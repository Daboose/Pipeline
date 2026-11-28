import { LightningElement, api, track } from "lwc";
import getHospitalBookings from "@salesforce/apex/PipelineBookingsController.getHospitalBookings";
import getHospitalBooked from "@salesforce/apex/PipelineBookingsController.getHospitalBooked";
import {
  chartModel,
  tipFor,
  windowText,
  monthLabels,
  VIEWS,
  emptyFilter,
  linesOf,
  chipsOf,
  chartTypes,
  grandTotal,
  surgeonGrid,
  brandTable,
  filterItems,
  activeCount,
  toggleAll,
  flip
} from "c/pipelineHospitalBookingsModel";

function errorText(e) {
  return (
    (e && e.body && e.body.message) ||
    (e && e.message) ||
    "The bookings could not be read."
  );
}

/** The words of a tooltip as lines, the first one bold. */
const tipLines = (words) =>
  (words || []).map((text, i) => ({
    key: "l" + i,
    text,
    cls: i === 0 ? "tb" : ""
  }));

/**
 * Pipeline: the MyCase Bookings screen of a ROSA deal (Robert, 2026-11-19; views, chips and filters 2026-11-25, mockup
 * docs/mockups/pipeline_bookings_surgeon_view_v4.html). A ROSA deal is at a hospital and has no surgeon, so the bookings are the
 * hospital's, for the last 12 months up to today (Robert, 2026-11-28: the current month is the last column). A VIEW slider beside the heading chooses the view:
 * - Hospital Total: one stacked bar per month, split into Hip, Knee, Shoulder and CMFT, each month's total above its bar.
 * - Surgeon Total: a grid of numbers, a row per surgeon (busiest first), a column per month, shaded by size, a Hospital total row.
 * - Surgeon / Brand: a table, a row per brand under each surgeon (the case's Brand, in its type's colour), a column per month; the
 *   Surgeon and Brand headings have filters (untick names; the funnel button is filled while anything is hidden).
 * Under the heading, two rows of on/off chips: Hip, Knee, Shoulder, CMFT, then Primary, Revision, Demo (the case's Type); all on at
 * the start; each takes its cases out of every view and the big number. The view and the chips are kept in the person's settings
 * (`saved` in, `prefschange` out; the same at every hospital); the Surgeon and Brand filters only last while the flyout is open. Hovering a bar or a number shows its detail. The chart and tables fill the box they are given.
 *
 * Who uses it: the deal flyout (pipelineDeal) on the MyCase Bookings screen of a ROSA deal; it is passed the deal's id.
 * What it touches: reads the bookings with PipelineBookingsController.getHospitalBookings (the deal's Healthcare Facility, in the
 * signed-in person's own access) and changes nothing. Colours come from the app's own theme variables, so dark and light follow.
 */
/** The ROSA / non-ROSA choice, with no heading (Robert, 2026-11-28: "ALL" under a "ROSA" heading read as all ROSA). */
const ROBOT_OPTIONS = [
  { value: "all", label: "All" },
  { value: "rosa", label: "ROSA only" },
  { value: "non", label: "Non-ROSA" }
];

/** Completed surgeries (the default) or bookings from today (Robert, 2026-11-28); no "all". */
const WHEN_OPTIONS = [
  { value: "past", label: "Completed" },
  { value: "future", label: "Booked" }
];

export default class PipelineHospitalBookings extends LightningElement {
  _recordId;
  _refreshKey = 0;
  data;
  loading = false;
  error = "";
  /** The view chosen on the slider: hospital, surgeon or brand. */
  view = "hospital";
  /** What is switched off: types, case Types, surgeons and brands. */
  @track f = emptyFilter();
  /** ROSA / non-ROSA (Robert, 2026-11-28): all cases, only those whose usage holds the ROSA drape, or only those without it. */
  robot = "all";
  /**
   * Completed or Booked (Robert, 2026-11-28): "past" is the last 12 months' cases with usage, up to today (ROSA = the drape on the usage);
   * "future" is the bookings from today for 12 months (ROSA = the booking's Technology, ROSA or ROSA+PSI; cancelled ones left out).
   */
  when = "past";
  /** Both reads, kept while the deal is open so switching back is instant: { past, future }. */
  _cache = {};
  /** True while the other set is being read after a switch (the views dim). */
  switching = false;
  /** The open filter panel: { kind, query, on, style }, or null. */
  @track pop = null;
  /** The measured size of the chart box, so the chart fills its space. */
  @track size;
  /** The tooltip: shown while the mouse is over a bar or a number. */
  @track tip = { on: false, style: "", lines: [] };
  _onResize;
  _lines;
  _linesOf;

  connectedCallback() {
    this._onResize = () => this.measure();
    window.addEventListener("resize", this._onResize);
  }
  disconnectedCallback() {
    window.removeEventListener("resize", this._onResize);
  }
  renderedCallback() {
    this.measure();
  }
  measure() {
    const box = this.template.querySelector(".box.chart");
    if (!box) return;
    const w = Math.round(box.clientWidth);
    const h = Math.round(box.clientHeight);
    if (
      w > 0 &&
      h > 0 &&
      (!this.size || this.size.w !== w || this.size.h !== h)
    ) {
      this.size = { w, h };
    }
  }

  /** A number that goes up when the deal changes elsewhere, so the bookings are read again. */
  @api
  get refreshKey() {
    return this._refreshKey;
  }
  set refreshKey(value) {
    if (value !== this._refreshKey) {
      this._refreshKey = value;
      if (this._recordId) this.load(true);
    }
  }

  /**
   * The person's saved choice ({ view, types, procs }: the view and the chips switched off), the same at every hospital (Robert,
   * 2026-11-25). The Surgeon and Brand filters are not saved: their names belong to one hospital.
   */
  @api
  get saved() {
    return this._saved;
  }
  set saved(value) {
    this._saved = value;
    if (!value) return;
    if (["hospital", "surgeon", "brand"].includes(value.view))
      this.view = value.view;
    this.f = {
      ...this.f,
      types: Array.isArray(value.types) ? [...value.types] : [],
      procs: Array.isArray(value.procs) ? [...value.procs] : []
    };
    this.robot = ["all", "rosa", "non"].includes(value.robot)
      ? value.robot
      : "all";
    const when = value.when === "future" ? "future" : "past";
    if (when !== this.when) {
      this.when = when;
      if (this._recordId) this.load(false);
    }
  }
  _saved = null;

  /** Tells the parent what to keep in the person's settings. */
  sendPrefs() {
    this.dispatchEvent(
      new CustomEvent("prefschange", {
        detail: {
          view: this.view,
          types: [...this.f.types],
          procs: [...this.f.procs],
          robot: this.robot,
          when: this.when
        }
      })
    );
  }

  /**
   * Optional (the ROSA deal screen, Robert 2026-11-28, mockup rosa_deal_add_surgeons_v9): the Account ids of the surgeons already in the
   * deal's Surgeons and Growth. When given, the Surgeon Total and Surgeon / Brand views put a green tick before those surgeons and, when
   * `canAdd` is true, a round plus before the others; pressing it fires `addsurgeon` ({ accountId, name }) and the caller adds them.
   * Pipeline passes nothing, so it shows no marks.
   */
  @api
  get dealSurgeons() {
    return this._dealSurgeons;
  }
  set dealSurgeons(value) {
    this._dealSurgeons = Array.isArray(value) ? value : null;
    this.adding = null;
  }
  _dealSurgeons = null;
  @api canAdd = false;
  /** The heading (shown in capitals); the ROSA deal's Site › myCase passes "myCase Hospital Bookings" (Robert, 2026-11-28). */
  @api heading = "MyCase bookings";
  /** The surgeon being added (its plus is hidden until the caller sends the new list). */
  adding = null;

  /** A row's mark: inDeal (the tick) or add (the plus); neither for "No surgeon recorded" or without a deal list. */
  markOf(key) {
    const list = this._dealSurgeons;
    if (!list || !key || String(key).startsWith("none:")) return {};
    if (list.includes(key)) return { markIn: true };
    if (this.canAdd && this.adding !== key) return { markAdd: true };
    return {};
  }
  get hasMarks() {
    return !!this._dealSurgeons;
  }
  handleAddSurgeon(event) {
    const { id, name } = event.currentTarget.dataset;
    if (!id) return;
    this.adding = id;
    this.dispatchEvent(
      new CustomEvent("addsurgeon", { detail: { accountId: id, name } })
    );
  }

  /** The id of the ROSA deal (SalesRisks__c). */
  @api
  get recordId() {
    return this._recordId;
  }
  set recordId(value) {
    if (value === this._recordId) return;
    this._recordId = value;
    this.load(false);
  }

  /** A quiet read keeps what is on screen until the new data arrives. A new deal or a refresh forgets both kept reads. */
  load(quiet) {
    const id = this._recordId;
    if (!id) return;
    this._cache = {};
    this.loading = !quiet;
    this.error = "";
    if (!quiet) this.data = undefined;
    this.read(id, this.when);
  }
  read(id, when) {
    const call = when === "future" ? getHospitalBooked : getHospitalBookings;
    return call({ dealId: id })
      .then((d) => {
        if (id !== this._recordId) return;
        this._cache = { ...this._cache, [when]: d };
        if (when === this.when) this.data = d;
      })
      .catch((e) => {
        if (id === this._recordId && when === this.when)
          this.error = errorText(e);
      })
      .finally(() => {
        if (id === this._recordId && when === this.when) {
          this.loading = false;
          this.switching = false;
        }
      });
  }

  /* ---------- Completed or Booked ---------- */
  get whenOptions() {
    return WHEN_OPTIONS;
  }
  get isBooked() {
    return this.when === "future";
  }
  handleWhen(event) {
    const when = event.detail.value === "future" ? "future" : "past";
    if (when === this.when) return;
    this.when = when;
    this.tip = { ...this.tip, on: false };
    this.closeFilter();
    this.sendPrefs();
    const kept = this._cache[when];
    if (kept) {
      this.data = kept;
      return;
    }
    // keep the screen (and the sliders) in place and dim the views while the other set is read
    this.switching = true;
    this.error = "";
    this.read(this._recordId, when);
  }
  get wrapCls() {
    return this.switching ? "wrap dim" : "wrap";
  }
  get showHospital() {
    return this.hasViews && this.isHospital;
  }
  get showSurgeon() {
    return this.hasViews && this.isSurgeon;
  }
  get showBrand() {
    return this.hasViews && this.isBrand;
  }
  get bigText() {
    return this.isBooked
      ? "booked from today, next 12 months"
      : "cases in the last 12 months";
  }

  get noHospital() {
    return !this.loading && !this.error && !!this.data && !this.data.hospitalId;
  }
  get hasHospital() {
    return !!(this.data && this.data.hospitalId && !this.error);
  }
  /** Nothing in the chosen set: the heading and sliders stay so the other set can be chosen, with a line in place of the views. */
  get noBookings() {
    return this.hasHospital && !this.data.hasBookings;
  }
  get hasChart() {
    return this.hasHospital;
  }
  get hasViews() {
    return this.hasHospital && this.data.hasBookings;
  }
  get noBookingsText() {
    return this.isBooked
      ? `No bookings at ${this.data.hospitalName} from today.`
      : `No MyCase bookings at ${this.data.hospitalName} in the last 12 months.`;
  }
  get hospitalText() {
    return this.data ? "at " + this.data.hospitalName : "";
  }
  get windowLabel() {
    return windowText(this.data.windowStart, this.data.windowEnd);
  }

  /** The lines from Apex, worked out once per read. */
  get allLines() {
    if (this._linesOf !== this.data) {
      this._linesOf = this.data;
      this._lines = linesOf(this.data);
    }
    return this._lines;
  }
  /** The lines the ROSA / non-ROSA choice lets through; every view, chip and filter works from these. */
  get lines() {
    const all = this.allLines;
    if (this.robot === "all") return all;
    const want = this.robot === "rosa";
    return all.filter((l) => !!l.rosa === want);
  }
  get robotOptions() {
    return ROBOT_OPTIONS;
  }
  handleRobot(event) {
    this.robot = event.detail.value;
    this.tip = { ...this.tip, on: false };
    this.sendPrefs();
  }
  get viewOptions() {
    return VIEWS;
  }
  get isHospital() {
    return this.view === "hospital";
  }
  get isSurgeon() {
    return this.view === "surgeon";
  }
  get isBrand() {
    return this.view === "brand";
  }
  get chips() {
    return chipsOf(this.lines, this.f);
  }
  get grand() {
    return grandTotal(this.lines, this.f, this.view);
  }
  get chartTypes() {
    return chartTypes(this.lines, this.f);
  }
  get chart() {
    return chartModel(this.chartTypes, this.data.windowStart, this.size);
  }
  get months() {
    return monthLabels(this.data.windowStart).map((label, i) => ({
      key: "m" + i,
      label
    }));
  }
  /** A tooltip's words go on the number as one text, a line per row. */
  withTips(model) {
    return {
      ...model,
      rows: model.rows.map((r) => ({
        ...r,
        cells: r.cells.map((c) => ({
          ...c,
          tipText: c.tip ? c.tip.join("\n") : ""
        }))
      }))
    };
  }
  get grid() {
    const g = this.withTips(
      surgeonGrid(this.lines, this.f, this.data.windowStart)
    );
    return {
      ...g,
      rows: g.rows.map((r) => ({ ...r, ...this.markOf(r.key) }))
    };
  }
  get table() {
    const tb = this.withTips(
      brandTable(this.lines, this.f, this.data.windowStart)
    );
    return {
      ...tb,
      rows: tb.rows.map((r) => ({
        ...r,
        id: r.first ? String(r.key).split("|")[0] : null,
        ...(r.first ? this.markOf(String(r.key).split("|")[0]) : {})
      }))
    };
  }

  /* ---------- the slider and the chips ---------- */
  handleView(event) {
    this.view = event.detail.value;
    this.tip = { ...this.tip, on: false };
    if (this.view !== "brand") this.closeFilter();
    this.sendPrefs();
  }
  handleChip(event) {
    const { kind, key } = event.currentTarget.dataset;
    const list = kind === "proc" ? "procs" : "types";
    this.f = { ...this.f, [list]: flip(this.f[list], key) };
    this.sendPrefs();
  }

  /* ---------- the Surgeon and Brand filters ---------- */
  filterCls(kind) {
    return activeCount(this.lines, kind, this.offOf(kind))
      ? "fbtn act"
      : "fbtn";
  }
  filterTitle(kind) {
    const n = activeCount(this.lines, kind, this.offOf(kind));
    const word = kind === "surgeon" ? "surgeon" : "brand";
    return n
      ? `${n} ${word}${n === 1 ? "" : "s"} hidden: press to change`
      : `Filter ${word}s`;
  }
  get surgeonFilterCls() {
    return this.filterCls("surgeon");
  }
  get brandFilterCls() {
    return this.filterCls("brand");
  }
  get surgeonFilterTitle() {
    return this.filterTitle("surgeon");
  }
  get brandFilterTitle() {
    return this.filterTitle("brand");
  }
  offOf(kind) {
    return kind === "surgeon" ? this.f.surgeons : this.f.brands;
  }
  get popItems() {
    return this.pop
      ? filterItems(
          this.lines,
          this.pop.kind,
          this.offOf(this.pop.kind),
          this.pop.query
        )
      : [];
  }
  get popTitle() {
    return this.pop && this.pop.kind === "surgeon" ? "SURGEONS" : "BRANDS";
  }
  get popPlaceholder() {
    return this.pop && this.pop.kind === "surgeon"
      ? "Search surgeons"
      : "Search brands";
  }
  get popCls() {
    return this.pop && this.pop.on ? "fpop on" : "fpop";
  }
  get allLabel() {
    return this.pop && this.pop.query.trim()
      ? "Select all shown"
      : "Select all";
  }
  get allCls() {
    const items = this.popItems;
    const off = items.filter((x) => !x.on).length;
    if (!off) return "fi all";
    return off === items.length ? "fi all off" : "fi all part";
  }
  openFilter(event) {
    const kind = event.currentTarget.dataset.kind;
    if (this.pop && this.pop.kind === kind) {
      this.closeFilter();
      return;
    }
    const wrapEl = this.template.querySelector(".wrap");
    const wrap = wrapEl.getBoundingClientRect();
    const z = this.zoomOf(wrapEl) || 1;
    const b = event.currentTarget.getBoundingClientRect();
    const left = Math.max(
      0,
      Math.min((b.left - wrap.left) / z - 10, wrap.width / z - 316)
    );
    const top = (b.bottom - wrap.top) / z + 8;
    clearTimeout(this._popTimer);
    this.pop = {
      kind,
      query: "",
      on: false,
      style: `left:${left}px;top:${top}px`
    };
    // put the panel on the page first, then switch it on so it unfolds (the motion standard)
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    this._popTimer = setTimeout(() => {
      if (this.pop) this.pop = { ...this.pop, on: true };
    }, 30);
  }
  closeFilter() {
    if (!this.pop) return;
    clearTimeout(this._popTimer);
    this.pop = { ...this.pop, on: false };
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    this._popTimer = setTimeout(() => {
      this.pop = null;
    }, 450);
  }
  handleKey(event) {
    if (event.key === "Escape") this.closeFilter();
  }
  handleSearch(event) {
    this.pop = { ...this.pop, query: event.target.value };
  }
  clearSearch() {
    this.pop = { ...this.pop, query: "" };
    const input = this.template.querySelector(".fin input");
    if (input) {
      input.value = "";
      input.focus();
    }
  }
  setOff(kind, list) {
    this.f = { ...this.f, [kind === "surgeon" ? "surgeons" : "brands"]: list };
  }
  handlePick(event) {
    const kind = this.pop.kind;
    this.setOff(
      kind,
      flip(this.offOf(kind), event.currentTarget.dataset.value)
    );
  }
  handleAll() {
    const kind = this.pop.kind;
    this.setOff(kind, toggleAll(this.offOf(kind), this.popItems));
  }

  /* ---------- tooltips ---------- */
  /**
   * The screen's zoom (Robert, 2026-11-28: tooltips appeared far from the mouse at 80%): the mouse and getBoundingClientRect are in
   * drawn pixels, but left and top are set in the page's own (unzoomed) pixels, so divide by the ratio of the two.
   */
  zoomOf(el) {
    const w = el.getBoundingClientRect().width;
    return el.offsetWidth ? w / el.offsetWidth : 1;
  }
  placeTip(event, words) {
    const box = this.template.querySelector(".wrap");
    const tipEl = this.template.querySelector(".tip");
    const b = box.getBoundingClientRect();
    const z = this.zoomOf(box) || 1;
    const tw = tipEl ? tipEl.offsetWidth : 0;
    const th = tipEl ? tipEl.offsetHeight : 0;
    const x = (event.clientX - b.left) / z;
    const y = (event.clientY - b.top) / z;
    const left = Math.max(4, Math.min(x + 14, b.width / z - tw - 8));
    const top = Math.max(y - th - 10, 4);
    this.tip = {
      on: true,
      style: `left:${left}px;top:${top}px`,
      lines: tipLines(words)
    };
  }
  handleMove(event) {
    const { m, t } = event.currentTarget.dataset;
    const w = tipFor(this.chartTypes, this.data.windowStart, Number(m), t);
    this.placeTip(event, [w.month, w.line, w.total]);
  }
  handleCellMove(event) {
    const text = event.currentTarget.dataset.tip;
    if (!text) return;
    this.placeTip(event, text.split("\n"));
  }
  handleLeave() {
    this.tip = { ...this.tip, on: false };
  }
}
