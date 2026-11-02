import { LightningElement, api } from "lwc";
import getSurgeries from "@salesforce/apex/PipelineSurgeonController.getSurgeries";

function errorText(e) {
  return (
    (e && e.body && e.body.message) ||
    (e && e.message) ||
    "The surgeries could not be counted."
  );
}

/**
 * Pipeline: the surgeon's surgeries card in the deal flyout: how many surgeries in the last 12 months, by type, as bars.
 * A surgery counts only when it is in the past and has at least one usage item on one of its usage sheets, the manual
 * sheet included (so a cancelled case, which has no items, drops out). Surgery records exist for Australia only.
 * Reads only; changes nothing.
 */
export default class PipelineSurgeries extends LightningElement {
  _recordId;
  _refreshKey = 0;
  @api country = "";
  @api bare = false; // inside the Case Bookings panel: no card, no heading

  data;
  loading = false;
  error = "";

  /** A number that goes up when the deal is saved, so what is shown is read again (a new Primary HCP has other usages). */
  @api
  get refreshKey() {
    return this._refreshKey;
  }
  set refreshKey(value) {
    if (value !== this._refreshKey) {
      this._refreshKey = value;
      if (this._recordId) this.load();
    }
  }

  @api
  get recordId() {
    return this._recordId;
  }
  set recordId(value) {
    if (value === this._recordId) return;
    this._recordId = value;
    this.load();
  }

  load() {
    const id = this._recordId;
    if (!id) return;
    this.loading = true;
    this.error = "";
    this.data = undefined;
    getSurgeries({ dealId: id })
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

  get cardCls() {
    return this.bare ? "card bare" : "card";
  }
  get showHead() {
    return !this.bare;
  }
  get heading() {
    return "Surgeries, last 12 months, by type";
  }
  get noSurgeon() {
    return !this.loading && !this.error && this.data && !this.data.surgeonId;
  }
  get hasData() {
    return !this.loading && !!(this.data && this.data.surgeonId);
  }
  get rows() {
    const list = (this.data && this.data.byType) || [];
    const max = Math.max(1, ...list.map((r) => r.count));
    return list.map((r) => ({
      type: r.type,
      count: r.count,
      style: `width:${(100 * r.count) / max}%`
    }));
  }
  get note() {
    return this.country && this.country !== "AU"
      ? "Surgery records are held for Australia only, so other countries show no surgeries."
      : "From the surgery records (Australia). Past surgeries that have usage items recorded (an uploaded sheet or the manual sheet) only.";
  }
}
