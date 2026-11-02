import { LightningElement, api } from "lwc";
import getBookings from "@salesforce/apex/PipelineBookingsController.getBookings";
import createFromBookings from "@salesforce/apex/PipelineBookingsController.createFromBookings";
import adjustToBookings from "@salesforce/apex/PipelineBookingsController.adjustToBookings";
import { formatDate, plural } from "c/pipelineFormat";
import { usageCheck, chartModel } from "c/pipelineBookingsModel";

function errorText(e) {
  return (
    (e && e.body && e.body.message) ||
    (e && e.message) ||
    "The bookings could not be read."
  );
}

/**
 * Pipeline: the My Case Bookings panel in the deal flyout. For each type of surgery the surgeon does (Hip, Knee, Shoulder,
 * CMFT), a stacked bar graph of the surgeries per month for the last 12 whole months (plus this month so far), split into
 * primary and revision (CMFT is never split), with the 12-month total, side by side. Beside each graph a check against the
 * surgeon's ZB usages: within 10% of the bookings is accurate; further out, or no usages at all, comes with a suggestion
 * (an average of X cases a month, per hospital) and a button that creates or adjusts the usages for the person.
 * Reads the bookings with PipelineBookingsController; creating or adjusting changes Usage__c in the person's own access and
 * tells the flyout (usageschanged) so the Usages panel and the button badges read again.
 */
export default class PipelineBookings extends LightningElement {
  _recordId;
  _refreshKey = 0;
  data;
  loading = false;
  error = "";
  errors = [];
  flash = "";
  saving = false;

  /** A number that goes up when usages or the deal change elsewhere, so the usages check is read again. */
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
    this.flash = "";
    this.errors = [];
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
  get hasErrors() {
    return this.errors.length > 0;
  }
  get missingAll() {
    return !!(
      this.hasData &&
      this.data.noUsagesAtAll &&
      this.data.types.length &&
      this.data.types.every((t) => t.usage === "none")
    );
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
  get anyUsageLine() {
    return this.data.types.some((t) => t.usage === "zb" && t.zb > 0);
  }

  hospitalsText(t) {
    const shown = t.hospitals
      .slice(0, 5)
      .map((h) => `${h.name}: ${h.count} a year`)
      .join(" · ");
    return t.hospitals.length > 5
      ? `${shown} · and ${t.hospitals.length - 5} more`
      : shown;
  }

  get cards() {
    return this.data.types.map((t) => {
      const check = usageCheck(t);
      const low = t.name.toLowerCase();
      const primary = t.primary.reduce((a, b) => a + b, 0);
      const revision = t.split ? t.revision.reduce((a, b) => a + b, 0) : 0;
      const card = {
        key: t.name,
        name: t.name,
        portfolio: t.portfolio,
        booked: t.booked,
        primaryTotal: primary,
        revisionTotal: revision,
        split: t.split,
        chart: chartModel(t, this.data.windowStart),
        chartLabel: `${t.name} bookings by month`,
        hospitals: this.hospitalsText(t),
        isMissing: check.kind === "missing",
        isAdjust: check.kind === "adjust",
        isCompetitor: check.kind === "competitor",
        isGood: check.kind === "good",
        canCreate: this.data.canCreate && t.canAuto,
        canEdit: this.data.canEdit && t.canAuto,
        notAuto: !t.canAuto
      };
      if (check.kind === "good") {
        card.cueMark = "Usages look accurate";
        card.cueText = `The usages say ${t.zb} ZB ${low} cases a year; ${t.booked} were booked. That is within 10%.`;
      } else if (check.kind === "adjust") {
        card.cueMark = `Usages look ${check.direction}: adjust them`;
        card.cueText =
          check.pct === null
            ? `The usages say no ZB ${low} cases a year, but ${t.booked} were booked.`
            : `The usages say ${t.zb} ZB ${low} cases a year, but ${t.booked} were booked, ${check.pct}% ${check.direction === "low" ? "more" : "fewer"}. More than 10% out should be adjusted.`;
        card.suggest = `adjust the usages to the last 12 months of bookings, an average of ${check.per} cases a month (${t.booked} a year; the usages say ${t.zb}).`;
      } else if (check.kind === "competitor") {
        card.cueMark = `Usages list no ZB ${low}`;
        card.cueText = `The usages list no ZB ${low} cases, but ${t.booked} were booked with ZB items (about ${check.per} a month). Check the usages.`;
      } else {
        card.pill = `Usages are missing for ${low}. Please create them now.`;
        card.suggest = t.canAuto
          ? `create the usages from the last 12 months of bookings, an average of ${check.per} cases a month (${t.booked} a year).${t.portfolio === "Hip" ? " Stems and cups each get the same number." : ""}`
          : `the bookings average ${check.per} cases a month (${t.booked} a year), but shoulder usages are split into anatomical and reverse, which the bookings do not show, so enter them in the Surgeon Usages.`;
      }
      card.showSuggest = !!card.suggest;
      card.cueCls =
        "cue " + this.cueClass(check) + (card.showSuggest ? " joined" : "");
      card.showCreate = card.isMissing && card.canCreate;
      card.showAdjust = card.isAdjust && card.canEdit;
      card.showOpen = card.isAdjust || (card.isMissing && card.notAuto);
      card.cueOpen = card.isCompetitor;
      return card;
    });
  }
  cueClass(check) {
    if (check.kind === "good") return "good";
    if (check.kind === "missing") return "missing";
    return check.direction === "high" ? "high" : "low";
  }

  get subtitleCount() {
    return plural(this.data.types.length, "type");
  }

  /* ----- creating or adjusting the usages ----- */
  handleCreate(event) {
    this.run(
      createFromBookings,
      event.currentTarget.dataset.portfolio,
      event.currentTarget.dataset.name,
      false
    );
  }
  handleAdjust(event) {
    this.run(
      adjustToBookings,
      event.currentTarget.dataset.portfolio,
      event.currentTarget.dataset.name,
      true
    );
  }
  run(apex, portfolio, name, adjusting) {
    const low = name.toLowerCase();
    this.saving = true;
    this.errors = [];
    this.flash = "";
    apex({ dealId: this._recordId, portfolio })
      .then((r) => {
        const records = r.created + r.updated;
        this.flash = adjusting
          ? `Adjusted the ${low} usages to ${r.total} ZB cases a year (${records} usage ${plural(records, "record")} changed). The usage line now matches the bookings.`
          : `Created ${r.created} ${low} ${plural(r.created, "usage")}, ${r.total} ZB cases a year in all. The graph now shows the usage line.`;
        if (r.skipped)
          this.flash += ` ${r.skipped} ${plural(r.skipped, "line")} listing a competitor ${r.skipped === 1 ? "was" : "were"} left alone.`;
        this.load(true);
        this.dispatchEvent(new CustomEvent("usageschanged"));
      })
      .catch((e) => {
        this.errors = [errorText(e)];
      })
      .finally(() => {
        this.saving = false;
      });
  }
  handleOpenUsages() {
    this.dispatchEvent(new CustomEvent("openusages"));
  }
}
