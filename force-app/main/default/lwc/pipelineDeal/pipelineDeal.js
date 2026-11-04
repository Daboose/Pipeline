import { LightningElement, api, wire } from "lwc";
import {
  getRecord,
  updateRecord,
  getRecordNotifyChange
} from "lightning/uiRecordApi";
import {
  getObjectInfo,
  getPicklistValuesByRecordType
} from "lightning/uiObjectInfoApi";
import getBadges from "@salesforce/apex/PipelineBookingsController.getBadges";
import SALESRISKS from "@salesforce/schema/SalesRisks__c";
import RECORD_TYPE from "@salesforce/schema/SalesRisks__c.RecordTypeId";
import {
  formatMoney,
  chatterDays,
  stageDays,
  ageDays,
  chatterBand,
  stageBand,
  suggestYear,
  quarterIsPast,
  STAGE_COLOURS
} from "c/pipelineFormat";

const SLIDE_IN_DELAY_MS = 30; // lets the closed position be drawn first, so the slide runs
const SLIDE_OUT_MS = 450; // a little longer than the slide itself (0.4 s in the style sheet)
const QUARTER_FIELD = "Expected_Closure_Quarter__c";
const YEAR_FIELD = "Expected_Closing_Year__c";

/**
 * The fields shown for each kind of deal: [API name, label, kind of control, required on the screen].
 * "readonly" rows are shown but never edited. What each person may actually change is decided by Salesforce (field
 * access); a field they cannot edit is shown as plain text. The lists of choices (stage, quarter, brand and so on) are
 * read from Salesforce for the deal's record type, never typed in here.
 */
const FIELDS = {
  opp: [
    ["Account__c", "Primary HCP", "lookup", true],
    ["Healthcare_Facility__c", "Healthcare facility", "lookup"],
    ["Stage__c", "Stage", "picklist", true],
    ["Expected_Closure_Quarter__c", "Expected closing quarter", "picklist"],
    ["Expected_Closing_Year__c", "Expected closing year", "picklist"],
    ["AmountPerYear__c", "Expected annual value", "number"],
    ["CurrencyIsoCode", "Currency", "picklist"],
    ["UnitsCasesPerYear__c", "Expected annual units / cases", "number"],
    ["Brand__c", "Brand", "multi", false, true],
    ["OnHold__c", "On hold", "bool"],
    ["Priority__c", "Rep priority", "bool"],
    ["State_Priority__c", "State priority", "bool"],
    ["myMo__c", "MyMo", "bool"],
    ["myMo_Stage__c", "MyMo stage", "picklist"],
    ["Link_To_ROSA_Deal__c", "Link to ROSA deal", "lookup"],
    ["Objective__c", "Background information", "textarea", false, true]
  ],
  risk: [
    ["Account__c", "Primary HCP", "lookup", true],
    ["Healthcare_Facility__c", "Healthcare facility", "lookup"],
    ["Stage__c", "Stage", "picklist", true],
    ["Expected_Closure_Quarter__c", "Expected closing quarter", "picklist"],
    ["Expected_Closing_Year__c", "Expected closing year", "picklist"],
    ["AmountPerYear__c", "Annual value at risk", "number"],
    ["CurrencyIsoCode", "Currency", "picklist"],
    ["Portfolio__c", "Portfolio", "multi", false, true],
    ["Brand__c", "Brand", "multi", false, true],
    ["Priority__c", "Rep priority", "bool"],
    ["State_Priority__c", "State priority", "bool"],
    ["Objective__c", "Background information", "textarea", false, true]
  ],
  rosa: [
    ["Healthcare_Facility__c", "Healthcare facility", "lookup", true],
    ["Account__c", "Primary HCP", "lookup"],
    ["ROSA_Deal_Type__c", "ROSA deal type", "picklist"],
    ["ROSA_Sales_Type__c", "ROSA sales type", "multi", false, true],
    ["ROSAGrowthDollar__c", "ROSA growth $", "number"],
    ["CurrencyIsoCode", "Currency", "picklist"],
    ["Stage__c", "Stage", "picklist", true],
    ["Expected_Closure_Quarter__c", "Expected closing quarter", "picklist"],
    ["Expected_Closing_Year__c", "Expected closing year", "picklist"],
    ["Install_Date__c", "Install date", "date"],
    ["Close_Date__c", "Close date", "date"],
    ["ROSA_Platform_Shoulder_Stage__c", "ROSA platform: shoulder", "picklist"],
    ["ROSA_Platform_Hip_Stage__c", "ROSA platform: hip", "picklist"],
    [
      "ROSA_Platform_Partial_Knee__c",
      "ROSA platform: partial knee",
      "picklist"
    ],
    ["Priority__c", "Rep priority", "bool"],
    ["State_Priority__c", "State priority", "bool"],
    ["Objective__c", "Background information", "textarea", false, true]
  ]
};
const VALUE_LABEL = {
  opp: "Expected annual value",
  risk: "Annual value at risk",
  rosa: "ROSA growth value"
};
const KIND_NAME = {
  opp: "Opportunity",
  risk: "Risk",
  rosa: "ROSA opportunity"
};
/** The two closing stages of each kind: won (the end of the path) and lost. */
const ENDS = {
  opp: { won: "Conversion", lost: "Unsuccessful Conversion" },
  risk: { won: "Closed Retained", lost: "Lost Business" },
  rosa: { won: "Closed Won", lost: "Deal Lost" }
};

function parseErrors(e) {
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
  if (!out.length) out.push("The deal could not be saved.");
  return out.map((text, key) => ({ key, text }));
}

/**
 * Pipeline: the deal flyout. Opens over the screen (the screen behind it is blurred and switched off) with the stage
 * path across the top, a strip of the deal's key numbers, the deal's fields on the left and its Chatter on the right.
 * Previous and Next move through the list the deal was opened from. Fields are changed and saved with Salesforce's own
 * record service, so field access, validation rules and the deal's existing automations all behave exactly as they do
 * on the standard page. Nothing is saved until Save changes is pressed.
 */
export default class PipelineDeal extends LightningElement {
  _open = false;
  /** True once the flyout is to be slid in from the right; false slides it away (the screen keeps it on the page while it slides). */
  @api
  get open() {
    return this._open;
  }
  set open(value) {
    this._open = value;
    if (!value) this.resetPanel(); // the flyout is sliding away; it opens next time with no panel over it
  }
  _deal;
  @api index = 0;
  @api total = 0;
  @api isManager = false;
  @api viewerId = "";

  draft = {};
  draftNames = {}; // the names of records picked in this edit, by field
  savedTick = 0; // counts saves, so the Usages and Case Bookings panels read again
  panel = ""; // which panel is over the deal: usages, cases or none
  panelMounted = false; // the panel is on the page (it stays a moment after closing, to slide away)
  panelOn = false; // and slid into view
  panelTimer;
  usageTick = 0; // counts changes to the surgeon's usages (from either panel), so both panels and the button badges read again
  badges; // what the MyCase Bookings button shows: { booked } (the usages' age is no longer shown)
  usageAction = null; // what the Surgeon Usages panel wants in the bottom row: { kind: "" | "edit" | "add", canSubmit, saving }
  errors = [];
  savedMsg = false;
  saving = false;
  confirming = false;
  pending = "";

  get scrimCls() {
    return this.open ? "scrim on" : "scrim";
  }

  /* ----- the Usages and Case Bookings panels (slide in over everything under the header; the header and bottom bar stay) ----- */
  get usagesOpen() {
    return this.panelMounted && this.panel === "usages";
  }
  get casesOpen() {
    return this.panelMounted && this.panel === "cases";
  }
  /**
   * The bottom row holds only action buttons (Robert, 2026-11-04): over the deal itself, Open in Salesforce, Cancel and Save
   * changes; while the Surgeon Usages panel is editing or adding, its Cancel and Save changes / Add usage; otherwise nothing.
   */
  get showDealActions() {
    return !this.panelMounted;
  }
  get showPanelActions() {
    return (
      this.panelMounted &&
      this.panel === "usages" &&
      !!this.usageAction &&
      !!this.usageAction.kind
    );
  }
  get panelSubmitLabel() {
    return this.usageAction && this.usageAction.kind === "add"
      ? "Add usage"
      : "Save changes";
  }
  get panelSubmitDisabled() {
    return (
      !this.usageAction ||
      !this.usageAction.canSubmit ||
      this.usageAction.saving
    );
  }
  handleActionState(event) {
    this.usageAction = event.detail;
  }
  handlePanelCancel() {
    const u = this.template.querySelector("c-pipeline-usages");
    if (u) u.cancel();
  }
  handlePanelSubmit() {
    const u = this.template.querySelector("c-pipeline-usages");
    if (u) u.submit();
  }
  /** Goes up when the deal is saved or the usages change, so the panels read their data again. */
  get panelRefresh() {
    return this.savedTick + this.usageTick;
  }
  handleUsagesChanged() {
    this.usageTick += 1;
    this.loadBadges();
  }
  loadBadges() {
    const id = this.recordId;
    if (!id || !this.showSurgeon) {
      this.badges = undefined;
      return;
    }
    getBadges({ dealId: id })
      .then((b) => {
        if (id === this.recordId) this.badges = b || undefined;
      })
      .catch(() => {
        // the badges are a convenience: without them the buttons just show no badge
      });
  }
  /** The surgeries in the last 12 months, as a badge. */
  get casesBadge() {
    const b = this.badges;
    if (!b || !b.surgeonId) return null;
    return { text: String(b.booked), cls: "badge" };
  }
  get layerCls() {
    return this.panelOn ? "layer on" : "layer";
  }
  get usagesBtnCls() {
    return this.panelOn && this.panel === "usages" ? "btn nav on" : "btn nav";
  }
  get casesBtnCls() {
    return this.panelOn && this.panel === "cases" ? "btn nav on" : "btn nav";
  }
  get panelTitle() {
    return this.panel === "cases" ? "MyCase bookings" : "Surgeon usages";
  }
  get panelSubtitle() {
    return (this._deal && this._deal.hcp) || "";
  }
  /** Opens a panel (put on the page first, switched on a moment later so the slide runs), or swaps to it if another is open. */
  openPanel(kind) {
    clearTimeout(this.panelTimer);
    this.usageAction = null;
    this.panel = kind;
    if (this.panelMounted && this.panelOn) return;
    this.panelMounted = true;
    this.panelOn = false;
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    this.panelTimer = setTimeout(() => {
      this.panelOn = true;
    }, SLIDE_IN_DELAY_MS);
  }
  /** Closes the panel: switched off first, taken off the page once it has slid away. */
  closePanel() {
    if (!this.panelMounted) return;
    this.usageAction = null;
    clearTimeout(this.panelTimer);
    this.panelOn = false;
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    this.panelTimer = setTimeout(() => {
      this.panelMounted = false;
      this.panel = "";
    }, SLIDE_OUT_MS);
  }
  resetPanel() {
    clearTimeout(this.panelTimer);
    this.usageAction = null;
    this.panelOn = false;
    this.panelMounted = false;
    this.panel = "";
  }
  handleUsagesButton() {
    if (this.panelOn && this.panel === "usages") this.closePanel();
    else this.openPanel("usages");
  }
  handleCasesButton() {
    if (this.panelOn && this.panel === "cases") this.closePanel();
    else this.openPanel("cases");
  }
  handlePanelClose() {
    this.closePanel();
  }
  disconnectedCallback() {
    clearTimeout(this.panelTimer);
  }
  get flyCls() {
    return this.open ? "fly on" : "fly";
  }

  @api
  get deal() {
    return this._deal;
  }
  set deal(value) {
    if (!this._deal || !value || this._deal.id !== value.id) {
      this.draft = {};
      this.draftNames = {};
      this.errors = [];
      this.savedMsg = false;
      this.confirming = false;
    }
    const changed = !this._deal || !value || this._deal.id !== value.id;
    this._deal = value;
    if (changed) {
      this.badges = undefined;
      this.loadBadges();
    }
  }

  get showSurgeon() {
    return this.kind !== "rosa";
  }
  /** The deal's own area for the usage ratings: Hip, Knee, Shoulder (Extremities) or CMF. */
  get area() {
    return (
      { Hip: "Hip", Knee: "Knee", Extremities: "Shoulder", CMFT: "CMF" }[
        this._deal && this._deal.segment
      ] || ""
    );
  }
  get ownerName() {
    return (this._deal && this._deal.ownerName) || "";
  }
  get country() {
    return (this._deal && this._deal.ownerCountry) || "";
  }
  /** A manager looking at someone else's deal may ask the rep to check the usages. */
  get canAsk() {
    return !!(
      this.isManager &&
      this._deal &&
      this._deal.ownerId !== this.viewerId
    );
  }
  get isRep() {
    return !this.isManager;
  }
  handleAskCheck() {
    const d = this._deal;
    const chatter = this.template.querySelector("c-pipeline-chatter");
    if (chatter && d) {
      chatter.prefill(
        `@${d.ownerName} could you please check ${d.hcp}'s usages? They were last updated a while ago and the rating may be out of date.`
      );
    }
  }

  /**
   * Salesforce's page puts a text box's value on as an attribute, which a text box does not show, so the Background
   * Information (and any other text box) would stay blank. Its value is set here as a property instead; a box the
   * person is typing in is left alone, and what they have typed (not yet kept) is shown in preference to the record's.
   */
  renderedCallback() {
    this.template.querySelectorAll("textarea[data-api]").forEach((box) => {
      if (this.template.activeElement === box) return;
      const want = this.valueOf(box.dataset.api);
      const text = want === null || want === undefined ? "" : String(want);
      if (box.value !== text) box.value = text;
    });
  }

  get recordId() {
    return this._deal ? this._deal.id : undefined;
  }
  get kind() {
    return this._deal ? this._deal.kind : "opp";
  }
  get optionalFields() {
    const out = FIELDS[this.kind].map((f) => `SalesRisks__c.${f[0]}`);
    FIELDS[this.kind]
      .filter((f) => f[2] === "lookup")
      .forEach((f) =>
        out.push(`SalesRisks__c.${f[0].replace(/__c$/, "__r")}.Name`)
      );
    return out;
  }

  @wire(getObjectInfo, { objectApiName: SALESRISKS }) objectInfo;
  @wire(getRecord, {
    recordId: "$recordId",
    fields: [RECORD_TYPE],
    optionalFields: "$optionalFields"
  })
  record;
  @wire(getPicklistValuesByRecordType, {
    objectApiName: SALESRISKS,
    recordTypeId: "$recordTypeId"
  })
  picklists;

  get recordTypeId() {
    return this.record && this.record.data
      ? this.record.data.recordTypeId
      : undefined;
  }
  get fieldsLoaded() {
    return !!(this.record && this.record.data);
  }
  current(fieldName) {
    const f =
      this.record && this.record.data && this.record.data.fields[fieldName];
    return f ? f.value : null;
  }
  valueOf(fieldName) {
    return fieldName in this.draft
      ? this.draft[fieldName]
      : this.current(fieldName);
  }
  choices(fieldName) {
    const all = this.picklists && this.picklists.data;
    const f =
      all && all.picklistFieldValues && all.picklistFieldValues[fieldName];
    return f ? f.values : null;
  }
  updateable(fieldName) {
    const info = this.objectInfo && this.objectInfo.data;
    return !!(
      info &&
      info.fields[fieldName] &&
      info.fields[fieldName].updateable
    );
  }

  /* ----- header ----- */
  get title() {
    const d = this._deal || {};
    return (this.kind === "rosa" ? d.facility : d.hcp) || d.name || "";
  }
  get subtitle() {
    const d = this._deal || {};
    const seg = this.kind === "opp" && d.segment ? d.segment + " " : "";
    return seg + KIND_NAME[this.kind];
  }
  get positionText() {
    return `${this.index + 1} of ${this.total}`;
  }
  get noPrev() {
    return this.index <= 0;
  }
  get noNext() {
    return this.index >= this.total - 1;
  }
  get stageNow() {
    return this.valueOf("Stage__c") || (this._deal && this._deal.stage);
  }
  get pathSteps() {
    const ends = ENDS[this.kind];
    const values = (this.choices("Stage__c") || []).map((v) => v.value);
    const open = values.filter((v) => v !== ends.won && v !== ends.lost);
    const now = this.stageNow;
    const isLost = now === ends.lost;
    const steps = open.slice();
    if (!values.length) steps.push(now);
    else if (values.includes(ends.won) || isLost)
      steps.push(isLost ? ends.lost : ends.won);
    const cur = steps.indexOf(now);
    const curColour = isLost
      ? "var(--bad)"
      : cur === steps.length - 1
        ? "#16a34a"
        : STAGE_COLOURS[Math.max(cur, 0) % STAGE_COLOURS.length];
    return steps.map((value, i) => {
      let cls = "pstep" + (i < cur ? " done" : i === cur ? " cur" : "");
      if (i === 0) cls += " first";
      if (i === steps.length - 1) cls += " last";
      let style = `--ring:${curColour}`;
      if (i === cur) {
        if (isLost) cls += " lost";
        else style += `;background:${curColour}`;
      }
      return { value, cls, style };
    });
  }
  get strip() {
    const d = this._deal || {};
    const now = Date.now();
    const posted = chatterDays(d, now);
    const moved = stageDays(d, now);
    const quiet = d.isClosed || d.onHold;
    return [
      { label: "Owner", value: d.ownerName || "–" },
      {
        label: VALUE_LABEL[this.kind],
        value: formatMoney(d.value, d.currencyCode)
      },
      { label: "Close quarter", value: d.quarter || "–" },
      {
        label: "Last posted",
        value: quiet ? "–" : posted === null ? "–" : `${posted} d`,
        tag: !quiet && posted !== null,
        tagCls: `tag ${chatterBand(posted)}`
      },
      {
        label: "Last stage move",
        value: quiet ? "–" : moved === null ? "–" : `${moved} d`,
        tag: !quiet && moved !== null,
        tagCls: `tag ${stageBand(moved)}`
      },
      { label: "Deal age", value: `${ageDays(d, now) ?? "–"} d` },
      {
        label: "Status",
        value: d.isClosed ? "Closed" : d.onHold ? "On hold" : "Open"
      }
    ];
  }

  /* ----- fields ----- */
  /**
   * The rows of the form. The closing year sits in the same box as the closing quarter (two lists side by side) when
   * the person can edit both, so a quarter is never picked without seeing its year; with no edit access to the year it
   * stays a row of its own, read only.
   */
  get fieldRows() {
    const rows = this.rawFieldRows;
    const quarter = rows.find((r) => r.api === QUARTER_FIELD);
    const year = rows.find((r) => r.api === YEAR_FIELD);
    if (!(quarter && year && quarter.isSelect && year.isSelect)) return rows;
    quarter.pair = year;
    quarter.label = "Expected closing quarter and year";
    quarter.cls =
      "field paired" +
      (QUARTER_FIELD in this.draft || YEAR_FIELD in this.draft
        ? " changed"
        : "");
    return rows.filter((r) => r !== year);
  }
  get rawFieldRows() {
    if (!this.fieldsLoaded) return [];
    return FIELDS[this.kind].map(([fieldName, label, type, req, wide]) => {
      const value = this.valueOf(fieldName);
      const choices = this.choices(fieldName);
      const editable = type !== "readonly" && this.updateable(fieldName);
      const row = {
        api: fieldName,
        label,
        req: !!req,
        value: value === null || value === undefined ? "" : value,
        cls:
          "field" +
          (wide ? " wide" : "") +
          (fieldName in this.draft ? " changed" : "")
      };
      let control = editable ? type : "readonly";
      if ((control === "picklist" || control === "multi") && !choices)
        control = "readonly";
      if (control === "picklist") {
        const list = choices.map((c) => ({ value: c.value, label: c.label }));
        if (value && !list.some((c) => c.value === value))
          list.unshift({ value, label: value });
        if (!req) list.unshift({ value: "", label: "–" });
        row.options = list.map((o) => ({
          ...o,
          selected: o.value === (value || "")
        }));
        row.isSelect = true;
      } else if (control === "multi") {
        const on = value ? String(value).split(";") : [];
        row.options = choices.map((c) => ({
          value: c.value,
          label: c.label,
          cls: "pill" + (on.includes(c.value) ? " on" : "")
        }));
        row.isMulti = true;
      } else if (control === "lookup") {
        row.isLookup = true;
        row.lookupName = this.lookupName(fieldName);
      } else if (control === "number") {
        row.isNumber = true;
      } else if (control === "date") {
        row.isDate = true;
      } else if (control === "bool") {
        row.isBool = true;
        row.text = value ? "Yes" : "No";
        row.togCls = "tog" + (value ? " on" : "");
      } else if (control === "textarea") {
        row.isTextarea = true;
      } else {
        row.isReadOnly = true;
        row.text = this.readText(fieldName, type, value);
      }
      return row;
    });
  }
  readText(fieldName, type, value) {
    if (type === "lookup") return this.lookupName(fieldName) || "–";
    if (value === null || value === undefined || value === "") return "–";
    if (type === "bool") return value ? "Yes" : "No";
    if (fieldName === "AmountPerYear__c" || fieldName === "ROSAGrowthDollar__c")
      return formatMoney(
        value,
        this.valueOf("CurrencyIsoCode") ||
          (this._deal && this._deal.currencyCode)
      );
    return String(value).split(";").join(", ");
  }

  /** The name to show for a lookup field: one just picked, else the record's own related name. */
  lookupName(fieldName) {
    if (fieldName in this.draftNames) return this.draftNames[fieldName];
    const rel =
      this.record &&
      this.record.data &&
      this.record.data.fields[fieldName.replace(/__c$/, "__r")];
    const name = rel && rel.value && rel.value.fields && rel.value.fields.Name;
    return name ? name.value : "";
  }
  handleLookup(event) {
    const fieldName = event.currentTarget.dataset.api;
    this.draftNames = { ...this.draftNames, [fieldName]: event.detail.name };
    this.setDraft(fieldName, event.detail.id);
  }
  setDraft(fieldName, value) {
    const original = this.current(fieldName);
    const same =
      typeof value === "boolean"
        ? !!original === value
        : String(original ?? "") === String(value ?? "");
    const next = { ...this.draft };
    if (same) delete next[fieldName];
    else next[fieldName] = value;
    this.draft = next;
    this.savedMsg = false;
    this.errors = [];
  }
  handleSelect(event) {
    const field = event.target.dataset.api;
    this.setDraft(field, event.target.value);
    if (field === QUARTER_FIELD) this.suggestYearFor(event.target.value);
  }
  /**
   * Picking a quarter fills in its year when there is none yet, or when the year it has would put the quarter in the
   * past (the next occurrence of the quarter; see suggestYear). A year the person has already chosen that is still
   * current or ahead is left alone. The person can change the year afterwards.
   */
  suggestYearFor(quarter) {
    const yearField = YEAR_FIELD;
    if (!quarter || !this.updateable(yearField)) return;
    const year = this.valueOf(yearField);
    const want = String(suggestYear(quarter));
    const offered = (this.choices(yearField) || []).some(
      (c) => c.value === want
    );
    if ((!year || quarterIsPast(quarter, year)) && offered)
      this.setDraft(yearField, want);
  }
  handleText(event) {
    this.setDraft(event.target.dataset.api, event.target.value);
  }
  handleNumber(event) {
    const v = event.target.value;
    this.setDraft(event.target.dataset.api, v === "" ? "" : Number(v));
  }
  handleBool(event) {
    const fieldName = event.currentTarget.dataset.api;
    this.setDraft(fieldName, !this.valueOf(fieldName));
  }
  handleMulti(event) {
    const { api: fieldName, value } = event.currentTarget.dataset;
    const on = this.valueOf(fieldName)
      ? String(this.valueOf(fieldName)).split(";")
      : [];
    const next = on.includes(value)
      ? on.filter((x) => x !== value)
      : [...on, value];
    this.setDraft(fieldName, next.join(";"));
  }
  handlePathStep(event) {
    if (!this.updateable("Stage__c")) return;
    this.setDraft("Stage__c", event.currentTarget.dataset.value);
  }

  /* ----- saving ----- */
  get clean() {
    return Object.keys(this.draft).length === 0;
  }
  get cantSave() {
    return this.clean || this.saving;
  }
  get hasErrors() {
    return this.errors.length > 0;
  }
  handleSave() {
    const fields = { Id: this.recordId };
    Object.entries(this.draft).forEach(([k, v]) => {
      fields[k] = v === "" ? null : v;
    });
    this.saving = true;
    this.errors = [];
    updateRecord({ fields })
      .then(() => {
        this.draft = {};
        this.draftNames = {};
        this.savedTick += 1;
        this.loadBadges();
        this.savedMsg = true;
        getRecordNotifyChange([{ recordId: this.recordId }]);
        this.dispatchEvent(new CustomEvent("dealsaved"));
      })
      .catch((e) => {
        this.errors = parseErrors(e);
      })
      .finally(() => {
        this.saving = false;
      });
  }
  handleCancel() {
    this.draft = {};
    this.draftNames = {};
    this.errors = [];
  }
  handlePosted() {
    this.dispatchEvent(new CustomEvent("dealsaved"));
  }

  /* ----- leaving: with unsaved changes, ask first ----- */
  request(action) {
    if (!this.clean) {
      this.pending = action;
      this.confirming = true;
      return;
    }
    this.dispatchEvent(new CustomEvent(action));
  }
  handleClose() {
    this.request("close");
  }
  handleScrim() {
    this.request("close");
  }
  handlePrev() {
    this.request("prev");
  }
  handleNext() {
    this.request("next");
  }
  handleKeepEditing() {
    this.confirming = false;
    this.pending = "";
  }
  handleDiscard() {
    const action = this.pending;
    this.draft = {};
    this.draftNames = {};
    this.confirming = false;
    this.pending = "";
    this.dispatchEvent(new CustomEvent(action));
  }
  handleOpenRecord() {
    const e = new CustomEvent("pipelineopenrecord", {
      detail: JSON.stringify({ recordId: this.recordId }),
      bubbles: true,
      composed: true,
      cancelable: true
    });
    if (this.dispatchEvent(e)) {
      window.open(
        "/lightning/r/SalesRisks__c/" + this.recordId + "/view",
        "_blank",
        "noopener"
      );
    }
  }
}
