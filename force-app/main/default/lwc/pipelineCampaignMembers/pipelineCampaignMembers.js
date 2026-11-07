import { LightningElement, api } from "lwc";
import { beginColumnDrag } from "c/pipelineColumnResize";
import {
  formatMoney,
  chatterDays,
  stageDays,
  chatterBand,
  stageBand
} from "c/pipelineFormat";
import { sortRows, memberTiles, ratingRank } from "c/pipelineCampaignModel";

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
 * It reads nothing itself; the parent gives it the campaign and its members. It only shows what is connected: reps link their own deals.
 */
export default class PipelineCampaignMembers extends LightningElement {
  /** The campaign (CampaignRow from PipelineCampaignController) and its members (MemberRow list). */
  @api campaign = null;
  @api members = [];
  /** Campaign Management: show the tick boxes. */
  @api manage = false;

  filter = "all";
  q = "";
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
    const room = Math.max(
      260,
      Math.floor(window.innerHeight - top - below - 4)
    );
    box.style.maxHeight = room + "px";
  }
  renderedCallback() {
    this.fit();
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
      snapshot[th.dataset.id] = Math.round(th.getBoundingClientRect().width);
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
    return [
      { key: "s", label: "Surgeons", value: t.surgeons, cls: "tile" },
      { key: "w", label: "With a deal", value: t.withDeal, cls: "tile" },
      { key: "n", label: "No deal yet", value: t.noDeal, cls: "tile warn" },
      { key: "d", label: "Deals", value: t.deals, cls: "tile" },
      {
        key: "v",
        label: "Value / year",
        value: money,
        cls: "tile",
        valCls: money.length > 9 ? "long" : ""
      }
    ];
  }

  // ---------- filter and search ----------
  get showOptions() {
    return SHOW_OPTIONS;
  }
  handleFilter(event) {
    this.filter = event.detail.value;
  }
  get hasQ() {
    return this.q.length > 0;
  }
  handleQ(event) {
    this.q = event.target.value;
  }
  handleQClear() {
    this.q = "";
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
      value: (m) => (deal(m) ? Number(deal(m).value) || 0 : null),
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
        text: formatMoney(d.value, d.currencyCode)
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
        name: {
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
          text: r ? proper(r) : "Not rated",
          rateCls: r ? "rate " + proper(r) : "rate none"
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
      out.push({ key: m.memberId, cls: "", cells });
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
        out.push({ key: m.memberId + "-" + i, cls: "deal2", cells: extra });
      }
    });
    return out;
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
    try {
      window.localStorage.setItem(HIDDEN_KEY, JSON.stringify(this.hidden));
    } catch {
      // not remembered
    }
  }
}
