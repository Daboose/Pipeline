import { LightningElement, api } from "lwc";
import getUsages from "@salesforce/apex/PipelineSurgeonController.getUsages";
import saveUsage from "@salesforce/apex/PipelineUsageController.saveUsage";
import deleteUsage from "@salesforce/apex/PipelineUsageController.deleteUsage";
import addUsage from "@salesforce/apex/PipelineUsageController.addUsage";
import { formatDate } from "c/pipelineFormat";

const RANK = { PLATINUM: 0, GOLD: 1, SILVER: 2, BRONZE: 3 };
/** A usage list that was last changed this long ago (in years) gets the out-of-date warning. */
const OLD_YEARS = 2;
const YEAR_MS = 365.25 * 86400000;
/** The product lines of each portfolio, in order: [line key, label]. A hip usage holds stems and cups, a shoulder anatomical and reverse. */
const PORT_LINES = {
  Hip: [
    ["stems", "Stems"],
    ["cups", "Cups"]
  ],
  Knee: [["knee", "Knee"]],
  Shoulder: [
    ["anatomical", "Anatomical"],
    ["reverse", "Reverse"]
  ],
  CMF: [["cmft", "CMFT"]]
};

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
 * anatomical and reverse. For people who may change usages (Salesforce decides), a usage can be edited (company and cases
 * per line), deleted, or added for a hospital found by search; the record type of a new usage is chosen by the server from
 * the person's country and the portfolio. A surgeon never gets two usages for the same hospital and portfolio: adding one
 * that exists opens the existing one for editing. The company choices are read from Salesforce for each record type.
 */
export default class PipelineUsages extends LightningElement {
  _recordId;
  _refreshKey = 0;
  @api area = ""; // Hip, Knee, Shoulder or CMF: the deal's own area
  @api ownerName = "";
  @api canAsk = false; // a manager looking at someone else's deal may ask them to check
  @api isRep = false;
  @api bare = false; // inside the Usages panel: no card, no heading, always open

  data;
  loading = false;
  error = "";
  open = true;

  editing = false;
  draft = {}; // edited lines, by "usage id|line key": { company, cases }
  choices = {}; // company choices by record type id, then line key
  delTarget = null; // the usage waiting for a delete confirmation: { usageId, text }
  saving = false;
  errors = [];
  msg = "";
  adding = false;
  addHospital = null; // { id, name }
  addPortfolio = "";
  addDraft = {}; // by line key: { company, cases }

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
    this.resetEditing();
    this.load();
  }

  /** Reads the usages. A quiet read (after a change) keeps what is on screen until the new data arrives. */
  load(quiet) {
    const id = this._recordId;
    if (!id) return;
    this.loading = !quiet;
    this.error = "";
    if (!quiet) this.data = undefined;
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

  get cardCls() {
    return this.bare ? "card bare" : "card";
  }
  get showHead() {
    return !this.bare;
  }
  get showBody() {
    return this.bare || this.open;
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

  /* ----- what the person may do ----- */
  get canEdit() {
    return !!(this.data && this.data.canEdit);
  }
  get canDelete() {
    return !!(this.data && this.data.canDelete);
  }
  get addable() {
    return (this.data && this.data.addable) || [];
  }
  get canAdd() {
    return !!(this.data && this.data.canCreate && this.addable.length);
  }
  get showTools() {
    return this.hasData && (this.canEdit || this.canAdd);
  }
  get showEditButton() {
    return this.canEdit && !this.editing && !this.noLines;
  }
  get showAddButton() {
    return this.canAdd && !this.editing && !this.adding;
  }
  get colspan() {
    return this.editing ? 4 : 3;
  }
  get hasErrors() {
    return this.errors.length > 0;
  }
  get dirty() {
    return Object.keys(this.draft).length > 0;
  }
  get cantSave() {
    return !this.dirty || this.saving;
  }

  resetEditing() {
    this.editing = false;
    this.draft = {};
    this.delTarget = null;
    this.errors = [];
    this.msg = "";
    this.adding = false;
    this.addHospital = null;
    this.addDraft = {};
  }

  /** The record types whose company choices are needed now: those of the lines being edited, or of the portfolio being added. */
  get neededRts() {
    const ids = new Set();
    if (this.editing) {
      ((this.data && this.data.lines) || []).forEach((l) => {
        if (l.recordTypeId) ids.add(l.recordTypeId);
      });
    }
    const add = this.addRecordTypeId;
    if (this.adding && add) ids.add(add);
    return [...ids].map((id) => ({ id }));
  }
  handleChoices(event) {
    const { recordTypeId, byKey } = event.detail;
    this.choices = { ...this.choices, [recordTypeId]: byKey };
  }
  /** The options of a company list: a dash for none, the record type's own choices, and the current value if it is not among them. */
  companyOptions(recordTypeId, key, current) {
    const list = ((this.choices[recordTypeId] || {})[key] || []).slice();
    if (current && !list.includes(current)) list.unshift(current);
    return [{ value: "", label: "–", selected: !current }].concat(
      list.map((v) => ({ value: v, label: v, selected: v === current }))
    );
  }

  /* ----- editing the lines ----- */
  handleEdit() {
    this.resetEditing();
    this.editing = true;
  }
  handleCancelEdit() {
    this.resetEditing();
  }
  setDraft(event, patch) {
    const { usage, key } = event.target.dataset;
    const id = usage + "|" + key;
    this.draft = { ...this.draft, [id]: { ...this.draft[id], ...patch } };
    this.errors = [];
    this.msg = "";
  }
  handleCompany(event) {
    this.setDraft(event, { company: event.target.value });
  }
  handleCases(event) {
    const v = event.target.value;
    this.setDraft(event, { cases: v === "" ? null : Number(v) });
  }
  handleSave() {
    const byUsage = {};
    Object.entries(this.draft).forEach(([id, d]) => {
      const [usageId, key] = id.split("|");
      const cur = this.data.lines.find(
        (l) => l.usageId === usageId && l.key === key
      );
      (byUsage[usageId] = byUsage[usageId] || []).push({
        key,
        company: "company" in d ? d.company : cur && cur.company,
        cases: "cases" in d ? d.cases : cur && cur.cases
      });
    });
    this.saving = true;
    this.errors = [];
    Promise.all(
      Object.entries(byUsage).map(([usageId, lines]) =>
        saveUsage({ usageId, linesJson: JSON.stringify(lines) })
      )
    )
      .then(() => {
        this.editing = false;
        this.draft = {};
        this.msg = "Saved.";
        this.load(true);
      })
      .catch((e) => {
        this.errors = [errorText(e)];
      })
      .finally(() => {
        this.saving = false;
      });
  }

  /* ----- deleting a usage ----- */
  handleDelete(event) {
    const { usage, text } = event.currentTarget.dataset;
    this.delTarget = { usageId: usage, text };
  }
  handleDeleteNo() {
    this.delTarget = null;
  }
  handleDeleteYes() {
    const { usageId } = this.delTarget;
    this.saving = true;
    this.errors = [];
    deleteUsage({ usageId })
      .then(() => {
        this.delTarget = null;
        this.draft = {};
        this.msg = "Deleted.";
        this.load(true);
      })
      .catch((e) => {
        this.errors = [errorText(e)];
      })
      .finally(() => {
        this.saving = false;
      });
  }
  get deleteText() {
    return this.delTarget
      ? `Delete ${this.delTarget.text}? This cannot be undone.`
      : "";
  }

  /* ----- adding a usage ----- */
  handleAdd() {
    this.resetEditing();
    this.adding = true;
    this.addPortfolio = this.addable[0].portfolio;
  }
  handleAddCancel() {
    this.resetEditing();
  }
  handleHospital(event) {
    const { id, name } = event.detail;
    this.addHospital = id ? { id, name } : null;
  }
  handleAddPortfolio(event) {
    this.addPortfolio = event.target.value;
    this.addDraft = {};
  }
  handleAddCompany(event) {
    const key = event.target.dataset.key;
    this.addDraft = {
      ...this.addDraft,
      [key]: { ...this.addDraft[key], company: event.target.value }
    };
  }
  handleAddCases(event) {
    const key = event.target.dataset.key;
    const v = event.target.value;
    this.addDraft = {
      ...this.addDraft,
      [key]: { ...this.addDraft[key], cases: v === "" ? null : Number(v) }
    };
  }
  get portfolioChoices() {
    return this.addable.map((o) => ({
      value: o.portfolio,
      label: o.portfolio === "CMF" ? "CMFT" : o.portfolio,
      selected: o.portfolio === this.addPortfolio
    }));
  }
  get addOption() {
    return this.addable.find((o) => o.portfolio === this.addPortfolio);
  }
  get addRecordTypeId() {
    return this.addOption ? this.addOption.recordTypeId : "";
  }
  get addRecordTypeText() {
    return this.addOption
      ? `Saved as record type ${this.addOption.recordType}, chosen from your country and the portfolio.`
      : "";
  }
  get hospitalId() {
    return this.addHospital ? this.addHospital.id : "";
  }
  get hospitalName() {
    return this.addHospital ? this.addHospital.name : "";
  }
  get addLines() {
    return (PORT_LINES[this.addPortfolio] || []).map(([key, label]) => {
      const d = this.addDraft[key] || {};
      return {
        key,
        label,
        options: this.companyOptions(this.addRecordTypeId, key, d.company),
        cases: d.cases === null || d.cases === undefined ? "" : d.cases
      };
    });
  }
  get cantAdd() {
    return !this.addHospital || this.saving;
  }
  handleAddSave() {
    const lines = (PORT_LINES[this.addPortfolio] || []).map(([key]) => {
      const d = this.addDraft[key] || {};
      return { key, company: d.company || null, cases: d.cases ?? null };
    });
    const portfolio = this.addPortfolio;
    const hospital = this.addHospital.name;
    this.saving = true;
    this.errors = [];
    addUsage({
      dealId: this._recordId,
      hospitalId: this.addHospital.id,
      portfolio,
      linesJson: JSON.stringify(lines)
    })
      .then((res) => {
        this.adding = false;
        this.addHospital = null;
        this.addDraft = {};
        if (res.existing) {
          this.editing = true;
          this.draft = {};
          this.msg = `This surgeon already has a ${portfolio === "CMF" ? "CMFT" : portfolio} usage at ${hospital}, so it is open for editing instead of adding another.`;
        } else {
          this.msg = "Added.";
        }
        this.load(true);
      })
      .catch((e) => {
        this.errors = [errorText(e)];
      })
      .finally(() => {
        this.saving = false;
      });
  }

  /** The lines grouped by hospital, each portfolio with a heading row when it has two lines (hip, shoulder). */
  get groups() {
    const byHosp = new Map();
    ((this.data && this.data.lines) || [])
      .filter((l) => this.editing || !l.empty)
      .forEach((l) => {
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
        const name = portfolio === "CMF" ? "CMFT" : portfolio;
        const cell = (l) => {
          const d = this.draft[l.usageId + "|" + l.key] || {};
          const company = "company" in d ? d.company : l.company;
          const cases = "cases" in d ? d.cases : l.cases;
          return {
            company: company || "–",
            companyCls: company === "ZB" ? "zb" : "",
            cases: cases === null || cases === undefined ? "–" : cases,
            edit: this.editing && this.canEdit,
            usageId: l.usageId,
            lineKey: l.key,
            options: this.editing
              ? this.companyOptions(l.recordTypeId, l.key, company)
              : [],
            casesValue: cases === null || cases === undefined ? "" : cases,
            showDelete: false
          };
        };
        const deleteBits = (l) => ({
          showDelete: this.editing && this.canDelete,
          deleteUsageId: l.usageId,
          deleteText: `the ${name} usage at ${hospital}`
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
              ...cell(l),
              ...deleteBits(l)
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
          cases: "",
          edit: false,
          options: [],
          ...deleteBits(lines[0])
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
