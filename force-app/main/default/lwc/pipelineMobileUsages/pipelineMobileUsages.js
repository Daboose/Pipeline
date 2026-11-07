import { LightningElement, api } from "lwc";
import getUsages from "@salesforce/apex/PipelineSurgeonController.getUsages";
import saveUsage from "@salesforce/apex/PipelineUsageController.saveUsage";
import deleteUsage from "@salesforce/apex/PipelineUsageController.deleteUsage";
import addUsage from "@salesforce/apex/PipelineUsageController.addUsage";
import searchLookup from "@salesforce/apex/PipelineLookupController.search";
import {
  PORT_LINES,
  portfolioName,
  ratingPlates,
  usageFreshness,
  groupUsages,
  changedLines,
  companyOptions,
  SAVING_WORDS,
  withSavingScreen
} from "c/pipelineMobileModel";

const SLIDE_OUT_MS = 540; // a little longer than the slide itself (0.48 s in the style sheet)
const LOOKUP_MIN = 2; // letters before a hospital search is made, as on the desktop
const LOOKUP_WAIT_MS = 300;
const LOOKUP_LIMIT = 8;

const errorText = (e) =>
  (e && e.body && e.body.message) ||
  (e && e.message) ||
  "That did not work. Try again.";

/**
 * Pipeline Mobile: the Surgeon Usages screen of one deal on the phone (Robert, 2026-11-08; mockup pipeline_mobile_usages_v1.html, the rating
 * plates two by two). It slides in over the deal when the Surgeon Usages row is tapped and shows what the desktop panel shows: the four
 * rating plates (the metal plates of the Account page's Usage Card, adapted), how fresh the usages are (with the old-usages warning), and
 * the usages grouped by hospital, one card each. For a person Salesforce lets change usages: a tap on a card slides in an edit page (company
 * and cases a year for each line, a Delete that asks first, a locked Cancel / Save bar), and "+ Add usage" slides in a page for a new one
 * (hospital by a search page, portfolio, lines). A surgeon never gets two usages for the same hospital and portfolio: adding one that exists
 * opens it for editing. Reads and saves with the desktop's own Apex (PipelineSurgeonController.getUsages, PipelineUsageController.saveUsage,
 * deleteUsage, addUsage); the company lists are read from Salesforce for each record type by pipelineUsageChoices. It tells the parent
 * ("summary") how fresh the usages are, for the deal screen's row, and asks it to slide the screen off ("close").
 */
export default class PipelineMobileUsages extends LightningElement {
  @api dealLabel = "";
  @api area = ""; // the deal's own area: Hip, Knee, Shoulder or CMF

  _recordId;
  _refreshKey = 0;
  _open = false;
  data;
  loading = false;
  error = "";
  msg = "";
  errors = [];
  saving = false;
  savePhase = "";
  savingWord = "";
  choices = {}; // the company choices by record type id, then product line
  closeTimer;
  timer;

  editId = ""; // the usage being edited (its page is over the screen while this is set)
  draft = {}; // the edited lines: { lineKey: { company?, cases? } }
  delOpen = false;

  addOpen = false;
  addHospital = null; // { id, name }
  addPortfolio = "";
  addDraft = {};

  hospitalOpen = false; // the hospital search page
  term = "";
  hits = [];
  searched = false;

  @api
  get recordId() {
    return this._recordId;
  }
  set recordId(value) {
    if (value === this._recordId) return;
    this._recordId = value;
    this.resetPages();
    this.msg = "";
    this.load(false);
  }
  /** A number that goes up when the deal is saved, so what is shown is read again (a new Primary HCP has other usages). */
  @api
  get refreshKey() {
    return this._refreshKey;
  }
  set refreshKey(value) {
    if (value === this._refreshKey) return;
    this._refreshKey = value;
    if (this._recordId) this.load(true);
  }
  /** True while the screen is slid in; its sliding pages are put away once it has slid off. */
  @api
  get open() {
    return this._open;
  }
  set open(value) {
    this._open = !!value;
    clearTimeout(this.closeTimer);
    if (!value) {
      // eslint-disable-next-line @lwc/lwc/no-async-operation
      this.closeTimer = setTimeout(() => {
        this.resetPages();
        this.msg = "";
      }, SLIDE_OUT_MS);
    }
  }

  disconnectedCallback() {
    clearTimeout(this.timer);
    clearTimeout(this.closeTimer);
  }
  renderedCallback() {
    this.lockScroll();
  }
  /** A swipe on the screen scrolls it and is stopped at its top and bottom, not passed on to Salesforce's page underneath. */
  lockScroll() {
    const page = this.template.querySelector(".usagespage");
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

  /** Reads the usages. A quiet read (after a change) keeps what is on screen until the new data arrives. */
  load(quiet) {
    const id = this._recordId;
    if (!id) return Promise.resolve();
    this.loading = !quiet;
    this.error = "";
    if (!quiet) this.data = undefined;
    return getUsages({ dealId: id })
      .then((d) => {
        if (id !== this._recordId) return;
        this.data = d;
        this.dispatchEvent(
          new CustomEvent("summary", { detail: this.summary })
        );
      })
      .catch((e) => {
        if (id === this._recordId) this.error = errorText(e);
      })
      .finally(() => {
        if (id === this._recordId) this.loading = false;
      });
  }
  /** What the deal screen's row says: how long since the usages were last updated, and whether that is old. */
  get summary() {
    const d = this.data;
    if (!d) return { text: "", old: false, rating: "" };
    if (!d.surgeonId) return { text: "no Primary HCP", old: false, rating: "" };
    const f = usageFreshness(d.newest, this.area);
    // the rating of the deal's own area, as a word, for the Usage rating tile on the deal screen
    const mine = ratingPlates(d.ratings, this.area).find((p) => p.mine);
    return { text: f.row, old: f.old, rating: mine ? mine.rank : "" };
  }

  /* ----- the screen ----- */
  get pageCls() {
    return "page usagespage" + (this._open ? " on" : "");
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
  get plates() {
    return ratingPlates(this.data.ratings, this.area);
  }
  get fresh() {
    return usageFreshness(this.data.newest, this.area);
  }
  get freshCls() {
    return "fresh" + (this.fresh.old ? " w" : "");
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
  get hasMsg() {
    return !!this.msg;
  }
  get groups() {
    return groupUsages(this.data.lines).map((g) => ({
      hospital: g.hospital,
      usages: g.usages.map((u) => ({
        usageId: u.usageId,
        name: u.name,
        cls:
          "ucard" +
          (u.portfolio === this.area ? " mine" : "") +
          (this.canEdit ? "" : " fixed"),
        arrow: this.canEdit,
        rows: u.lines
          .filter((l) => !l.empty)
          .map((l) => ({
            key: l.key,
            label: PORT_LINES[u.portfolio].length > 1 ? l.label : "",
            company: l.company || "–",
            companyCls: l.company === "ZB" ? "co zb" : "co",
            casesText: l.cases === null ? "–" : `${l.cases} a year`
          }))
      }))
    }));
  }
  get noUsages() {
    return this.hasData && this.groups.length === 0;
  }

  /* ----- the pages ----- */
  resetPages() {
    clearTimeout(this.timer);
    this.editId = "";
    this.draft = {};
    this.delOpen = false;
    this.addOpen = false;
    this.addHospital = null;
    this.addDraft = {};
    this.hospitalOpen = false;
    this.term = "";
    this.hits = [];
    this.searched = false;
    this.errors = [];
    this.saving = false;
  }
  get editCls() {
    return "pg e" + (this.editId ? " on" : "");
  }
  get addCls() {
    return "pg a" + (this.addOpen ? " on" : "");
  }
  get hospitalCls() {
    return "pg h" + (this.hospitalOpen ? " on" : "");
  }
  get askCls() {
    return "askwrap" + (this.delOpen ? " on" : "");
  }
  get hasErrors() {
    return this.errors.length > 0;
  }
  get neededRts() {
    const ids = new Set();
    if (this.editUsage && this.editUsage.recordTypeId)
      ids.add(this.editUsage.recordTypeId);
    if (this.addOpen && this.addOption && this.addOption.recordTypeId)
      ids.add(this.addOption.recordTypeId);
    return [...ids].map((id) => ({ id }));
  }
  handleChoices(event) {
    const { recordTypeId, byKey } = event.detail;
    this.choices = { ...this.choices, [recordTypeId]: byKey };
  }
  choicesFor(recordTypeId, key) {
    return (this.choices[recordTypeId] || {})[key] || [];
  }

  /* ----- editing one usage ----- */
  get editUsage() {
    if (!this.editId || !this.data) return null;
    const all = groupUsages(this.data.lines).flatMap((g) => g.usages);
    return all.find((u) => u.usageId === this.editId) || null;
  }
  get editTitle() {
    const u = this.editUsage;
    return u ? `${u.hospital} · ${u.name}` : "";
  }
  get editLines() {
    const u = this.editUsage;
    if (!u) return [];
    return u.lines.map((l) => {
      const d = this.draft[l.key] || {};
      const company = "company" in d ? d.company : l.company;
      const cases = "cases" in d ? d.cases : l.cases;
      return {
        key: l.key,
        label: PORT_LINES[u.portfolio].length > 1 ? l.label : "",
        options: companyOptions(
          this.choicesFor(u.recordTypeId, l.key),
          company
        ),
        casesValue: cases === null || cases === undefined ? "" : cases,
        coCls:
          "in" +
          ("company" in d && company !== (l.company || "") ? " chg" : ""),
        nCls: "in" + ("cases" in d && cases !== l.cases ? " chg" : "")
      };
    });
  }
  get editChanged() {
    const u = this.editUsage;
    return u ? changedLines(u, this.draft) : [];
  }
  get cantSave() {
    return this.editChanged.length === 0 || this.saving;
  }
  get deleteText() {
    const u = this.editUsage;
    return u
      ? `Delete the ${u.name} usage at ${u.hospital}? This cannot be undone.`
      : "";
  }
  handleCard(event) {
    if (!this.canEdit) return;
    this.resetPages();
    this.msg = "";
    this.editId = event.currentTarget.dataset.id;
  }
  setEditDraft(key, patch) {
    this.draft = { ...this.draft, [key]: { ...this.draft[key], ...patch } };
    this.errors = [];
  }
  handleEditCompany(event) {
    this.setEditDraft(event.target.dataset.key, {
      company: event.target.value
    });
  }
  handleEditCases(event) {
    const v = event.target.value;
    this.setEditDraft(event.target.dataset.key, {
      cases: v === "" ? null : Number(v)
    });
  }
  handleEditClose() {
    this.editId = "";
    this.draft = {};
    this.errors = [];
    this.delOpen = false;
  }
  handleSave() {
    const u = this.editUsage;
    if (!u || this.cantSave) return;
    this.saving = true;
    this.errors = [];
    const linesJson = JSON.stringify(this.editChanged);
    withSavingScreen(
      (s) => {
        this.savePhase = s.phase;
        this.savingWord = s.word;
      },
      SAVING_WORDS.save,
      () => saveUsage({ usageId: u.usageId, linesJson })
    )
      .then(() => {
        this.editId = "";
        this.draft = {};
        this.msg = "Saved.";
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
  handleDeleteAsk() {
    this.delOpen = true;
  }
  handleDeleteKeep() {
    this.delOpen = false;
  }
  handleDeleteYes() {
    const u = this.editUsage;
    if (!u) return;
    this.saving = true;
    withSavingScreen(
      (s) => {
        this.savePhase = s.phase;
        this.savingWord = s.word;
      },
      SAVING_WORDS.delete,
      () => deleteUsage({ usageId: u.usageId })
    )
      .then(() => {
        this.delOpen = false;
        this.editId = "";
        this.draft = {};
        this.msg = "Deleted.";
        this.load(true);
        this.dispatchEvent(new CustomEvent("usageschanged"));
      })
      .catch((e) => {
        this.delOpen = false;
        this.errors = [errorText(e)];
      })
      .finally(() => {
        this.saving = false;
      });
  }

  /* ----- adding a usage ----- */
  get addOption() {
    return this.addable.find((o) => o.portfolio === this.addPortfolio);
  }
  get portfolioChoices() {
    return this.addable.map((o) => ({
      value: o.portfolio,
      label: portfolioName(o.portfolio),
      selected: o.portfolio === this.addPortfolio
    }));
  }
  get addLines() {
    const rt = this.addOption ? this.addOption.recordTypeId : "";
    return (PORT_LINES[this.addPortfolio] || []).map(([key, label]) => {
      const d = this.addDraft[key] || {};
      return {
        key,
        label: PORT_LINES[this.addPortfolio].length > 1 ? label : "",
        options: companyOptions(this.choicesFor(rt, key), d.company),
        casesValue: d.cases === null || d.cases === undefined ? "" : d.cases
      };
    });
  }
  get addRecordTypeText() {
    return this.addOption
      ? `Saved as record type ${this.addOption.recordType}, chosen from your country and the portfolio.`
      : "";
  }
  get hospitalText() {
    return this.addHospital ? this.addHospital.name : "Search by name…";
  }
  get hospitalCellCls() {
    return "hosp" + (this.addHospital ? " set" : "");
  }
  get cantAdd() {
    return !this.addHospital || this.saving;
  }
  handleAddOpen() {
    this.resetPages();
    this.msg = "";
    this.addOpen = true;
    this.addPortfolio = this.addable[0] ? this.addable[0].portfolio : "";
  }
  handleAddClose() {
    this.addOpen = false;
    this.addHospital = null;
    this.addDraft = {};
    this.errors = [];
    this.hospitalOpen = false;
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
  handleAddSave() {
    if (this.cantAdd) return;
    const lines = (PORT_LINES[this.addPortfolio] || []).map(([key]) => {
      const d = this.addDraft[key] || {};
      return { key, company: d.company || null, cases: d.cases ?? null };
    });
    const portfolio = this.addPortfolio;
    const hospital = this.addHospital.name;
    this.saving = true;
    this.errors = [];
    const dealId = this._recordId;
    const hospitalId = this.addHospital.id;
    const linesJson = JSON.stringify(lines);
    withSavingScreen(
      (s) => {
        this.savePhase = s.phase;
        this.savingWord = s.word;
      },
      SAVING_WORDS.create,
      () => addUsage({ dealId, hospitalId, portfolio, linesJson })
    )
      .then((res) => {
        this.addOpen = false;
        this.addHospital = null;
        this.addDraft = {};
        this.dispatchEvent(new CustomEvent("usageschanged"));
        if (res && res.existing) {
          this.msg = `This surgeon already has a ${portfolioName(portfolio)} usage at ${hospital}, so it is open for editing instead of adding another.`;
          return this.load(true).then(() => {
            this.draft = {};
            this.editId = res.usageId;
          });
        }
        this.msg = "Added.";
        return this.load(true);
      })
      .catch((e) => {
        this.errors = [errorText(e)];
      })
      .finally(() => {
        this.saving = false;
      });
  }

  /* ----- the hospital search page ----- */
  handleHospitalOpen() {
    this.hospitalOpen = true;
    this.term = "";
    this.hits = [];
    this.searched = false;
  }
  handleHospitalClose() {
    this.hospitalOpen = false;
  }
  get hasTerm() {
    return this.term !== "";
  }
  get hitsPrompt() {
    return !this.searched && this.term.trim().length < LOOKUP_MIN;
  }
  get hitsNone() {
    return this.searched && this.hits.length === 0;
  }
  get hitsFull() {
    return this.hits.length >= LOOKUP_LIMIT;
  }
  get limit() {
    return LOOKUP_LIMIT;
  }
  handleTerm(event) {
    this.term = event.target.value;
    clearTimeout(this.timer);
    const t = this.term;
    if (t.trim().length < LOOKUP_MIN) {
      this.hits = [];
      this.searched = false;
      return;
    }
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    this.timer = setTimeout(() => {
      searchLookup({ fieldName: "Healthcare_Facility__c", term: t })
        .then((rows) => {
          if (t === this.term) {
            this.hits = rows.map((r) => ({
              id: r.id,
              name: r.name,
              sub: r.sub || ""
            }));
            this.searched = true;
          }
        })
        .catch(() => {
          if (t === this.term) {
            this.hits = [];
            this.searched = true;
          }
        });
    }, LOOKUP_WAIT_MS);
  }
  handleTermClear() {
    this.term = "";
    this.hits = [];
    this.searched = false;
  }
  handlePickHospital(event) {
    const { id, name } = event.currentTarget.dataset;
    this.addHospital = { id, name };
    this.hospitalOpen = false;
  }
}
