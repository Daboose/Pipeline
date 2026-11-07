import { LightningElement, wire } from "lwc";
import { getRecord } from "lightning/uiRecordApi";
import { getPicklistValuesByRecordType } from "lightning/uiObjectInfoApi";
import SALESRISKS from "@salesforce/schema/SalesRisks__c";
import getContext from "@salesforce/apex/PipelineController.getContext";
import getDeals from "@salesforce/apex/PipelineController.getDeals";
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
  detailRows
} from "c/pipelineMobileModel";
import { formatMoney } from "c/pipelineFormat";

const MOBILE_VERSION = "0.9.2"; // shown at the foot of the screen; raised with each change that goes out

// the fields read from the deal itself for the deal screen (the rest comes with the list)
const RECORD_FIELDS = [
  "SalesRisks__c.UnitsCasesPerYear__c",
  "SalesRisks__c.myMo__c"
];

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
  stagesOpen = false; // the list of stages under the stage row
  debugText = "";
  statusOptions = STATUS_OPTIONS;
  typeOptions = TYPE_OPTIONS;

  @wire(getRecord, { recordId: "$openId", optionalFields: RECORD_FIELDS })
  record;
  @wire(getPicklistValuesByRecordType, {
    objectApiName: SALESRISKS,
    recordTypeId: "$recordTypeId"
  })
  picklists;

  get recordTypeId() {
    return this.record && this.record.data
      ? this.record.data.recordTypeId
      : undefined;
  }

  connectedCallback() {
    this.onViewport = () => this.fit();
    window.addEventListener("resize", this.onViewport);
    if (window.visualViewport)
      window.visualViewport.addEventListener("resize", this.onViewport);
    const filter = {
      kinds: KINDS.map((k) => k.kind),
      status: "both",
      closedMonths: 12,
      mineOnly: true
    };
    Promise.all([
      getContext().catch(() => null),
      getDeals({ filterJson: JSON.stringify(filter) })
    ])
      .then(([ctx, res]) => {
        this.stageOrder = (ctx && ctx.stageOrder) || [];
        this.deals = res.deals || [];
        this.truncated = !!res.truncated;
      })
      .catch((e) => {
        this.error = errorText(e);
      })
      .finally(() => {
        this.loading = false;
      });
  }

  disconnectedCallback() {
    window.removeEventListener("resize", this.onViewport);
    if (window.visualViewport)
      window.visualViewport.removeEventListener("resize", this.onViewport);
  }
  renderedCallback() {
    this.fit();
    this.lockOuterScroll();
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
    page.style.setProperty("--fit-height", `${height}px`);
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
        tf: cs.transform !== "none"
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
    const page = this.template.querySelector(".page");
    if (!page || this.lockedPage === page) return;
    this.lockedPage = page;
    page.addEventListener(
      "touchstart",
      (e) => {
        this.touchY = e.touches[0].clientY;
      },
      { passive: true }
    );
    page.addEventListener(
      "touchmove",
      (e) => {
        const dy = e.touches[0].clientY - this.touchY;
        const atTop = page.scrollTop <= 0;
        const atBottom =
          page.scrollTop + page.clientHeight >= page.scrollHeight - 1;
        if ((atTop && dy > 0) || (atBottom && dy < 0)) e.preventDefault();
      },
      { passive: false }
    );
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
        ...this.lastMeasure,
        scroller: m.scroller,
        chain: m.chain
      },
      null,
      1
    );
  }

  get showList() {
    return this.ready && !this.openId;
  }
  get showDeal() {
    return this.ready && !!this.openId && !!this.openDeal;
  }

  /* ----- the deal screen ----- */
  get openDeal() {
    return this.deals.find((d) => d.id === this.openId);
  }
  get header() {
    return this.openDeal ? headerOf(this.openDeal) : { name: "", sub: "" };
  }
  get tiles() {
    return this.openDeal ? summaryTiles(this.openDeal) : [];
  }
  get recFields() {
    const f =
      (this.record && this.record.data && this.record.data.fields) || {};
    const val = (n) => (f[n] ? f[n].value : null);
    return { units: val("UnitsCasesPerYear__c"), mymo: !!val("myMo__c") };
  }
  get rows() {
    if (!this.openDeal) return [];
    return detailRows(this.openDeal, this.recFields).map((r) => ({
      ...r,
      cls: r.yes === null ? "fv" : r.yes ? "fv yes" : "fv no"
    }));
  }
  get goRows() {
    const d = this.openDeal;
    if (!d) return [];
    return [
      { key: "usages", label: "Surgeon Usages" },
      { key: "bookings", label: "MyCase Bookings" },
      {
        key: "campaigns",
        label: "Campaigns",
        badge: d.campaignCount > 0 ? d.campaignCount : ""
      }
    ];
  }
  get stageNow() {
    return (this.openDeal && this.openDeal.stage) || "–";
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
    return stageSteps(this.stageValues, d.kind, d.stage).map((name) => ({
      name,
      current: name === d.stage,
      cls: name === d.stage ? "here" : ""
    }));
  }
  /** The colour of the stage row: blue, green at the won stage, red at the lost stage. */
  get stageRowCls() {
    const tone = this.openDeal ? stageTone(this.openDeal) : "";
    return "stgC" + (tone ? ` ${tone}` : "");
  }
  get stageSecCls() {
    return "stsec" + (this.stagesOpen ? "" : " shut");
  }
  get stagesWord() {
    return this.stagesOpen ? "Close" : "All stages";
  }
  handleStages() {
    this.stagesOpen = !this.stagesOpen;
  }
  /** Opens a deal on its own screen; the list keeps where it was (the Status, the search, the folds and how far it was scrolled). */
  handleOpen(event) {
    const page = this.template.querySelector(".page");
    this.listTop = page ? page.scrollTop : 0;
    this.stagesOpen = false;
    this.openId = event.currentTarget.dataset.id;
    this.scrollTo(0);
  }
  handleBack() {
    this.openId = "";
    this.scrollTo(this.listTop || 0);
  }
  scrollTo(top) {
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    requestAnimationFrame(() => {
      const page = this.template.querySelector(".page");
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
