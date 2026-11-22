import { LightningElement, api } from "lwc";
import { StickyHeads } from "c/pipelineSticky";
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
  plural,
  dealStatus
} from "c/pipelineFormat";
import { localWidth, zoomOf } from "c/pipelineZoom";
import { ratingRank } from "c/pipelineCampaignModel";

const MIN_COL_PX = 50; // the narrowest a column may be dragged to
/**
 * Makes the columns fit the box (Robert, 2026-11-23). `px` holds each shown column's width in the table's own units. Table cells do not
 * honour a percentage inside calc() (Chrome gave every column the same width, which is what made a dragged column look like it was
 * resizing all the others), so the columns are sized in pixels worked out from the measured box. When the widths add up to no more than
 * the box they are kept as they are (the table is then narrower than the box); when they add up to more, the columns share the box:
 * the Status column and the column being dragged (`pinId`) keep their widths and the others shrink in proportion. Exported for the test.
 */
export function fitWidths(ids, px, box, pinId) {
  const out = { ...px };
  const total = ids.reduce((a, id) => a + out[id], 0);
  if (!box || total <= box) return out;
  const fixed = (id) => id === "status" || id === pinId;
  const others = ids.filter((id) => !fixed(id));
  if (!others.length) return out;
  const fixedSum = ids.filter(fixed).reduce((a, id) => a + out[id], 0);
  const othersSum = others.reduce((a, id) => a + out[id], 0);
  const room = Math.max(box - fixedSum, others.length * MIN_COL_PX);
  others.forEach((id) => {
    out[id] = Math.max(MIN_COL_PX, Math.floor((out[id] * room) / othersSum));
  });
  const left = room - others.reduce((a, id) => a + out[id], 0);
  if (left > 0) out[others[others.length - 1]] += left;
  return out;
}

const PAGE = 25; // rows shown to start with
const STEP = 50; // rows added by each "Show more" (Robert, 2026-11-09)

/**
 * The columns of each list: [id, heading, how to sort, number?, shown by default].
 * The three kinds have their own columns and are never mashed together (Robert, 2026-10-25).
 */
function implantColumns(valueHeading) {
  return [
    ["hcp", "Surgeon", (d) => d.hcp || "", false, true],
    ["facility", "Hospital", (d) => d.facility || "", false, true],
    ["country", "Country", (d) => d.ownerCountry || "", false, true],
    ["segment", "Portfolio", (d) => d.segment || "", false, true],
    // the surgeon's usage rating for this deal's portfolio, best first, unrated last (Robert, 2026-11-16: opportunities and risks only,
    // between Portfolio and Brand; ROSA deals are against a hospital, which has no rating)
    ["rating", "Rating", (d) => ratingSortKey(d.rating), false, true],
    ["brands", "Brand", (d) => d.brands || "", false, true],
    ["stage", "Stage", (d) => d.stage || "", false, true],
    ["value", valueHeading, (d) => Number(d.value) || 0, true, true],
    ["quarter", "Close quarter", (d) => quarterRank(d.quarter), false, true],
    ["posted", "Last posted", (d) => chatterDays(d) ?? -1, true, true],
    ["moved", "Last stage move", (d) => stageDays(d) ?? -1, true, true],
    ["status", "Status", (d) => dealStatus(d).label, false, true],
    ["age", "Age", (d) => ageDays(d) ?? -1, true, false],
    ["state", "State", (d) => d.ownerState || "", false, false]
  ];
}
const COLUMNS = {
  opp: implantColumns("Revenue / year"),
  risk: implantColumns("Value at risk / year"),
  rosa: [
    ["facility", "Healthcare facility", (d) => d.facility || "", false, true],
    ["country", "Country", (d) => d.ownerCountry || "", false, true],
    ["dealtype", "Deal type", (d) => d.rosaDealType || "", false, true],
    ["stage", "Stage", (d) => d.stage || "", false, true],
    ["value", "ROSA value / year", (d) => Number(d.value) || 0, true, true],
    ["quarter", "Close quarter", (d) => quarterRank(d.quarter), false, true],
    ["closedate", "Close date", (d) => d.closeDate || "", false, true],
    ["installdate", "Install date", (d) => d.installDate || "", false, true],
    ["posted", "Last posted", (d) => chatterDays(d) ?? -1, true, true],
    ["moved", "Last stage move", (d) => stageDays(d) ?? -1, true, true],
    ["status", "Status", (d) => dealStatus(d).label, false, true],
    ["age", "Age", (d) => ageDays(d) ?? -1, true, false],
    ["state", "State", (d) => d.ownerState || "", false, false]
  ]
};

/** Sorts a rating best first (Platinum, Gold, Silver, Bronze) with the unrated last. */
function ratingSortKey(rating) {
  const r = ratingRank(rating);
  return r === null ? 9 : r;
}
/** "GOLD" as "Gold". */
function properRating(rating) {
  const t = String(rating || "").toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

const STATUS_MIN_PX = 150; // the Status pill (Closed Lost is the widest) and the cell's padding; the same as the style sheet's minimum for the column
const NO_COUNTRY = "nocountry"; // saved with the column choices when the person has hidden the Country column
const NO_RATING = "norating"; // saved with the column choices when the person has hidden the Rating column (it is on by default)
const NO_REP = "norep"; // saved with the column choices when the person has hidden the Sales rep column (Robert, 2026-11-16: it is on by default)

const FOLD_IN_DELAY_MS = 30; // lets the closed state be drawn first, so the unfolding runs
const FOLD_MS = 450; // a little longer than the fold itself (0.4 s in the style sheet)

/**
 * Pipeline: the list of deals for one kind (opportunities, risks or ROSA). The Sales rep (the owner of the deal) is the first column, on by
 * default in every list and switched off in the Columns picker (Robert, 2026-11-16: it was missing when a campaign's deals all had one owner).
 * With more than one rep the list is grouped by rep with a heavier line between reps; a list holding one rep is plain, with the rep's name
 * on each row; with the column switched off there is no rep column and no grouping. a Columns picker, sorting by any heading, and column edges the
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
  connectedCallback() {
    this.onWindowResize = () => this.measureBox();
    window.addEventListener("resize", this.onWindowResize);
  }
  /** The box the table fits is measured after every draw and when the window changes, so the columns re-fit (never guessed). */
  measureBox() {
    const box = this.template.querySelector(".tablewrap");
    const w = box ? box.clientWidth : 0;
    if (w && Math.abs(w - this.boxPx) >= 1) this.boxPx = w;
  }
  renderedCallback() {
    this.measureBox();
    if (!this.sticky) this.sticky = new StickyHeads(this.template);
    this.sticky.refresh();
    if (this.pickerOpen) this.fitPicker();
  }
  /**
   * The Columns picker hangs below its button, but a list near the bottom of the window left the picker running off the screen with
   * the lower columns out of reach (Robert, 2026-11-16, the Risks list). It is measured each time it is drawn: if it does not fit below
   * the button it opens upward when there is more room above (under the top bar), and its height is held to the room it has, scrolling
   * inside itself, so every column can always be reached. Sizes are in the picker's own units, so the room is divided by the Zoom.
   */
  fitPicker() {
    const picker = this.template.querySelector(".picker");
    const button = this.template.querySelector(".colwrap .btn");
    if (!picker || !button) return;
    picker.style.maxHeight = "";
    picker.style.top = "";
    picker.style.bottom = "";
    const zoom = zoomOf(picker);
    const rect = button.getBoundingClientRect();
    const bar =
      (parseFloat(
        window.getComputedStyle(picker).getPropertyValue("--stick")
      ) || 0) * zoom;
    const below = (window.innerHeight - rect.bottom - 12) / zoom;
    const above = (rect.top - bar - 12) / zoom;
    if (picker.offsetHeight <= below) return;
    const up = above > below;
    if (up) {
      picker.style.top = "auto";
      picker.style.bottom = "calc(100% + 6px)";
    }
    picker.style.maxHeight = `${Math.max(120, Math.floor(up ? above : below))}px`;
  }
  disconnectedCallback() {
    window.removeEventListener("resize", this.onWindowResize);
    clearTimeout(this.foldTimer);
    if (this.sticky) this.sticky.stop();
    this.sticky = null;
  }
  get bodyCls() {
    return this.bodyOn ? "fold on" : "fold";
  }
  pickerOpen = false;
  sortId = "value";
  sortDir = -1;
  shown = PAGE;
  live = null; // widths while a drag is in progress
  pinId = ""; // the column being dragged: it keeps the width the mouse gave it while the others share what is left
  boxPx = 0; // the width of the table's box, in the table's own units (measured; see measureBox)
  collapsed = {}; // the sales reps whose block is closed, by name

  get dealCount() {
    return (this.deals || []).length;
  }

  /** "picking" while the Columns picker is open: that list's heading bar then sits above the other lists' bars (see the CSS). */
  get cardCls() {
    return `${this.listOpen ? "card" : "card shut"}${this.pickerOpen ? " picking" : ""}`;
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

  /** More than one country among the deals in this list (the country of each deal's owner). */
  get multiCountry() {
    return (
      new Set((this.deals || []).map((d) => d.ownerCountry).filter(Boolean))
        .size > 1
    );
  }
  /** The columns this list can show: Country only when the deals come from more than one country (Robert, 2026-11-07). */
  get defs() {
    return COLUMNS[this.kind].filter(
      (c) => c[0] !== "country" || this.multiCountry
    );
  }
  /**
   * The columns on show. Country comes on by itself when there is more than one country, unless the person has switched it off:
   * that is saved as the marker "nocountry" beside their other choices (a layout saved before Country existed has neither).
   */
  get chosenIds() {
    if (!(this.columns && this.columns.length))
      return this.defs.filter((c) => c[4]).map((c) => c[0]);
    let ids = this.columns;
    if (
      this.multiCountry &&
      !ids.includes("country") &&
      !ids.includes(NO_COUNTRY)
    )
      ids = [...ids, "country"];
    // a layout saved before the Rating column existed shows it too, unless it was switched off
    if (
      this.defs.some((c) => c[0] === "rating") &&
      !ids.includes("rating") &&
      !ids.includes(NO_RATING)
    )
      ids = [...ids, "rating"];
    return ids;
  }
  get visibleDefs() {
    return this.defs.filter((c) => this.chosenIds.includes(c[0]));
  }
  get headCols() {
    return this.visibleDefs.map((c) => ({
      id: c[0],
      label: c[1],
      cls: (c[3] ? "num" : "") + (c[0] === "status" ? " c-status" : ""),
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
  /** Whether the Sales rep column is on: it is, unless the person switched it off (saved as the marker "norep"). */
  get showRepCol() {
    return !(this.columns && this.columns.includes(NO_REP));
  }
  /** Reps are grouped only when the column is on and the list holds more than one rep (a lone rep needs no grouping). */
  get repNames() {
    return [...new Set((this.deals || []).map((d) => d.ownerName || ""))].sort(
      (a, b) => a.localeCompare(b)
    );
  }
  get grouped() {
    return this.showRepCol && this.repNames.length > 1;
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
      star: false,
      campaign: false
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
          plainRep: this.showRepCol,
          rep: d.ownerName || "–",
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
      textCls: "",
      title: "",
      tag: false,
      tagCls: "",
      star: false,
      stateStar: false
    };
    switch (id) {
      case "hcp":
      case "facility": {
        const text = (id === "hcp" ? d.hcp : d.facility) || "–";
        return {
          ...base,
          text,
          // by default the Hospital column is a little narrower: a long name is cut with "…" (the full name on hover) until the
          // person drags the column to the width they want (Robert, 2026-11-07)
          textCls: id === "facility" && !this.hasWidths ? "clip" : "",
          title: id === "facility" ? text : "",
          star: !!d.repPriority && (id === "hcp") === (this.kind !== "rosa"),
          // the violet star: a state priority, in the same place as the rep star (Robert, 2026-11-10)
          stateStar:
            !!d.statePriority && (id === "hcp") === (this.kind !== "rosa"),
          // the gold star: the deal is in one or more campaigns (beside the surgeon; a ROSA list has no surgeon column)
          campaign: d.campaignCount > 0 && id === "hcp" && this.kind !== "rosa"
        };
      }
      case "rating": {
        // a small plate: brushed metal for a rating, flat black for "Not rated" (Robert, 2026-11-19)
        const r = ratingRank(d.rating) === null ? "" : properRating(d.rating);
        return {
          ...base,
          cls: "ratecell",
          tag: true,
          plate: true,
          tagCls: "rplate " + (r || "none"),
          text: r || "Not rated"
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
        // a closed or an on-hold deal has no "last posted" to watch; the Status column says On Hold (Robert, 2026-11-07)
        if (d.isClosed || d.onHold)
          return { ...base, cls: "num", text: "–", tag: false };
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
      case "status": {
        // a solid pill in the stage bar's colours: Open blue, On Hold amber, Closed Won green, Closed Lost red
        const st = dealStatus(d);
        return {
          ...base,
          cls: "c-status",
          text: st.label,
          tag: true,
          tagCls: `stp st-${st.key}`
        };
      }
      case "country":
        return { ...base, text: d.ownerCountry || "–" };
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
    return Math.min(STEP, this.remaining);
  }
  handleMore() {
    this.shown += STEP;
  }
  /** Show All: every deal in the list at once (Robert, 2026-11-09). */
  handleShowAll() {
    this.shown = this.dealCount;
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
  /**
   * A press on a rating plate (Robert, 2026-11-19): opens the deal as a click on its line does, but on its Surgeon Usages screen, so a
   * rating can be put right (or a usage added for a surgeon who is not rated) at once. The line's own click does not also fire.
   */
  handlePlate(event) {
    event.stopPropagation();
    const row = event.currentTarget.closest("tr");
    this.dispatchEvent(
      new CustomEvent("dealopen", {
        detail: {
          id: row.dataset.id,
          ids: this.orderedDeals.map((d) => d.id),
          screen: "usages"
        }
      })
    );
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
  /** Every shown column in order (the rep column first when it is on) as ids. */
  get shownIds() {
    return (this.showRepCol ? ["__rep"] : []).concat(
      this.visibleDefs.map((c) => c[0])
    );
  }
  /** The width of each shown column in pixels, fitted to the box (see fitWidths). */
  get fittedWidths() {
    const ids = this.shownIds;
    const px = {};
    ids.forEach((id) => {
      px[id] = this.widthMap[id] || 140;
    });
    // the Status column never gets narrower than its pill needs (Robert, 2026-11-17: Closed Won did not fit and he had to widen the column by hand)
    if (px.status !== undefined) px.status = Math.max(px.status, STATUS_MIN_PX);
    return fitWidths(ids, px, this.boxPx, this.pinId);
  }
  get colWidths() {
    const fitted = this.fittedWidths;
    return this.shownIds.map((id) => ({
      id,
      px: fitted[id],
      style: `width:${fitted[id]}px`
    }));
  }
  get tableStyle() {
    if (!this.hasWidths) return "";
    const total = this.colWidths.reduce((a, c) => a + c.px, 0);
    return `table-layout:fixed;width:min(${total}px,100%)`;
  }
  handleResizeStart(event) {
    const id = event.currentTarget.dataset.id;
    const snapshot = {};
    this.template.querySelectorAll("th[data-id]").forEach((th) => {
      snapshot[th.dataset.id] = Math.round(localWidth(th));
    });
    this.measureBox();
    const ids = this.shownIds;
    // the dragged column may grow until the others are at their narrowest (and Status at its own width)
    const others = ids.filter((x) => x !== id && x !== "status").length;
    const statusPx =
      id !== "status" && snapshot.status !== undefined
        ? Math.max(snapshot.status, STATUS_MIN_PX)
        : 0;
    const maxWidth = this.boxPx
      ? Math.max(MIN_COL_PX, this.boxPx - statusPx - others * MIN_COL_PX)
      : Infinity;
    this.pinId = id;
    this.live = { ...snapshot };
    beginColumnDrag(
      event,
      snapshot[id] || 140,
      MIN_COL_PX,
      (width) => {
        // the column follows the mouse; the others share what is left of the box
        const px = { ...this.live, [id]: Math.min(width, maxWidth) };
        this.live = fitWidths(ids, px, this.boxPx, id);
      },
      () => {
        const done = this.live;
        this.live = null;
        this.pinId = "";
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
    return [{ id: "__rep", label: "Sales rep", on: this.showRepCol }].concat(
      this.defs.map((c) => ({
        id: c[0],
        label: c[1],
        on: this.chosenIds.includes(c[0])
      }))
    );
  }
  handlePicker() {
    this.pickerOpen = !this.pickerOpen;
  }
  handleColumn(event) {
    const id = event.target.dataset.id;
    const checked = event.target.checked;
    // the Sales rep column is not one of the deal columns: it is on unless the marker says it was switched off
    const repOn = id === "__rep" ? checked : this.showRepCol;
    const on = this.chosenIds;
    let next =
      id === "__rep" ? on : checked ? [...on, id] : on.filter((x) => x !== id);
    next = this.defs.map((c) => c[0]).filter((x) => next.includes(x));
    if (!next.length) return;
    // switching Country off is remembered, or it would come straight back on while there is more than one country
    if (this.multiCountry && !next.includes("country")) next.push(NO_COUNTRY);
    if (!repOn) next.push(NO_REP);
    // the same for Rating (opportunities and risks only)
    if (this.defs.some((c) => c[0] === "rating") && !next.includes("rating"))
      next.push(NO_RATING);
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
