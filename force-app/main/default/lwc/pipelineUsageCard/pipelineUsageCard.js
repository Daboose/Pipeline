import { LightningElement, api } from "lwc";
import { NavigationMixin } from "lightning/navigation";
import getCard from "@salesforce/apex/PipelineUsageCardController.getCard";
import deleteLine from "@salesforce/apex/PipelineUsageCardController.deleteLine";
import addUsageFor from "@salesforce/apex/PipelineUsageCardController.addUsageFor";
import saveUsage from "@salesforce/apex/PipelineUsageController.saveUsage";
import searchLookup from "@salesforce/apex/PipelineLookupController.search";
import { formatDate } from "c/pipelineFormat";

/** Usages not changed for longer than this (days) get the "worth checking" warning. */
const OLD_DAYS = 365;
const DAY_MS = 86400000;
const TYPES = ["Hip", "Knee", "Shoulder", "CMFT"];
const STARS = { PLATINUM: 4, GOLD: 3, SILVER: 2, BRONZE: 1 };
/** The product lines of each portfolio, in order: [line key, label]. */
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
const portName = (p) => (p === "CMF" ? "CMFT" : p);

function errorText(e) {
  return (
    (e && e.body && e.body.message) ||
    (e && e.message) ||
    "Something went wrong. Please try again."
  );
}
const sum = (a) => a.reduce((x, y) => x + y, 0);

/**
 * Pipeline: the Usage card on an Account record page. One component, two behaviours chosen by the account it sits on.
 * A surgeon (person account): the four usage ratings as metal plates (Platinum, Gold, Silver, Bronze), a note on when the
 * usages last changed, the usages grouped by hospital (edit a line, take a line off, add a usage), and, only for people who
 * can read the MyCase objects, the MyCase bookings of the last 12 months by type, for information only. A hospital (business
 * account): the cases by surgeon and type, from MyCase bookings (only for people who can read MyCase) or from the usage
 * records, where Zimmer Biomet ("ZB") is split from every other company. Light theme so it sits quietly on the page.
 * Everything changes through Salesforce in the person's own access; the company choices are read live from Salesforce for
 * each usage record type (pipelineUsageChoices) and never typed in here. Opening and closing follow the Pipeline motion
 * standard (a fold over 0.4 s).
 */
export default class PipelineUsageCard extends NavigationMixin(
  LightningElement
) {
  _recordId;
  data;
  loading = false;
  error = "";
  busy = false;
  changedNote = false;
  hmode = "mc"; // hospital view: mc (MyCase bookings) or us (usage records)

  /* editing a line, taking one off */
  editKey = null; // "usageId|key"
  editDraft = {};
  delKey = null;
  flashKey = null; // a usage id whose lines are highlighted
  showEmptyFor = null; // a usage id whose empty lines are shown (so they can be filled in)
  rowMsg = "";
  rowMsgCls = "note warn";

  /* adding a usage */
  addOpen = false;
  addHospital = null; // { id, name }
  addPortfolio = "";
  addKey = "";
  addCompany = "";
  addCases = "";
  addMsg = "";
  search = "";
  hits = [];
  searched = false;
  _timer;

  choices = {}; // company choices by record type id, then line key

  @api
  get recordId() {
    return this._recordId;
  }
  set recordId(value) {
    if (value === this._recordId) return;
    this._recordId = value;
    this.load();
  }

  /** Reads the card. A quiet read (after a change) keeps what is on screen until the new data arrives. */
  load(quiet) {
    const id = this._recordId;
    if (!id) return Promise.resolve();
    this.loading = !quiet;
    this.error = "";
    return getCard({ accountId: id })
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

  /* ----- what is shown ----- */
  get hasData() {
    return !!this.data && !this.error;
  }
  get isPerson() {
    return this.hasData && this.data.isPerson;
  }
  get isHospital() {
    return this.hasData && !this.data.isPerson;
  }
  get heading() {
    return this.isPerson ? "Usages" : "Cases by surgeon";
  }
  get canMyCase() {
    return !!(this.data && this.data.canMyCase);
  }
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
  get busyCls() {
    return this.busy ? "comp busy" : "comp";
  }

  /* ----- ratings: the metal plates ----- */
  get plates() {
    return ((this.data && this.data.ratings) || []).map((r) => {
      const v = (r.rating || "").toUpperCase();
      const known = STARS[v] !== undefined;
      return {
        key: r.area,
        area: portName(r.area),
        cls: "plate m-" + (known ? v : "NONE"),
        rank: known ? v.charAt(0) + v.slice(1).toLowerCase() : "No rating",
        stars: known ? "★".repeat(STARS[v]) : "",
        hasRank: known,
        label: `${portName(r.area)}: ${known ? v.toLowerCase() : "no rating"}`
      };
    });
  }
  get ratingNote() {
    if (this.changedNote) {
      return {
        cls: "note info",
        text: "Usages changed just now. Ratings are recalculated by Salesforce in the background, so they may take a little while to change."
      };
    }
    const d = this.data && this.data.newest;
    if (!d) {
      return {
        cls: "note ok",
        text: "No usages have been recorded for this surgeon."
      };
    }
    const days = Math.floor((Date.now() - Date.parse(d)) / DAY_MS);
    const ago =
      days <= 0
        ? "today"
        : days < 60
          ? `${days} days ago`
          : `${Math.round(days / 30.4)} months ago`;
    const when = `${formatDate(d)} (${ago})`;
    return days > OLD_DAYS
      ? {
          cls: "note warn",
          lead: `Usages last changed ${when}.`,
          text: " Worth checking they are still right."
        }
      : { cls: "note ok", text: `Usages last changed ${when}.` };
  }

  /* ----- the surgeon's usages table ----- */
  get noLines() {
    return !(this.data && this.data.lines && this.data.lines.length);
  }
  get colCount() {
    return this.canEdit ? 5 : 4;
  }
  get groups() {
    const byHosp = new Map();
    ((this.data && this.data.lines) || []).forEach((l) => {
      if (l.empty && l.usageId !== this.showEmptyFor) return;
      const h = l.hospital || "No hospital recorded";
      if (!byHosp.has(h)) byHosp.set(h, []);
      byHosp.get(h).push(l);
    });
    return [...byHosp.entries()].map(([hospital, lines]) => ({
      hospital,
      rows: lines.map((l) => this.rowOf(l))
    }));
  }
  rowOf(l) {
    const k = l.usageId + "|" + l.key;
    const editing = this.editKey === k;
    const deleting = this.delKey === k;
    const flash = this.flashKey === l.usageId;
    const cls = editing
      ? "editing"
      : deleting
        ? "deleting"
        : flash
          ? "flash"
          : l.empty
            ? "emptyline"
            : "";
    const d = this.editDraft;
    return {
      k,
      cls,
      editing,
      deleting,
      portfolio: portName(l.portfolio),
      label: l.label,
      usageId: l.usageId,
      lineKey: l.key,
      company: l.company || "–",
      companyCls: l.company === "ZB" ? "co-zb" : "",
      cases: l.cases === null || l.cases === undefined ? "–" : l.cases,
      options: editing
        ? this.companyOptions(
            l.recordTypeId,
            l.key,
            d.company !== undefined ? d.company : l.company
          )
        : [],
      casesValue:
        d.cases !== undefined
          ? d.cases
          : l.cases === null || l.cases === undefined
            ? ""
            : l.cases,
      normal: !editing && !deleting,
      actionLabel: l.empty ? "Add" : "Edit",
      delText: `Take off ${l.label} (${l.company || "no company"}, ${
        l.cases === null || l.cases === undefined ? 0 : l.cases
      } cases per year) at ${l.hospital || "this hospital"}?`,
      delSpan: this.colCount - 1
    };
  }
  /** The options of a company list: a dash for none, the record type's own choices, and the current value if it is not among them. */
  companyOptions(recordTypeId, key, current) {
    const list = ((this.choices[recordTypeId] || {})[key] || []).slice();
    if (current && !list.includes(current)) list.unshift(current);
    return [{ value: "", label: "–", selected: !current }].concat(
      list.map((v) => ({ value: v, label: v, selected: v === current }))
    );
  }
  handleChoices(event) {
    const { recordTypeId, byKey } = event.detail;
    this.choices = { ...this.choices, [recordTypeId]: byKey };
  }
  /** The record types whose company choices are needed now: the line being edited, or the portfolio being added. */
  get neededRts() {
    const ids = new Set();
    if (this.editKey && this.data) {
      const [usageId, key] = this.editKey.split("|");
      const l = this.data.lines.find(
        (x) => x.usageId === usageId && x.key === key
      );
      if (l && l.recordTypeId) ids.add(l.recordTypeId);
    }
    if (this.addOpen && this.addRecordTypeId) ids.add(this.addRecordTypeId);
    return [...ids].map((id) => ({ id }));
  }

  /* ----- edit a line ----- */
  handleEdit(event) {
    const { k } = event.currentTarget.dataset;
    this.clearRowState();
    this.editKey = k;
    this.editDraft = {};
  }
  handleEditCancel() {
    this.clearRowState();
  }
  handleEditCompany(event) {
    this.editDraft = { ...this.editDraft, company: event.target.value };
  }
  handleEditCases(event) {
    const v = event.target.value;
    this.editDraft = {
      ...this.editDraft,
      cases: v === "" ? "" : Number(v)
    };
  }
  handleEditSave(event) {
    const { usage, key } = event.currentTarget.dataset;
    const cur = this.data.lines.find(
      (l) => l.usageId === usage && l.key === key
    );
    const d = this.editDraft;
    const company = d.company !== undefined ? d.company : cur.company;
    const cases = d.cases !== undefined ? d.cases : cur.cases;
    this.run(
      () =>
        saveUsage({
          usageId: usage,
          linesJson: JSON.stringify([
            {
              key,
              company: company || null,
              cases: cases === "" || cases === undefined ? null : cases
            }
          ])
        }),
      () => {
        this.clearRowState();
        this.flashKey = usage;
        this.touched();
      }
    );
  }

  /* ----- take a line off ----- */
  handleDelete(event) {
    this.clearRowState();
    this.delKey = event.currentTarget.dataset.k;
  }
  handleDeleteNo() {
    this.delKey = null;
  }
  handleDeleteYes(event) {
    const { usage, key } = event.currentTarget.dataset;
    this.run(
      () => deleteLine({ usageId: usage, key }),
      () => {
        this.clearRowState();
        this.touched();
      }
    );
  }
  clearRowState() {
    this.editKey = null;
    this.editDraft = {};
    this.delKey = null;
    this.flashKey = null;
    this.rowMsg = "";
  }
  touched() {
    this.changedNote = true;
  }

  /** Runs a change with the "please wait" cover on, then reads the card again; an error is shown and nothing else changes. */
  run(action, done) {
    this.busy = true;
    this.rowMsg = "";
    this.addMsg = "";
    return action()
      .then((res) => {
        const after = done(res);
        return this.load(true).then(() => after);
      })
      .catch((e) => {
        const msg = errorText(e);
        if (this.addOpen) this.addMsg = msg;
        else {
          this.rowMsg = msg;
          this.rowMsgCls = "note bad";
        }
      })
      .finally(() => {
        this.busy = false;
      });
  }

  /* ----- add a usage (a fold, the Pipeline motion standard) ----- */
  get addToggleLabel() {
    return this.addOpen ? "Close" : "Add usage";
  }
  get foldCls() {
    return this.addOpen ? "fold open" : "fold";
  }
  handleAddToggle() {
    if (this.addOpen) {
      this.closeAdd();
      return;
    }
    this.clearRowState();
    this.addOpen = true;
    this.addPortfolio = this.addable.length ? this.addable[0].portfolio : "";
    this.addKey = this.addProducts.length ? this.addProducts[0].value : "";
    this.addCompany = "";
  }
  closeAdd() {
    this.addOpen = false;
    this.addMsg = "";
    // the fields are emptied once the fold has closed
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    setTimeout(() => {
      if (!this.addOpen) this.resetAdd();
    }, 450);
  }
  resetAdd() {
    this.addHospital = null;
    this.addCompany = "";
    this.addCases = "";
    this.search = "";
    this.hits = [];
    this.searched = false;
  }
  get portfolioChoices() {
    return this.addable.map((o) => ({
      value: o.portfolio,
      label: portName(o.portfolio),
      selected: o.portfolio === this.addPortfolio
    }));
  }
  get addProducts() {
    return (PORT_LINES[this.addPortfolio] || []).map(([value, label]) => ({
      value,
      label,
      selected: value === this.addKey
    }));
  }
  get addRecordTypeId() {
    const o = this.addable.find((x) => x.portfolio === this.addPortfolio);
    return o ? o.recordTypeId : "";
  }
  get addCompanies() {
    return this.companyOptions(
      this.addRecordTypeId,
      this.addKey,
      this.addCompany
    );
  }
  handleAddPortfolio(event) {
    this.addPortfolio = event.target.value;
    this.addKey = this.addProducts[0] ? this.addProducts[0].value : "";
    this.addCompany = "";
  }
  handleAddProduct(event) {
    this.addKey = event.target.value;
    this.addCompany = "";
  }
  handleAddCompany(event) {
    this.addCompany = event.target.value;
  }
  handleAddCases(event) {
    this.addCases = event.target.value;
  }

  /* hospital search (one search box: the name with a cross, or the search) */
  get hasHospital() {
    return !!this.addHospital;
  }
  get hospitalName() {
    return this.addHospital ? this.addHospital.name : "";
  }
  get sboxCls() {
    return this.search ? "sbox has" : "sbox";
  }
  get showHits() {
    return this.searched && this.search.trim().length >= 2;
  }
  get noHits() {
    return this.searched && this.hits.length === 0;
  }
  handleSearch(event) {
    this.search = event.target.value;
    clearTimeout(this._timer);
    const t = this.search;
    if (t.trim().length < 2) {
      this.hits = [];
      this.searched = false;
      return;
    }
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    this._timer = setTimeout(() => {
      searchLookup({ fieldName: "Healthcare_Facility__c", term: t })
        .then((rows) => {
          if (t === this.search) {
            this.hits = rows.map((r) => ({
              id: r.id,
              name: r.name,
              sub: r.sub || ""
            }));
            this.searched = true;
          }
        })
        .catch(() => {
          this.hits = [];
          this.searched = true;
        });
    }, 250);
  }
  handleSearchClear() {
    this.search = "";
    this.hits = [];
    this.searched = false;
  }
  handlePick(event) {
    const { id, name } = event.currentTarget.dataset;
    this.addHospital = { id, name };
    this.search = "";
    this.hits = [];
    this.searched = false;
  }
  handleHospitalClear() {
    this.addHospital = null;
  }
  handleAddDo() {
    this.addMsg = "";
    if (!this.addHospital) {
      this.addMsg = "Pick a hospital first.";
      return;
    }
    if (this.addCases === "" || Number(this.addCases) < 0) {
      this.addMsg = "Enter the cases per year (a whole number, 0 or more).";
      return;
    }
    const portfolio = this.addPortfolio;
    const hospital = this.addHospital;
    this.run(
      () =>
        addUsageFor({
          surgeonId: this._recordId,
          hospitalId: hospital.id,
          portfolio,
          linesJson: JSON.stringify([
            {
              key: this.addKey,
              company: this.addCompany || null,
              cases: Number(this.addCases)
            }
          ])
        }),
      (res) => {
        this.touched();
        this.flashKey = res.usageId;
        if (res.existing) {
          this.showEmptyFor = res.usageId;
          this.rowMsgCls = "note warn";
          this.rowMsg = `This surgeon already has a ${portName(portfolio)} usage for that company at ${hospital.name}, so nothing was added. It is highlighted below: use Edit (or Add on an empty line) to change it.`;
        }
        this.closeAdd();
      }
    );
  }

  /* ----- MyCase bookings (surgeon) ----- */
  get bookingRows() {
    return ((this.data && this.data.bookings) || []).map((b) => {
      const total = b.primary + b.revision;
      return {
        type: b.type,
        none: total === 0,
        primary: b.primary,
        revision: b.revision,
        total,
        latest: b.latest ? formatDate(b.latest) : ""
      };
    });
  }
  get noBookings() {
    return this.bookingRows.every((r) => r.none);
  }
  get bookingTotals() {
    const rows = this.bookingRows;
    return {
      primary: sum(rows.map((r) => r.primary)),
      revision: sum(rows.map((r) => r.revision)),
      total: sum(rows.map((r) => r.total))
    };
  }

  /* ----- hospital ----- */
  get showSwitch() {
    return this.canMyCase;
  }
  get splitView() {
    return !this.canMyCase || this.hmode === "us";
  }
  get mcBtnCls() {
    return this.hmode === "mc" ? "on" : "";
  }
  get usBtnCls() {
    return this.hmode === "us" ? "on" : "";
  }
  handleMode(event) {
    this.hmode = event.currentTarget.dataset.m;
  }
  get typeHeads() {
    return TYPES.map((t) => ({ t }));
  }
  get splitHeads() {
    return TYPES.concat(["All types"]).map((t) => ({ t }));
  }
  get splitSubs() {
    const out = [];
    for (let i = 0; i < 5; i++) {
      out.push({ k: "z" + i, t: "ZB", cls: "num sub zbh" });
      out.push({ k: "o" + i, t: "Other", cls: "num sub" });
    }
    return out;
  }
  get hospitalRows() {
    const split = this.splitView;
    const rows = ((this.data && this.data.surgeons) || [])
      .map((s) => ({
        s,
        weight: split ? sum(s.zb) + sum(s.other) : sum(s.mycase)
      }))
      .filter((x) => x.weight > 0)
      .sort((a, b) => b.weight - a.weight);
    const cell = (v, cls) => ({
      v: v || "–",
      cls: "num" + (v ? "" : " dash") + (cls ? " " + cls : "")
    });
    return rows.map(({ s }) => {
      const cells = [];
      if (split) {
        for (let i = 0; i < 4; i++) {
          cells.push({ k: "z" + i, ...cell(s.zb[i], "zbc") });
          cells.push({ k: "o" + i, ...cell(s.other[i], "oth") });
        }
        cells.push({ k: "zt", v: sum(s.zb), cls: "num zbc strong" });
        cells.push({ k: "ot", v: sum(s.other), cls: "num oth strong" });
      } else {
        for (let i = 0; i < 4; i++) {
          cells.push({ k: "m" + i, ...cell(s.mycase[i]) });
        }
        cells.push({ k: "mt", v: sum(s.mycase), cls: "num strong" });
      }
      return { id: s.id, name: s.name || "Unnamed surgeon", cells };
    });
  }
  get hospitalTotals() {
    const list = (this.data && this.data.surgeons) || [];
    const col = (key, i) => sum(list.map((s) => s[key][i]));
    const cells = [];
    if (this.splitView) {
      for (let i = 0; i < 4; i++) {
        cells.push({ k: "z" + i, v: col("zb", i), cls: "num zbc" });
        cells.push({ k: "o" + i, v: col("other", i), cls: "num oth" });
      }
      cells.push({
        k: "zt",
        v: sum(list.map((s) => sum(s.zb))),
        cls: "num zbc"
      });
      cells.push({
        k: "ot",
        v: sum(list.map((s) => sum(s.other))),
        cls: "num oth"
      });
    } else {
      for (let i = 0; i < 4; i++) {
        cells.push({ k: "m" + i, v: col("mycase", i), cls: "num" });
      }
      cells.push({
        k: "mt",
        v: sum(list.map((s) => sum(s.mycase))),
        cls: "num"
      });
    }
    return cells;
  }
  get noSurgeons() {
    return this.hospitalRows.length === 0;
  }
  get hospitalFoot() {
    return this.splitView
      ? "Cases per year from the usage records, Zimmer Biomet (ZB) against every other company. A hip adds its stems and cups."
      : "Zimmer Biomet surgeries booked in MyCase in the last 12 months, past dates only, primary and revision together. MyCase holds Zimmer Biomet surgeries only, so there is no split.";
  }
  handleGo(event) {
    const id = event.currentTarget.dataset.id;
    this[NavigationMixin.Navigate]({
      type: "standard__recordPage",
      attributes: { recordId: id, objectApiName: "Account", actionName: "view" }
    });
  }
}
