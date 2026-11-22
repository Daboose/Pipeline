import { LightningElement, api } from "lwc";
import { beginColumnDrag } from "c/pipelineColumnResize";
import {
  formatMoney,
  chatterDays,
  stageDays,
  chatterBand,
  stageBand
} from "c/pipelineFormat";
import {
  sortRows,
  memberTiles,
  ratingRank,
  valueByRating,
  toUsd,
  usdAmount,
  RATING_KEYS
} from "c/pipelineCampaignModel";
import currencyRates from "@salesforce/apex/PipelineCampaignController.currencyRates";
import searchSurgeons from "@salesforce/apex/PipelineCampaignController.searchSurgeons";
import addMember from "@salesforce/apex/PipelineCampaignController.addMember";
import { localWidth, zoomOf } from "c/pipelineZoom";

const WIDTHS_KEY = "pipelineCampaignMembersWidths";
const HIDDEN_KEY = "pipelineCampaignMembersHidden";
/** The columns that belong to a deal; the rest describe the surgeon. */
/** The columns about the surgeon that sit at the very end of the table (the two reps). */
const TAIL_IDS = ["y1", "y6"];
const DEAL_IDS = [
  "portfolio",
  "stage",
  "value",
  "quarter",
  "posted",
  "moved",
  "rep"
];
const TICK_WIDTH = 56;
const AREA = {
  Hip: "Hip",
  Knee: "Knee",
  Extremities: "Shoulder",
  CMFT: "CMF"
};
const SHOW_OPTIONS = [
  { value: "all", label: "All" },
  { value: "with", label: "With a deal" },
  { value: "none", label: "No deal yet" }
];

function proper(s) {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
function withEnglish(name, english) {
  const same =
    !english ||
    english.trim().toLowerCase() === (name || "").trim().toLowerCase();
  return same ? name : name + " (English: " + english + ")";
}
const byNewest = (a, b) =>
  String(b.createdDate || "").localeCompare(String(a.createdDate || ""));

/**
 * pipelineCampaignMembers: the one members list of a sales campaign (Robert, 2026-11-07; mockup pipeline_campaign_members_v1.html).
 * Used by Campaign Management (with tick boxes and tools passed in through the slots tools, remove and ask) and by Pipeline
 (read only). Shows tiles, a Show filter and search, and a table: the
 * surgeon, hospitals, country and city, type, one rating column per portfolio the campaign covers, and the surgeon's deals
 * linked to the campaign (a second line for each further deal; a Portfolio column when the campaign covers several portfolios).
 * The table sorts by a heading, resizes by a column edge and keeps its headings in view, like every Pipeline table.
 * It reads nothing itself; the parent gives it the campaign and its members. In Report mode it only shows what is connected. In Pipeline
 * (`maintainable`) a Mode switch adds Maintain, which hands the surgeons to pipelineCampaignMaintain (put deals in and out of the campaign).
 */
export default class PipelineCampaignMembers extends LightningElement {
  /** The campaign (CampaignRow from PipelineCampaignController) and its members (MemberRow list). */
  @api campaign = null;
  @api members = [];
  /** Campaign Management: show the tick boxes. */
  @api manage = false;
  /** Pipeline: the value goes on a row of its own: the campaign's Value / year and the same split by the surgeon's rating, with a LOCAL or USD switch (Robert, 2026-11-17). */
  @api valueRow = false;
  /** Pipeline: offer the Maintain mode (put deals in and out of the campaign) beside the Report mode (Robert, 2026-11-16). */
  @api maintainable = false;
  /** Pipeline only (Robert, 2026-11-19): a click on a deal's line opens the deal flyout; with it the lines are highlighted when the mouse is over them. */
  @api dealsOpenable = false;
  /**
   * The columns the person has turned off, kept by the screen that hosts the list (Pipeline keeps them in the person's own settings, so
   * they follow them to any computer; Robert, 2026-11-19: "I constantly turn off the hospitals"). null (the default) means the host keeps
   * nothing, and the list remembers them on this computer only, as Campaign Management does. Every change is reported as `columnschange`.
   */
  @api
  get hiddenColumns() {
    return this._hiddenColumns;
  }
  set hiddenColumns(value) {
    this._hiddenColumns = Array.isArray(value) ? value : null;
    if (this._hiddenColumns) this.hidden = [...this._hiddenColumns];
  }
  _hiddenColumns = null;
  /**
   * The column widths the person dragged them to, kept by the screen that hosts the list (Pipeline keeps them in the person's own settings,
   * so they follow them to any computer; Robert, 2026-11-20). An object { columnId: pixels } sets them, and an empty object means the
   * standard widths. null (the default) means the host keeps nothing and the list remembers the widths on this computer only, as
   * Campaign Management does. Every change, and a reset to the standard widths (widths null), is reported as `widthschange`.
   */
  @api
  get columnWidths() {
    return this.widths;
  }
  set columnWidths(value) {
    if (value && typeof value === "object") {
      this.widths = Object.keys(value).length ? { ...value } : null;
    }
  }

  usd = false; // the value chips in US dollars; local currencies until the person flicks the switch
  rates = null; // the exchange rates held in Salesforce, read the first time USD is chosen
  ratesError = "";
  mode = "report"; // report (the list as it always was) or maintain
  includeClosed = false; // Include Closed (Robert, 2026-11-19): Maintain also lists the closed deals that fit
  types = { opp: true, risk: false }; // the kinds of deal Maintain lists: opportunities, not risks, until the person ticks them
  filter = "all";
  q = "";
  addQ = ""; // Maintain: what is typed in the Add box (the Search box is the Add box there; Robert, 2026-11-20)
  addResult = null; // the surgeons found for it (PipelineCampaignController.searchSurgeons)
  addSeq = 0;
  addWide = false; // false: the campaign's own countries first; true: every country (the "Widen search" button; Robert, 2026-11-20)
  addBusy = false;
  addError = "";
  addToast = "";
  sort = { id: "name", dir: 1 };
  widths = null; // null: the table finds its own widths; otherwise { columnId: pixels }
  hidden = []; // the columns the person has turned off (all on by default; remembered on this computer)
  pickerOpen = false;
  live = null;
  ticked = {};

  connectedCallback() {
    this.onResize = () => this.fit();
    window.addEventListener("resize", this.onResize);
    try {
      const saved = JSON.parse(
        window.localStorage.getItem(WIDTHS_KEY) || "null"
      );
      if (saved && typeof saved === "object") this.widths = saved;
      const off = JSON.parse(window.localStorage.getItem(HIDDEN_KEY) || "null");
      if (Array.isArray(off)) this.hidden = off;
    } catch {
      // storage not available
    }
  }
  disconnectedCallback() {
    clearTimeout(this.addTimer);
    clearTimeout(this.addToastTimer);
    cancelAnimationFrame(this.fitFrame);
    window.removeEventListener("resize", this.onResize);
  }
  /** The table box is as tall as the space left below it in the window, so it reaches the bottom wherever it is shown. */
  fit() {
    const box = this.template.querySelector(".tscroll");
    if (!box) return;
    const top = box.getBoundingClientRect().top;
    // what the screen around the list adds below it (its bottom padding), so the page ends exactly at the window's bottom and never scrolls
    const parent = this.template.host.parentElement;
    const below = parent
      ? parseFloat(window.getComputedStyle(parent).paddingBottom) || 0
      : 0;
    // top is in drawn pixels and the box's own units are what the style is written in, so under Zoom the space left is divided by it
    const room = Math.max(
      260,
      Math.floor((window.innerHeight - top) / zoomOf(box) - below - 4)
    );
    box.style.maxHeight = room + "px";
  }
  renderedCallback() {
    this.fit();
    // and once more when the browser has laid the screen out, so the list always reaches the bottom of the window
    cancelAnimationFrame(this.fitFrame);
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    this.fitFrame = requestAnimationFrame(() => this.fit());
    const all = this.template.querySelector("input.selall");
    if (all) {
      const n = this.selectedIds.length;
      all.indeterminate = n > 0 && !this.allTicked;
    }
  }

  /** The ticked members' ids (Campaign Management's Remove uses them). */
  @api
  get selectedIds() {
    return Object.keys(this.ticked).filter((k) => this.ticked[k]);
  }
  @api
  clearSelection() {
    this.ticked = {};
    this.announce();
  }
  announce() {
    this.dispatchEvent(
      new CustomEvent("selectionchange", { detail: { ids: this.selectedIds } })
    );
  }

  // ---------- the columns ----------
  get ports() {
    return (this.campaign && this.campaign.portfolios) || [];
  }
  get multi() {
    return this.ports.length > 1;
  }
  get colDefs() {
    const defs = [
      ["name", "Surgeon", false, 230],
      ["hospitals", "Current Hospitals", false, 200],
      ["place", "Country · City", false, 150],
      ["type", "Type", false, 170]
    ];
    this.ports.forEach((p) =>
      defs.push([
        "rate:" + p,
        this.multi ? (AREA[p] || p) + " Rating" : "Rating",
        false,
        140
      ])
    );
    if (this.multi) defs.push(["portfolio", "Portfolio", false, 130]);
    defs.push(
      ["stage", "Stage", false, 150],
      ["value", "Revenue / Year", true, 150],
      ["quarter", "Close Quarter", false, 140],
      ["posted", "Last Posted", false, 130],
      ["moved", "Last Stage Move", false, 150],
      ["rep", "Sales Rep", false, 170],
      ["y1", "Y1 Recon Rep", false, 170],
      ["y6", "Y6 Extremities Rep", false, 190]
    );
    return defs;
  }
  /** The columns shown: all of them unless the person turned some off (the surgeon's name always stays). */
  get visibleDefs() {
    return this.colDefs.filter(
      (d) => d[0] === "name" || !this.hidden.includes(d[0])
    );
  }
  get leadDefs() {
    return this.visibleDefs.filter(
      (d) => !DEAL_IDS.includes(d[0]) && !TAIL_IDS.includes(d[0])
    );
  }
  get tailDefs() {
    return this.visibleDefs.filter((d) => TAIL_IDS.includes(d[0]));
  }
  get dealDefs() {
    return this.visibleDefs.filter((d) => DEAL_IDS.includes(d[0]));
  }
  get heads() {
    return this.visibleDefs.map((d) => ({
      id: d[0],
      label: d[1],
      cls: d[2] ? "num" : "",
      arrow: this.sort.id === d[0] ? (this.sort.dir === 1 ? " ▲" : " ▼") : ""
    }));
  }
  /** The widths in use: what the person dragged them to, else the standard ones (so a long hospital list can never take the screen). */
  get currentWidths() {
    return this.live || this.widths || {};
  }
  get colList() {
    const w = this.currentWidths;
    const out = this.visibleDefs.map((d) => ({
      id: d[0],
      px: w[d[0]] || d[3],
      style: "width:" + (w[d[0]] || d[3]) + "px"
    }));
    if (this.manage)
      out.unshift({
        id: "__tick",
        px: TICK_WIDTH,
        style: "width:" + TICK_WIDTH + "px"
      });
    return out;
  }
  get hasWidths() {
    return this.colList.length > 0;
  }
  get tableStyle() {
    if (!this.hasWidths) return "";
    const total = this.colList.reduce((a, c) => a + c.px, 0);
    return "table-layout:fixed;width:" + total + "px;min-width:100%";
  }
  get emptySpan() {
    return this.visibleDefs.length + (this.manage ? 1 : 0);
  }
  handleSort(event) {
    const id = event.currentTarget.dataset.id;
    this.sort = { id, dir: this.sort.id === id ? -this.sort.dir : 1 };
  }
  handleResizeStart(event) {
    const id = event.currentTarget.dataset.id;
    const snapshot = {};
    this.template.querySelectorAll("th[data-id]").forEach((th) => {
      snapshot[th.dataset.id] = Math.round(localWidth(th));
    });
    this.live = { ...snapshot };
    beginColumnDrag(
      event,
      snapshot[id] || 140,
      60,
      (width) => {
        this.live = { ...this.live, [id]: width };
      },
      () => {
        this.widths = this.live;
        this.live = null;
        this.saveWidths();
      }
    );
  }
  handleWidthsReset() {
    this.widths = null;
    this.saveWidths();
  }
  saveWidths() {
    this.dispatchEvent(
      new CustomEvent("widthschange", {
        detail: { widths: this.widths ? { ...this.widths } : null }
      })
    );
    try {
      window.localStorage.setItem(WIDTHS_KEY, JSON.stringify(this.widths));
    } catch {
      // not remembered
    }
  }

  // ---------- the tiles ----------
  get tiles() {
    const t = memberTiles(this.members);
    const money = t.value.length
      ? t.value.map((v) => formatMoney(v.total, v.currencyCode)).join(" · ")
      : "–";
    const counts = [
      { key: "s", label: "Surgeons", value: t.surgeons, cls: "tile" },
      { key: "w", label: "With a deal", value: t.withDeal, cls: "tile" },
      { key: "n", label: "No deal yet", value: t.noDeal, cls: "tile warn" },
      { key: "d", label: "Deals", value: t.deals, cls: "tile" }
    ];
    // Campaign Management keeps its fifth tile; Pipeline gives the value a row of its own
    if (this.valueRow) return counts;
    return counts.concat({
      key: "v",
      label: "Value / year",
      value: money,
      cls: "tile",
      valCls: money.length > 9 ? "long" : ""
    });
  }

  // ---------- the value row: total and by rating, local or in US dollars ----------
  get currencyOptions() {
    return [
      { value: "local", label: "LOCAL" },
      { value: "usd", label: "USD" }
    ];
  }
  get currencyValue() {
    return this.usd ? "usd" : "local";
  }
  /** The currency the person last chose, saved in their Pipeline settings and handed in by the screen: "local" (the default) or "usd". */
  @api
  get currency() {
    return this.usd ? "usd" : "local";
  }
  set currency(value) {
    this.applyCurrency(value === "usd");
  }
  /** The person flicked the switch: show it, and tell the screen so it can be remembered. */
  async handleCurrency(event) {
    const wantUsd = event.detail.value === "usd";
    await this.applyCurrency(wantUsd);
    if (this.usd === wantUsd)
      this.dispatchEvent(
        new CustomEvent("currencychange", {
          detail: { value: wantUsd ? "usd" : "local" }
        })
      );
  }
  /** Switches the figures to US dollars or back, reading the Salesforce rates the first time US dollars are wanted. */
  async applyCurrency(wantUsd) {
    if (wantUsd && !this.rates) {
      try {
        this.rates = await currencyRates();
        this.ratesError = "";
      } catch {
        this.ratesError = "The exchange rates could not be read.";
        return; // stays on local currencies
      }
    }
    this.usd = wantUsd;
  }
  /** One amount per currency, or one amount in US dollars. */
  amountText(amounts) {
    if (this.usd && this.rates) {
      const { usd } = toUsd(amounts, this.rates);
      return Object.keys(amounts).length ? formatMoney(usd, "USD") : "–";
    }
    const list = Object.keys(amounts)
      .filter((c) => amounts[c])
      .sort();
    return list.length
      ? list.map((c) => formatMoney(amounts[c], c)).join(" · ")
      : "–";
  }
  get valueChips() {
    const v = valueByRating(this.members);
    const chip = (key, label, amounts, cls) => {
      const text = this.amountText(amounts);
      return {
        key,
        label,
        text,
        cls: `vchip${cls ? " " + cls : ""}${text === "–" ? " zero" : ""}`,
        plateCls:
          key === "total"
            ? ""
            : `rplate ${key === "NONE" ? "none" : key.charAt(0) + key.slice(1).toLowerCase()}`
      };
    };
    return [chip("total", "Value / year", v.total, "tot")].concat(
      RATING_KEYS.map((k) =>
        chip(
          k,
          k === "NONE" ? "Not rated" : k.charAt(0) + k.slice(1).toLowerCase(),
          v[k],
          ""
        )
      )
    );
  }
  /** USD is on and the rates have been read. */
  get showUsd() {
    return this.usd && !!this.rates;
  }
  get notValueRow() {
    return !this.valueRow;
  }
  /** Pipeline's campaign screen: the first row holds only the title and the Currency switch, so it is compact (Robert, 2026-11-17). */
  get bandCls() {
    return this.valueRow ? "band compact" : "band";
  }
  get showValueRow() {
    return this.valueRow;
  }

  // ---------- report or maintain ----------
  get isMaintain() {
    return this.maintainable && this.mode === "maintain";
  }
  get notMaintain() {
    return !this.isMaintain;
  }
  get modeOptions() {
    return [
      { value: "report", label: "Report" },
      { value: "maintain", label: "Maintain" }
    ];
  }
  handleMode(event) {
    this.mode = event.detail.value;
    this.addQ = "";
    this.addResult = null;
    this.addError = "";
    this.addWide = false;
  }
  get oppOn() {
    return this.types.opp;
  }
  get riskOn() {
    return this.types.risk;
  }
  get oppCls() {
    return this.types.opp ? "kchip on" : "kchip";
  }
  get riskCls() {
    return this.types.risk ? "kchip on" : "kchip";
  }
  get oppTickCls() {
    return this.types.opp ? "ktick" : "kring";
  }
  get riskTickCls() {
    return this.types.risk ? "ktick" : "kring";
  }
  get closedOn() {
    return this.includeClosed;
  }
  get closedCls() {
    return this.includeClosed ? "kchip on" : "kchip";
  }
  get closedTickCls() {
    return this.includeClosed ? "ktick" : "kring";
  }
  handleClosed() {
    this.includeClosed = !this.includeClosed;
  }
  handleKind(event) {
    const kind = event.currentTarget.dataset.kind;
    this.types = { ...this.types, [kind]: !this.types[kind] };
  }
  /** The surgeons Maintain lists: all of the campaign's members, in name order (the box there is Add, not Search; the Show filter does not
   *  apply either, so a surgeon never vanishes from under the person's finger when a deal is put in). */
  get maintainMembers() {
    return [...(this.members || [])].sort((a, b) =>
      (a.name || "").localeCompare(b.name || "")
    );
  }
  /** A deal was put in or taken out: tell the screen, so the tiles and the deals are read again. */
  handleDealChange(event) {
    this.dispatchEvent(
      new CustomEvent("campaigndealchange", { detail: event.detail })
    );
  }

  // ---------- filter and search ----------
  get showOptions() {
    return SHOW_OPTIONS;
  }
  handleFilter(event) {
    this.filter = event.detail.value;
  }
  get hasQ() {
    return (this.isMaintain ? this.addQ : this.q).length > 0;
  }
  get searchValue() {
    return this.isMaintain ? this.addQ : this.q;
  }
  get searchLabel() {
    return this.isMaintain ? "Add" : "Search";
  }
  get searchAria() {
    return this.isMaintain
      ? "Add a surgeon to the campaign"
      : "Search surgeons";
  }
  /** The box is the same box in both modes; in Maintain its label is amber so the person sees it now adds surgeons. */
  get fslblCls() {
    return this.isMaintain ? "fslbl adding" : "fslbl";
  }
  handleQ(event) {
    if (this.isMaintain) {
      this.addQ = event.target.value;
      this.runAddSearch();
    } else {
      this.q = event.target.value;
    }
  }
  handleQClear() {
    if (this.isMaintain) {
      this.addQ = "";
      this.addResult = null;
      this.addError = "";
      this.addWide = false;
    } else {
      this.q = "";
    }
  }

  // ---------- Maintain: adding a surgeon to the campaign ----------
  runAddSearch() {
    clearTimeout(this.addTimer);
    const mine = ++this.addSeq;
    this.addError = "";
    if (this.addQ.trim().length < 2) {
      this.addResult = null;
      return;
    }
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    this.addTimer = setTimeout(async () => {
      try {
        const r = await searchSurgeons({
          campaignId: this.campaign.id,
          term: this.addQ,
          wide: this.addWide
        });
        if (mine === this.addSeq) this.addResult = r;
      } catch (e) {
        this.addError = this.errorOf(e, "The surgeons could not be searched.");
      }
    }, 250);
  }
  errorOf(e, fallback) {
    return e && e.body && e.body.message ? e.body.message : fallback;
  }
  get showAddPop() {
    return this.isMaintain && this.addQ.trim().length >= 2;
  }
  get addHits() {
    return ((this.addResult && this.addResult.hits) || []).map((h) => {
      const same =
        !h.preferredName ||
        h.preferredName.trim().toLowerCase() ===
          (h.name || "").trim().toLowerCase();
      return {
        key: h.id,
        id: h.id,
        nameText: same
          ? h.name
          : h.name + " (English: " + h.preferredName + ")",
        sub: [
          h.hospitals ? "Hospitals: " + h.hospitals : "",
          [h.country, h.city].filter(Boolean).join(" · "),
          h.type
        ]
          .filter(Boolean)
          .join(" · "),
        already: h.alreadyMember,
        title: "Add " + h.name + " to the campaign"
      };
    });
  }
  /** "Searching AU, NZ." or "Searching every country." with the button that switches between the two. */
  get addScopeText() {
    const r = this.addResult;
    if (!r) return "";
    return r.scope === "ALL"
      ? "Searching every country."
      : "Searching " + r.scope + ".";
  }
  get addWidenText() {
    return this.addWide ? "Back to the campaign's countries" : "Widen search";
  }
  get addOutsideText() {
    const r = this.addResult;
    if (this.addWide || !r || !r.outside) return "";
    return (
      (r.outside >= 50 ? "50 or more" : r.outside) +
      " more match outside these countries."
    );
  }
  handleWiden() {
    this.addWide = !this.addWide;
    this.runAddSearch();
  }
  get addNone() {
    return !!this.addResult && this.addResult.hits.length === 0;
  }
  async handleAddPress(event) {
    const id = event.currentTarget.dataset.id;
    const hit = this.addHits.find((h) => h.id === id);
    if (!hit || this.addBusy) return;
    this.addBusy = true;
    this.addError = "";
    try {
      await addMember({ campaignId: this.campaign.id, surgeonId: id });
      this.addQ = "";
      this.addResult = null;
      this.addWide = false;
      this.sayAdd(hit.nameText + " added to the campaign");
      this.dispatchEvent(
        new CustomEvent("campaignmemberchange", { detail: { surgeonId: id } })
      );
    } catch (e) {
      this.addError = this.errorOf(e, "That surgeon could not be added.");
    } finally {
      this.addBusy = false;
    }
  }
  sayAdd(text) {
    this.addToast = text;
    clearTimeout(this.addToastTimer);
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    this.addToastTimer = setTimeout(() => {
      this.addToast = "";
    }, 2500);
  }
  /** A surgeon was taken out of the campaign in the Maintain list: tell the screen, so the members and tiles are read again. */
  handleMemberChange(event) {
    this.dispatchEvent(
      new CustomEvent("campaignmemberchange", { detail: event.detail })
    );
  }

  // ---------- the rows ----------
  ratingOf(m, portfolio) {
    const c = (m.ratings || []).find((r) => r.portfolio === portfolio);
    return c ? c.rating : null;
  }
  firstDeal(m) {
    return [...(m.deals || [])].sort(byNewest)[0] || null;
  }
  get visibleMembers() {
    const q = this.q.trim().toLowerCase();
    const kept = (this.members || []).filter((m) => {
      const has = (m.deals || []).length > 0;
      if (this.filter === "with" && !has) return false;
      if (this.filter === "none" && has) return false;
      if (q) {
        const hay = (
          (m.name || "") +
          " " +
          (m.preferredName || "")
        ).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const id = this.sort.id;
    const now = Date.now();
    const deal = (m) => this.firstDeal(m);
    const by = {
      name: (m) => m.name,
      hospitals: (m) => m.hospitals,
      place: (m) => [m.country, m.city].filter(Boolean).join(" · "),
      type: (m) => m.type,
      portfolio: (m) => (deal(m) ? AREA[deal(m).portfolio] || "" : ""),
      y1: (m) => m.y1Rep,
      y6: (m) => m.y6Rep,
      stage: (m) => (deal(m) ? deal(m).stage : ""),
      value: (m) => (deal(m) ? this.sortAmount(deal(m)) : null),
      quarter: (m) => (deal(m) ? deal(m).quarter : ""),
      posted: (m) => (deal(m) ? chatterDays(deal(m), now) : null),
      moved: (m) => (deal(m) ? stageDays(deal(m), now) : null),
      rep: (m) => (deal(m) ? deal(m).ownerName : "")
    };
    let valueOf = by[id];
    if (id.startsWith("rate:")) {
      const p = id.slice(5);
      valueOf = (m) => ratingRank(this.ratingOf(m, p));
    }
    return valueOf ? sortRows(kept, valueOf, this.sort.dir) : kept;
  }
  /** The cells of one deal, by column id, so the ones turned off can be left out. */
  /** A deal's value as the person asked to see it: in its own currency, or, with USD chosen, in US dollars (left in its own currency
   *  if that currency has no rate). */
  moneyText(d) {
    if (this.usd && this.rates) {
      const u = usdAmount(d.value, d.currencyCode, this.rates);
      if (u !== null) return formatMoney(u, "USD");
    }
    return formatMoney(d.value, d.currencyCode);
  }
  /** What the value column sorts by: US dollars with USD chosen, so the order matches the figures shown. */
  sortAmount(d) {
    if (this.usd && this.rates) {
      const u = usdAmount(d.value, d.currencyCode, this.rates);
      if (u !== null) return u;
    }
    return Number(d.value) || 0;
  }
  dealCellMap(d, now) {
    const quiet = d.isClosed || d.onHold;
    const day = (n, band) => {
      if (quiet || n === null) {
        return {
          isText: true,
          text: d.onHold && !d.isClosed ? "On Hold" : "–"
        };
      }
      return { isTag: true, text: `${n} d`, tagCls: `tag ${band(n)}` };
    };
    return {
      portfolio: {
        isText: true,
        text: AREA[d.portfolio] || d.portfolio || "–"
      },
      stage: { isText: true, text: d.stage || "–" },
      value: {
        isText: true,
        cls: "num",
        text: this.moneyText(d)
      },
      quarter: { isText: true, text: d.quarter || "–" },
      posted: day(chatterDays(d, now), chatterBand),
      moved: day(stageDays(d, now), stageBand),
      rep: { isText: true, text: d.ownerName || "–" }
    };
  }
  dealCells(d, keyBase, now) {
    const map = this.dealCellMap(d, now);
    return this.dealDefs.map((def) => ({
      ...map[def[0]],
      key: keyBase + def[0]
    }));
  }
  get rows() {
    const now = Date.now();
    const out = [];
    this.visibleMembers.forEach((m) => {
      const deals = [...(m.deals || [])].sort(byNewest);
      const lead = {
        // the surgeon's name opens their Account record in a NEW tab (Robert, 2026-11-19), so the person keeps their place here
        name: m.accountId
          ? {
              isLink: true,
              cls: "who",
              href: "/lightning/r/Account/" + m.accountId + "/view",
              text: withEnglish(m.name, m.preferredName)
            }
          : {
              isText: true,
              cls: "who",
              text: withEnglish(m.name, m.preferredName)
            },
        hospitals: { isText: true, text: m.hospitals || "" },
        place: {
          isText: true,
          text: [m.country, m.city].filter(Boolean).join(" · ")
        },
        type: { isText: true, text: m.type || "" }
      };
      this.ports.forEach((p) => {
        const r = this.ratingOf(m, p);
        lead["rate:" + p] = {
          isRate: true,
          cls: "ratecell",
          // in Pipeline (dealsOpenable) a plate is pressed to open the surgeon's usages (Robert, 2026-11-19)
          rateOpen: this.dealsOpenable && !!m.accountId,
          dealId: deals.length ? deals[0].id : "",
          accountId: m.accountId,
          who: withEnglish(m.name, m.preferredName),
          text: r ? proper(r) : "Not rated",
          rateCls: "rplate " + (r ? proper(r) : "none")
        };
      });
      const cells = [];
      if (this.manage)
        cells.push({
          key: "t",
          isTick: true,
          id: m.memberId,
          cls: "tick",
          checked: !!this.ticked[m.memberId]
        });
      this.leadDefs.forEach((def) =>
        cells.push({ ...lead[def[0]], key: "l" + def[0] })
      );
      if (deals.length) {
        cells.push(...this.dealCells(deals[0], "d0", now));
      } else if (this.dealDefs.length) {
        cells.push({
          key: "nd",
          isNoDeal: true,
          noDealOpen: this.dealsOpenable && !!m.accountId, // in Pipeline "No deal yet" is pressed to make the surgeon's first deal
          accountId: m.accountId,
          who: withEnglish(m.name, m.preferredName),
          colspan: this.dealDefs.length
        });
      }
      this.tailDefs.forEach((def) =>
        cells.push({
          key: "t" + def[0],
          isText: true,
          text: (def[0] === "y1" ? m.y1Rep : m.y6Rep) || ""
        })
      );
      out.push({
        key: m.memberId,
        cls: deals.length && this.dealsOpenable ? "dealrow" : "",
        dealId: deals.length ? deals[0].id : "",
        cells
      });
      for (let i = 1; i < deals.length; i++) {
        const extra = [];
        if (this.manage) extra.push({ key: "t", isText: true, cls: "tick" });
        extra.push({
          key: "e",
          isText: true,
          colspan: this.leadDefs.length,
          text: ""
        });
        extra.push(...this.dealCells(deals[i], "d" + i, now));
        this.tailDefs.forEach((def) =>
          extra.push({ key: "t" + def[0], isText: true, text: "" })
        );
        out.push({
          key: m.memberId + "-" + i,
          cls: this.dealsOpenable ? "deal2 dealrow" : "deal2",
          dealId: deals[i].id,
          cells: extra
        });
      }
    });
    return out;
  }
  /**
   * A click on a deal's line opens that deal (Robert, 2026-11-19), in Pipeline only (dealsOpenable): the screen is told the deal and the
   * ids of every deal listed here, in the order they are listed, so Previous and Next step through the campaign's deals. A click on a
   * control inside the line (a tick box) does nothing.
   */
  handleRowClick(event) {
    if (!this.dealsOpenable) return;
    const id = event.currentTarget.dataset.deal;
    if (!id) return;
    const t = event.target;
    if (t && t.closest && t.closest("input, button, a")) return;
    this.dispatchEvent(
      new CustomEvent("dealopen", {
        detail: {
          id,
          ids: this.rows.filter((r) => r.dealId).map((r) => r.dealId)
        }
      })
    );
  }
  /**
   * A press on a surgeon's rating plate (Robert, 2026-11-19), in Pipeline only: with a deal listed it opens that deal on its Surgeon
   * Usages screen (the same event as a click on the line, plus the screen); a surgeon with no deal yet has no deal to open, so the screen
   * is told the surgeon, and shows just the surgeon's usages.
   */
  handlePlate(event) {
    event.stopPropagation();
    const { deal, account, who } = event.currentTarget.dataset;
    if (deal) {
      this.dispatchEvent(
        new CustomEvent("dealopen", {
          detail: {
            id: deal,
            ids: this.rows.filter((r) => r.dealId).map((r) => r.dealId),
            screen: "usages"
          }
        })
      );
    } else {
      this.dispatchEvent(
        new CustomEvent("surgeonopen", {
          detail: { accountId: account, name: who, screen: "usages" }
        })
      );
    }
  }
  /** "No deal yet" was pressed (Pipeline only): the surgeon's flyout opens on its New Deal screen. */
  handleNoDeal(event) {
    event.stopPropagation();
    const { account, who } = event.currentTarget.dataset;
    this.dispatchEvent(
      new CustomEvent("surgeonopen", {
        detail: { accountId: account, name: who, screen: "new" }
      })
    );
  }
  get noRows() {
    return this.rows.length === 0;
  }
  get emptyText() {
    return (this.members || []).length === 0
      ? "No members yet."
      : "No surgeon matches.";
  }

  // ---------- ticks ----------
  get allTicked() {
    const m = this.members || [];
    return m.length > 0 && m.every((x) => this.ticked[x.memberId]);
  }
  handleTick(event) {
    this.ticked = {
      ...this.ticked,
      [event.target.dataset.id]: event.target.checked
    };
    this.announce();
  }
  handleTickAll(event) {
    const on = event.target.checked;
    const next = {};
    (this.members || []).forEach((m) => {
      next[m.memberId] = on;
    });
    this.ticked = next;
    this.announce();
  }

  // ---------- the Columns picker (everything on by default; the person turns off what they do not need) ----------
  get pickerItems() {
    return this.colDefs
      .filter((d) => d[0] !== "name")
      .map((d) => ({ id: d[0], label: d[1], on: !this.hidden.includes(d[0]) }));
  }
  handlePicker() {
    this.pickerOpen = !this.pickerOpen;
  }
  handleColumn(event) {
    const id = event.target.dataset.id;
    this.hidden = event.target.checked
      ? this.hidden.filter((x) => x !== id)
      : [...this.hidden, id];
    this.saveHidden();
  }
  handleColumnsReset() {
    this.hidden = [];
    this.saveHidden();
    this.pickerOpen = false;
  }
  handlePickerWidthsReset() {
    this.pickerOpen = false;
    this.handleWidthsReset();
  }
  saveHidden() {
    this.dispatchEvent(
      new CustomEvent("columnschange", { detail: { hidden: [...this.hidden] } })
    );
    try {
      window.localStorage.setItem(HIDDEN_KEY, JSON.stringify(this.hidden));
    } catch {
      // not remembered
    }
  }
}
