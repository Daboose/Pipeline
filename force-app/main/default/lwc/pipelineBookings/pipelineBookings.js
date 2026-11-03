import { LightningElement, api, track } from "lwc";
import getBookings from "@salesforce/apex/PipelineBookingsController.getBookings";
import saveHospital from "@salesforce/apex/PipelineBookingsController.saveHospital";
import { formatDate } from "c/pipelineFormat";
import {
  chartModel,
  hospitalState,
  needsAttention,
  choicesFor,
  freeCompanies,
  companyKey,
  newDraft,
  pickChoice,
  afterLines,
  changeText,
  blocker,
  opsFor,
  foundParts,
  linesText,
  listText
} from "c/pipelineBookingsModel";

function errorText(e) {
  return (
    (e && e.body && e.body.message) ||
    (e && e.message) ||
    "The bookings could not be read."
  );
}

const rowKeyOf = (sec, row) => `${sec}|${row.id || "none"}`;

/**
 * Pipeline: the My Case Bookings panel in the deal flyout. For each type of surgery the surgeon does (Hip, Knee, Shoulder,
 * CMFT), three columns of the same size every time (Robert, 2026-11-03, mockup pipeline_usage_conflict_v7): a stacked bar
 * graph of the surgeries per month for the last 12 whole months (a third of the width), the list of hospitals (a fifth) and
 * the panel for the hospital that was clicked (the rest). The panel says what was found there (no usage, only a
 * competitor's usage, or a ZB usage out from the bookings) and offers up to three choices: add the ZB usage and / or a
 * competitor's usage, change or delete the competitor, adjust or delete the ZB usage, or leave it. The ZB cases a year start
 * at the suggestion from the bookings and can be changed. Nothing is saved until the person confirms.
 *
 * A surgeon has one usage per hospital, portfolio and company, so ZB and a competitor sit side by side as separate usages.
 * The company choices are read from Salesforce for the person's record type (pipelineUsageChoices), never typed in.
 * Reads the bookings with PipelineBookingsController; saving changes Usage__c in the person's own access (saveHospital) and
 * tells the flyout (usageschanged) so the Usages panel and the button badges read again.
 */
export default class PipelineBookings extends LightningElement {
  _recordId;
  _refreshKey = 0;
  data;
  loading = false;
  error = "";
  errors = [];
  saving = false;
  /** Where the person is in each type: the chosen hospital, their choices for each hospital, and what was saved or left. */
  @track selected = {};
  @track drafts = {};
  @track saved = {};
  @track left = {};
  /** The measured size of each graph, so it fills its third of the screen. */
  @track sizes = {};
  /** The company choices read from Salesforce, by usage record type. */
  @track choicesByRt = {};
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

  /** A number that goes up when usages or the deal change elsewhere, so the bookings are read again. */
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
    this.errors = [];
    this.selected = {};
    this.drafts = {};
    this.saved = {};
    this.left = {};
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
        if (id === this._recordId) {
          this.data = d;
          this.settle(d);
        }
      })
      .catch((e) => {
        if (id === this._recordId) this.error = errorText(e);
      })
      .finally(() => {
        if (id === this._recordId) this.loading = false;
      });
  }

  /** Gives every hospital its starting choices and makes sure each type has a chosen hospital. */
  settle(d) {
    d.types.forEach((t) => {
      (t.rows || []).forEach((row) => {
        const k = rowKeyOf(t.name, row);
        if (!this.drafts[k]) this.drafts[k] = newDraft(row);
      });
      const rows = t.rows || [];
      const cur = this.selected[t.name];
      if (!rows.some((r) => (r.id || "none") === cur) && rows.length) {
        const first =
          rows.find(
            (r) =>
              needsAttention(hospitalState(r)) &&
              !this.left[rowKeyOf(t.name, r)]
          ) || rows[0];
        this.selected[t.name] = first.id || "none";
      }
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

  /* ----- the three columns of each type ----- */

  /** The companies a competitor's usage may be for, as read from Salesforce for this type's record type; null until read. */
  companyList(t) {
    const byKey = t.recordTypeId ? this.choicesByRt[t.recordTypeId] : null;
    return byKey ? byKey[companyKey(t.portfolio)] || [] : null;
  }

  /** The person's choices with the competitor's company filled in (the first free one when none is chosen yet). */
  resolved(t, row, draft) {
    const list = this.companyList(t);
    const free = freeCompanies(list || [], row);
    const name = free.includes(draft.compName) ? draft.compName : free[0] || "";
    return { ...draft, compName: name };
  }

  nextHospital(t) {
    const cur = this.selected[t.name];
    return (t.rows || []).find(
      (r) =>
        (r.id || "none") !== cur &&
        needsAttention(hospitalState(r)) &&
        !this.left[rowKeyOf(t.name, r)]
    );
  }

  get sections() {
    return this.data.types.map((t) => this.section(t));
  }

  section(t) {
    const low = t.name.toLowerCase();
    const rows = t.rows || [];
    const primary = t.primary.reduce((a, b) => a + b, 0);
    const revision = t.split ? t.revision.reduce((a, b) => a + b, 0) : 0;
    const attention = rows.filter(
      (r) => needsAttention(hospitalState(r)) && !this.left[rowKeyOf(t.name, r)]
    ).length;
    const cur = this.selected[t.name];
    const row = rows.find((r) => (r.id || "none") === cur) || rows[0];
    const s = {
      key: t.name,
      name: t.name,
      portfolio: t.portfolio,
      booked: t.booked,
      primaryTotal: primary,
      revisionTotal: revision,
      split: t.split,
      chart: chartModel(t, this.data.windowStart, this.sizes[t.name]),
      chartLabel: `${t.name} bookings by month`,
      recordTypeId: t.recordTypeId,
      isShoulder: !t.canAuto,
      shoulderNote: `Shoulder usages are split into anatomical and reverse, which the bookings do not show, so enter them in the Surgeon Usages. The bookings average ${Math.round((t.booked / 12) * 10) / 10} cases a month (${t.booked} a year).`,
      hasPanel: t.canAuto && rows.length > 0,
      bodyCls: "body " + (t.canAuto && rows.length > 0 ? "many" : "wide"),
      attentionBold: String(attention),
      attentionText:
        attention === 0
          ? "All hospitals dealt with"
          : ` hospital${attention > 1 ? "s" : ""} need${attention > 1 ? "" : "s"} attention`,
      showAttentionNumber: attention > 0,
      list: [],
      panel: null
    };
    if (!s.hasPanel) return s;
    s.list = rows.map((r) => {
      const k = rowKeyOf(t.name, r);
      const state = hospitalState(r);
      const isLeft = !!this.left[k];
      const mark = needsAttention(state) ? (isLeft ? "left" : "todo") : "done";
      return {
        key: k,
        sec: t.name,
        row: r.id || "none",
        name: r.name,
        text: (isLeft ? "Left as it is · " : "") + listText(r.lines),
        cls: "hrow" + ((r.id || "none") === cur ? " on" : ""),
        markCls: "mark " + mark
      };
    });
    s.panel = this.panel(t, row, low);
    return s;
  }

  panel(t, row, low) {
    const sec = t.name;
    const k = rowKeyOf(sec, row);
    const d = this.data;
    const p = {
      sec,
      row: row.id || "none",
      name: row.name,
      bookedText: `${row.booked} ZB ${low} cases booked in the last 12 months`,
      noHospital: !row.id,
      noHospitalText: `${row.booked} ${low} surgeries have no hospital recorded, so a usage cannot be added for them. Record the hospital on the surgeries first.`,
      readOnly: !(d.canCreate && d.canEdit),
      done: false
    };
    const nx = this.nextHospital(t);
    const savedText = this.saved[k];
    if (savedText || this.left[k]) {
      p.done = true;
      p.doneText = savedText
        ? `Saved. This hospital now has ${savedText}.`
        : "Left as it is.";
      p.hasNext = !!nx;
      return p;
    }
    if (p.noHospital) return p;
    const state = hospitalState(row);
    const draft = this.resolved(t, row, this.drafts[k] || newDraft(row));
    p.markCls = "mark " + (needsAttention(state) ? "todo" : "done");
    p.found = foundParts(row, t.name).map((f, i) => ({
      k: "f" + i,
      t: f.t,
      cls: f.b ? "bold" : ""
    }));
    if (p.readOnly) return p;
    const list = this.companyList(t);
    const free = freeCompanies(list || [], row);
    const comps = (row.lines || []).filter((l) => l.company !== "ZB");
    const tgt = comps[draft.compIndex] || comps[0];
    p.choices = choicesFor(state, d.canDelete).map((c) => {
      const on = c.key === draft.choice;
      const o = {
        key: c.key,
        title: c.title,
        desc: c.desc,
        on,
        cls: "rad" + (on ? " on" : ""),
        showZb: on && !!c.zb,
        showComp: on && !!c.comp && !!tgt,
        showAdd: on && !!c.addComp
      };
      if (o.showZb) {
        o.zbToggle = !!c.zbToggle;
        o.zbYesCls = "seg" + (draft.addZb ? " on" : "");
        o.zbNoCls = "seg" + (!draft.addZb ? " on" : "");
        o.showZbBox = !c.zbToggle || draft.addZb;
        o.zbValue = draft.zb;
        o.zbSuggest = `suggested: ${row.booked}`;
      }
      if (o.showComp) {
        o.compMany = comps.length > 1;
        o.compOptions = comps.map((l, i) => ({
          value: String(i),
          label: l.company || "No company",
          selected: i === (draft.compIndex || 0)
        }));
        o.compName = tgt.company || "No company";
        o.compSegs = c.comp.map((x) => ({
          s: x[0],
          label: x[1],
          cls: "seg" + (draft.sub === x[0] ? " on" : "")
        }));
        o.showCompNum = draft.sub === "change";
        o.compValue = draft.cases;
      }
      if (o.showAdd) {
        o.addNoCls = "seg" + (!draft.addComp ? " on" : "");
        o.addYesCls = "seg" + (draft.addComp ? " on" : "");
        o.showAddFields = draft.addComp;
        o.loadingCompanies = list === null;
        o.noCompanies = list !== null && free.length === 0;
        o.addOptions = free.map((c2) => ({
          value: c2,
          selected: c2 === draft.compName
        }));
        o.addValue = draft.compCases;
      }
      return o;
    });
    p.now = linesText(row.lines);
    p.after = linesText(afterLines(row, draft));
    const leave = draft.choice === "leave";
    const why = leave ? "" : blocker(row, draft);
    p.confirm = draft.mode === "confirm";
    p.confirmText = (changeText(row, draft) || "") + "?";
    p.reviewAct = leave ? "skip" : "review";
    p.reviewLabel = leave ? "Leave and move on" : "Review change";
    p.disabled = !!why || this.saving;
    p.note = leave
      ? "No change will be made at this hospital."
      : why || "Nothing is saved until you confirm.";
    p.saving = this.saving;
    return p;
  }

  /* ----- what the person does ----- */
  ds(event) {
    const { sec, row } = event.currentTarget.dataset;
    const t = this.data.types.find((x) => x.name === sec);
    const r = (t.rows || []).find((x) => (x.id || "none") === row);
    return { t, r, k: rowKeyOf(sec, r), sec };
  }
  focusLater(selector) {
    Promise.resolve().then(() => {
      const el = this.template.querySelector(selector);
      if (el) {
        el.focus();
        if (el.select) el.select();
      }
    });
  }

  handleHospital(event) {
    const { sec, row } = event.currentTarget.dataset;
    const prev = this.selected[sec];
    if (prev === row) return;
    // leaving a hospital that was just saved: look at the real state when coming back
    const t = this.data.types.find((x) => x.name === sec);
    const pr = (t.rows || []).find((x) => (x.id || "none") === prev);
    if (pr) delete this.saved[rowKeyOf(sec, pr)];
    this.selected[sec] = row;
  }
  handleChoice(event) {
    if (event.target.closest(".seg, .num, .sel")) return;
    const { k } = this.ds(event);
    const d = this.drafts[k];
    if (d.choice === event.currentTarget.dataset.c) return;
    pickChoice(d, event.currentTarget.dataset.c);
    this.focusLater(".rad.on input.num");
  }
  handleSeg(event) {
    event.stopPropagation();
    const { t, r, k } = this.ds(event);
    const d = this.drafts[k];
    const g = event.currentTarget.dataset.g;
    const v = event.currentTarget.dataset.s;
    if (g === "zbon") d.addZb = v === "yes";
    else if (g === "compon") {
      d.addComp = v === "yes";
      d.compName = this.resolved(t, r, d).compName;
    } else d.sub = v;
    d.mode = "edit";
    this.focusLater(
      g === "zbon"
        ? '.rad.on input[data-f="zb"]'
        : g === "compon"
          ? '.rad.on input[data-f="compCases"]'
          : '.rad.on input[data-f="cases"]'
    );
  }
  handleInput(event) {
    const { k } = this.ds(event);
    const v = event.target.value;
    this.drafts[k][event.currentTarget.dataset.f] =
      v === "" ? "" : Math.max(0, Number(v));
    this.drafts[k].mode = "edit";
  }
  handleSelect(event) {
    const { k } = this.ds(event);
    const f = event.currentTarget.dataset.f;
    const v = event.target.value;
    if (f === "compIndex") this.drafts[k].compIndex = Number(v);
    else this.drafts[k].compName = v;
  }
  handleAct(event) {
    const { t, r, k, sec } = this.ds(event);
    const act = event.currentTarget.dataset.act;
    const d = this.drafts[k];
    if (act === "review") d.mode = "confirm";
    else if (act === "back") d.mode = "edit";
    else if (act === "skip") this.left[k] = true;
    else if (act === "again") {
      delete this.saved[k];
      delete this.left[k];
      this.drafts[k] = newDraft(r);
    } else if (act === "next") {
      const nx = this.nextHospital(t);
      if (nx) this.selected[sec] = nx.id || "none";
    } else if (act === "yes") this.save(t, r, k);
  }

  save(t, row, k) {
    const rd = this.resolved(t, row, this.drafts[k]);
    const ops = opsFor(row, rd);
    if (!ops.length) {
      this.drafts[k].mode = "edit";
      return;
    }
    const afterText = linesText(afterLines(row, rd));
    this.saving = true;
    this.errors = [];
    saveHospital({
      dealId: this._recordId,
      portfolio: t.portfolio,
      hospitalId: row.id,
      opsJson: JSON.stringify(ops)
    })
      .then(() => {
        this.saved[k] = afterText;
        delete this.drafts[k];
        this.load(true);
        this.dispatchEvent(new CustomEvent("usageschanged"));
      })
      .catch((e) => {
        this.errors = [errorText(e)];
        this.drafts[k].mode = "edit";
      })
      .finally(() => {
        this.saving = false;
      });
  }

  handleChoices(event) {
    const { recordTypeId, byKey } = event.detail;
    this.choicesByRt[recordTypeId] = byKey;
  }
  handleOpenUsages() {
    this.dispatchEvent(new CustomEvent("openusages"));
  }
}
