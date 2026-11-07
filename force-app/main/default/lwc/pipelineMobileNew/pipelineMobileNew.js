import { LightningElement, api, wire } from "lwc";
import {
  getObjectInfo,
  getPicklistValuesByRecordType
} from "lightning/uiObjectInfoApi";
import { createRecord } from "lightning/uiRecordApi";
import SALESRISKS from "@salesforce/schema/SalesRisks__c";
import searchLookup from "@salesforce/apex/PipelineLookupController.search";
import searchNear from "@salesforce/apex/PipelineLookupController.searchNear";
import { suggestYear, quarterIsPast } from "c/pipelineFormat";
import {
  KIND_LABELS,
  NEW_REQUIRED,
  QUARTER_FIELD,
  YEAR_FIELD,
  formRows,
  liveDeal,
  stageSteps,
  stageTone,
  newDealTypes,
  newDealChoices,
  recordTypesFor,
  missingRequired,
  createFields,
  SAVING_WORDS,
  withSavingScreen
} from "c/pipelineMobileModel";

const SLIDE_OUT_MS = 540; // a little longer than the slide itself (0.48 s in the style sheet)
const LOOKUP_MIN = 2; // letters before a search is made, as on the desktop
const LOOKUP_WAIT_MS = 300;
const LOOKUP_LIMIT = 8;
const HOSPITAL_FIELD = "Healthcare_Facility__c";
const SURGEON_FIELD = "Account__c";
const KEEP = [SURGEON_FIELD, HOSPITAL_FIELD, "Objective__c"]; // what carries over when the kind or portfolio changes

const parseErrors = (e) => {
  const out = [];
  const o = e && e.body && e.body.output;
  if (o) {
    (o.errors || []).forEach((x) => out.push(x.message));
    Object.values(o.fieldErrors || {}).forEach((list) =>
      list.forEach((x) => out.push(x.message))
    );
  }
  if (!out.length && e && e.body && e.body.message) out.push(e.body.message);
  if (!out.length && e && Array.isArray(e.body))
    e.body.forEach((b) => out.push(b.message));
  if (!out.length) out.push("The deal could not be created.");
  return out.map((text, key) => ({ key, text }));
};

/**
 * Pipeline Mobile: the New deal page (Robert, 2026-11-08; mockup pipeline_mobile_new_v1.html, option D). It slides in over the list when the
 * "Create new pipeline" bar is tapped. A slider picks the kind (opportunity, risk or ROSA); for an opportunity a dropdown picks the portfolio.
 * Salesforce decides which record types the person may use (the object's record type list as reported to them); the record type is the one
 * for the kind and portfolio (a person in several countries is also asked which). Under that are the same fields as editing that kind of deal
 * (the lists of choices read for the record type), the stage starting at the first one, with the required ones starred (the surgeon, the
 * quarter and the value; the hospital on a ROSA deal). Create makes the record with Salesforce's own record service as the signed-in person, so
 * field access, validation rules and the existing automations all run as on the standard page; whatever Salesforce refuses is shown above the
 * stage and nothing is lost. It tells the parent ("created") with the new deal's Id, and asks it to slide the page off ("close").
 */
export default class PipelineMobileNew extends LightningElement {
  _open = false;
  kind = "opp";
  portfolio = "";
  rtChoice = "";
  draft = {};
  draftNames = {};
  savePhase = "";
  savingWord = "";
  stagesOpen = true; // the stage is chosen when a deal is made, so the list starts open; tapping a stage folds it (Robert, 2026-11-08)
  errors = [];
  saving = false;
  picklistData;
  sheetField = "";
  sheetTerm = "";
  sheetHits = [];
  sheetSearched = false;
  closeTimer;
  timer;

  /** True while the page is slid in; it is put back as new once it has slid off. */
  @api
  get open() {
    return this._open;
  }
  set open(value) {
    this._open = !!value;
    clearTimeout(this.closeTimer);
    if (!value) {
      // eslint-disable-next-line @lwc/lwc/no-async-operation
      this.closeTimer = setTimeout(() => this.reset(), SLIDE_OUT_MS);
    }
  }

  @wire(getObjectInfo, { objectApiName: SALESRISKS }) objectInfo;
  @wire(getPicklistValuesByRecordType, {
    objectApiName: SALESRISKS,
    recordTypeId: "$recordTypeId"
  })
  wiredPicklists({ data }) {
    this.picklistData = data;
    if (data) this.applyDefaults(data);
  }

  disconnectedCallback() {
    clearTimeout(this.closeTimer);
    clearTimeout(this.timer);
  }
  renderedCallback() {
    this.lockScroll();
    // Salesforce puts a text box's value on as an attribute, which a text box does not show: the Background information is set as a property
    this.template.querySelectorAll("textarea[data-api]").forEach((box) => {
      if (this.template.activeElement === box) return;
      const want = this.valueOf(box.dataset.api);
      const text = want === null || want === undefined ? "" : String(want);
      if (box.value !== text) box.value = text;
    });
  }
  /** A swipe on the page scrolls it and is stopped at its top and bottom, not passed on to Salesforce's page underneath. */
  lockScroll() {
    const page = this.template.querySelector(".newpage");
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
  reset() {
    this.kind = "opp";
    this.portfolio = "";
    this.rtChoice = "";
    this.draft = {};
    this.draftNames = {};
    this.stagesOpen = true;
    this.errors = [];
    this.saving = false;
    this.sheetField = "";
    this.sheetTerm = "";
    this.sheetHits = [];
    this.sheetSearched = false;
    const page = this.template.querySelector(".newpage");
    if (page) page.scrollTop = 0;
  }

  /* ----- which record type: the kind, the portfolio, the person's own record types ----- */
  get types() {
    const infos =
      this.objectInfo &&
      this.objectInfo.data &&
      this.objectInfo.data.recordTypeInfos;
    return newDealTypes(infos);
  }
  get choices() {
    return newDealChoices(this.types);
  }
  get kindOptions() {
    return this.choices.kinds.map((k) => ({ value: k, label: KIND_LABELS[k] }));
  }
  get isOpp() {
    return this.kind === "opp";
  }
  get effectivePortfolio() {
    const list = this.choices.portfolios;
    return list.includes(this.portfolio) ? this.portfolio : list[0] || "";
  }
  get portfolioOptions() {
    return this.choices.portfolios.map((p) => ({
      value: p,
      label: p,
      selected: p === this.effectivePortfolio
    }));
  }
  get candidates() {
    return recordTypesFor(this.types, this.kind, this.effectivePortfolio);
  }
  get recordType() {
    return (
      this.candidates.find((t) => t.id === this.rtChoice) ||
      this.candidates[0] ||
      null
    );
  }
  get recordTypeId() {
    return this.recordType ? this.recordType.id : undefined;
  }
  get manyTypes() {
    return this.candidates.length > 1;
  }
  get typeOptions() {
    return this.candidates.map((t) => ({
      value: t.id,
      label: t.name,
      selected: this.recordType && t.id === this.recordType.id
    }));
  }
  get typeName() {
    return this.recordType ? this.recordType.name : "";
  }
  get noTypes() {
    return !!(this.objectInfo && this.objectInfo.data) && !this.recordType;
  }
  /** After the kind or portfolio changes the form starts again, keeping the surgeon, the hospital and the background already written. */
  restart() {
    const keep = {};
    KEEP.forEach((k) => {
      if (k in this.draft) keep[k] = this.draft[k];
    });
    this.draft = keep;
    this.stagesOpen = true;
    this.errors = [];
    this.rtChoice = "";
  }
  handleKind(event) {
    this.kind = event.detail.value;
    this.restart();
  }
  handlePortfolio(event) {
    this.portfolio = event.target.value;
    this.restart();
  }
  handleRecordType(event) {
    this.rtChoice = event.target.value;
    this.restart();
  }

  /* ----- the fields ----- */
  valueOf(field) {
    return field in this.draft ? this.draft[field] : null;
  }
  choicesFor(field) {
    const all = this.picklistData;
    const f = all && all.picklistFieldValues && all.picklistFieldValues[field];
    return f ? f.values : null;
  }
  createable(field) {
    const info = this.objectInfo && this.objectInfo.data;
    return !!(info && info.fields[field] && info.fields[field].createable);
  }
  /** The stage starts at the record type's default or the first stage; the currency at its default, as Salesforce offers them. */
  applyDefaults(data) {
    const next = { ...this.draft };
    const f = data.picklistFieldValues || {};
    if (!("Stage__c" in next) && f.Stage__c) {
      const def = f.Stage__c.defaultValue && f.Stage__c.defaultValue.value;
      const first = stageSteps(
        f.Stage__c.values.map((v) => v.value),
        this.kind,
        ""
      )[0];
      if (def || first) next.Stage__c = def || first;
    }
    if (!("CurrencyIsoCode" in next) && f.CurrencyIsoCode) {
      const def =
        f.CurrencyIsoCode.defaultValue && f.CurrencyIsoCode.defaultValue.value;
      if (def) next.CurrencyIsoCode = def;
    }
    this.draft = next;
  }
  get formRows() {
    if (!this.picklistData) return [];
    return formRows(this.kind, {
      draft: this.draft,
      valueOf: (field) => this.valueOf(field),
      choices: (field) => this.choicesFor(field),
      updateable: (field) => this.createable(field),
      lookupName: (field) => this.draftNames[field] || "",
      required: (NEW_REQUIRED[this.kind] || []).map((r) => r[0])
    }).map((r) => ({ ...r, changed: false, cls: "f" }));
  }
  setDraft(field, value) {
    this.draft = { ...this.draft, [field]: value };
    this.errors = [];
  }
  handleSelect(event) {
    const field = event.target.dataset.api;
    this.setDraft(field, event.target.value);
    if (field === QUARTER_FIELD) this.suggestYearFor(event.target.value);
  }
  /** Picking a quarter fills in its year when there is none yet, or when its year would put the quarter in the past (as when editing). */
  suggestYearFor(quarter) {
    if (!quarter || !this.createable(YEAR_FIELD)) return;
    const year = this.valueOf(YEAR_FIELD);
    const want = String(suggestYear(quarter));
    const offered = (this.choicesFor(YEAR_FIELD) || []).some(
      (c) => c.value === want
    );
    if ((!year || quarterIsPast(quarter, year)) && offered)
      this.setDraft(YEAR_FIELD, want);
  }
  handleText(event) {
    this.setDraft(event.target.dataset.api, event.target.value);
  }
  /** A number box. A field Salesforce holds as text (the units) is sent as the text typed; a number field is sent as a number. */
  handleNumber(event) {
    const name = event.target.dataset.api;
    const v = event.target.value;
    const info = this.objectInfo && this.objectInfo.data;
    const meta = info && info.fields[name];
    const asText = !!meta && meta.dataType === "String";
    this.setDraft(name, v === "" ? "" : asText ? String(v) : Number(v));
  }
  handleFlag(event) {
    this.setDraft(
      event.currentTarget.dataset.api,
      event.detail.value === "yes"
    );
  }
  handleChoice(event) {
    const field = event.currentTarget.dataset.api;
    const value = event.detail.value;
    const on = this.valueOf(field)
      ? String(this.valueOf(field)).split(";")
      : [];
    const next = on.includes(value)
      ? on.filter((x) => x !== value)
      : [...on, value];
    this.setDraft(field, next.join(";"));
  }

  /* ----- the stage: one coloured row that opens the list ----- */
  get stageNow() {
    return this.valueOf("Stage__c") || "–";
  }
  get live() {
    return liveDeal(
      { kind: this.kind, stage: "", isClosed: false, onHold: false },
      this.draft
    );
  }
  get stageList() {
    const values = (this.choicesFor("Stage__c") || []).map((v) => v.value);
    const now = this.stageNow === "–" ? "" : this.stageNow;
    return stageSteps(values, this.kind, now).map((name) => ({
      name,
      current: name === now,
      cls: name === now ? "here" : ""
    }));
  }
  get stageRowCls() {
    const tone = stageTone(this.live);
    return "stgC" + (tone ? ` ${tone}` : "");
  }
  get stageSecCls() {
    const tone = stageTone(this.live);
    return (
      "stsec" + (tone ? ` ${tone}` : "") + (this.stagesOpen ? "" : " shut")
    );
  }
  handleStages() {
    this.stagesOpen = !this.stagesOpen;
  }
  handleStagePick(event) {
    this.setDraft("Stage__c", event.currentTarget.dataset.name);
    this.stagesOpen = false;
  }

  /* ----- the person and hospital search page ----- */
  get sheetCls() {
    return "sheet" + (this.sheetField ? " on" : "");
  }
  get sheetTitle() {
    const row = this.formRows.find((r) => r.api === this.sheetField);
    return row ? row.label : "";
  }
  get sheetPrompt() {
    return !this.sheetSearched && this.sheetTerm.trim().length < LOOKUP_MIN;
  }
  get sheetNone() {
    return this.sheetSearched && this.sheetHits.length === 0;
  }
  get limit() {
    return LOOKUP_LIMIT;
  }
  get sheetFull() {
    return this.sheetHits.length >= LOOKUP_LIMIT;
  }
  get hasSheetTerm() {
    return this.sheetTerm !== "";
  }
  handleLookupOpen(event) {
    this.sheetField = event.currentTarget.dataset.api;
    this.sheetTerm = "";
    this.sheetHits = [];
    this.sheetSearched = false;
  }
  /** The round cross on an optional lookup takes the choice away. */
  handleLookupClear(event) {
    const field = event.currentTarget.dataset.api;
    const names = { ...this.draftNames };
    delete names[field];
    this.draftNames = names;
    const next = { ...this.draft };
    delete next[field];
    this.draft = next;
  }
  handleSheetClose() {
    this.sheetField = "";
  }
  handleSheetTerm(event) {
    this.sheetTerm = event.target.value;
    clearTimeout(this.timer);
    const t = this.sheetTerm;
    if (t.trim().length < LOOKUP_MIN) {
      this.sheetHits = [];
      this.sheetSearched = false;
      return;
    }
    const field = this.sheetField;
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    this.timer = setTimeout(() => {
      // the hospital picker puts the chosen surgeon's own hospitals first (when their names match what was typed)
      const call =
        field === HOSPITAL_FIELD
          ? searchNear({
              fieldName: field,
              term: t,
              surgeonId: this.valueOf(SURGEON_FIELD) || null
            })
          : searchLookup({ fieldName: field, term: t });
      call
        .then((rows) => {
          if (t === this.sheetTerm) {
            const chosen = this.valueOf(field);
            this.sheetHits = rows.map((r) => ({
              id: r.id,
              name: r.name,
              sub: r.sub || "",
              chosen: r.id === chosen,
              cls: "rs" + (r.id === chosen ? " is" : "")
            }));
            this.sheetSearched = true;
          }
        })
        .catch(() => {
          if (t === this.sheetTerm) {
            this.sheetHits = [];
            this.sheetSearched = true;
          }
        });
    }, LOOKUP_WAIT_MS);
  }
  handleSheetClear() {
    this.sheetTerm = "";
    this.sheetHits = [];
    this.sheetSearched = false;
  }
  handleSheetPick(event) {
    const { id, name } = event.currentTarget.dataset;
    this.draftNames = { ...this.draftNames, [this.sheetField]: name };
    this.setDraft(this.sheetField, id);
    this.sheetField = "";
  }

  /* ----- leaving and creating ----- */
  get pageCls() {
    return "page newpage" + (this._open ? " on" : "");
  }
  get hasErrors() {
    return this.errors.length > 0;
  }
  get createWord() {
    return this.saving ? "Creating…" : "Create";
  }
  handleBack() {
    this.dispatchEvent(new CustomEvent("close"));
  }
  showErrors(list) {
    this.errors = list;
    const page = this.template.querySelector(".newpage");
    if (page) page.scrollTop = 0;
  }
  handleCreate() {
    if (this.saving) return;
    const missing = missingRequired(this.kind, (field) => this.valueOf(field));
    if (missing.length) {
      this.showErrors(missing.map((text, key) => ({ key, text })));
      return;
    }
    if (!this.recordType) {
      this.showErrors([
        { key: 0, text: "No record type is available for new deals for you." }
      ]);
      return;
    }
    this.saving = true;
    this.errors = [];
    withSavingScreen(
      (s) => {
        this.savePhase = s.phase;
        this.savingWord = s.word;
      },
      SAVING_WORDS.create,
      () =>
        createRecord({
          apiName: SALESRISKS.objectApiName,
          fields: createFields(this.draft, this.recordType.id)
        })
    )
      .then((res) => {
        this.dispatchEvent(new CustomEvent("created", { detail: res.id }));
      })
      .catch((e) => {
        this.showErrors(parseErrors(e));
      })
      .finally(() => {
        this.saving = false;
      });
  }
}
