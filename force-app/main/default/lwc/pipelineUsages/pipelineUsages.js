import { LightningElement, api } from "lwc";
import getUsages from "@salesforce/apex/PipelineSurgeonController.getUsages";
import { formatDate } from "c/pipelineFormat";

const RANK = { PLATINUM: 0, GOLD: 1, SILVER: 2, BRONZE: 3 };
/** A usage list that was last changed this long ago (in years) gets the out-of-date warning. */
const OLD_YEARS = 2;
const YEAR_MS = 365.25 * 86400000;

function errorText(e) {
  return (
    (e && e.body && e.body.message) ||
    (e && e.message) ||
    "The usages could not be read."
  );
}

/**
 * Pipeline: the surgeon's usages card in the deal flyout. The four area ratings (the deal's own area outlined), when the
 * usages were last changed with a warning when they look old, and, when opened, the usages grouped by hospital: each
 * portfolio with its company (ZB is Zimmer Biomet) and cases per year; a hip shows stems and cups, a shoulder shows
 * anatomical and reverse. Reads only; changes nothing.
 */
export default class PipelineUsages extends LightningElement {
  _recordId;
  _refreshKey = 0;
  @api area = ""; // Hip, Knee, Shoulder or CMF: the deal's own area
  @api ownerName = "";
  @api canAsk = false; // a manager looking at someone else's deal may ask them to check
  @api isRep = false;

  data;
  loading = false;
  error = "";
  open = true;

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
    getUsages({ dealId: id })
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

  get heading() {
    const n = this.data && this.data.surgeonName;
    return n ? `${n}: usages` : "Usages";
  }
  get noSurgeon() {
    return !this.loading && !this.error && this.data && !this.data.surgeonId;
  }
  get hasData() {
    return !this.loading && !!(this.data && this.data.surgeonId);
  }
  get chevClass() {
    return this.open ? "chev up" : "chev";
  }
  get toggleTitle() {
    return this.open ? "Collapse" : "Expand";
  }
  handleToggle() {
    this.open = !this.open;
  }

  get ratings() {
    return ((this.data && this.data.ratings) || []).map((r) => {
      const rank = RANK[(r.rating || "").toUpperCase()];
      return {
        area: r.area,
        text: r.rating || "–",
        cls:
          "rate" +
          (r.area === this.area ? " mine" : "") +
          (rank !== undefined ? " r" + rank : "")
      };
    });
  }

  get yearsOld() {
    const d = this.data && this.data.newest;
    return d ? (Date.now() - Date.parse(d)) / YEAR_MS : null;
  }
  get isOld() {
    return this.yearsOld !== null && this.yearsOld >= OLD_YEARS;
  }
  get warnCls() {
    return "warn" + (this.isOld ? " w" : "");
  }
  get updatedText() {
    const d = this.data && this.data.newest;
    if (!d) return "No usages have been recorded for this surgeon.";
    const days = Math.floor((Date.now() - Date.parse(d)) / 86400000);
    const when = formatDate(d);
    if (this.isOld) {
      const yrs = Math.floor(this.yearsOld);
      return `Usages last updated ${yrs} ${yrs === 1 ? "year" : "years"} ago (${when}).${
        this.area ? ` The ${this.area} rating may be out of date.` : ""
      }`;
    }
    if (days < 60)
      return `Usages updated ${days} ${days === 1 ? "day" : "days"} ago (${when}).`;
    const months = Math.round(days / 30.4);
    return `Usages updated ${months} months ago (${when}).`;
  }
  get ownerFirst() {
    return (this.ownerName || "").split(" ")[0];
  }
  get showAsk() {
    return this.isOld && this.canAsk;
  }
  get showRepNote() {
    return this.isOld && this.isRep;
  }
  handleAsk() {
    this.dispatchEvent(new CustomEvent("askcheck"));
  }

  get noLines() {
    return !(this.data && this.data.lines && this.data.lines.length);
  }
  /** The lines grouped by hospital, each portfolio with a heading row when it has two lines (hip, shoulder). */
  get groups() {
    const byHosp = new Map();
    ((this.data && this.data.lines) || []).forEach((l) => {
      const h = l.hospital || "No hospital recorded";
      if (!byHosp.has(h)) byHosp.set(h, new Map());
      const ports = byHosp.get(h);
      if (!ports.has(l.portfolio)) ports.set(l.portfolio, []);
      ports.get(l.portfolio).push(l);
    });
    return [...byHosp.entries()].map(([hospital, ports]) => {
      const rows = [];
      [...ports.entries()].forEach(([portfolio, lines]) => {
        const mine = portfolio === this.area ? " mine" : "";
        const cell = (l) => ({
          company: l.company || "–",
          companyCls: l.company === "ZB" ? "zb" : "",
          cases: l.cases === null || l.cases === undefined ? "–" : l.cases
        });
        /* hip and shoulder always show as a heading with their lines under it; knee and CMF are one plain line */
        const tree = portfolio === "Hip" || portfolio === "Shoulder";
        if (!tree) {
          lines.forEach((l) =>
            rows.push({
              key: hospital + portfolio + l.label,
              cls: mine.trim(),
              label: l.label,
              labelCls: "",
              ...cell(l)
            })
          );
          return;
        }
        rows.push({
          key: hospital + portfolio,
          cls: ("up" + mine).trim(),
          label: portfolio,
          labelCls: "",
          company: "",
          companyCls: "",
          cases: ""
        });
        lines.forEach((l) =>
          rows.push({
            key: hospital + portfolio + l.label,
            cls: mine.trim(),
            label: l.label,
            labelCls: "sub",
            ...cell(l)
          })
        );
      });
      return { hospital, rows };
    });
  }
}
