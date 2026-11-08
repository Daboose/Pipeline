import { LightningElement, wire } from "lwc";
import {
  getRecord,
  updateRecord,
  getRecordNotifyChange
} from "lightning/uiRecordApi";
import {
  getObjectInfo,
  getPicklistValuesByRecordType
} from "lightning/uiObjectInfoApi";
import SALESRISKS from "@salesforce/schema/SalesRisks__c";
import getContext from "@salesforce/apex/PipelineController.getContext";
import getDeals from "@salesforce/apex/PipelineController.getDeals";
import searchLookup from "@salesforce/apex/PipelineLookupController.search";
import searchNear from "@salesforce/apex/PipelineLookupController.searchNear";
import {
  KINDS,
  STATUS_OPTIONS,
  dealsOf,
  cardOf,
  currencyGroups,
  chartFigures,
  valueWord,
  headerOf,
  summaryTiles,
  stageSteps,
  stageTone,
  liveDeal,
  dealArea,
  formRows,
  formSections,
  formFieldNames,
  QUARTER_FIELD,
  YEAR_FIELD,
  SAVING_WORDS,
  withSavingScreen
} from "c/pipelineMobileModel";
import { formatMoney, suggestYear, quarterIsPast } from "c/pipelineFormat";

const MOBILE_VERSION = "0.42"; // shown at the foot of the screen; raised with each change that goes out

const SLIDE_OUT_MS = 540; // a little longer than the slide itself (0.48 s in the style sheet)
const LOOKUP_MIN = 2; // letters before a search is made, as on the desktop
const LOOKUP_WAIT_MS = 300;
const LOOKUP_LIMIT = 8; // the most a search returns; a full list means there are probably more
const HOSPITAL_FIELD = "Healthcare_Facility__c";
const SURGEON_FIELD = "Account__c";

const parseErrors = (e) => {
  const out = [];
  const o = e && e.body && e.body.output;
  if (o) {
    (o.errors || []).forEach((x) => out.push(x.message));
    Object.values(o.fieldErrors || {}).forEach((list) =>
      list.forEach((x) => out.push(x.message))
    );
  }
  if (!out.length && e && e.body && e.body.message) out.push(e.body.message);
  if (!out.length && e && Array.isArray(e.body))
    e.body.forEach((b) => out.push(b.message));
  if (!out.length) out.push("The deal could not be saved.");
  return out.map((text, key) => ({ key, text }));
};

const TYPE_OPTIONS = KINDS.map((k) => ({ value: k.kind, label: k.short }));

const errorText = (e) =>
  (e && e.body && e.body.message) ||
  (e && e.message) ||
  "Something went wrong. Please try again.";

/**
 * pipelineMobile: Pipeline on the phone, the first screen (Robert, 2026-11-07; mockup pipeline_mobile_list_v2.html). A sales rep's own
 * deals (opportunities, risks and ROSA), with a Status slider (Open, Closed, Both), a search, a folding section for each kind and a
 * Charts section (stage bars and quarter columns, one kind at a time, one block per currency). Every section is folded when the
 * screen opens, as on the desktop. It reads the deals through PipelineController.getDeals with "mineOnly" (the person's own deals,
 * whoever they are) and changes nothing. Tapping a deal opens it on the next screen, which is not built yet.
 * Placed on the Lightning app page Pipeline Mobile, shown as a tab in the Salesforce mobile app. Light colours only for now.
 */
export default class PipelineMobile extends LightningElement {
  deals = [];
  stageOrder = [];
  loading = true;
  error = "";
  truncated = false;
  status = "open";
  q = "";
  chartKind = "opp";
  // every section starts folded
  shut = { charts: true, opp: true, risk: true, rosa: true };

  version = MOBILE_VERSION;
  openId = ""; // the deal being looked at; blank when the list is showing
  chatOn = false; // the Chatter screen is slid in over the deal
  chatSummary = ""; // "4 posts · last 2 d ago", told by the Chatter screen
  newOn = false; // the New deal page is slid in over the list
  createdMsg = false; // the "Created." line at the top of a deal just created
  usagesOn = false; // the Surgeon Usages screen is slid in over the deal
  usagesSummary = { text: "", old: false, rating: "" }; // "updated 3 months ago", told by the Usages screen
  bookingsOn = false; // the MyCase Bookings screen is slid in over the deal
  bookingsSummary = ""; // "54 cases in 12 months", told by the Bookings screen
  bookingsKey = 0; // goes up when the deal is saved, so the bookings are read again
  campaignsOn = false; // the Campaigns screen is slid in over the deal
  campaignsNow = null; // how many campaigns the deal is in after a change made on the Campaigns screen; null until then
  campaignsDirty = false;
  dealOn = false; // the deal screen is slid in (it stays on the page a moment after sliding out)
  stagesOpen = false; // the list of stages under the stage row
  draft = {}; // the changes not yet saved, by field (nothing is saved until Save is pressed)
  draftNames = {}; // the names of records picked in this edit, by field
  errors = [];
  savedMsg = false;
  saving = false;
  savePhase = ""; // the saving screen: "", "working" or "done"
  savingWord = "";
  confirming = false; // asking whether to leave with unsaved changes
  sheetField = ""; // the lookup being searched (the search page is over the deal while this is set)
  sheetTerm = "";
  sheetHits = [];
  sheetSearched = false;
  debugText = "";
  statusOptions = STATUS_OPTIONS;
  typeOptions = TYPE_OPTIONS;

  @wire(getObjectInfo, { objectApiName: SALESRISKS }) objectInfo;
  @wire(getRecord, { recordId: "$openId", optionalFields: "$optionalFields" })
  record;
  @wire(getPicklistValuesByRecordType, {
    objectApiName: SALESRISKS,
    recordTypeId: "$recordTypeId"
  })
  picklists;

  get optionalFields() {
    return formFieldNames(this.openDeal ? this.openDeal.kind : "opp");
  }
  get recordTypeId() {
    return this.record && this.record.data
      ? this.record.data.recordTypeId
      : undefined;
  }

  connectedCallback() {
    this.onViewport = () => {
      this.fit();
      this.settleOuterScroll();
    };
    window.addEventListener("resize", this.onViewport);
    if (window.visualViewport)
      window.visualViewport.addEventListener("resize", this.onViewport);
    Promise.all([getContext().catch(() => null), this.fetchDeals()])
      .then(([ctx, res]) => {
        this.stageOrder = (ctx && ctx.stageOrder) || [];
        this.takeDeals(res);
      })
      .catch((e) => {
        this.error = errorText(e);
      })
      .finally(() => {
        this.loading = false;
      });
  }
  fetchDeals() {
    const filter = {
      kinds: KINDS.map((k) => k.kind),
      status: "both",
      closedMonths: 12,
      mineOnly: true
    };
    return getDeals({ filterJson: JSON.stringify(filter) });
  }
  takeDeals(res) {
    this.deals = res.deals || [];
    this.truncated = !!res.truncated;
  }

  disconnectedCallback() {
    window.removeEventListener("resize", this.onViewport);
    if (window.visualViewport)
      window.visualViewport.removeEventListener("resize", this.onViewport);
  }
  renderedCallback() {
    this.fit();
    this.lockOuterScroll();
    this.shareLabelWidth();
    // Salesforce puts a text box's value on as an attribute, which a text box does not show, so the Background information would stay
    // blank. Its value is set here as a property; a box being typed in is left alone.
    this.template.querySelectorAll("textarea[data-api]").forEach((box) => {
      if (this.template.activeElement === box) return;
      const want = this.valueOf(box.dataset.api);
      const text = want === null || want === undefined ? "" : String(want);
      if (box.value !== text) box.value = text;
    });
  }

  /** The labels of every Yes / No slider on the phone: the four on the deal form and the one on each campaign. */
  get measureLabels() {
    return ["On hold", "Rep priority", "MyMobility", "In campaign"];
  }
  /**
   * Gives every Yes / No slider on the phone one label width, the width of the longest label (measured from hidden copies set in the
   * slider's own label type, plus the slider's 34 px of padding round its label), so the No and Yes are the same size on the deal form
   * and on the Campaigns screen (Robert, 2026-11-07). Set on the form's block of sliders and on the Campaigns screen, and so inherited by
   * the sliders inside; not on the whole screen, which would also widen the Status slider.
   */
  shareLabelWidth() {
    let widest = 0;
    this.template.querySelectorAll(".lblmeasure").forEach((s) => {
      widest = Math.max(widest, s.getBoundingClientRect().width);
    });
    const value = `${Math.ceil(widest) + 34}px`;
    const targets = [
      ...this.template.querySelectorAll(".flagbox"),
      ...this.template.querySelectorAll("c-pipeline-mobile-campaigns")
    ];
    targets.forEach((el) => {
      if (el.style.getPropertyValue("--seg-label-width") !== value)
        el.style.setProperty("--seg-label-width", value);
    });
  }

  /**
   * The Salesforce phone app scrolls its pages inside its own scroller, which stops "sticky" working, so this page does its own
   * scrolling, in the height that is left on the screen. Measured, never guessed: first the whole height from where the page starts to the
   * bottom of the screen; then, once it has laid out, how much further Salesforce's own scroller can still scroll (the space it keeps
   * clear for its floating bottom bars), which is taken off, so the page ends exactly at the bars and Salesforce's page has nothing left
   * to scroll. The Status slider and the search, sticky inside this page, then stay locked at the top of it.
   */
  fit() {
    const page = this.template.querySelector(".page");
    if (!page) return;
    const host = this.template.host;
    const applied = this.appliedPull || 0; // how far this page is already pulled up into Salesforce's own top padding
    // where the page would start with no pull
    const raw = host.getBoundingClientRect().top + applied;
    const vv = window.visualViewport;
    const viewH = vv ? vv.height : window.innerHeight;
    const key = `${Math.round(raw)}:${Math.round(viewH)}`;
    const known = this.reserveKey === key;
    const reserve = known ? this.reserve : 0;
    const pull = known ? this.pull : 0;
    const height = Math.max(240, Math.floor(viewH - (raw - pull) - reserve));
    page.style.marginTop = pull ? `-${pull}px` : "";
    const wrap = this.template.querySelector(".wrap");
    if (wrap) wrap.style.setProperty("--fit-height", `${height}px`);
    this.appliedPull = pull;
    this.lastMeasure = {
      top: Math.round(raw - pull),
      viewH: Math.round(viewH),
      reserve,
      pull,
      height
    };
    if (this.calibKey !== key) {
      this.calibKey = key;
      // eslint-disable-next-line @lwc/lwc/no-async-operation
      setTimeout(() => this.calibrate(key, raw), 120);
    }
  }
  /**
   * Two things measured once the page has laid out at full height. (1) How far Salesforce's own scroller can still scroll: the room it
   * keeps for its bottom bars, taken off the page's height. (2) How much space Salesforce leaves above the page inside its scroller
   * (from the scroller's top edge to where the page starts): taken off by pulling the page up by that much, so the gap above the
   * locked Status slider is just our own 8 px, the same as the gap under the search (Robert, 2026-11-07).
   */
  calibrate(key, raw) {
    const m = this.measure();
    const excess = m.scroller ? m.scroller.excess : 0;
    // the space above the page: from the top of Salesforce's scroller if there is one, otherwise from the top of the web view itself
    // (on Robert's phone there is no scroller above the page and the page starts 13 px down). A big figure is not padding (on a large
    // screen Salesforce's own header is above the page), so it is left alone.
    const lead = Math.round(m.scroller ? raw - m.scroller.top : raw);
    this.reserve = Math.max(0, Math.min(400, excess));
    // NOT pulled up: Salesforce's wrapper clips anything that sticks out above the page's own top edge (the top of the Status slider was
    // cut off flat when it was pulled up by this much), so the space above the page is Salesforce's and cannot be taken back. The
    // figure is kept for the debug box.
    this.pull = 0;
    this.reserveKey = key;
    this.lastMeasure = { ...this.lastMeasure, calibrated: true, excess, lead };
    this.fit();
  }
  /** The ancestors above this page: the one that scrolls (if any), with how far it can still scroll, and the rest for the debug box. */
  measure() {
    const host = this.template.host;
    const chain = [];
    let node = host;
    let scroller = null;
    for (let i = 0; i < 25 && node; i++) {
      const root = node.getRootNode ? node.getRootNode() : null;
      node =
        node.assignedSlot ||
        node.parentElement ||
        (root && root.host ? root.host : null);
      if (!node || node === document.documentElement) break;
      const cs = window.getComputedStyle(node);
      const r = node.getBoundingClientRect();
      const scrolls = ["auto", "scroll"].includes(cs.overflowY);
      const excess = node.scrollHeight - node.clientHeight;
      chain.push({
        tag: (node.tagName || "").toLowerCase(),
        cls: String(node.className || "").slice(0, 24),
        oy: cs.overflowY,
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        sh: node.scrollHeight,
        ch: node.clientHeight,
        tf: cs.transform !== "none",
        st: Math.round(node.scrollTop)
      });
      // the nearest ancestor that scrolls and has more to scroll is Salesforce's page scroller
      if (!scroller && scrolls && excess > 1) {
        scroller = {
          excess,
          top: r.top,
          tag: (node.tagName || "").toLowerCase()
        };
      }
    }
    return { chain, scroller };
  }
  /**
   * Keeps a swipe on this page from moving Salesforce's page underneath (Robert, 2026-11-07): the swipe scrolls this page, and where
   * this page can go no further (the top or the bottom) it is stopped there, not passed on.
   */
  lockOuterScroll() {
    this.lockedPages = this.lockedPages || new WeakSet();
    this.template.querySelectorAll(".page").forEach((page) => {
      if (this.lockedPages.has(page)) return;
      this.lockedPages.add(page);
      let touchY = 0;
      page.addEventListener(
        "touchstart",
        (e) => {
          touchY = e.touches[0].clientY;
        },
        { passive: true }
      );
      page.addEventListener(
        "touchmove",
        (e) => {
          const dy = e.touches[0].clientY - touchY;
          const atTop = page.scrollTop <= 0;
          const atBottom =
            page.scrollTop + page.clientHeight >= page.scrollHeight - 1;
          if ((atTop && dy > 0) || (atBottom && dy < 0)) e.preventDefault();
        },
        { passive: false }
      );
    });
    // a touch handler on the screen makes the pressed look (:active) work on the iPhone, for everything inside it
    const wrap = this.template.querySelector(".wrap");
    if (wrap && this.pressWrap !== wrap) {
      this.pressWrap = wrap;
      wrap.addEventListener("touchstart", () => {}, { passive: true });
      // the screen's own box never scrolls: if the browser moves it (to show a text box above the keyboard), it is put straight back, so
      // the locked Back bar stays where it is; the pages inside scroll themselves
      wrap.addEventListener("focusout", () => this.settleOuterScroll());
      wrap.addEventListener("scroll", () => {
        wrap.scrollTop = 0;
        wrap.scrollLeft = 0;
      });
    }
  }
  /**
   * When the keyboard opens for a text box the iPhone scrolls what is above this screen (Salesforce's own scroller, or the web view itself) to
   * show the box, and it does not always scroll back when the keyboard closes: the whole screen then sat higher, with the locked Back bar off
   * the top (Robert, 2026-11-07). This puts everything above the screen back at the top. Nothing above it is meant to scroll (the screen fits
   * the space and scrolls itself), so the top is where it belongs.
   */
  resetOuterScroll() {
    // not while a text box is still being typed in (the keyboard is up and the phone is showing the box)
    const on = this.template.activeElement;
    if (
      on &&
      /^(INPUT|TEXTAREA|SELECT|C-PIPELINE-MOBILE-CHATTER|C-PIPELINE-MOBILE-NEW)$/.test(
        on.tagName
      )
    )
      return;
    let node = this.template.host;
    for (let i = 0; i < 25 && node; i++) {
      const root = node.getRootNode ? node.getRootNode() : null;
      node =
        node.assignedSlot ||
        node.parentElement ||
        (root && root.host ? root.host : null);
      if (!node) break;
      if (node.scrollTop > 0) node.scrollTop = 0;
    }
    const doc = document.scrollingElement || document.documentElement;
    if (doc && doc.scrollTop > 0) doc.scrollTop = 0;
    if (window.scrollY > 0) window.scrollTo(0, 0);
    // measure the space again now that everything is back in place: the height was last worked out while the screen sat higher, which left
    // the page taller than the room (the Save and Cancel bar ended up under Salesforce's "How can I help?" bar)
    this.calibKey = "";
    this.fit();
  }
  /** After the keyboard has gone (it takes about a quarter of a second), and again a little later in case the phone is slow to settle. */
  settleOuterScroll() {
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    setTimeout(() => this.resetOuterScroll(), 300);
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    setTimeout(() => this.resetOuterScroll(), 800);
  }
  /** Tapping the version line shows what the screen measured (for finding a problem on a phone); tap again to hide it. */
  handleDebug() {
    if (this.debugText) {
      this.debugText = "";
      return;
    }
    const m = this.measure();
    this.debugText = JSON.stringify(
      {
        v: this.version,
        winY: Math.round(window.scrollY),
        vvTop: window.visualViewport
          ? Math.round(window.visualViewport.offsetTop)
          : null,
        ...this.lastMeasure,
        scroller: m.scroller,
        chain: m.chain
      },
      null,
      1
    );
  }

  /** The list stays on the page under the deal while the deal is open (the deal slides over it), so Back finds it exactly as it was left. */
  get showList() {
    return this.ready;
  }
  get showDeal() {
    return this.ready && !!this.openId && !!this.openDeal;
  }

  /* ----- the deal screen ----- */
  get openDeal() {
    return this.deals.find((d) => d.id === this.openId);
  }
  /** The deal as it would be with the unsaved changes made: the On Hold pill, the Status tile and the stage colour follow at once. */
  get liveDeal() {
    return this.openDeal ? liveDeal(this.openDeal, this.draft) : undefined;
  }
  get header() {
    return this.liveDeal ? headerOf(this.liveDeal) : { name: "", sub: "" };
  }
  get tiles() {
    if (!this.liveDeal) return [];
    // the surgeon's usage rating takes the Portfolio tile's place on an opportunity or a risk whose portfolio is known
    const rating =
      this.showSurgeonRows && this.usagesArea
        ? this.usagesSummary.rating || ""
        : undefined;
    return summaryTiles(this.liveDeal, Date.now(), rating);
  }
  get stageNow() {
    return (this.liveDeal && this.liveDeal.stage) || "–";
  }
  get stageValues() {
    const all = this.picklists && this.picklists.data;
    const f =
      all && all.picklistFieldValues && all.picklistFieldValues.Stage__c;
    return f ? f.values.map((v) => v.value) : [];
  }
  get stageList() {
    const d = this.openDeal;
    if (!d) return [];
    const now = this.stageNow;
    return stageSteps(this.stageValues, d.kind, now).map((name) => ({
      name,
      current: name === now,
      cls: name === now ? "here" : ""
    }));
  }
  /** The colour of the stage row: blue, green at the won stage, red at the lost stage. */
  get stageRowCls() {
    const tone = this.liveDeal ? stageTone(this.liveDeal) : "";
    return "stgC" + (tone ? ` ${tone}` : "");
  }
  /** The whole stage component (row and list in one outline): the colour carries the outline, "shut" folds the list. */
  get stageSecCls() {
    const tone = this.liveDeal ? stageTone(this.liveDeal) : "";
    return (
      "stsec" + (tone ? ` ${tone}` : "") + (this.stagesOpen ? "" : " shut")
    );
  }
  handleStages() {
    this.stagesOpen = !this.stagesOpen;
  }
  /** Tapping a stage in the list is a draft, like any other change; the list folds shut. Nothing happens if the person may not change it. */
  handleStagePick(event) {
    if (!this.updateable("Stage__c")) return;
    this.setDraft("Stage__c", event.currentTarget.dataset.name);
    this.stagesOpen = false;
  }
  /**
   * Opens a deal on its own screen: it slides in from the right over the list (0.4 s, the motion standard). The list stays where it was
   * underneath (the Status, the search, the folds and how far it was scrolled), so nothing has to be put back.
   */
  handleOpen(event) {
    this.openDealById(event.currentTarget.dataset.id);
  }
  openDealById(id) {
    clearTimeout(this.leaveTimer);
    this.stagesOpen = false;
    this.clearDraft();
    this.chatOn = false;
    this.chatSummary = "";
    this.campaignsOn = false;
    this.campaignsNow = null;
    this.campaignsDirty = false;
    this.bookingsOn = false;
    this.bookingsSummary = "";
    this.usagesOn = false;
    this.usagesSummary = { text: "", old: false, rating: "" };
    this.createdMsg = false;
    this.openId = id;
    this.dealOn = true;
    this.scrollDealTo(0);
  }
  get dealCls() {
    return "page dealpage" + (this.dealOn ? " on" : "");
  }
  /** Back to the list; with unsaved changes it asks first (Stay or Leave). */
  handleBack() {
    if (!this.clean) {
      this.confirming = true;
      return;
    }
    this.leaveDeal();
  }
  /** The deal slides off to the right; it is taken off the page once it has gone (its words stay on it while it slides). */
  leaveDeal() {
    this.confirming = false;
    this.chatOn = false;
    this.campaignsOn = false;
    this.bookingsOn = false;
    this.usagesOn = false;
    this.dealOn = false;
    clearTimeout(this.leaveTimer);
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    this.leaveTimer = setTimeout(() => {
      if (this.dealOn) return;
      this.clearDraft();
      this.stagesOpen = false;
      this.openId = "";
    }, SLIDE_OUT_MS);
  }
  /* ----- Chatter: its own screen, slid in over the deal ----- */
  get chatLabel() {
    const h = this.header;
    return [h.name, h.sub].filter(Boolean).join(" · ");
  }
  handleChatOpen() {
    this.chatOn = true;
  }
  handleChatClose() {
    this.chatOn = false;
  }
  handleChatFeed(event) {
    this.chatSummary = event.detail;
  }
  /** A post was made: read the deals again, so the deal's own "Last posted" figure follows (as the desktop does). */
  handleChatPosted() {
    this.fetchDeals()
      .then((res) => this.takeDeals(res))
      .catch(() => {});
  }
  /* ----- Campaigns: its own screen, slid in over the deal, holding the Campaigns list that already works on the desktop ----- */
  get campaignsSummary() {
    const n =
      this.campaignsNow !== null
        ? this.campaignsNow
        : (this.openDeal && this.openDeal.campaignCount) || 0;
    if (n === 0) return "In no campaign";
    return n === 1 ? "In 1 campaign" : `In ${n} campaigns`;
  }
  handleCampaignsOpen() {
    this.campaignsOn = true;
  }
  handleCampaignsChanged(event) {
    this.campaignsNow = event.detail;
    this.campaignsDirty = true;
  }
  /** Back from the Campaigns screen; if the deal was put in or out of a campaign the deals are read again, so its card's star follows. */
  handleCampaignsClose() {
    this.campaignsOn = false;
    if (!this.campaignsDirty) return;
    this.campaignsDirty = false;
    this.fetchDeals()
      .then((res) => this.takeDeals(res))
      .catch(() => {});
  }
  /* ----- a new deal: the "Create new pipeline" bar slides the New deal page in; a created deal opens on its own screen ----- */
  handleNewOpen() {
    this.newOn = true;
  }
  handleNewClose() {
    this.newOn = false;
  }
  /** A deal was created: the deals are read again, so it is in the list, and its own screen slides in with "Created." at the top. */
  handleCreated(event) {
    const id = event.detail;
    this.newOn = false;
    this.fetchDeals()
      .then((res) => {
        this.takeDeals(res);
        this.openDealById(id);
        this.createdMsg = true;
      })
      .catch((e) => {
        this.error = errorText(e);
      });
  }

  /* ----- Surgeon Usages: its own screen, slid in over the deal ----- */
  /** The Surgeon Usages and MyCase Bookings rows are for an opportunity or a risk: a ROSA deal has no surgeon's usages (as on the desktop). */
  get showSurgeonRows() {
    return this.showDeal && this.openDeal.kind !== "rosa";
  }
  get usagesArea() {
    return this.openDeal ? dealArea(this.openDeal) : "";
  }
  get usagesSubCls() {
    return "gsub" + (this.usagesSummary.old ? " warn" : "");
  }
  handleUsagesOpen() {
    this.usagesOn = true;
  }
  handleUsagesClose() {
    this.usagesOn = false;
  }
  handleUsagesSummary(event) {
    this.usagesSummary = event.detail;
  }

  /* ----- MyCase Bookings: its own screen, slid in over the deal ----- */
  handleBookingsOpen() {
    this.bookingsOn = true;
  }
  handleBookingsClose() {
    this.bookingsOn = false;
  }
  handleBookingsSummary(event) {
    this.bookingsSummary = event.detail;
  }
  handleStay() {
    this.confirming = false;
  }
  handleLeave() {
    this.leaveDeal();
  }

  /* ----- editing: the fields, the draft, Save and Cancel ----- */
  current(api) {
    const f = this.record && this.record.data && this.record.data.fields[api];
    return f ? f.value : null;
  }
  valueOf(api) {
    return api in this.draft ? this.draft[api] : this.current(api);
  }
  choices(api) {
    const all = this.picklists && this.picklists.data;
    const f = all && all.picklistFieldValues && all.picklistFieldValues[api];
    return f ? f.values : null;
  }
  updateable(api) {
    const info = this.objectInfo && this.objectInfo.data;
    return !!(info && info.fields[api] && info.fields[api].updateable);
  }
  /** The name to show for a lookup: one just picked, else the record's own related name. */
  lookupName(api) {
    if (api in this.draftNames) return this.draftNames[api];
    const rel =
      this.record &&
      this.record.data &&
      this.record.data.fields[api.replace(/__c$/, "__r")];
    const name = rel && rel.value && rel.value.fields && rel.value.fields.Name;
    return name ? name.value : "";
  }
  get fieldsLoaded() {
    return !!(this.record && this.record.data);
  }
  get formRows() {
    if (!this.openDeal || !this.fieldsLoaded) return [];
    return formRows(this.openDeal.kind, {
      draft: this.draft,
      valueOf: (api) => this.valueOf(api),
      choices: (api) => this.choices(api),
      updateable: (api) => this.updateable(api),
      lookupName: (api) => this.lookupName(api)
    });
  }
  /** The form's rows grouped into sections with the opening boxes between them. */
  get formSections() {
    return formSections(this.formRows);
  }
  get clean() {
    return Object.keys(this.draft).length === 0;
  }
  get saveBarCls() {
    return "savewrap" + (this.clean ? "" : " on");
  }
  get saveWord() {
    return this.saving ? "Saving…" : "Save";
  }
  get askCls() {
    return "askwrap" + (this.confirming ? " on" : "");
  }
  get hasErrors() {
    return this.errors.length > 0;
  }
  get savedCls() {
    return "okmsg" + (this.savedMsg ? " on" : "");
  }
  clearDraft() {
    this.draft = {};
    this.draftNames = {};
    this.errors = [];
    this.savedMsg = false;
  }
  setDraft(api, value) {
    const original = this.current(api);
    const same =
      typeof value === "boolean"
        ? !!original === value
        : String(original ?? "") === String(value ?? "");
    const next = { ...this.draft };
    if (same) delete next[api];
    else next[api] = value;
    this.draft = next;
    this.savedMsg = false;
    this.createdMsg = false;
    this.errors = [];
  }
  handleSelect(event) {
    const api = event.target.dataset.api;
    this.setDraft(api, event.target.value);
    if (api === QUARTER_FIELD) this.suggestYearFor(event.target.value);
  }
  /** Picking a quarter fills in its year when there is none yet, or when its year would put the quarter in the past (as on the desktop). */
  suggestYearFor(quarter) {
    if (!quarter || !this.updateable(YEAR_FIELD)) return;
    const year = this.valueOf(YEAR_FIELD);
    const want = String(suggestYear(quarter));
    const offered = (this.choices(YEAR_FIELD) || []).some(
      (c) => c.value === want
    );
    if ((!year || quarterIsPast(quarter, year)) && offered)
      this.setDraft(YEAR_FIELD, want);
  }
  handleText(event) {
    this.setDraft(event.target.dataset.api, event.target.value);
  }
  /** A number box. A field Salesforce holds as text (the units) is sent as the text typed; a number field is sent as a number. */
  handleNumber(event) {
    const api = event.target.dataset.api;
    const v = event.target.value;
    const info = this.objectInfo && this.objectInfo.data;
    const field = info && info.fields[api];
    const asText = !!field && field.dataType === "String";
    this.setDraft(api, v === "" ? "" : asText ? String(v) : Number(v));
  }
  handleFlag(event) {
    this.setDraft(
      event.currentTarget.dataset.api,
      event.detail.value === "yes"
    );
  }
  handleChoice(event) {
    const api = event.currentTarget.dataset.api;
    const value = event.detail.value;
    const on = this.valueOf(api) ? String(this.valueOf(api)).split(";") : [];
    const next = on.includes(value)
      ? on.filter((x) => x !== value)
      : [...on, value];
    this.setDraft(api, next.join(";"));
  }
  handleCancel() {
    this.clearDraft();
  }
  handleSave() {
    if (this.saving || this.clean) return;
    const fields = { Id: this.openId };
    Object.entries(this.draft).forEach(([k, v]) => {
      fields[k] = v === "" ? null : v;
    });
    this.saving = true;
    this.errors = [];
    // the whole screen is dimmed and locked until Salesforce has answered and the deals are read again (Robert, 2026-11-08)
    withSavingScreen(
      (s) => {
        this.savePhase = s.phase;
        this.savingWord = s.word;
      },
      SAVING_WORDS.save,
      () =>
        updateRecord({ fields }).then(() => {
          const id = this.openId;
          this.draft = {};
          this.draftNames = {};
          this.savedMsg = true;
          this.bookingsKey += 1; // the Primary HCP may have changed, so the bookings are read again
          getRecordNotifyChange([{ recordId: id }]);
          // read the deals again, quietly, so the list and the summary show what was saved
          return this.fetchDeals().then((res) => this.takeDeals(res));
        })
    )
      .catch((e) => {
        this.errors = parseErrors(e);
      })
      .finally(() => {
        this.saving = false;
      });
  }

  /* ----- the search page for a lookup (Primary HCP, Healthcare facility, Link to ROSA deal): slides in over the deal ----- */
  get sheetCls() {
    return "sheet" + (this.sheetField ? " on" : "");
  }
  get sheetTitle() {
    const row = this.formRows.find((r) => r.api === this.sheetField);
    return row ? row.label : "";
  }
  get sheetPrompt() {
    return !this.sheetSearched && this.sheetTerm.trim().length < LOOKUP_MIN;
  }
  /** A full list: say so, and ask for more of the name (Robert, 2026-11-07: teach people to search with specific words, not generic ones). */
  get limit() {
    return LOOKUP_LIMIT;
  }
  get sheetFull() {
    return this.sheetHits.length >= LOOKUP_LIMIT;
  }
  get sheetNone() {
    return this.sheetSearched && this.sheetHits.length === 0;
  }
  get hasSheetTerm() {
    return this.sheetTerm !== "";
  }
  handleLookupOpen(event) {
    this.sheetField = event.currentTarget.dataset.api;
    this.sheetTerm = "";
    this.sheetHits = [];
    this.sheetSearched = false;
  }
  /** The round cross on an optional lookup takes the choice away (a draft like any other change; Save then writes it as empty). */
  handleLookupClear(event) {
    const api = event.currentTarget.dataset.api;
    this.draftNames = { ...this.draftNames, [api]: "" };
    this.setDraft(api, "");
  }
  handleSheetClose() {
    this.sheetField = "";
  }
  handleSheetTerm(event) {
    this.sheetTerm = event.target.value;
    clearTimeout(this.sheetTimer);
    const t = this.sheetTerm;
    if (t.trim().length < LOOKUP_MIN) {
      this.sheetHits = [];
      this.sheetSearched = false;
      return;
    }
    const field = this.sheetField;
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    this.sheetTimer = setTimeout(() => {
      // the hospital picker puts the chosen surgeon's own hospitals first (when their names match what was typed)
      const call =
        field === HOSPITAL_FIELD
          ? searchNear({
              fieldName: field,
              term: t,
              surgeonId: this.valueOf(SURGEON_FIELD) || null
            })
          : searchLookup({ fieldName: field, term: t });
      call
        .then((rows) => {
          if (t === this.sheetTerm) {
            this.sheetHits = this.markChosen(rows, field);
            this.sheetSearched = true;
          }
        })
        .catch(() => {
          if (t === this.sheetTerm) {
            this.sheetHits = [];
            this.sheetSearched = true;
          }
        });
    }, LOOKUP_WAIT_MS);
  }
  markChosen(rows, field) {
    const chosen = this.valueOf(field);
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      sub: r.sub || "",
      chosen: r.id === chosen,
      cls: "rs" + (r.id === chosen ? " is" : "")
    }));
  }
  handleSheetClear() {
    this.sheetTerm = "";
    this.sheetHits = [];
    this.sheetSearched = false;
  }
  handleSheetPick(event) {
    const { id, name } = event.currentTarget.dataset;
    const field = this.sheetField;
    this.draftNames = { ...this.draftNames, [field]: name };
    this.setDraft(field, id);
    this.sheetField = "";
  }
  scrollDealTo(top) {
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    requestAnimationFrame(() => {
      const page = this.template.querySelector(".dealpage");
      if (page) page.scrollTop = top;
    });
  }

  get ready() {
    return !this.loading && !this.error;
  }
  get hasSearch() {
    return this.q !== "";
  }

  handleStatus(event) {
    this.status = event.detail.value;
  }
  handleSearch(event) {
    this.q = event.target.value;
  }
  handleClear() {
    this.q = "";
    const input = this.template.querySelector("input.search");
    if (input) {
      input.value = "";
      input.focus();
    }
  }
  handleFold(event) {
    const key = event.currentTarget.dataset.key;
    this.shut = { ...this.shut, [key]: !this.shut[key] };
  }
  handleChartKind(event) {
    this.chartKind = event.detail.value;
  }

  /* ----- the three folding sections ----- */
  get sections() {
    return KINDS.map((k) => {
      const rows = dealsOf(this.deals, k.kind, this.status, this.q);
      const open = !this.shut[k.kind];
      return {
        kind: k.kind,
        label: k.label,
        count: rows.length,
        open,
        cls: "sec" + (open ? "" : " shut"),
        cards: rows.map((d) => cardOf(d, this.status)),
        empty: rows.length === 0
      };
    });
  }

  /* ----- the Charts section ----- */
  get chartsOpen() {
    return !this.shut.charts;
  }
  get chartsCls() {
    return "sec" + (this.shut.charts ? " shut" : "");
  }
  get chartRows() {
    return dealsOf(this.deals, this.chartKind, this.status, "");
  }
  get noChartDeals() {
    return this.chartRows.length === 0;
  }
  /** One block of tiles and charts for each currency (usually one); values are never added across currencies. */
  get chartBlocks() {
    const groups = currencyGroups(this.chartRows);
    return groups.map((g) => {
      const f = chartFigures(
        g.rows,
        this.chartKind,
        this.stageOrder,
        this.status
      );
      return {
        key: g.code || "none",
        code: g.code,
        showCode: groups.length > 1,
        currencyNote: g.code || "the deal's currency",
        tiles: [
          { key: "n", label: f.countLabel, value: f.count, cls: "tv" },
          {
            key: "v",
            label: valueWord(this.chartKind),
            value: formatMoney(f.total, g.code),
            cls: "tv"
          },
          {
            key: "a",
            label: "Needs attention",
            value: f.attention,
            cls: "tv warn"
          }
        ],
        stages: f.stages.map((s) => ({
          ...s,
          label: `${s.name} (${s.count})`,
          barStyle: `width:${s.pct}%;background:${s.colour}`,
          valueText: formatMoney(s.value, g.code)
        })),
        quarters: f.quarters.map((x) => ({
          ...x,
          valueText: formatMoney(x.value, g.code),
          // the column takes most of the room under its value label
          colStyle: `height:${Math.round(x.pct * 0.78)}%`
        }))
      };
    });
  }
}
