import { LightningElement, wire } from "lwc";
import {
  getObjectInfo,
  getPicklistValuesByRecordType
} from "lightning/uiObjectInfoApi";
import SALESRISKS from "@salesforce/schema/SalesRisks__c";
import getContext from "@salesforce/apex/PipelineController.getContext";
import getDeals from "@salesforce/apex/PipelineController.getDeals";
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
const PIPELINE_VERSION = "0.93";

/** The colours a person can choose for the headings (Robert, 2026-11-02); the look of each is in pipelineApp.css. */
const HEAD_COLOURS = [
  { key: "pink", label: "Pink" },
  { key: "sky", label: "Sky blue" },
  { key: "lime", label: "Lime green" },
  { key: "cyan", label: "Cyan" }
];
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
  flyLeaving; // the deal whose panel is sliding away because a save moved it out of what the screen shows
  savedFilters = [];
  activeFilterId = "";
  settingsOpen = false;
  panelOpen = false; // the selection panel is on the page (it stays a moment after closing, to slide away)
  panelOn = false; // and this says it is slid into view
  filtersMounted = false; // the My filters panel: on the page (it stays a moment after closing, to slide away)
  filtersOn = false; // and slid into view
  flyOn = false; // the same for the deal flyout
  sumOpen = false;
  fsOn = false;
  settings = {
    theme: "dark",
    headColour: "pink",
    altTint: false,
    cols: {},
    widths: {},
    ui: {},
    last: null
  };
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
  disconnectedCallback() {
    document.removeEventListener("fullscreenchange", this.onFullScreenChange);
    clearTimeout(this.panelTimer);
    clearTimeout(this.flyTimer);
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
        altTint: !!s.altTint,
        cols: s.cols && typeof s.cols === "object" ? s.cols : {},
        widths: s.widths && typeof s.widths === "object" ? s.widths : {},
        ui: s.ui && typeof s.ui === "object" ? s.ui : {},
        last: s.last && typeof s.last === "object" ? s.last : null
      };
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
  get rootClass() {
    return "root";
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
  async loadCampaign() {
    const id = this.linkedCampaignId;
    this.campaignLoadedFor = id;
    this.campaignError = "";
    if (!id) return;
    this.campaignBusy = true;
    try {
      const detail = await getCampaign({ campaignId: id });
      if (id === this.linkedCampaignId) this.campaignDetail = detail;
    } catch (e) {
      this.campaignDetail = null;
      this.campaignError =
        e && e.body ? e.body.message : "The campaign could not be read.";
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
      c.managerName ? "Manager " + c.managerName : ""
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

  /** The deals left after every choice applied on the screen, except a single owner (the Team table lists everyone). */
  get dealsForPeople() {
    const now = Date.now();
    const f = { ...this.filter, ownerId: "" };
    return this.allDeals.filter((d) => clientMatch(d, f, now));
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
      listOpen: false
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
    return this.flyId
      ? this.allDeals.find((d) => d.id === this.flyId) || this.flyLeaving
      : undefined;
  }
  get flyIndex() {
    return this.flyIds.indexOf(this.flyId);
  }
  get flyTotal() {
    return this.flyIds.length;
  }
  handleDealOpen(event) {
    clearTimeout(this.flyTimer);
    this.flyLeaving = undefined;
    this.flyIds = event.detail.ids;
    this.flyId = event.detail.id;
    if (!this.flyOn) {
      this.flyTimer = this.slideIn(() => {
        this.flyOn = true;
      });
    }
  }
  handleDealClose() {
    clearTimeout(this.flyTimer);
    this.flyOn = false;
    this.flyTimer = this.slideOut(() => {
      this.flyId = "";
      this.flyLeaving = undefined;
    });
  }
  /**
   * Called after the deals are read again. If the deal being looked at is no longer among them (a save moved it out of the
   * open or the closed choice) its panel closes, sliding away, and the screen goes back to the list; the previous / next
   * buttons only step through deals that are still there. Without this the panel stayed "open" behind the scenes and came
   * back by itself when the choices later brought that deal into the list again (Robert, 2026-11-07).
   */
  closeFlyoutIfGone(before) {
    if (!this.flyId) return;
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
