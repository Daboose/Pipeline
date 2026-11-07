import { LightningElement, api } from "lwc";
import getBookings from "@salesforce/apex/PipelineBookingsController.getBookings";
import { formatDate } from "c/pipelineFormat";
import { ALL, viewOf, chartModel, rowKey } from "c/pipelineBookingsModel";

const CHART = { w: 330, h: 190 }; // the chart's drawing space; it is scaled to the width of the phone

const errorText = (e) =>
  (e && e.body && e.body.message) ||
  (e && e.message) ||
  "The bookings could not be read.";
const sum = (list) => (list || []).reduce((a, b) => a + b, 0);

/**
 * Pipeline Mobile: the MyCase Bookings screen of one deal on the phone (Robert, 2026-11-07; mockup pipeline_mobile_bookings_v1.html).
 * It slides in over the deal when the MyCase Bookings row is tapped and shows what the desktop panel shows: for each type of surgery the
 * deal's surgeon does (Hip, Knee, Shoulder, CMFT) the cases in the last 12 months, primary and revision, and a bar chart of the surgeries
 * per month (the 12 whole months and this month so far). A type with several hospitals has a dropdown (All hospitals, then each) that
 * redraws the chart. Graphs only; nothing is changed. It reads through PipelineBookingsController.getBookings and draws with the desktop's
 * own chart logic (pipelineBookingsModel). It tells the parent ("summary") how many cases there were, for the deal screen's row, and
 * asks it to slide the screen off ("close").
 */
export default class PipelineMobileBookings extends LightningElement {
  @api dealLabel = "";
  @api open = false;

  _recordId;
  _refreshKey = 0;
  data;
  loading = false;
  error = "";
  selected = {}; // the hospital chosen for each type ("all" until one is picked)

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
  /** A number that goes up when the deal is saved, so the bookings are read again (the Primary HCP may have changed). */
  @api
  get refreshKey() {
    return this._refreshKey;
  }
  set refreshKey(value) {
    if (value === this._refreshKey) return;
    this._refreshKey = value;
    if (this._recordId) this.load(true);
  }

  renderedCallback() {
    this.lockScroll();
  }
  /** A swipe on this page scrolls the page and is stopped at its top and bottom, not passed on to Salesforce's page underneath. */
  lockScroll() {
    const page = this.template.querySelector(".bookingspage");
    if (!page || this.lockedPage === page) return;
    this.lockedPage = page;
    let touchY = 0;
    page.addEventListener(
      "touchstart",
      (e) => {
        touchY = e.touches[0].clientY;
      },
      { passive: true }
    );
    page.addEventListener(
      "touchmove",
      (e) => {
        const dy = e.touches[0].clientY - touchY;
        const atTop = page.scrollTop <= 0;
        const atBottom =
          page.scrollTop + page.clientHeight >= page.scrollHeight - 1;
        if ((atTop && dy > 0) || (atBottom && dy < 0)) e.preventDefault();
      },
      { passive: false }
    );
  }

  /** A quiet read keeps what is on screen until the new numbers arrive. */
  load(quiet) {
    const id = this._recordId;
    if (!id) return;
    this.loading = !quiet;
    this.error = "";
    if (!quiet) this.data = undefined;
    getBookings({ dealId: id })
      .then((d) => {
        if (id !== this._recordId) return;
        this.data = d;
        this.dispatchEvent(
          new CustomEvent("summary", { detail: this.summaryText })
        );
      })
      .catch((e) => {
        if (id === this._recordId) this.error = errorText(e);
      })
      .finally(() => {
        if (id === this._recordId) this.loading = false;
      });
  }

  /** The row on the deal screen: the cases in the last 12 months, all types together ("54 cases in 12 months"). */
  get summaryText() {
    const d = this.data;
    if (!d) return "";
    if (!d.surgeonId) return "No Primary HCP";
    const n = (d.types || []).reduce((a, t) => a + (t.booked || 0), 0);
    if (n === 0) return "No cases in 12 months";
    return `${n} ${n === 1 ? "case" : "cases"} in 12 months`;
  }

  /* ----- the screen ----- */
  get pageCls() {
    return "page bookingspage" + (this.open ? " on" : "");
  }
  handleBack() {
    this.dispatchEvent(new CustomEvent("close"));
  }
  get noSurgeon() {
    return !this.loading && !this.error && !!this.data && !this.data.surgeonId;
  }
  get hasData() {
    return !!(this.data && this.data.surgeonId);
  }
  get noBookings() {
    return this.hasData && (this.data.types || []).length === 0;
  }
  get showCharts() {
    return this.hasData && !this.noBookings;
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
    const cases = (o) => sum(o.primary) + (t.split ? sum(o.revision) : 0);
    return {
      key: t.name,
      name: t.name,
      booked: v.booked,
      primaryTotal: v.primaryTotal,
      revisionTotal: v.revisionTotal,
      split: t.split,
      where: v.where,
      many: v.many,
      options: v.many
        ? [{ value: ALL, label: `All hospitals · ${cases(t)} cases` }]
            .concat(
              (t.rows || []).map((r) => ({
                value: rowKey(r),
                label: `${r.name} · ${cases(r)} cases`
              }))
            )
            .map((o) => ({ ...o, selected: o.value === v.selectedKey }))
        : [],
      chart: chartModel(v.graph, this.data.windowStart, CHART),
      chartLabel: `${t.name} bookings by month`
    };
  }
  handleHospital(event) {
    this.selected = {
      ...this.selected,
      [event.target.dataset.type]: event.target.value
    };
  }
}
