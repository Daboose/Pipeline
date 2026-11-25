import { LightningElement, api, wire } from "lwc";
import {
  getObjectInfo,
  getPicklistValuesByRecordType
} from "lightning/uiObjectInfoApi";
import { createRecord, getRecord } from "lightning/uiRecordApi";
import SALESRISKS from "@salesforce/schema/SalesRisks__c";
import USER_NAME from "@salesforce/schema/User.Name";
import USER_ID from "@salesforce/user/Id";
import USER_CURRENCY from "@salesforce/i18n/currency";
import searchOwners from "@salesforce/apex/PipelineFilterController.searchOwners";
import setLink from "@salesforce/apex/PipelineDealCampaignController.setLink";
import { suggestYear, quarterIsPast, STAGE_ENDS } from "c/pipelineFormat";
import {
  newDealTypes,
  recordTypesFor,
  createFields
} from "c/pipelineMobileModel";

const QUARTER = "Expected_Closure_Quarter__c";
const YEAR = "Expected_Closing_Year__c";
const OWNER_MIN = 2; // letters before the owner search is made, as for every search in Pipeline
const OWNER_WAIT_MS = 300;
const YES_NO = [
  { value: "no", label: "No" },
  { value: "yes", label: "Yes", tone: "good" }
];
/** The two switches of a ROSA deal: [field, label]. */
const FLAGS = [
  ["Priority__c", "Rep priority"],
  ["State_Priority__c", "State priority"]
];
/** The three platform lists: [field, label]. */
const PLATFORMS = [
  ["ROSA_Platform_Shoulder_Stage__c", "ROSA Platform: Shoulder"],
  ["ROSA_Platform_Hip_Stage__c", "ROSA Platform: Hip"],
  ["ROSA_Platform_Partial_Knee__c", "ROSA Platform: Partial Knee"]
];

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
  if (!out.length) out.push("The deal could not be created.");
  return out.map((text, key) => ({ key, text }));
}

/**
 * Pipeline: the New Deal screen of the facility flyout (Robert, 2026-11-25; mockup docs/mockups/pipeline_new_rosa_deal_v1.html). It is shown
 * for a healthcare facility with "No deal yet" in the campaign list and makes a ROSA deal for it. A ROSA deal has no portfolio: the country
 * alone decides the record type, so the country is asked first when the person works in more than one (and taken at once when in one), and
 * the form appears once it is known. The form follows the ROSA deal screen: the stage slider, the Healthcare facility (the facility the flyout
 * is for, changeable), the optional Primary HCP, the ROSA deal type, the ROSA sales types (one or more), the ROSA growth value and currency,
 * the owner (the person using Pipeline, changeable), the expected closing quarter and year (never before the current quarter), the install and
 * close dates, the three platform lists, the Rep and State priority switches and the background information. Mandatory: the facility, the ROSA
 * growth value, the owner, and the closing quarter and year. Every list of choices is read from Salesforce for the record type, never typed here.
 *
 * Save makes the record with Salesforce's own record service as the signed-in person (field access, the quarter rule and the deal's existing
 * automations run as on the standard page), then puts the deal into the campaign being looked at (PipelineDealCampaignController.setLink; a
 * ROSA deal joins through its facility), then tells its host ("created", with the new deal's Id, and a message if the deal was made but could
 * not join the campaign). Whatever Salesforce refuses is shown above the form and nothing is lost. Cancel says "cancel". Used by
 * pipelineSurgeonFlyout, the flyout shared with the surgeon's New Deal (pipelineNewDeal, which this does not change).
 */
export default class PipelineNewRosaDeal extends LightningElement {
  /** The facility: the Healthcare Facility starts as this account. */
  @api accountId = "";
  @api accountName = "";
  /** The campaign the facility was listed in: the new deal is put into it. */
  @api campaignId = "";

  country = ""; // the two-letter code chosen; with only one country it is taken at once
  draft = {};
  fac = null; // { id, name }
  facTouched = false; // the person changed it, so a later read of the host's facility must not overwrite it
  hcp = null; // { id, name }, optional
  owner = null; // { id, name }
  ownerOpen = false;
  ownerTerm = "";
  ownerHits = [];
  ownerSearched = false;
  errors = [];
  saving = false;
  picklistData;
  timer;

  @wire(getObjectInfo, { objectApiName: SALESRISKS }) objectInfo;
  @wire(getRecord, { recordId: USER_ID, fields: [USER_NAME] })
  wiredUser({ data }) {
    if (data && !this.owner)
      this.owner = { id: USER_ID, name: data.fields.Name.value };
  }
  @wire(getPicklistValuesByRecordType, {
    objectApiName: SALESRISKS,
    recordTypeId: "$recordTypeId"
  })
  wiredPicklists({ data }) {
    this.picklistData = data;
    if (data) this.applyDefaults(data);
  }

  connectedCallback() {
    this.takeFacility();
  }
  disconnectedCallback() {
    clearTimeout(this.timer);
  }
  renderedCallback() {
    this.template.querySelectorAll("textarea[data-api]").forEach((box) => {
      if (this.template.activeElement === box) return;
      const text = this.draft[box.dataset.api] || "";
      if (box.value !== text) box.value = text;
    });
  }
  takeFacility() {
    if (!this.facTouched && this.accountId)
      this.fac = { id: this.accountId, name: this.accountName };
  }

  /* ----- the record type: the country alone ----- */
  get types() {
    const infos =
      this.objectInfo &&
      this.objectInfo.data &&
      this.objectInfo.data.recordTypeInfos;
    return newDealTypes(infos).filter((t) => t.kind === "rosa");
  }
  get countries() {
    return [...new Set(this.types.map((t) => t.country))].sort();
  }
  /** The country in use: the one chosen if it is offered, else the only one there is, else none yet. */
  get effectiveCountry() {
    if (this.countries.includes(this.country)) return this.country;
    return this.countries.length === 1 ? this.countries[0] : "";
  }
  get countryOptions() {
    return this.countries.map((c) => ({
      value: c,
      label: c,
      selected: c === this.effectiveCountry
    }));
  }
  get askCountry() {
    return this.countries.length > 1;
  }
  /** The top card: the country (when there is a choice), the record type and, once it is known, the stage slider on the right. */
  get showHead() {
    return this.askCountry || this.ready;
  }
  get noCountry() {
    return !this.effectiveCountry;
  }
  get recordType() {
    if (!this.effectiveCountry) return null;
    return (
      recordTypesFor(this.types, "rosa", "").find(
        (t) => t.country === this.effectiveCountry
      ) || null
    );
  }
  get recordTypeId() {
    return this.recordType ? this.recordType.id : undefined;
  }
  /** The form appears once the country (so the record type) is known. */
  get ready() {
    return !!this.recordType;
  }
  get typeName() {
    return this.recordType ? "Record type: " + this.recordType.name : "";
  }
  get noTypes() {
    return !!(this.objectInfo && this.objectInfo.data) && !this.types.length;
  }
  handleCountry(event) {
    this.country = event.target.value;
    // a different record type means different lists, so the stage and the choices start again; what was written about the deal stays
    const next = { ...this.draft };
    ["Stage__c", "ROSA_Deal_Type__c", "ROSA_Sales_Type__c"]
      .concat(PLATFORMS.map((p) => p[0]))
      .forEach((f) => delete next[f]);
    this.draft = next;
    this.errors = [];
  }

  /* ----- the stage: the slider of the deal screen, the open stages then the winning and the losing one ----- */
  stageSteps(values) {
    const ends = STAGE_ENDS.rosa;
    const open = values.filter((v) => v !== ends.won && v !== ends.lost);
    const closing = [ends.won, ends.lost].filter((v) => values.includes(v));
    return [...open, ...closing];
  }
  get stages() {
    return this.stageSteps(this.choices("Stage__c").map((v) => v.value));
  }
  get hasStages() {
    return this.stages.length > 0;
  }
  get showStage() {
    return this.ready && this.hasStages;
  }
  get stageWon() {
    return STAGE_ENDS.rosa.won;
  }
  get stageLost() {
    return STAGE_ENDS.rosa.lost;
  }
  get stageNow() {
    return this.draft.Stage__c || "";
  }
  handleStage(event) {
    this.setDraft("Stage__c", event.detail.value);
  }

  /* ----- the fields ----- */
  choices(field) {
    const all = this.picklistData;
    const f = all && all.picklistFieldValues && all.picklistFieldValues[field];
    return f ? f.values : [];
  }
  options(field) {
    return this.choices(field).map((v) => ({
      value: v.value,
      label: v.label || v.value,
      selected: v.value === this.draft[field]
    }));
  }
  /** The stage starts at the record type's own default (else its first open stage); the currency starts as the person's own when offered. */
  applyDefaults(data) {
    const f = data.picklistFieldValues || {};
    if (!("Stage__c" in this.draft) && f.Stage__c) {
      const def = f.Stage__c.defaultValue && f.Stage__c.defaultValue.value;
      const first = this.stageSteps(f.Stage__c.values.map((v) => v.value))[0];
      if (def || first) this.draft = { ...this.draft, Stage__c: def || first };
    }
    if (!("CurrencyIsoCode" in this.draft) && f.CurrencyIsoCode) {
      const offered = f.CurrencyIsoCode.values.map((v) => v.value);
      const def =
        f.CurrencyIsoCode.defaultValue && f.CurrencyIsoCode.defaultValue.value;
      const own = offered.includes(USER_CURRENCY) ? USER_CURRENCY : def;
      if (own) this.draft = { ...this.draft, CurrencyIsoCode: own };
    }
  }
  setDraft(field, value) {
    this.draft = { ...this.draft, [field]: value };
    this.errors = [];
  }
  handleSelect(event) {
    this.setDraft(event.target.dataset.api, event.target.value);
  }
  handleText(event) {
    this.setDraft(event.target.dataset.api, event.target.value);
  }
  get dealTypeOptions() {
    return this.options("ROSA_Deal_Type__c");
  }
  get dealTypeNone() {
    return !this.draft.ROSA_Deal_Type__c;
  }
  get platforms() {
    return PLATFORMS.map(([field, label]) => ({
      api: field,
      label,
      none: !this.draft[field],
      options: this.options(field)
    }));
  }
  get currencyOptions() {
    return this.options("CurrencyIsoCode");
  }

  /** The sales types: one or more of Hip, Knee, Shoulder, held as Salesforce holds them ("Hip;Knee"). */
  get salesChoices() {
    const on = (this.draft.ROSA_Sales_Type__c || "").split(";").filter(Boolean);
    return this.choices("ROSA_Sales_Type__c").map((v) => ({
      value: v.value,
      label: v.label || v.value,
      cls: on.includes(v.value) ? "chip on" : "chip"
    }));
  }
  get hasSales() {
    return this.salesChoices.length > 0;
  }
  handleSales(event) {
    const value = event.currentTarget.dataset.value;
    const on = (this.draft.ROSA_Sales_Type__c || "").split(";").filter(Boolean);
    const next = on.includes(value)
      ? on.filter((x) => x !== value)
      : [...on, value];
    this.setDraft("ROSA_Sales_Type__c", next.join(";"));
  }

  /** The value is a number: only digits and a point are kept as typed; it becomes a number when the deal is saved. */
  handleValue(event) {
    const v = event.target.value.replace(/[^0-9.]/g, "");
    if (v !== event.target.value) event.target.value = v;
    this.setDraft("ROSAGrowthDollar__c", v);
  }
  get value() {
    const v = this.draft.ROSAGrowthDollar__c;
    return v === undefined || v === null ? "" : String(v);
  }
  get installDate() {
    return this.draft.Install_Date__c || "";
  }
  get closeDate() {
    return this.draft.Close_Date__c || "";
  }
  handleDate(event) {
    this.setDraft(event.target.dataset.api, event.target.value);
  }
  get year() {
    return this.draft[YEAR] || "";
  }
  get quarter() {
    return this.draft[QUARTER] || "";
  }
  /** Quarters from the current one on: with a year chosen, a quarter before the current quarter is not offered (the rule Salesforce applies on save). */
  get quarterOptions() {
    return this.choices(QUARTER)
      .filter((v) => !quarterIsPast(v.value, this.year))
      .map((v) => ({
        value: v.value,
        label: v.label || v.value,
        selected: v.value === this.quarter
      }));
  }
  get yearOptions() {
    const thisYear = new Date().getFullYear();
    return this.choices(YEAR)
      .filter((v) => Number(v.value) >= thisYear)
      .map((v) => ({
        value: v.value,
        label: v.label || v.value,
        selected: v.value === this.year
      }));
  }
  get quarterNone() {
    return !this.quarter;
  }
  get yearNone() {
    return !this.year;
  }
  handleQuarter(event) {
    const q = event.target.value;
    const next = { ...this.draft, [QUARTER]: q };
    // picking a quarter fills in its year when there is none, or when the year chosen would put the quarter in the past
    const offered = this.choices(YEAR).some(
      (c) => c.value === String(suggestYear(q))
    );
    if (q && (!next[YEAR] || quarterIsPast(q, next[YEAR])) && offered)
      next[YEAR] = String(suggestYear(q));
    this.draft = next;
    this.errors = [];
  }
  handleYear(event) {
    const y = event.target.value;
    const next = { ...this.draft, [YEAR]: y };
    // a quarter that is now in the past is taken away rather than left to be refused
    if (next[QUARTER] && quarterIsPast(next[QUARTER], y)) delete next[QUARTER];
    this.draft = next;
    this.errors = [];
  }
  get flags() {
    return FLAGS.map(([field, label]) => ({
      api: field,
      label,
      options: YES_NO,
      value: this.draft[field] ? "yes" : "no"
    }));
  }
  handleFlag(event) {
    this.setDraft(
      event.currentTarget.dataset.api,
      event.detail.value === "yes"
    );
  }
  get background() {
    return this.draft.Objective__c || "";
  }

  /* ----- the facility, the physician, the owner ----- */
  get facId() {
    return this.fac ? this.fac.id : "";
  }
  get facName() {
    return this.fac ? this.fac.name : "";
  }
  handleFacility(event) {
    this.facTouched = true;
    this.fac = event.detail.id
      ? { id: event.detail.id, name: event.detail.name }
      : null;
    this.errors = [];
  }
  get hcpId() {
    return this.hcp ? this.hcp.id : "";
  }
  get hcpName() {
    return this.hcp ? this.hcp.name : "";
  }
  handleHcp(event) {
    this.hcp = event.detail.id
      ? { id: event.detail.id, name: event.detail.name }
      : null;
  }
  get ownerName() {
    return this.owner ? this.owner.name : "";
  }
  get ownerIsMe() {
    return !!this.owner && this.owner.id === USER_ID;
  }
  get showOwnerChip() {
    return !!this.owner && !this.ownerOpen;
  }
  get ownerNone() {
    return this.ownerSearched && this.ownerHits.length === 0;
  }
  get showOwnerList() {
    return this.ownerSearched && this.ownerTerm.trim().length >= OWNER_MIN;
  }
  handleOwnerOpen() {
    this.ownerOpen = true;
    this.ownerTerm = "";
    this.ownerHits = [];
    this.ownerSearched = false;
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    setTimeout(() => {
      const input = this.template.querySelector("input.ownerin");
      if (input) input.focus();
    }, 0);
  }
  handleOwnerTerm(event) {
    this.ownerTerm = event.target.value;
    clearTimeout(this.timer);
    const t = this.ownerTerm;
    if (t.trim().length < OWNER_MIN) {
      this.ownerHits = [];
      this.ownerSearched = false;
      return;
    }
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    this.timer = setTimeout(() => {
      searchOwners({ term: t })
        .then((rows) => {
          if (t === this.ownerTerm) {
            this.ownerHits = rows.map((r) => ({
              id: r.id,
              name: r.name,
              sub: r.title || ""
            }));
            this.ownerSearched = true;
          }
        })
        .catch(() => {
          if (t === this.ownerTerm) {
            this.ownerHits = [];
            this.ownerSearched = true;
          }
        });
    }, OWNER_WAIT_MS);
  }
  handleOwnerPick(event) {
    const { id, name } = event.currentTarget.dataset;
    this.owner = { id, name };
    this.ownerOpen = false;
  }
  handleOwnerCancel() {
    this.ownerOpen = false;
  }

  /* ----- what is still to fill in, and saving ----- */
  get missing() {
    if (!this.recordType) return ["Country"];
    const out = [];
    if (!this.fac) out.push("Healthcare facility");
    if (this.value === "") out.push("ROSA growth $");
    if (!this.owner) out.push("Owner");
    if (!this.quarter || !this.year) out.push("Closing quarter and year");
    return out;
  }
  get footNote() {
    if (this.saving) return "Creating the deal…";
    if (!this.recordType) return "Choose the country to start.";
    return this.missing.length
      ? "Still to fill in: " + this.missing.join(", ") + "."
      : "Ready to save. The deal will be added to the campaign.";
  }
  get cantSave() {
    return this.saving || this.missing.length > 0;
  }
  get hasErrors() {
    return this.errors.length > 0;
  }
  get saveWord() {
    return this.saving ? "Creating…" : "Save deal";
  }
  handleCancel() {
    this.dispatchEvent(new CustomEvent("cancel"));
  }
  async handleSave() {
    if (this.cantSave) return;
    this.saving = true;
    this.errors = [];
    const fields = createFields(
      {
        ...this.draft,
        ROSAGrowthDollar__c: Number(this.draft.ROSAGrowthDollar__c),
        Healthcare_Facility__c: this.fac.id,
        Account__c: this.hcp ? this.hcp.id : "",
        OwnerId: this.owner.id
      },
      this.recordType.id
    );
    let id;
    try {
      const res = await createRecord({
        apiName: SALESRISKS.objectApiName,
        fields
      });
      id = res.id;
    } catch (e) {
      this.errors = parseErrors(e);
      this.saving = false;
      return;
    }
    // the deal is made; it now joins the campaign the person is looking at. If that fails the deal still exists, and the host says so.
    let linkError = "";
    try {
      if (this.campaignId)
        await setLink({
          dealId: id,
          campaignId: this.campaignId,
          linked: true
        });
    } catch (e) {
      linkError = parseErrors(e)
        .map((x) => x.text)
        .join(" ");
    }
    this.saving = false;
    this.dispatchEvent(
      new CustomEvent("created", { detail: { id, linkError } })
    );
  }
}
