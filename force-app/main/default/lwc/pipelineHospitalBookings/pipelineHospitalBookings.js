import { LightningElement, api, track } from "lwc";
import getHospitalBookings from "@salesforce/apex/PipelineBookingsController.getHospitalBookings";
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
 * hospital's, for the last 12 whole months. A VIEW slider beside the heading chooses the view:
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
  }
  _saved = null;

  /** Tells the parent what to keep in the person's settings. */
  sendPrefs() {
    this.dispatchEvent(
      new CustomEvent("prefschange", {
        detail: {
          view: this.view,
          types: [...this.f.types],
          procs: [...this.f.procs]
        }
      })
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

  /** A quiet read keeps what is on screen until the new data arrives. */
  load(quiet) {
    const id = this._recordId;
    if (!id) return;
    this.loading = !quiet;
    this.error = "";
    if (!quiet) this.data = undefined;
    getHospitalBookings({ dealId: id })
      .then((d) => {
        if (id === this._recordId) this.data = d;
      })
      .catch((e) => {
        if (id === this._recordId) this.error = errorText(e);
      })
      .finally(() => {
        if (id === this._recordId) this.loading = false;
      });
  }

  get noHospital() {
    return !this.loading && !this.error && !!this.data && !this.data.hospitalId;
  }
  get hasHospital() {
    return !!(this.data && this.data.hospitalId && !this.error);
  }
  get noBookings() {
    return this.hasHospital && !this.data.hasBookings;
  }
  get hasChart() {
    return this.hasHospital && this.data.hasBookings;
  }
  get noBookingsText() {
    return `No MyCase bookings at ${this.data.hospitalName} in the last 12 months.`;
  }
  get hospitalText() {
    return this.data ? "at " + this.data.hospitalName : "";
  }
  get windowLabel() {
    return windowText(this.data.windowStart, this.data.windowEnd);
  }

  /** The lines from Apex, worked out once per read. */
  get lines() {
    if (this._linesOf !== this.data) {
      this._linesOf = this.data;
      this._lines = linesOf(this.data);
    }
    return this._lines;
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
    return this.withTips(
      surgeonGrid(this.lines, this.f, this.data.windowStart)
    );
  }
  get table() {
    return this.withTips(brandTable(this.lines, this.f, this.data.windowStart));
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
    const wrap = this.template.querySelector(".wrap").getBoundingClientRect();
    const b = event.currentTarget.getBoundingClientRect();
    const left = Math.max(
      0,
      Math.min(b.left - wrap.left - 10, wrap.width - 316)
    );
    const top = b.bottom - wrap.top + 8;
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
  placeTip(event, words) {
    const box = this.template.querySelector(".wrap");
    const tipEl = this.template.querySelector(".tip");
    const b = box.getBoundingClientRect();
    const tw = tipEl ? tipEl.offsetWidth : 0;
    const th = tipEl ? tipEl.offsetHeight : 0;
    const left = Math.max(
      4,
      Math.min(event.clientX - b.left + 14, b.width - tw - 8)
    );
    const top = Math.max(event.clientY - b.top - th - 10, 4);
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
