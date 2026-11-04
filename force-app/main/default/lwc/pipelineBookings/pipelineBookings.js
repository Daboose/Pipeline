import { LightningElement, api, track } from "lwc";
import getBookings from "@salesforce/apex/PipelineBookingsController.getBookings";
import { formatDate } from "c/pipelineFormat";
import { chartModel, viewOf, hospitalList } from "c/pipelineBookingsModel";

function errorText(e) {
  return (
    (e && e.body && e.body.message) ||
    (e && e.message) ||
    "The bookings could not be read."
  );
}

/**
 * Pipeline: the My Case Bookings panel in the deal flyout. Graphs only (Robert, 2026-11-04, mockup
 * pipeline_case_bookings_simple_v2): for each type of surgery the surgeon does (Hip, Knee, Shoulder, CMFT), a stacked bar
 * graph of the surgeries per month for the last 12 whole months and this month so far, primary and revision. A type
 * with one hospital has no list: the graph takes the whole width and the heading line names the hospital. A type with more
 * than one has a list on the left with All hospitals on top (the default); clicking a hospital redraws the graph with only
 * its cases and clicking All goes back. It shows whether a surgeon is booking cases, which shows a deal is moving.
 *
 * The comparison with the surgeon's usages and the changes it offered were taken out and are kept in git (tag
 * usage-reconciliation-v0.54) for a future Usage Management component. Reads the bookings with PipelineBookingsController
 * and changes nothing.
 */
export default class PipelineBookings extends LightningElement {
  _recordId;
  _refreshKey = 0;
  data;
  loading = false;
  error = "";
  /** The chosen hospital of each type ("all" until one is clicked). */
  @track selected = {};
  /** The measured size of each graph, so it fills its space. */
  @track sizes = {};
  _onResize;

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
    const boxes = this.template.querySelectorAll(".cb");
    boxes.forEach((b) => {
      const w = Math.round(b.clientWidth);
      const h = Math.round(b.clientHeight);
      const cur = this.sizes[b.dataset.sec];
      if (w > 0 && h > 0 && (!cur || cur.w !== w || cur.h !== h)) {
        this.sizes[b.dataset.sec] = { w, h };
      }
    });
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

  @api
  get recordId() {
    return this._recordId;
  }
  set recordId(value) {
    if (value === this._recordId) return;
    this._recordId = value;
    this.selected = {};
    this.load(false);
  }

  /** A quiet read keeps what is on screen until the new data arrives. */
  load(quiet) {
    const id = this._recordId;
    if (!id) return;
    this.loading = !quiet;
    this.error = "";
    if (!quiet) this.data = undefined;
    getBookings({ dealId: id })
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

  get noSurgeon() {
    return !this.loading && !this.error && this.data && !this.data.surgeonId;
  }
  get hasData() {
    return !!(this.data && this.data.surgeonId);
  }
  get noBookings() {
    return this.hasData && this.data.types.length === 0;
  }
  get windowText() {
    const start = this.data.windowStart;
    const thisMonth = this.data.today.slice(0, 8) + "01";
    const last = new Date(thisMonth + "T00:00:00");
    last.setDate(0);
    const end = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
    return `Surgeries from ${formatDate(start)} to ${formatDate(end)} (12 whole months), and this month so far.`;
  }
  get anySplit() {
    return this.data.types.some((t) => t.split);
  }
  get anyCmft() {
    return this.data.types.some((t) => !t.split);
  }

  get sections() {
    return this.data.types.map((t) => this.section(t));
  }

  section(t) {
    const v = viewOf(t, this.selected[t.name]);
    return {
      key: t.name,
      name: t.name,
      booked: v.booked,
      primaryTotal: v.primaryTotal,
      revisionTotal: v.revisionTotal,
      split: t.split,
      where: v.where,
      many: v.many,
      hospitalCount: (t.rows || []).length,
      list: v.many ? hospitalList(t, v.selectedKey) : [],
      bodyCls: "body " + (v.many ? "two" : "one"),
      chart: chartModel(v.graph, this.data.windowStart, this.sizes[t.name]),
      chartLabel: `${t.name} bookings by month`
    };
  }

  handleHospital(event) {
    const { sec, key } = event.currentTarget.dataset;
    this.selected[sec] = key;
  }
}
