import { LightningElement, wire } from "lwc";
import {
  getObjectInfo,
  getPicklistValuesByRecordType
} from "lightning/uiObjectInfoApi";
import SALESRISKS from "@salesforce/schema/SalesRisks__c";
import getContext from "@salesforce/apex/PipelineController.getContext";
import currencyRates from "@salesforce/apex/PipelineCampaignController.currencyRates";
import getDeals from "@salesforce/apex/PipelineController.getDeals";
import getDealsByIds from "@salesforce/apex/PipelineController.getDealsByIds";
import listCampaigns from "@salesforce/apex/PipelineCampaignController.listCampaigns";
import getCampaign from "@salesforce/apex/PipelineCampaignController.getCampaign";
import saveSettings from "@salesforce/apex/PipelineController.saveSettings";
import listFilters from "@salesforce/apex/PipelineFilterController.listFilters";
import {
  KINDS,
  splitStages,
  defaultFilter,
  fromSaved,
  derivedStatus,
  chipList,
  NAMES,
  toggleKind,
  withStatus,
  serverFilter,
  serverChanged,
  clientMatch,
  reconcileFlyout,
  MINE
} from "c/pipelineFilterModel";
import { quarterRank } from "c/pipelineFormat";
import { zoomStyle, cleanZoom, DEFAULT_ZOOM } from "c/pipelineZoom";
import { usdDeals } from "c/pipelineCurrency";

/** JSON with the keys in a fixed order, so two filters with the same choices compare as equal. */
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson(value[k])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

/**
 * The Pipeline version shown beside the logo and at the foot of the settings panel. Kept in this one place; raise it
 * with each change that goes out. 0.1 to 0.9 were the first checkpoints (live deals, panels, lists, the deal flyout with
 * Usages, Surgeries and Chatter, saved filters); 0.10 follows the final mockup: a filter bar with chips and a Change
 * selection panel with Apply, in place of the always-visible Choose Your Data panel.
 */
const PIPELINE_VERSION = "0.182";

/** The colours a person can choose for the headings (Robert, 2026-11-02); the look of each is in pipelineApp.css. */
const HEAD_COLOURS = [
  { key: "pink", label: "Pink" },
  { key: "sky", label: "Sky blue" },
  { key: "lime", label: "Lime green" },
  { key: "cyan", label: "Cyan" }
];
/** Saved column widths: an object of column id to a sensible number of pixels, else null (nothing saved). */
function cleanWidths(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out = {};
  Object.keys(value).forEach((k) => {
    const n = Number(value[k]);
    if (Number.isFinite(n) && n >= 30 && n <= 1200) out[k] = Math.round(n);
  });
  return out;
}
const SLIDE_IN_DELAY_MS = 30; // lets the closed position be drawn first, so the slide runs
const SLIDE_OUT_MS = 450; // a little longer than the slide itself (0.4 s in the style sheets)

/** The record types whose stage choices stand for each kind of deal (the Australian ones; the other countries share the same stages). */
const STAGE_RECORD_TYPES = {
  opp: "AU HIP Opportunity",
  risk: "AU RISK",
  rosa: "AU ROSA Opportunity"
};
const KIND_ORDER = KINDS;

/** True when the screen sits inside the Salesforce page (not already on its own full-screen page). */
function isEmbedded() {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

function errorText(e) {
  return (
    (e && e.body && e.body.message) ||
    (e && e.message) ||
    "Something went wrong reading the deals."
  );
}

/** A saved MyCase Bookings choice for a ROSA deal, tidied: { view, types, procs }, or null when there is nothing usable. */
function cleanHospBook(h) {
  if (!h || typeof h !== "object") return null;
  const words = (list) => {
    return Array.isArray(list) ? list.filter((x) => typeof x === "string") : [];
  };
  return {
    view: ["hospital", "surgeon", "brand"].includes(h.view)
      ? h.view
      : "hospital",
    types: words(h.types),
    procs: words(h.procs)
  };
}

/**
 * Pipeline: the shell of the tool. A sales manager can look at their team, any team, or no team (everything sharing
 * allows); a sales rep sees only their own deals (decided on the server from the Teams, never here). It loads the deals,
 * holds what the person has chosen (a filter bar for the quick choices and the Change selection panel for the rest) and
 * their settings, and shows a summary panel and a list per deal type. It changes no deal.
 */
export default class PipelineApp extends LightningElement {
  version = PIPELINE_VERSION;
  ctx = null;
  error = "";
  busy = true;
  allDeals = [];
  truncated = false;
  teamNames = {};
  asAt = "";
  flyId = "";
  flyIds = [];
  flyFromCampaign = false; // the flyout was opened from the campaign list, so it steps through the campaign's deals and reads them itself (Robert, 2026-11-19)
  flyExtra = []; // those deals, read by id (the campaign can hold deals Pipeline's own list leaves out, such as closed ones)
  flyLeaving; // the deal whose panel is sliding away because a save moved it out of what the screen shows
  savedFilters = [];
  activeFilterId = "";
  settingsOpen = false;
  panelOpen = false; // the selection panel is on the page (it stays a moment after closing, to slide away)
  panelOn = false; // and this says it is slid into view
  filtersMounted = false; // the My filters panel: on the page (it stays a moment after closing, to slide away)
  filtersOn = false; // and slid into view
  flyOn = false; // the same for the deal flyout
  flyScreen = "deal"; // the screen the deal flyout opens on: "usages" when a rating plate was pressed (Robert, 2026-11-19)
  flySurgeon = null; // a surgeon with no deal whose plate was pressed in the campaign list: { accountId, name }; the flyout shows just their usages
  flySurgeonOn = false; // and slid into view
  usagesDirty = false; // a usage was changed in a flyout: the lists read the ratings again when it closes
  sumOpen = false;
  fsOn = false;
  settings = {
    theme: "dark",
    headColour: "pink",
    currency: "local", // the campaign screen's value figures: "local" (each in its own currency) or "usd" (Robert, 2026-11-17)
    zoom: DEFAULT_ZOOM, // the screen size in percent: 100, 90, 80, 70 or 60; 80 until the person chooses (Robert, 2026-11-16)
    altTint: false,
    cols: {},
    widths: {},
    campHidden: null, // the campaign list's columns the person turned off (null until they choose; Robert, 2026-11-19)
    campWidths: null, // the campaign list's column widths the person dragged to ({} for the standard ones; null until they choose; Robert, 2026-11-20)
    hospBook: null, // a ROSA deal's MyCase Bookings: { view, types, procs } (the view and the chips switched off), the same at every hospital; null until they choose (Robert, 2026-11-25)
    ui: {},
    last: null
  };
  rates = null; // the exchange rates held in Salesforce, read the first time US dollars are wanted
  _filter = null; // the choices applied; set once the stage choices and the person are known
  campaigns = []; // the active sales campaigns offered in Change selection
  campaignDetail = null; // the linked campaign and its members, for the campaign screen
  campaignLoadedFor = ""; // the campaign the detail above belongs to
  campaignBusy = false;
  campaignError = "";
  screen = "pipeline"; // which screen is showing when a campaign is linked: pipeline or campaign
  screenIn = ""; // the way the screen coming in slides from: left or right
  leaving = ""; // the screen sliding out right now: pipeline or campaign (it stays on the page for the slide, then goes)
  leaveTo = ""; // the side it slides out to: left or right
  leaveTimer;
  choices = {
    opp: { open: [], closed: [] },
    risk: { open: [], closed: [] },
    rosa: { open: [], closed: [] }
  };
  stageValues = {};
  rt = {};
  recordTypes = {}; // every deal record type's name and Id, for the brand lists
  ctxReady = false;
  choicesReady = false;
  started = false;
  saveTimer;
  announced = false;

  /* ----- the stage choices, read from Salesforce for each kind of deal ----- */
  @wire(getObjectInfo, { objectApiName: SALESRISKS })
  wiredInfo({ data, error }) {
    if (data) {
      const found = {};
      const byName = {};
      Object.values(data.recordTypeInfos || {}).forEach((r) => {
        byName[r.name] = r.recordTypeId;
        KIND_ORDER.forEach((k) => {
          if (r.name === STAGE_RECORD_TYPES[k]) found[k] = r.recordTypeId;
        });
      });
      this.rt = found;
      this.recordTypes = byName;
      if (!KIND_ORDER.every((k) => found[k])) this.useFallbackStages();
    } else if (error) {
      this.useFallbackStages();
    }
  }
  @wire(getPicklistValuesByRecordType, {
    objectApiName: SALESRISKS,
    recordTypeId: "$rtOpp"
  })
  wiredOpp(result) {
    this.takeStages("opp", result);
  }
  @wire(getPicklistValuesByRecordType, {
    objectApiName: SALESRISKS,
    recordTypeId: "$rtRisk"
  })
  wiredRisk(result) {
    this.takeStages("risk", result);
  }
  @wire(getPicklistValuesByRecordType, {
    objectApiName: SALESRISKS,
    recordTypeId: "$rtRosa"
  })
  wiredRosa(result) {
    this.takeStages("rosa", result);
  }
  get rtOpp() {
    return this.rt.opp;
  }
  get rtRisk() {
    return this.rt.risk;
  }
  get rtRosa() {
    return this.rt.rosa;
  }
  takeStages(kind, { data, error }) {
    if (data && data.picklistFieldValues && data.picklistFieldValues.Stage__c) {
      this.stageValues = {
        ...this.stageValues,
        [kind]: data.picklistFieldValues.Stage__c.values.map((v) => v.value)
      };
      if (KIND_ORDER.every((k) => this.stageValues[k])) this.buildChoices();
    } else if (error) {
      this.useFallbackStages();
    }
  }
  buildChoices() {
    const choices = {};
    KIND_ORDER.forEach((k) => {
      choices[k] = splitStages(k, this.stageValues[k]);
    });
    this.choices = choices;
    this.choicesReady = true;
    this.tryStart();
  }
  /** If Salesforce cannot give a deal type's stages, every kind uses the whole Stage list (the screen still works). */
  useFallbackStages() {
    if (this.choicesReady) return;
    const all = this.ctx ? this.ctx.stageOrder : [];
    KIND_ORDER.forEach((k) => {
      this.stageValues[k] = all;
    });
    this.buildChoices();
  }

  connectedCallback() {
    this.onFullScreenChange = () => {
      this.fsOn = !!document.fullscreenElement;
    };
    document.addEventListener("fullscreenchange", this.onFullScreenChange);
    getContext()
      .then((ctx) => {
        this.ctx = ctx;
        this.loadCampaigns();
        this.readSettings(ctx.settingsJson);
        return listFilters().catch(() => []);
      })
      .then((list) => {
        this.savedFilters = list;
        this.ctxReady = true;
        this.tryStart();
      })
      .catch((e) => {
        this.error = errorText(e);
        this.busy = false;
        this.announce();
      });
    // if Salesforce is slow to give the stage choices, carry on with the whole Stage list after a few seconds
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    setTimeout(() => {
      if (!this.choicesReady && this.ctxReady) this.useFallbackStages();
    }, 6000);
  }
  renderedCallback() {
    this.measureTopBar();
  }
  /** The headings that stay at the top sit just under the top bar, so its height is measured (it can wrap on a narrow screen) and given to every list as --stick. */
  measureTopBar() {
    const top = this.template.querySelector(".top");
    const root = this.template.querySelector(".root");
    if (!top || !root) return;
    root.style.setProperty("--stick", `${top.offsetHeight}px`);
    if (!this.topObserver && typeof ResizeObserver !== "undefined") {
      this.topObserver = new ResizeObserver(() => this.measureTopBar());
      this.topObserver.observe(top);
    }
  }
  disconnectedCallback() {
    if (this.topObserver) this.topObserver.disconnect();
    this.topObserver = null;
    document.removeEventListener("fullscreenchange", this.onFullScreenChange);
    clearTimeout(this.panelTimer);
    clearTimeout(this.flyTimer);
    clearTimeout(this.surgeonTimer);
    clearTimeout(this.filtersTimer);
    clearTimeout(this.leaveTimer);
  }

  /* ----- sliding panels: each is put on the page first, slid in a moment later, and taken off once it has slid away ----- */
  slideIn(setOn) {
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    return setTimeout(setOn, SLIDE_IN_DELAY_MS);
  }
  slideOut(remove) {
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    return setTimeout(remove, SLIDE_OUT_MS);
  }

  /** Starts once the person and the stage choices are both known: their default filter, else the filter they last used, else My team (a manager) or everything they own, with opportunities, risks and ROSA deals all on (Robert, 2026-11-07). */
  tryStart() {
    if (this.started || !this.ctxReady || !this.choicesReady) return;
    this.started = true;
    let f = defaultFilter(
      ["opp", "risk", "rosa"],
      this.choices,
      this.startTeam
    );
    const first = this.savedFilters.find((x) => x.isDefault);
    if (first) {
      const parsed = this.parse(first);
      if (parsed) {
        f = parsed.filter;
        this.activeFilterId = first.id;
        this.takeColumns(parsed.saved);
      }
    } else if (this.settings.last) {
      f = fromSaved(
        this.settings.last,
        this.choices,
        this.isManager,
        this.startTeam
      );
    }
    this.filter = f;
    this.loadDeals();
  }
  parse(row) {
    try {
      const saved = JSON.parse(row.json);
      const read = fromSaved(
        saved,
        this.choices,
        this.isManager,
        this.startTeam
      );
      return { saved, filter: read };
    } catch {
      return null;
    }
  }
  /** A filter also holds the layout of the lists (which columns, how wide); running it puts that layout on the screen. */
  takeColumns(saved) {
    const next = { ...this.settings };
    let any = false;
    if (saved.cols && typeof saved.cols === "object") {
      next.cols = saved.cols;
      any = true;
    }
    if (saved.widths && typeof saved.widths === "object") {
      next.widths = saved.widths;
      any = true;
    }
    if (any) {
      this.settings = next;
      this.persist();
    }
  }

  readSettings(json) {
    if (!json) return;
    try {
      const s = JSON.parse(json);
      this.settings = {
        theme: s.theme === "light" ? "light" : "dark",
        headColour: HEAD_COLOURS.some((h) => h.key === s.headColour)
          ? s.headColour
          : "pink",
        zoom: cleanZoom(s.zoom),
        currency: s.currency === "usd" ? "usd" : "local",
        altTint: !!s.altTint,
        cols: s.cols && typeof s.cols === "object" ? s.cols : {},
        widths: s.widths && typeof s.widths === "object" ? s.widths : {},
        campHidden: Array.isArray(s.campHidden)
          ? s.campHidden.filter((x) => typeof x === "string")
          : null,
        campWidths: cleanWidths(s.campWidths),
        hospBook: cleanHospBook(s.hospBook),
        ui: s.ui && typeof s.ui === "object" ? s.ui : {},
        last: s.last && typeof s.last === "object" ? s.last : null
      };
      // opening in US dollars: the rates are read now (and if they cannot be, the screen simply shows local currencies)
      if (this.settings.currency === "usd") this.ensureRates();
      // the summary panels, the Team table and the lists always open folded (Robert, 2026-11-07), whatever was left open last time
    } catch {
      // unreadable settings: keep the defaults
    }
  }
  persist() {
    clearTimeout(this.saveTimer);
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    this.saveTimer = setTimeout(() => {
      saveSettings({ settingsJson: JSON.stringify(this.settings) }).catch(
        () => {
          // a failed save only means the choice is not remembered next time
        }
      );
    }, 600);
  }

  loadDeals(silent) {
    this.busy = !silent;
    this.error = "";
    return getDeals({ filterJson: JSON.stringify(serverFilter(this.filter)) })
      .then((res) => {
        const before = this.allDeals;
        this.allDeals = res.deals;
        this.closeFlyoutIfGone(before);
        this.truncated = res.truncated;
        this.teamNames = res.teamNames || {};
        this.asAt = new Date().toLocaleString("en-AU", {
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit"
        });
      })
      .catch((e) => {
        this.error = errorText(e);
      })
      .finally(() => {
        this.busy = false;
        this.announce();
      });
  }
  /** Tells the Visualforce page the first read is done, so it can fade the loading screen away. */
  announce() {
    if (this.announced) return;
    this.announced = true;
    this.dispatchEvent(
      new CustomEvent("pipelineready", { bubbles: true, composed: true })
    );
  }

  /* ----- what the template needs ----- */
  /** While the Pipeline screen slides away to the campaign screen the page's own scroll bar is taken off at once, so it does not hang on
   *  until the end of the slide and then vanish, which made the campaign screen jerk to the right (Robert, 2026-11-17). */
  get rootClass() {
    return this.leaving === "pipeline" ? "root nosb" : "root";
  }
  /** The zoom the person chose, as the one number (--z) the whole screen is scaled by. */
  get rootStyle() {
    return zoomStyle(this.settings.zoom);
  }
  get theme() {
    return this.settings.theme;
  }
  get headColour() {
    return this.settings.headColour;
  }
  /** The four heading colours for the settings panel; the chosen one is marked. */
  get headOptions() {
    return HEAD_COLOURS.map((h) => ({
      ...h,
      cls: h.key === this.settings.headColour ? "hc on" : "hc",
      dotCls: "dot " + h.key
    }));
  }
  /* ----- the campaign linked in Change selection: the view shows its deals, and a switch at the top middle changes to its members ----- */
  get filter() {
    return this._filter;
  }
  set filter(value) {
    this._filter = value;
    this.syncCampaign();
  }
  get linkedCampaignId() {
    return (this._filter && this._filter.campId) || "";
  }
  get showViewToggle() {
    return this.ready && !!this.linkedCampaignId;
  }
  get viewOptions() {
    return [
      { value: "campaign", label: "Campaign" },
      { value: "pipeline", label: "Pipeline" }
    ];
  }
  get showPipelineScreen() {
    return this.ready && (!this.linkedCampaignId || this.screen === "pipeline");
  }
  /** The Pipeline screen stays on the page while the campaign screen shows (hidden, not removed), so what the person opened is still open when they come back. */
  get pipelineMainCls() {
    if (this.leaving === "pipeline") return "main out-" + this.leaveTo;
    const away = !this.showPipelineScreen;
    return (
      "main" +
      (away ? " away" : "") +
      (!away && this.screenIn ? " slide-" + this.screenIn : "")
    );
  }
  /** The Opportunities, Risks, ROSA and Status row drives the Pipeline view only, so it is not on the campaign screen at all (Robert,
   *  2026-11-17). It goes, and comes back, at once, in the same pass that builds the screen, so the campaign screen is laid out in its
   *  final shape from the first moment (a fold would leave the members list measured for the old, shorter room). */
  get showBar() {
    return this.ready && this.screen !== "campaign";
  }
  get showCampaignScreen() {
    return (
      this.ready &&
      !!this.linkedCampaignId &&
      (this.screen === "campaign" || this.leaving === "campaign")
    );
  }
  get screenCls() {
    if (this.leaving === "campaign") return "main cscreen out-" + this.leaveTo;
    return "main cscreen" + (this.screenIn ? " slide-" + this.screenIn : "");
  }
  /** Both screens move: the one going away slides out as the other slides in (the motion standard, 0.4 s). */
  handleViewPick(event) {
    const next = event.detail.value;
    if (next === this.screen) return;
    // Pipeline flies off to the right as the campaign comes in from the left, and back again the other way
    this.screenIn = next === "campaign" ? "left" : "right";
    this.leaveTo = next === "campaign" ? "right" : "left";
    this.leaving = this.screen;
    this.screen = next;
    clearTimeout(this.leaveTimer);
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    this.leaveTimer = setTimeout(() => {
      this.leaving = "";
    }, SLIDE_OUT_MS);
  }
  /** Reads the linked campaign when the choice changes, and goes back to the deals when the campaign is unlinked. */
  syncCampaign() {
    const id = this.linkedCampaignId;
    if (!id) {
      this.campaignDetail = null;
      this.campaignLoadedFor = "";
      this.screen = "pipeline";
      this.screenIn = "";
      this.leaving = "";
      return;
    }
    if (id !== this.campaignLoadedFor) {
      this.screen = "pipeline"; // after Apply the person is back on the deals
      this.screenIn = "";
      this.leaving = "";
      this.loadCampaign();
    }
  }
  /** A deal was put in or taken out of the campaign (Maintain mode): read the campaign's members and tiles again, and the deals, quietly. */
  handleCampaignDealChange() {
    this.loadCampaign(true);
    this.loadDeals(true);
  }
  /**
   * The refresh button in the top row (Robert, 2026-11-19): reads again what the screen is showing, the deals and, on a campaign, the
   * campaign's members, so changes made elsewhere in Salesforce show without leaving the screen. The "Please wait" cover is on while it
   * reads, and the "As at" time moves.
   */
  async handleRefresh() {
    if (this.busy) return;
    const deals = this.loadDeals(true);
    const campaign = this.linkedCampaignId
      ? this.loadCampaign(true)
      : Promise.resolve();
    this.busy = true; // loadDeals(true) switches the cover off at the start, so it goes on after
    try {
      await Promise.all([deals, campaign]);
    } finally {
      this.busy = false;
    }
  }
  async loadCampaign(quiet) {
    const id = this.linkedCampaignId;
    this.campaignLoadedFor = id;
    this.campaignError = "";
    if (!id) return;
    if (!quiet) this.campaignBusy = true;
    try {
      const detail = await getCampaign({ campaignId: id });
      if (id === this.linkedCampaignId) this.campaignDetail = detail;
    } catch (e) {
      // a quiet re-read that fails leaves what is on the screen as it is
      if (!quiet) {
        this.campaignDetail = null;
        this.campaignError =
          e && e.body ? e.body.message : "The campaign could not be read.";
      }
    } finally {
      this.campaignBusy = false;
    }
  }
  async loadCampaigns() {
    try {
      const all = await listCampaigns();
      this.campaigns = (all || []).filter((c) => c.active);
    } catch {
      this.campaigns = []; // without access to campaigns the choice simply offers none
    }
  }
  get campaignName() {
    return this.campaignDetail
      ? this.campaignDetail.campaign.name
      : (this._filter && this._filter.campName) || "";
  }
  get campaignStatusText() {
    return this.campaignDetail && this.campaignDetail.campaign.active
      ? "Active"
      : "Inactive";
  }
  get campaignStatusCls() {
    return this.campaignDetail && this.campaignDetail.campaign.active
      ? "tag fill good"
      : "tag fill bad";
  }
  get campaignFacts() {
    const c = this.campaignDetail ? this.campaignDetail.campaign : null;
    if (!c) return "";
    return [
      c.portfolios.join(", "),
      c.managerName ? "Campaign Manager " + c.managerName : ""
    ]
      .filter(Boolean)
      .join(" · ");
  }
  get ready() {
    return !!(this.ctx && this.filter);
  }
  get isManager() {
    return !!(this.ctx && this.ctx.isManager);
  }
  /** A person who manages a team starts on My team; a team viewer with no team of their own starts on no team. */
  get startTeam() {
    return this.ctx && this.ctx.hasOwnTeam ? MINE : "";
  }
  get viewerId() {
    return this.ctx ? this.ctx.userId : "";
  }
  get isRep() {
    return !!this.ctx && !this.ctx.isManager;
  }
  get teams() {
    return this.ctx ? this.ctx.teams : [];
  }
  get stageOrder() {
    return this.ctx ? this.ctx.stageOrder : [];
  }
  /** When the deals on the screen were read, beside the logo. The version is in the settings panel, not here. */
  get asAtText() {
    return this.asAt ? `As at ${this.asAt}` : "";
  }
  get settingsScrimCls() {
    return this.settingsOpen ? "scrim on" : "scrim";
  }
  get settingsHidden() {
    return this.settingsOpen ? "false" : "true";
  }
  get settingsFlyCls() {
    return this.settingsOpen ? "fly on" : "fly";
  }
  get fsCls() {
    return this.fsOn ? "icb fsbtn on" : "icb fsbtn";
  }
  get fsText() {
    return this.fsOn ? "Exit full screen" : "Full screen";
  }
  get darkCls() {
    return this.settings.theme === "dark" ? "on" : "";
  }
  get lightCls() {
    return this.settings.theme === "light" ? "on" : "";
  }

  /** The lists to choose from in the panel: Salesforce's own lists, plus anything extra found in the deals read. */
  get options() {
    const ctx = this.ctx || {};
    const deals = this.allDeals;
    const nonRosa = deals.filter((d) => d.kind !== "rosa");
    const merge = (listed, found, sort) => {
      const extra = [...new Set(found.filter(Boolean))].filter(
        (x) => !(listed || []).includes(x)
      );
      return [
        ...(listed || []),
        ...(sort ? extra.sort(sort) : extra.sort((a, b) => a.localeCompare(b)))
      ];
    };
    return {
      countries: merge(
        ctx.countries,
        deals.map((d) => d.ownerCountry)
      ),
      states: ctx.stateCodes || [],
      segments: merge(
        ctx.portfolios,
        nonRosa.flatMap((d) =>
          (d.segment || "").split(";").map((x) => x.trim())
        )
      ),
      brands: merge(
        ctx.brands,
        nonRosa.flatMap((d) => (d.brands || "").split(";").map((b) => b.trim()))
      ),
      quarters: merge(
        [], // only the quarters (with their years) that deals actually have; the bare Q1 to Q4 are not offered
        deals.map((d) => d.quarter),
        (a, b) => quarterRank(a) - quarterRank(b)
      )
    };
  }

  /** US dollars are on: the person chose USD and the Salesforce rates have been read. */
  get usdOn() {
    return this.settings.currency === "usd" && !!this.rates;
  }
  /** The deals left after every choice applied on the screen, except a single owner (the Team table lists everyone). With USD chosen
   *  every deal's value is in US dollars (Robert, 2026-11-17), so every summary, table and total below works in one currency. */
  get dealsForPeople() {
    const now = Date.now();
    const f = { ...this.filter, ownerId: "" };
    const kept = this.allDeals.filter((d) => clientMatch(d, f, now));
    return this.usdOn ? usdDeals(kept, this.rates) : kept;
  }
  /** The team member the screen is filtered down to (their name follows each list's heading), or blank. */
  get focusRepName() {
    const f = this.filter;
    if (!f || !f.ownerId) return "";
    if (f.ownerName) return f.ownerName;
    const d = this.dealsForPeople.find((x) => x.ownerId === f.ownerId);
    return d ? d.ownerName || "" : "";
  }
  /** The deals left after every choice, including a single owner. */
  get visibleDeals() {
    const owner = this.filter.ownerId;
    return owner
      ? this.dealsForPeople.filter((d) => d.ownerId === owner)
      : this.dealsForPeople;
  }
  get teamWidths() {
    return this.settings.widths.team;
  }
  get sections() {
    const deals = this.visibleDeals;
    return KIND_ORDER.filter((k) => this.filter.kinds.includes(k)).map((k) => ({
      kind: k,
      deals: deals.filter((d) => d.kind === k),
      columns: this.settings.cols[k],
      widths: this.settings.widths[k],
      // an end user has a handful of deals, so their lists start open (Robert, 2026-11-09). A manager's start folded, except Opportunities, the
      // list people look at most, which starts open whenever the choices include it (Robert, 2026-11-17); Risks, ROSA, the Team table and the
      // summary panels stay folded
      listOpen: this.isRep || k === "opp"
    }));
  }
  get filterStatus() {
    return derivedStatus(this.filter, this.choices);
  }

  get teamStartsOpen() {
    return false;
  }
  get showTeamTable() {
    return this.isManager && this.filter.kinds.length > 0;
  }
  get teamPicked() {
    return !!this.filter.teamId;
  }
  /** Up to three equal panels across; a lone panel takes half the width. */
  get dcolsStyle() {
    return `grid-template-columns:repeat(${Math.max(2, this.filter.kinds.length)},minmax(0,1fr))`;
  }

  /* ----- applying choices ----- */
  /** Puts new choices on the screen, reading the deals again only when a server-side choice changed. */
  applyFilter(next) {
    const reload = serverChanged(this.filter, next);
    this.filter = next;
    this.settings = { ...this.settings, last: next };
    this.persist();
    if (reload) this.loadDeals();
  }
  handleKindToggle(event) {
    this.applyFilter(toggleKind(this.filter, event.detail.kind, this.choices));
  }
  handleStatusPick(event) {
    this.applyFilter(withStatus(this.filter, event.detail.value, this.choices));
  }
  handleOpenPanel() {
    clearTimeout(this.panelTimer);
    this.panelOpen = true;
    this.panelTimer = this.slideIn(() => {
      this.panelOn = true;
    });
  }
  closePanel() {
    clearTimeout(this.panelTimer);
    this.panelOn = false;
    this.panelTimer = this.slideOut(() => {
      this.panelOpen = false;
    });
  }
  handlePanelApply(event) {
    this.applyFilter(event.detail.filter);
    this.closePanel();
  }
  handlePanelReset(event) {
    this.applyFilter(event.detail.filter);
    this.activeFilterId = "";
  }
  handlePanelCancel() {
    this.closePanel();
  }
  handlePickRep(event) {
    this.filter = {
      ...this.filter,
      ownerId: event.detail.ownerId,
      ownerName: event.detail.ownerName || ""
    };
  }

  /* ----- saved filters ----- */
  /** What the screen is showing right now, as JSON: the choices and the list columns. */
  get snapshot() {
    return JSON.stringify({
      ...this.filter,
      cols: this.settings.cols,
      widths: this.settings.widths
    });
  }
  openFilterById(id) {
    const row = this.savedFilters.find((f) => f.id === id);
    const parsed = row && this.parse(row);
    if (!parsed) return;
    this.activeFilterId = id;
    this.takeColumns(parsed.saved);
    this.applyFilter(parsed.filter);
  }
  /* ----- the My filters panel (opened from the button in the top row) ----- */
  handleFiltersToggle() {
    if (this.filtersOn) this.closeFilters();
    else this.openFilters();
  }
  openFilters() {
    clearTimeout(this.filtersTimer);
    this.filtersMounted = true;
    this.filtersTimer = this.slideIn(() => {
      this.filtersOn = true;
    });
  }
  closeFilters() {
    clearTimeout(this.filtersTimer);
    this.filtersOn = false;
    this.filtersTimer = this.slideOut(() => {
      this.filtersMounted = false;
    });
  }
  /** Running a filter makes it what the screen shows and puts the panel away. */
  handleOpenFilter(event) {
    this.openFilterById(event.detail.id);
    this.closeFilters();
  }
  /** The filter's own words: the deal types, Open / Closed / Both / Custom, and what it narrows to. */
  summaryOf(f) {
    if (!f || !f.stages || !this.choices) return "";
    const status = {
      open: "Open",
      closed: "Closed",
      both: "Open and closed",
      custom: "Chosen stages"
    }[derivedStatus(f, this.choices)];
    const chips = chipList(f, this.choices, this.teams, this.isRep)
      .map((c) => (c.label ? `${c.label} ${c.text}` : c.text))
      .join(", ");
    return [f.kinds.map((k) => NAMES[k]).join(", "), status, chips]
      .filter(Boolean)
      .join(" · ");
  }
  get filterRows() {
    return (this.savedFilters || []).map((row) => {
      const parsed = this.parse(row);
      return {
        id: row.id,
        name: row.name,
        isDefault: row.isDefault,
        summary: parsed ? this.summaryOf(parsed.filter) : ""
      };
    });
  }
  get screenSummary() {
    return this.summaryOf(this.filter);
  }
  get activeFilterName() {
    const row = (this.savedFilters || []).find(
      (f) => f.id === this.activeFilterId
    );
    return row ? row.name : "";
  }
  get filterButtonLabel() {
    return this.activeFilterName || "Filters";
  }
  get filterIsDefault() {
    const row = (this.savedFilters || []).find(
      (f) => f.id === this.activeFilterId
    );
    return !!(row && row.isDefault);
  }
  /** What is on the screen no longer matches the filter that was opened (its choices, or its list columns and widths). */
  get filterChanged() {
    const row = (this.savedFilters || []).find(
      (f) => f.id === this.activeFilterId
    );
    const parsed = row && this.parse(row);
    if (!parsed || !this.filter || !this.filter.stages) return false;
    if (stableJson(parsed.filter) !== stableJson(this.filter)) return true;
    const { cols, widths } = parsed.saved;
    return !!(
      (cols &&
        typeof cols === "object" &&
        stableJson(cols) !== stableJson(this.settings.cols)) ||
      (widths &&
        typeof widths === "object" &&
        stableJson(widths) !== stableJson(this.settings.widths))
    );
  }
  get canShareWithTeam() {
    return !!(this.ctx && this.ctx.hasOwnTeam);
  }
  handleFiltersChanged(event) {
    const active = event.detail.activeId;
    listFilters()
      .then((list) => {
        this.savedFilters = list;
        this.activeFilterId = list.some((f) => f.id === active) ? active : "";
      })
      .catch((e) => {
        this.error = errorText(e);
      });
  }

  /* ----- the deal flyout ----- */
  get flyDeal() {
    if (!this.flyId) return undefined;
    const own = this.allDeals.find((d) => d.id === this.flyId);
    const extra = this.flyExtra.find((d) => d.id === this.flyId);
    return (this.flyFromCampaign ? extra || own : own) || this.flyLeaving;
  }
  get flyIndex() {
    return this.flyIds.indexOf(this.flyId);
  }
  get flyTotal() {
    return this.flyIds.length;
  }
  /* ----- the ROSA deal screen: a ROSA deal opens rosaDeal over the page instead of the deal flyout (0.179) ----- */
  rosaId = "";
  rosaSaved = false;
  openRosa(id) {
    this.rosaSaved = false;
    this.rosaId = id;
  }
  handleRosaSaved() {
    this.rosaSaved = true;
  }
  handleRosaClose() {
    this.rosaId = "";
    if (this.rosaSaved) {
      this.rosaSaved = false;
      this.loadDeals(true);
      if (this.linkedCampaignId) this.loadCampaign(true);
    }
  }
  handleDealOpen(event) {
    const asked = this.allDeals.find((d) => d.id === event.detail.id);
    if (asked && asked.kind === "rosa") {
      this.openRosa(asked.id);
      return;
    }
    clearTimeout(this.flyTimer);
    this.flyLeaving = undefined;
    this.flyFromCampaign = false;
    this.flyExtra = [];
    this.flyIds = event.detail.ids;
    this.flyId = event.detail.id;
    this.flyScreen = event.detail.screen || "deal";
    if (!this.flyOn) {
      this.flyTimer = this.slideIn(() => {
        this.flyOn = true;
      });
    }
  }
  /**
   * A deal's line in the campaign list was clicked (Robert, 2026-11-19): the deals listed there are read by id (they may include ones
   * Pipeline's own list leaves out) and the flyout opens on the one clicked, with Previous and Next stepping through those deals in the
   * order they are listed.
   */
  async handleCampaignDealOpen(event) {
    const { id, ids, screen } = event.detail;
    this.busy = true;
    let deals = [];
    try {
      deals = await getDealsByIds({ ids });
    } catch (e) {
      this.error = errorText(e);
      return;
    } finally {
      this.busy = false;
    }
    const have = new Set(deals.map((d) => d.id));
    if (!have.has(id)) {
      this.error = "That deal could not be opened.";
      return;
    }
    const rosa = deals.find((d) => d.id === id && d.kind === "rosa");
    if (rosa) {
      this.openRosa(id);
      return;
    }
    clearTimeout(this.flyTimer);
    this.flyLeaving = undefined;
    this.flyFromCampaign = true;
    this.flyExtra = deals;
    this.flyIds = ids.filter((i) => have.has(i));
    this.flyId = id;
    this.flyScreen = screen || "deal";
    if (!this.flyOn) {
      this.flyTimer = this.slideIn(() => {
        this.flyOn = true;
      });
    }
  }
  /**
   * A usage was added, changed or deleted from a flyout (Robert, 2026-11-19: a new usage got a rating but the table did not show it). The
   * lists read the ratings again quietly when the flyout is closed, a little later than the change, because Salesforce recalculates a
   * surgeon's rating in the background.
   */
  handleUsagesChanged() {
    this.usagesDirty = true;
  }
  refreshAfterUsages() {
    if (!this.usagesDirty) return;
    this.usagesDirty = false;
    this.loadDeals(true);
    this.loadCampaign(true);
  }
  handleDealClose() {
    this.refreshAfterUsages();
    clearTimeout(this.flyTimer);
    this.flyOn = false;
    this.flyTimer = this.slideOut(() => {
      this.flyId = "";
      this.flyLeaving = undefined;
      this.flyFromCampaign = false;
      this.flyExtra = [];
      this.flyScreen = "deal";
    });
  }
  /**
   * A rating plate of a surgeon with no deal yet was pressed in the campaign list (Robert, 2026-11-19): there is no deal to open, so a
   * flyout of the same kind opens with just the surgeon's usages (the Usage Card), where a usage can be added. A screen to add a deal
   * for them is planned next.
   */
  handleSurgeonOpen(event) {
    clearTimeout(this.surgeonTimer);
    this.flySurgeon = event.detail;
    if (!this.flySurgeonOn) {
      this.surgeonTimer = this.slideIn(() => {
        this.flySurgeonOn = true;
      });
    }
  }
  /**
   * A new deal was made for a surgeon with none, from the campaign list (Robert, 2026-11-19): it has joined the campaign (or the screen says
   * why not), the surgeon's flyout slides away and the deal's own flyout (the four screens) slides in on it; the lists read the deals again.
   */
  async handleDealCreated(event) {
    const { id, linkError } = event.detail;
    this.handleSurgeonClose();
    this.loadCampaign(true);
    this.loadDeals(true);
    await this.handleCampaignDealOpen({
      detail: { id, ids: [id], screen: "deal" }
    });
    this.error = linkError
      ? `The deal was created, but it could not be added to the campaign: ${linkError}`
      : this.flyId === id
        ? ""
        : "The deal was created, but you cannot open it here.";
  }
  handleSurgeonClose() {
    this.refreshAfterUsages();
    clearTimeout(this.surgeonTimer);
    this.flySurgeonOn = false;
    this.surgeonTimer = this.slideOut(() => {
      this.flySurgeon = null;
    });
  }
  /**
   * Called after the deals are read again. If the deal being looked at is no longer among them (a save moved it out of the
   * open or the closed choice) its panel closes, sliding away, and the screen goes back to the list; the previous / next
   * buttons only step through deals that are still there. Without this the panel stayed "open" behind the scenes and came
   * back by itself when the choices later brought that deal into the list again (Robert, 2026-11-07).
   */
  closeFlyoutIfGone(before) {
    if (!this.flyId || this.flyFromCampaign) return; // a deal opened from the campaign is not tied to Pipeline's own list
    const { ids, gone } = reconcileFlyout(
      this.flyId,
      this.flyIds,
      this.allDeals
    );
    this.flyIds = ids;
    if (!gone) return;
    this.flyLeaving = (before || []).find((d) => d.id === this.flyId);
    this.handleDealClose();
  }
  handleDealPrev() {
    const i = this.flyIndex;
    if (i > 0) this.flyId = this.flyIds[i - 1];
  }
  handleDealNext() {
    const i = this.flyIndex;
    if (i < this.flyIds.length - 1) this.flyId = this.flyIds[i + 1];
  }
  /** A deal was saved or posted on: read the deals again quietly so the lists show the new values. */
  handleDealSaved() {
    this.loadDeals(true);
    if (this.flyFromCampaign) this.refreshCampaignFly();
  }
  /**
   * A deal opened from the campaign list was saved or posted on (Robert, 2026-11-19: "refresh the list after a save"): the campaign's list
   * behind the flyout is read again quietly, and so are the deals the flyout steps through, so both show the new figures. The deal being
   * looked at stays open even if the change took it out of the campaign; the others stay only while they are still in it.
   */
  async refreshCampaignFly() {
    const asked = this.flyId;
    await this.loadCampaign(true);
    const members = (this.campaignDetail && this.campaignDetail.members) || [];
    const listed = new Set();
    members.forEach((m) => (m.deals || []).forEach((d) => listed.add(d.id)));
    const ids = this.flyIds.filter((i) => i === asked || listed.has(i));
    try {
      const deals = await getDealsByIds({ ids });
      if (!this.flyFromCampaign || this.flyId !== asked) return;
      this.flyExtra = deals;
      this.flyIds = ids.filter((i) => deals.some((d) => d.id === i));
    } catch {
      // a quiet re-read that fails leaves the flyout as it is
    }
  }

  /* ----- other changes ----- */
  handleSummaryToggle() {
    this.sumOpen = !this.sumOpen;
    this.rememberUi({ sum: this.sumOpen });
  }
  handleListToggle(event) {
    const { kind, open } = event.detail;
    this.rememberUi({
      lists: { ...(this.settings.ui.lists || {}), [kind]: open }
    });
  }
  handleTeamToggle(event) {
    this.rememberUi({ team: event.detail.open });
  }
  /** Remembers which panels the person left open, in their own settings. */
  rememberUi(patch) {
    this.settings = { ...this.settings, ui: { ...this.settings.ui, ...patch } };
    this.persist();
  }
  handleColumnsChange(event) {
    const { kind, columns } = event.detail;
    const cols = { ...this.settings.cols };
    if (columns) cols[kind] = columns;
    else delete cols[kind];
    this.settings = { ...this.settings, cols };
    this.persist();
  }
  /** The campaign list's Columns picker was used: the columns turned off are kept in the person's settings. */
  handleCampaignColumns(event) {
    this.settings = { ...this.settings, campHidden: event.detail.hidden };
    this.persist();
  }
  /** The MyCase Bookings view or chips of a ROSA deal were changed: kept in the person's settings, the same for every hospital. */
  handleHospBookChange(event) {
    this.settings = { ...this.settings, hospBook: cleanHospBook(event.detail) };
    this.persist();
  }
  /** The campaign list's column widths were dragged or reset: kept in the person's settings ({} means the standard widths). */
  handleCampaignWidths(event) {
    this.settings = {
      ...this.settings,
      campWidths: event.detail.widths ? { ...event.detail.widths } : {}
    };
    this.persist();
  }
  handleWidthsChange(event) {
    const { kind, widths } = event.detail;
    const all = { ...this.settings.widths };
    if (widths) all[kind] = widths;
    else delete all[kind];
    this.settings = { ...this.settings, widths: all };
    this.persist();
  }
  handleSettingsOpen() {
    this.settingsOpen = true;
  }
  handleSettingsClose() {
    this.settingsOpen = false;
  }
  handleTheme(event) {
    this.settings = {
      ...this.settings,
      theme: event.currentTarget.dataset.theme
    };
    this.persist();
  }
  handleHeadColour(event) {
    this.settings = {
      ...this.settings,
      headColour: event.currentTarget.dataset.head
    };
    this.persist();
  }
  /** The Currency switch was flicked (here or on the campaign screen): reads the Salesforce rates the first time US dollars are wanted,
   *  and, if they cannot be read, stays on local currencies and saves nothing. */
  async handleCurrencyChange(event) {
    const wantUsd = event.detail.value === "usd";
    if (wantUsd && !(await this.ensureRates())) return;
    this.settings = { ...this.settings, currency: wantUsd ? "usd" : "local" };
    this.persist();
  }
  async ensureRates() {
    if (this.rates) return true;
    try {
      this.rates = await currencyRates();
      return true;
    } catch {
      return false;
    }
  }
  handleZoom(event) {
    this.settings = { ...this.settings, zoom: cleanZoom(event.detail.value) };
    this.persist();
  }
  handleTint(event) {
    this.settings = { ...this.settings, altTint: event.target.checked };
    this.persist();
  }

  /**
   * Inside Salesforce there is little room (banner, navigation), so this opens Pipeline on its own page in a new tab.
   * On that page it switches the browser's own full screen on and off (the same as NPI and ACCRURA).
   */
  handleFullScreen() {
    if (isEmbedded()) {
      window.open(
        window.location.origin + "/apex/PipelineApp?nocache=1",
        "_blank",
        "noopener"
      );
      return;
    }
    if (document.fullscreenElement) {
      document.exitFullscreen();
      return;
    }
    const el = document.documentElement;
    const request = el.requestFullscreen || el.webkitRequestFullscreen;
    if (request) request.call(el);
  }
}
