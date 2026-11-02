import { LightningElement, api } from "lwc";
import { beginColumnDrag } from "c/pipelineColumnResize";
import {
  formatMoney,
  chatterDays,
  stageDays,
  ageDays,
  chatterBand,
  stageBand,
  formatDate,
  totalsByCurrency,
  needsAttention,
  quarterRank,
  plural
} from "c/pipelineFormat";

const PAGE = 25;

/**
 * The columns of each list: [id, heading, how to sort, number?, shown by default].
 * The three kinds have their own columns and are never mashed together (Robert, 2026-10-25).
 */
function implantColumns(valueHeading) {
  return [
    ["hcp", "Surgeon", (d) => d.hcp || "", false, true],
    ["facility", "Hospital", (d) => d.facility || "", false, true],
    ["segment", "Portfolio", (d) => d.segment || "", false, true],
    ["brands", "Brand", (d) => d.brands || "", false, true],
    ["stage", "Stage", (d) => d.stage || "", false, true],
    ["value", valueHeading, (d) => Number(d.value) || 0, true, true],
    ["quarter", "Close quarter", (d) => quarterRank(d.quarter), false, true],
    ["posted", "Last posted", (d) => chatterDays(d) ?? -1, true, true],
    ["moved", "Last stage move", (d) => stageDays(d) ?? -1, true, true],
    [
      "status",
      "Status",
      (d) => (d.isClosed ? "Closed" : d.onHold ? "On hold" : "Open"),
      false,
      true
    ],
    ["age", "Age", (d) => ageDays(d) ?? -1, true, false],
    ["state", "State", (d) => d.ownerState || "", false, false]
  ];
}
const COLUMNS = {
  opp: implantColumns("Revenue / year"),
  risk: implantColumns("Value at risk / year"),
  rosa: [
    ["facility", "Healthcare facility", (d) => d.facility || "", false, true],
    ["dealtype", "Deal type", (d) => d.rosaDealType || "", false, true],
    ["stage", "Stage", (d) => d.stage || "", false, true],
    ["value", "ROSA value / year", (d) => Number(d.value) || 0, true, true],
    ["quarter", "Close quarter", (d) => quarterRank(d.quarter), false, true],
    ["closedate", "Close date", (d) => d.closeDate || "", false, true],
    ["installdate", "Install date", (d) => d.installDate || "", false, true],
    ["posted", "Last posted", (d) => chatterDays(d) ?? -1, true, true],
    ["moved", "Last stage move", (d) => stageDays(d) ?? -1, true, true],
    [
      "status",
      "Status",
      (d) => (d.isClosed ? "Closed" : d.onHold ? "On hold" : "Open"),
      false,
      true
    ],
    ["age", "Age", (d) => ageDays(d) ?? -1, true, false],
    ["state", "State", (d) => d.ownerState || "", false, false]
  ]
};

const FOLD_IN_DELAY_MS = 30; // lets the closed state be drawn first, so the unfolding runs
const FOLD_MS = 450; // a little longer than the fold itself (0.4 s in the style sheet)

/**
 * Pipeline: the list of deals for one kind (opportunities, risks or ROSA). Grouped by sales rep with a heavier line
 * between reps (a list holding one rep is not grouped), a Columns picker, sorting by any heading, and column edges the
 * person can drag; the widths are kept in their own settings. A row opens the deal. It reads the deals it is handed
 * and changes none.
 */
export default class PipelineTypeList extends LightningElement {
  @api kind = "opp";
  @api deals = [];
  @api columns; // the column ids the person chose, or undefined for the defaults
  @api widths; // saved column widths in pixels, by column id, or undefined for automatic
  @api altTint = false;
  @api ownerName = ""; // when the screen is filtered down to one team member, their name follows the heading

  listOpen = true;
  bodyMounted = true; // the list is on the page (it stays a moment after closing, to fold away)
  bodyOn = true; // and this says it is unfolded
  foldTimer;

  /** Whether the list starts open (remembered in the person's settings). A repeat of what it already is changes nothing. */
  @api
  get initialOpen() {
    return this.listOpen;
  }
  set initialOpen(value) {
    const open = value !== false;
    if (open === this.listOpen) return;
    clearTimeout(this.foldTimer);
    this.listOpen = open;
    this.bodyMounted = open;
    this.bodyOn = open;
  }
  disconnectedCallback() {
    clearTimeout(this.foldTimer);
  }
  get bodyCls() {
    return this.bodyOn ? "fold on" : "fold";
  }
  pickerOpen = false;
  sortId = "value";
  sortDir = -1;
  shown = PAGE;
  live = null; // widths while a drag is in progress
  collapsed = {}; // the sales reps whose block is closed, by name

  get dealCount() {
    return (this.deals || []).length;
  }

  get cardCls() {
    return this.listOpen ? "card" : "card shut";
  }
  /* ----- the list ----- */
  get listTitle() {
    const n = this.dealCount;
    const word = { opp: "opportunity", risk: "risk", rosa: "ROSA deal" }[
      this.kind
    ];
    const many = { opp: "opportunities", risk: "risks", rosa: "ROSA deals" }[
      this.kind
    ];
    const title = `${n} ${plural(n, word, many)}`;
    return this.ownerName ? `${title} for ${this.ownerName}` : title;
  }
  get listChev() {
    return this.listOpen ? "chev up" : "chev";
  }
  get listToggleTitle() {
    return this.listOpen ? "Hide the list" : "Show the list";
  }
  get noDeals() {
    return this.dealCount === 0;
  }
  handleListToggle() {
    this.listOpen = !this.listOpen;
    this.fold(this.listOpen);
    this.pickerOpen = false;
    this.dispatchEvent(
      new CustomEvent("listtoggle", {
        detail: { kind: this.kind, open: this.listOpen }
      })
    );
  }

  /** Unfolds or folds the list: put on the page first and opened a moment later, closed first and taken off after it has folded. */
  fold(open) {
    clearTimeout(this.foldTimer);
    if (open) {
      this.bodyMounted = true;
      // eslint-disable-next-line @lwc/lwc/no-async-operation
      this.foldTimer = setTimeout(() => {
        this.bodyOn = true;
      }, FOLD_IN_DELAY_MS);
    } else {
      this.bodyOn = false;
      // eslint-disable-next-line @lwc/lwc/no-async-operation
      this.foldTimer = setTimeout(() => {
        this.bodyMounted = false;
      }, FOLD_MS);
    }
  }

  get defs() {
    return COLUMNS[this.kind];
  }
  get chosenIds() {
    const ids =
      this.columns && this.columns.length
        ? this.columns
        : this.defs.filter((c) => c[4]).map((c) => c[0]);
    return ids;
  }
  get visibleDefs() {
    return this.defs.filter((c) => this.chosenIds.includes(c[0]));
  }
  get headCols() {
    return this.visibleDefs.map((c) => ({
      id: c[0],
      label: c[1],
      cls: c[3] ? "num" : "",
      arrow: this.sortId === c[0] ? (this.sortDir === 1 ? " ▲" : " ▼") : ""
    }));
  }
  get sortedDeals() {
    const def =
      this.defs.find((c) => c[0] === this.sortId) ||
      this.defs.find((c) => c[0] === "value");
    const key = def[2];
    const dir = this.sortDir;
    return [...(this.deals || [])].sort((a, b) => {
      const x = key(a);
      const y = key(b);
      return (x > y ? 1 : x < y ? -1 : 0) * dir;
    });
  }
  /** Reps are grouped only when the list holds more than one rep (a lone rep needs no grouping). */
  get repNames() {
    return [...new Set((this.deals || []).map((d) => d.ownerName || ""))].sort(
      (a, b) => a.localeCompare(b)
    );
  }
  get grouped() {
    return this.repNames.length > 1;
  }
  get orderedDeals() {
    if (!this.grouped) return this.sortedDeals;
    const rank = new Map(this.repNames.map((n, i) => [n, i]));
    return this.sortedDeals
      .map((d, i) => ({ d, i }))
      .sort(
        (a, b) =>
          rank.get(a.d.ownerName || "") - rank.get(b.d.ownerName || "") ||
          a.i - b.i
      )
      .map((x) => x.d);
  }
  /** The reps that have more than one deal in the list, in the order shown: the only ones that can be collapsed. */
  get multiReps() {
    if (!this.grouped) return [];
    const count = new Map();
    this.orderedDeals.forEach((d) =>
      count.set(d.ownerName, (count.get(d.ownerName) || 0) + 1)
    );
    return [...count.entries()].filter(([, n]) => n > 1).map(([rep]) => rep);
  }
  get hasMulti() {
    return this.multiReps.length > 0;
  }
  get showCollapseAll() {
    return this.listOpen && this.hasMulti;
  }
  get collapseAllText() {
    return this.multiReps.some((r) => !this.collapsed[r])
      ? "Collapse all"
      : "Expand all";
  }
  handleCollapseAll() {
    const anyOpen = this.multiReps.some((r) => !this.collapsed[r]);
    const next = {};
    this.multiReps.forEach((r) => {
      next[r] = anyOpen;
    });
    this.collapsed = next;
  }
  handleRepToggle(event) {
    const rep = event.currentTarget.dataset.rep;
    this.collapsed = { ...this.collapsed, [rep]: !this.collapsed[rep] };
  }
  /** What a collapsed rep shows in each column: the total, the freshest post and stage move, the oldest age. */
  aggCell(id, group, now) {
    const base = {
      id,
      cls: "",
      text: "",
      title: "",
      tag: false,
      tagCls: "",
      star: false
    };
    const live = group.filter((d) => !d.isClosed && !d.onHold);
    const days = (fn) => live.map((d) => fn(d, now)).filter((n) => n !== null);
    if (id === "value")
      return { ...base, cls: "num", text: totalsByCurrency(group) };
    if (id === "posted") {
      const m = days(chatterDays);
      return m.length
        ? {
            ...base,
            cls: "num",
            text: `${Math.min(...m)} d`,
            tag: true,
            tagCls: `tag ${chatterBand(Math.min(...m))}`
          }
        : { ...base, cls: "num", text: "–" };
    }
    if (id === "moved") {
      const m = days(stageDays);
      return m.length
        ? {
            ...base,
            cls: "num",
            text: `${Math.min(...m)} d`,
            tag: true,
            tagCls: `tag ${stageBand(Math.min(...m))}`
          }
        : { ...base, cls: "num", text: "–" };
    }
    if (id === "age")
      return {
        ...base,
        cls: "num",
        text: `${Math.max(...group.map((d) => ageDays(d, now) ?? 0))} d`
      };
    if (id === "status") {
      const n = group.filter((d) => needsAttention(d, now)).length;
      return { ...base, text: n ? `${n} need attention` : "All current" };
    }
    return base;
  }
  get rows() {
    const now = Date.now();
    const defs = this.visibleDefs;
    const list = this.orderedDeals;
    const byRep = new Map();
    list.forEach((d) => {
      if (!byRep.has(d.ownerName)) byRep.set(d.ownerName, []);
      byRep.get(d.ownerName).push(d);
    });
    const out = [];
    let shown = 0;
    let groupNo = -1;
    const emit = (group) => {
      groupNo++;
      const alt = this.altTint && groupNo % 2 ? " alt" : "";
      const rep = group[0].ownerName;
      const multi = this.grouped && group.length > 1;
      const closed = multi && this.collapsed[rep];
      const repInfo = {
        rep,
        multi,
        chev: multi ? (closed ? "chev" : "chev up") : "",
        summary: multi
          ? `${group.length} deals · ${totalsByCurrency(group)}`
          : ""
      };
      if (closed) {
        out.push({
          id: "agg-" + rep,
          agg: true,
          cls: ("gfirst glast" + alt).trim(),
          span: 1,
          showRep: true,
          ...repInfo,
          cells: defs.map((c) => this.aggCell(c[0], group, now))
        });
        return;
      }
      group.forEach((d, i) => {
        out.push({
          id: d.id,
          cls: [
            i === 0 ? "gfirst" : "",
            i === group.length - 1 ? "glast" : "",
            alt.trim()
          ]
            .join(" ")
            .replace(/\s+/g, " ")
            .trim(),
          notAgg: true,
          span: group.length,
          showRep: this.grouped && i === 0,
          ...repInfo,
          cells: defs.map((c) => this.cell(c[0], d, now))
        });
      });
    };
    if (!this.grouped) {
      /* one rep (or none): a plain list, paged by deal */
      list.slice(0, this.shown).forEach((d) => {
        out.push({
          id: d.id,
          cls: "",
          span: 1,
          notAgg: true,
          showRep: false,
          multi: false,
          cells: defs.map((c) => this.cell(c[0], d, now))
        });
      });
      return out;
    }
    /* grouped: a rep's block is never cut in the middle, so paging goes by whole reps */
    for (const group of byRep.values()) {
      if (shown >= this.shown) break;
      shown += group.length;
      emit(group);
    }
    return out;
  }
  cell(id, d, now) {
    const base = {
      id,
      cls: "",
      text: "",
      title: "",
      tag: false,
      tagCls: "",
      star: false
    };
    switch (id) {
      case "hcp":
      case "facility": {
        const text = (id === "hcp" ? d.hcp : d.facility) || "–";
        return {
          ...base,
          text,
          star: !!d.repPriority && (id === "hcp") === (this.kind !== "rosa")
        };
      }
      case "value":
        return {
          ...base,
          cls: "num",
          text: formatMoney(d.value, d.currencyCode)
        };
      case "posted": {
        const n = chatterDays(d, now);
        if (d.isClosed || d.onHold)
          return {
            ...base,
            cls: "num",
            text: d.onHold && !d.isClosed ? "On hold" : "–",
            tag: false
          };
        const none = !d.lastPosted;
        return {
          ...base,
          cls: "num",
          text: n === null ? "–" : `${n} d`,
          tag: n !== null,
          tagCls: `tag ${chatterBand(n)}`,
          title: none
            ? "Nobody has posted on this deal yet; counted from the day it was created."
            : ""
        };
      }
      case "moved": {
        const n = stageDays(d, now);
        if (d.isClosed || d.onHold) return { ...base, cls: "num", text: "–" };
        return {
          ...base,
          cls: "num",
          text: n === null ? "–" : `${n} d`,
          tag: n !== null,
          tagCls: `tag ${stageBand(n)}`
        };
      }
      case "age": {
        const n = ageDays(d, now);
        return { ...base, cls: "num", text: n === null ? "–" : `${n} d` };
      }
      case "closedate":
        return { ...base, text: formatDate(d.closeDate) || "–" };
      case "installdate":
        return { ...base, text: formatDate(d.installDate) || "–" };
      case "dealtype":
        return { ...base, text: d.rosaDealType || "–" };
      case "segment":
        return {
          ...base,
          text: (d.segment || "").split(";").join(", ") || "–"
        };
      case "brands":
        return { ...base, text: (d.brands || "").split(";").join(", ") || "–" };
      case "stage":
        return { ...base, text: d.stage || "–" };
      case "quarter":
        return { ...base, text: d.quarter || "–" };
      case "state":
        return { ...base, text: d.ownerState || "–" };
      default:
        return base;
    }
  }
  get hasMore() {
    return this.dealCount > this.shown;
  }
  get remaining() {
    return this.dealCount - this.shown;
  }
  get moreCount() {
    return Math.min(PAGE, this.remaining);
  }
  handleMore() {
    this.shown += PAGE;
  }
  handleSort(event) {
    const id = event.currentTarget.dataset.id;
    if (this.sortId === id) {
      this.sortDir = -this.sortDir;
    } else {
      this.sortId = id;
      const def = this.defs.find((c) => c[0] === id);
      this.sortDir = def && def[3] ? -1 : 1;
    }
    this.shown = PAGE;
  }
  handleOpenDeal(event) {
    this.dispatchEvent(
      new CustomEvent("dealopen", {
        detail: {
          id: event.currentTarget.dataset.id,
          ids: this.orderedDeals.map((d) => d.id)
        }
      })
    );
  }

  /* ----- column widths ----- */
  get widthMap() {
    return this.live || this.widths || {};
  }
  get hasWidths() {
    return Object.keys(this.widthMap).length > 0;
  }
  /** Every shown column in order (the rep column first when grouped), each with its width in pixels. */
  get colWidths() {
    const ids = (this.grouped ? ["__rep"] : []).concat(
      this.visibleDefs.map((c) => c[0])
    );
    return ids.map((id) => ({
      id,
      px: this.widthMap[id] || 140,
      style: `width:${this.widthMap[id] || 140}px`
    }));
  }
  get tableStyle() {
    if (!this.hasWidths) return "";
    const total = this.colWidths.reduce((a, c) => a + c.px, 0);
    return `table-layout:fixed;width:${total}px`;
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
      50,
      (width) => {
        this.live = { ...this.live, [id]: width };
      },
      () => {
        const done = this.live;
        this.live = null;
        this.dispatchEvent(
          new CustomEvent("widthschange", {
            detail: { kind: this.kind, widths: done }
          })
        );
      }
    );
  }
  handleWidthsReset() {
    this.pickerOpen = false;
    this.dispatchEvent(
      new CustomEvent("widthschange", {
        detail: { kind: this.kind, widths: null }
      })
    );
  }

  /* ----- the Columns picker ----- */
  get pickerItems() {
    return this.defs.map((c) => ({
      id: c[0],
      label: c[1],
      on: this.chosenIds.includes(c[0])
    }));
  }
  handlePicker() {
    this.pickerOpen = !this.pickerOpen;
  }
  handleColumn(event) {
    const id = event.target.dataset.id;
    const on = this.chosenIds;
    let next = event.target.checked ? [...on, id] : on.filter((x) => x !== id);
    next = this.defs.map((c) => c[0]).filter((x) => next.includes(x));
    if (!next.length) return;
    this.dispatchEvent(
      new CustomEvent("columnschange", {
        detail: { kind: this.kind, columns: next }
      })
    );
  }
  handleColumnsReset() {
    this.dispatchEvent(
      new CustomEvent("columnschange", {
        detail: { kind: this.kind, columns: null }
      })
    );
    this.pickerOpen = false;
  }
}
