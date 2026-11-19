import { LightningElement, api, track } from "lwc";
import getHospitalBookings from "@salesforce/apex/PipelineBookingsController.getHospitalBookings";
import {
  typesOf,
  totalsOf,
  legendOf,
  chartModel,
  tipFor,
  windowText
} from "c/pipelineHospitalBookingsModel";

function errorText(e) {
  return (
    (e && e.body && e.body.message) ||
    (e && e.message) ||
    "The bookings could not be read."
  );
}

/**
 * Pipeline: the MyCase Bookings screen of a ROSA deal (Robert, 2026-11-19; mockup docs/mockups/pipeline_deal_screens_v1.html). A
 * ROSA deal is at a hospital and has no surgeon, so the bookings are the hospital's: one stacked bar per month for the last 12
 * whole months, split into Hip, Knee, Shoulder and CMFT, with each month's total above its bar, a legend with each type's total,
 * the grand total and the window ("November 2025 to October 2026"). Hovering a part of a bar names the month, the type, its cases
 * and the month's total. The chart is drawn to the box it is given (the component fills whatever space its parent gives it) and
 * is drawn again when the window changes size.
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
  /** The measured size of the chart box, so the chart fills its space. */
  @track size;
  /** The tooltip: shown while the mouse is over a part of a bar. */
  @track tip = { on: false, style: "", month: "", line: "", total: "" };
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
    const box = this.template.querySelector(".box");
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
  get types() {
    return typesOf(this.data);
  }
  get grand() {
    return totalsOf(this.types).grand;
  }
  get legend() {
    return legendOf(this.types);
  }
  get chart() {
    return chartModel(this.types, this.data.windowStart, this.size);
  }

  handleMove(event) {
    const { m, t } = event.currentTarget.dataset;
    const words = tipFor(this.types, this.data.windowStart, Number(m), t);
    const box = this.template.querySelector(".box");
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
      ...words
    };
  }
  handleLeave() {
    this.tip = { ...this.tip, on: false };
  }
}
