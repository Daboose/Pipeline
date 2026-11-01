import { LightningElement, api, wire } from "lwc";
import { getPicklistValuesByRecordType } from "lightning/uiObjectInfoApi";
import SALESRISKS from "@salesforce/schema/SalesRisks__c";
import searchOwners from "@salesforce/apex/PipelineFilterController.searchOwners";
import {
  KINDS,
  NAMES,
  MINE,
  derivedStatus,
  withStatus,
  toggleKind,
  defaultFilter,
  stagesOf,
  teamRows
} from "c/pipelineFilterModel";
import { quarterRank } from "c/pipelineFormat";

/** Brand lists already read, by record type, so a record type is asked for only once. */
const BRAND_CACHE = new Map();
const PORTFOLIO_NAMES = { ZBEdge: "ZBEDGE" };

const STATUSES = [
  ["open", "Open"],
  ["closed", "Closed"],
  ["both", "Both"],
  ["custom", "Custom"]
];
const RANGES = [
  [3, "Last 3 months"],
  [12, "Last 12 months"],
  [24, "Last 24 months"],
  [999, "All"]
];

function errorText(e) {
  return (
    (e && e.body && e.body.message) ||
    (e && e.message) ||
    "That did not work. Try again."
  );
}

/**
 * Pipeline: the Change selection panel (Choose Your Data). Opens over the screen from the top with the screen behind it
 * blurred. The person edits a copy of their choices (a team from the team tree or none, an owner, country, state, only
 * rep priority / state priority / on hold, portfolio, brand, stages, a range of expected close quarters, only deals that
 * need attention, how far back closed deals go) and nothing changes on the screen until Apply. Cancel throws the copy
 * away. Reset puts everything back to the person's usual starting point. It lists only real values: stages come from
 * Salesforce for each deal type, and countries, states, portfolios, brands and quarters from the deals read.
 */
export default class PipelineSelection extends LightningElement {
  /** True once the panel is to be slid into view; false slides it back up (the screen keeps it on the page while it slides). */
  @api open = false;
  @api filter = {};
  @api choices = {};
  @api teams = [];
  @api options = {};
  @api isManager = false;
  @api startTeam = "";
  @api recordTypes = {}; // record type name to Id, to read the brands that apply

  draft = {};
  opened = {};
  treeSeeded = false; // the team tree has been opened down to the chosen team
  scrollToTeam = false;
  teamQ = "";
  ownerQ = "";
  ownerResults = [];
  error = "";
  timer;
  brandValues = null; // the brands that apply to the portfolios and countries chosen; null while unknown
  brandsLoading = false;
  brandsFailed = false;
  pendingRt; // the record type whose brands are being read now
  queue = [];
  wantedRts = [];

  connectedCallback() {
    this.draft = JSON.parse(JSON.stringify(this.filter));
    this.refreshBrands();
  }
  renderedCallback() {
    if (!this.treeSeeded && (this.teams || []).length) {
      this.treeSeeded = true;
      this.openToTeam(this.draft.teamId);
      this.scrollToTeam = true;
    } else if (this.scrollToTeam) {
      this.scrollToTeam = false;
      const tree = this.template.querySelector(".tree");
      const sel = this.template.querySelector(".tree .trow.sel");
      if (tree && sel) {
        const gap =
          sel.getBoundingClientRect().top - tree.getBoundingClientRect().top;
        tree.scrollTop += gap - tree.clientHeight / 3;
      }
    }
  }
  /** Opens every branch above the chosen team, so it is in view when the panel opens (no clicking down to it). */
  openToTeam(teamId) {
    if (!teamId || teamId === MINE) return;
    const byId = new Map((this.teams || []).map((t) => [t.id, t]));
    const opened = { ...this.opened };
    const seen = new Set();
    let parent = byId.get((byId.get(teamId) || {}).parentId);
    while (parent && !seen.has(parent.id)) {
      seen.add(parent.id);
      opened[parent.id] = true;
      parent = byId.get(parent.parentId);
    }
    this.opened = opened;
  }

  set(patch) {
    this.draft = { ...this.draft, ...patch };
  }

  /* ----- header ----- */
  get scrimCls() {
    return this.open ? "pscrim on" : "pscrim";
  }
  get panelCls() {
    return this.open ? "panel on" : "panel";
  }

  get kindButtons() {
    return KINDS.map((k) => ({
      kind: k,
      label: NAMES[k],
      on: this.draft.kinds.includes(k),
      cls: "ktog" + (this.draft.kinds.includes(k) ? " on" : "")
    }));
  }
  get statusButtons() {
    const now = derivedStatus(this.draft, this.choices);
    return STATUSES.map(([value, label]) => ({
      value,
      label,
      cls: now === value ? "on" : ""
    }));
  }
  handleKind(event) {
    this.draft = toggleKind(
      this.draft,
      event.currentTarget.dataset.kind,
      this.choices
    );
  }
  handleStatus(event) {
    this.draft = withStatus(
      this.draft,
      event.currentTarget.dataset.value,
      this.choices
    );
  }
  handleReset() {
    this.draft = defaultFilter(this.draft.kinds, this.choices, this.startTeam);
    this.teamQ = "";
    this.ownerQ = "";
    this.ownerResults = [];
    this.dispatchEvent(
      new CustomEvent("reset", { detail: { filter: this.draft } })
    );
  }

  /* ----- team ----- */
  get teamChipText() {
    const id = this.draft.teamId;
    if (!id) return "";
    if (id === MINE) return "My team";
    const t = (this.teams || []).find((x) => x.id === id);
    return t ? t.name : "";
  }
  get treeRows() {
    const q = this.teamQ.trim().toLowerCase();
    const rows = [];
    const pick = (id) => this.draft.teamId === id;
    if (this.hasOwnTeam && (!q || "my team".includes(q))) {
      rows.push({
        key: MINE,
        id: MINE,
        name: "My team",
        sub: "",
        star: true,
        bold: true,
        showCar: false,
        cls: "trow" + (pick(MINE) ? " sel" : ""),
        style: ""
      });
    }
    teamRows(this.teams, this.opened, this.teamQ).forEach((r) => {
      rows.push({
        key: r.id,
        id: r.id,
        name: r.name,
        sub: r.sub,
        star: false,
        bold: !!r.sub, // a search result: the team name in bold, its path under it
        showCar: r.hasKids,
        caretCls: "chev" + (r.open ? " dn" : ""),
        cls: "trow" + (r.sub ? " stacked" : "") + (pick(r.id) ? " sel" : ""),
        style: `padding-left:${10 + r.depth * 18}px`
      });
    });
    return rows;
  }
  /** "My team" is offered only to a person who manages a team. */
  get hasOwnTeam() {
    return (this.teams || []).some((t) => t.mine);
  }
  get noTeamMatch() {
    return this.treeRows.length === 0;
  }
  handleTeamQClear() {
    this.teamQ = "";
  }
  handleOwnerQClear() {
    clearTimeout(this.timer);
    this.ownerQ = "";
    this.ownerResults = [];
  }
  handleTeamQ(event) {
    this.teamQ = event.target.value;
  }
  handleCaret(event) {
    event.stopPropagation();
    const id = event.currentTarget.dataset.car;
    this.opened = { ...this.opened, [id]: !this.opened[id] };
  }
  /** Choosing a team clears the country and state: the team already says whose deals these are (they can be chosen again to narrow it). */
  handlePickTeam(event) {
    this.set({
      teamId: event.currentTarget.dataset.id,
      countries: [],
      states: []
    });
    this.teamQ = "";
  }
  handleClearTeam() {
    this.set({ teamId: "" });
  }
  handleBelow(event) {
    this.set({ below: event.target.checked });
  }

  /* ----- owner ----- */
  handleOwnerQ(event) {
    this.ownerQ = event.target.value;
    clearTimeout(this.timer);
    const t = this.ownerQ;
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    this.timer = setTimeout(() => {
      if (t.trim().length < 2) {
        this.ownerResults = [];
        return;
      }
      searchOwners({ term: t })
        .then((list) => {
          if (t === this.ownerQ)
            this.ownerResults = list.map((p) => ({
              ...p,
              title: p.title || ""
            }));
        })
        .catch((e) => {
          this.error = errorText(e);
        });
    }, 300);
  }
  handlePickOwner(event) {
    this.set({
      ownerId: event.currentTarget.dataset.id,
      ownerName: event.currentTarget.dataset.name
    });
    this.ownerQ = "";
    this.ownerResults = [];
  }
  handleClearOwner() {
    this.set({ ownerId: "", ownerName: "" });
  }

  /* ----- where, what ----- */
  pills(values, chosen) {
    return (values || []).map((value) => ({
      value,
      cls: "pill" + (chosen.includes(value) ? " on" : "")
    }));
  }
  get countryPills() {
    return this.pills(this.options.countries, this.draft.countries);
  }
  get noCountries() {
    return !(this.options.countries || []).length;
  }
  get showStates() {
    return (
      this.draft.countries.includes("AU") &&
      (this.options.states || []).length > 0
    );
  }
  get statePills() {
    return this.pills(this.options.states, this.draft.states);
  }
  get segmentPills() {
    return this.pills(this.options.segments, this.draft.segments);
  }
  /** The brands to pick from: only those that apply to the portfolios and countries chosen (the mockup's rule). */
  get brandPills() {
    if (!this.draft.segments.length) return [];
    const list = this.brandValues || this.options.brands;
    return this.pills(list, this.draft.brands);
  }
  get brandHint() {
    if (!this.draft.segments.length)
      return "Pick a portfolio above to choose its brands.";
    if (this.brandsLoading) return "Reading the brands that apply…";
    if (this.brandsFailed)
      return "Showing every brand (the ones for this portfolio could not be read).";
    return "";
  }
  /**
   * The record types whose brand lists apply: for each chosen country (every country if none is chosen) and each chosen
   * portfolio, the deal record type named like "AU KNEE Opportunity"; and "AU RISK" when risks are on.
   */
  get brandRecordTypeIds() {
    const countries = this.draft.countries.length
      ? this.draft.countries
      : this.options.countries || [];
    const ids = new Set();
    countries.forEach((cc) => {
      this.draft.segments.forEach((seg) => {
        const name = `${cc} ${PORTFOLIO_NAMES[seg] || seg.toUpperCase()} Opportunity`;
        if (this.recordTypes[name]) ids.add(this.recordTypes[name]);
      });
      if (this.draft.kinds.includes("risk") && this.recordTypes[`${cc} RISK`])
        ids.add(this.recordTypes[`${cc} RISK`]);
    });
    return [...ids];
  }
  /**
   * Reads, one record type at a time (each once, then remembered), the brand lists that apply, then shows their union and
   * drops any chosen brand that no longer applies.
   */
  refreshBrands() {
    if (!this.draft.segments || !this.draft.segments.length) {
      this.brandValues = null;
      this.brandsFailed = false;
      this.queue = [];
      this.pendingRt = undefined;
      return;
    }
    const ids = this.brandRecordTypeIds;
    this.wantedRts = ids;
    if (!ids.length) {
      this.brandValues = null;
      return;
    }
    this.queue = ids.filter((id) => !BRAND_CACHE.has(id));
    this.brandsFailed = false;
    if (!this.queue.length) {
      this.finishBrands();
      return;
    }
    this.brandsLoading = true;
    this.pendingRt = this.queue[0];
  }
  @wire(getPicklistValuesByRecordType, {
    objectApiName: SALESRISKS,
    recordTypeId: "$pendingRt"
  })
  wiredBrands({ data, error }) {
    if (!this.pendingRt) return;
    if (data) {
      const f = data.picklistFieldValues && data.picklistFieldValues.Brand__c;
      BRAND_CACHE.set(this.pendingRt, f ? f.values.map((x) => x.value) : []);
      this.queue = this.queue.filter((id) => id !== this.pendingRt);
      if (this.queue.length) {
        this.pendingRt = this.queue[0];
      } else {
        this.pendingRt = undefined;
        this.finishBrands();
      }
    } else if (error) {
      this.pendingRt = undefined;
      this.queue = [];
      this.brandsLoading = false;
      this.brandValues = null;
      this.brandsFailed = true;
    }
  }
  finishBrands() {
    const all = new Set();
    (this.wantedRts || []).forEach((id) =>
      (BRAND_CACHE.get(id) || []).forEach((b) => all.add(b))
    );
    const order = this.options.brands || [];
    const rank = (b) => (order.indexOf(b) === -1 ? 999 : order.indexOf(b));
    this.brandValues = [...all].sort(
      (a, b) => rank(a) - rank(b) || a.localeCompare(b)
    );
    this.brandsLoading = false;
    this.set({ brands: this.draft.brands.filter((b) => all.has(b)) });
  }
  get hasOpp() {
    return this.draft.kinds.includes("opp");
  }
  get hasRosa() {
    return this.draft.kinds.includes("rosa");
  }
  get holdNote() {
    return this.draft.kinds.includes("risk") ? " (opportunities)" : "";
  }
  handlePill(event) {
    const { key, value } = event.currentTarget.dataset;
    const on = this.draft[key];
    const next = on.includes(value)
      ? on.filter((x) => x !== value)
      : [...on, value];
    const patch = { [key]: next };
    if (key === "countries" && !next.includes("AU")) patch.states = [];
    this.set(patch);
    if (key === "countries" || key === "segments") this.refreshBrands();
  }
  handleCheck(event) {
    this.set({ [event.target.dataset.key]: event.target.checked });
  }

  /* ----- stages ----- */
  get stageGroups() {
    const multi = this.draft.kinds.length > 1;
    return this.draft.kinds.map((kind) => {
      const c = this.choices[kind] || { open: [], closed: [] };
      return {
        kind,
        label: NAMES[kind],
        showLabel: multi,
        pills: this.pills(c.open.concat(c.closed), this.draft.stages)
      };
    });
  }
  handleStage(event) {
    const value = event.currentTarget.dataset.value;
    const on = this.draft.stages;
    this.set({
      stages: on.includes(value)
        ? on.filter((x) => x !== value)
        : [...on, value]
    });
  }
  get hasClosed() {
    return stagesOf(this.draft.kinds, this.choices, "closed").some((s) =>
      this.draft.stages.includes(s)
    );
  }
  get rangeOptions() {
    return RANGES.map(([value, label]) => ({
      value,
      label,
      selected: Number(this.draft.closedMonths) === value
    }));
  }
  handleRange(event) {
    this.set({ closedMonths: Number(event.target.value) });
  }

  /* ----- quarters ----- */
  get quarters() {
    return [...(this.options.quarters || [])].sort(
      (a, b) => quarterRank(a) - quarterRank(b)
    );
  }
  get fromOptions() {
    return this.quarters.map((value) => ({
      value,
      selected: this.draft.qFrom === value
    }));
  }
  get toOptions() {
    return this.quarters.map((value) => ({
      value,
      selected: this.draft.qTo === value
    }));
  }
  get noFrom() {
    return !this.draft.qFrom;
  }
  get noTo() {
    return !this.draft.qTo;
  }
  handleQuarter(event) {
    const key = event.target.dataset.key;
    const v = event.target.value;
    const patch = { [key]: v };
    const from = key === "qFrom" ? v : this.draft.qFrom;
    const to = key === "qTo" ? v : this.draft.qTo;
    if (from && to && quarterRank(to) < quarterRank(from)) {
      if (key === "qFrom") patch.qTo = from;
      else patch.qFrom = to;
    }
    this.set(patch);
  }

  /* ----- needs attention ----- */
  get staleCls() {
    return "switch" + (this.draft.stale ? " on" : "");
  }
  handleStale() {
    this.set({ stale: !this.draft.stale });
  }

  /* ----- save, apply, cancel ----- */
  handleApply() {
    this.dispatchEvent(
      new CustomEvent("apply", { detail: { filter: this.draft } })
    );
  }
  handleCancel() {
    this.dispatchEvent(new CustomEvent("cancel"));
  }
}
