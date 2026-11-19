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
const PORTFOLIOS = ["Hip", "Knee", "Extremities", "CMFT"];
const OWNER_MIN = 2; // letters before the owner search is made, as for every search in Pipeline
const OWNER_WAIT_MS = 300;
const YES_NO = [
  { value: "no", label: "No" },
  { value: "yes", label: "Yes", tone: "good" }
];
const YES_NO_WARN = [
  { value: "no", label: "No" },
  { value: "yes", label: "Yes", tone: "warn" }
];
/** The switches of an implant opportunity, as the deal screen has them: [field, label, the options]. MyMobility's stage shows only while it is Yes. */
const FLAGS = [
  ["OnHold__c", "On hold", YES_NO_WARN],
  ["Priority__c", "Rep priority", YES_NO],
  ["State_Priority__c", "State priority", YES_NO],
  ["myMo__c", "MyMobility", YES_NO]
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
 * Pipeline: the New Deal screen of the surgeon flyout (Robert, 2026-11-19; mockup docs/mockups/pipeline_new_deal_v1.html). It is shown for a
 * surgeon with "No deal yet" in the campaign list, and makes an implant opportunity for them. The record type is a choice: the portfolio
 * (Hip, Knee, Extremities, CMFT; only the ones this person has a record type for) and, when the person works in more than one country, the
 * country. The owner starts as the person using Pipeline and can be changed (a manager may be creating the deal for someone else); the
 * currency starts as the person's own and can be changed. Mandatory: the Primary HCP (the surgeon, changeable), the portfolio, the expected
 * closing quarter and year (never before the current quarter), the expected annual value and at least one brand (the units / cases is optional). The lists of
 * choices (stage, quarter, year, currency, brand, MyMobility stage) are read from Salesforce for the record type, never typed in here. The stage
 * is picked on the same slider as the deal screen (it starts at the record type's default). The screen starts with only the portfolio and
 * the country (side by side; the country is a small two-letter list, taken at once when the person has one country); the rest appears once
 * both are chosen. Order, as Robert asked: the portfolio and country, the stage, the surgeon and hospital, the closing quarter and year, the value, the units / cases (optional) and the owner; then the brand and
 * the four switches; the background information sits on the right, where Chatter is on an existing deal.
 *
 * Save makes the record with Salesforce's own record service as the signed-in person (field access, the quarter rule and the deal's existing
 * automations all run as on the standard page), then puts the deal into the campaign being looked at (PipelineDealCampaignController.setLink),
 * then tells its host ("created", with the new deal's Id, and a message if the deal was made but could not join the campaign). Whatever
 * Salesforce refuses is shown above the form and nothing is lost. Cancel says "cancel". Used by pipelineSurgeonFlyout.
 */
export default class PipelineNewDeal extends LightningElement {
  /** The surgeon: the Primary HCP starts as this account. */
  @api accountId = "";
  @api accountName = "";
  /** The campaign the surgeon was listed in: the new deal is put into it. */
  @api campaignId = "";

  port = "";
  country = ""; // the two-letter code chosen; with only one country it is taken at once
  draft = {};
  hcp = null; // { id, name }; null until the surgeon is read from the host
  hcpTouched = false; // the person changed it, so a later read of the host's surgeon must not overwrite it
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
      this.owner = {
        id: USER_ID,
        name: data.fields.Name.value
      };
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
    this.takeSurgeon();
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
  /** The Primary HCP is the surgeon the flyout is for, until the person picks another. */
  takeSurgeon() {
    if (!this.hcpTouched && this.accountId)
      this.hcp = { id: this.accountId, name: this.accountName };
  }

  /* ----- the record type: the portfolio, and the country when there is a choice ----- */
  get types() {
    const infos =
      this.objectInfo &&
      this.objectInfo.data &&
      this.objectInfo.data.recordTypeInfos;
    return newDealTypes(infos).filter((t) => t.kind === "opp");
  }
  get portfolioOptions() {
    return PORTFOLIOS.filter((p) =>
      this.types.some((t) => t.portfolio === p)
    ).map((p) => ({ value: p, label: p }));
  }
  /** The countries the person has a record type for (for the portfolio chosen, once there is one). */
  get countries() {
    const list = this.port
      ? recordTypesFor(this.types, "opp", this.port)
      : this.types;
    return [...new Set(list.map((t) => t.country))].sort();
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
  get noCountry() {
    return !this.effectiveCountry;
  }
  get recordType() {
    if (!this.port || !this.effectiveCountry) return null;
    return (
      recordTypesFor(this.types, "opp", this.port).find(
        (t) => t.country === this.effectiveCountry
      ) || null
    );
  }
  get recordTypeId() {
    return this.recordType ? this.recordType.id : undefined;
  }
  /** The rest of the screen appears once the portfolio and the country are chosen: the quarter, the stage and the lists all depend on the record type. */
  get ready() {
    return !!this.recordType;
  }
  get typeName() {
    return this.recordType ? "Record type: " + this.recordType.name : "";
  }
  get noTypes() {
    return !!(this.objectInfo && this.objectInfo.data) && !this.types.length;
  }
  handlePortfolio(event) {
    this.port = event.detail.value;
    this.resetForRecordType();
  }
  handleCountry(event) {
    this.country = event.target.value;
    this.resetForRecordType();
  }
  /** A different record type means different lists, so the stage and the brands start again; what was written about the deal stays. */
  resetForRecordType() {
    const next = { ...this.draft };
    delete next.Brand__c;
    delete next.Stage__c;
    this.draft = next;
    this.errors = [];
  }

  /* ----- the stage: the same slider as the deal screen, the open stages then the winning and the losing one ----- */
  stageSteps(values) {
    const ends = STAGE_ENDS.opp;
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
  get stageWon() {
    return STAGE_ENDS.opp.won;
  }
  get stageLost() {
    return STAGE_ENDS.opp.lost;
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
  /** The currency starts as the person's own (when the record type offers it), else Salesforce's default for the record type. */
  applyDefaults(data) {
    const f = data.picklistFieldValues || {};
    // the stage starts at the record type's own default, else its first open stage; the slider changes it
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
  get currencyOptions() {
    return this.choices("CurrencyIsoCode").map((v) => ({
      value: v.value,
      label: v.label || v.value,
      selected: v.value === this.draft.CurrencyIsoCode
    }));
  }
  handleSelect(event) {
    this.setDraft(event.target.dataset.api, event.target.value);
  }
  /** The value is a number; the units / cases field is text in Salesforce, so what is typed is sent as typed (digits only). */
  handleValue(event) {
    const v = event.target.value.replace(/[^0-9.]/g, "");
    if (v !== event.target.value) event.target.value = v;
    this.setDraft("AmountPerYear__c", v); // kept as typed; it becomes a number when the deal is saved
  }
  handleUnits(event) {
    const v = event.target.value.replace(/[^0-9]/g, "");
    if (v !== event.target.value) event.target.value = v;
    this.setDraft("UnitsCasesPerYear__c", v);
  }
  handleText(event) {
    this.setDraft(event.target.dataset.api, event.target.value);
  }
  get quarterNone() {
    return !this.quarter;
  }
  get yearNone() {
    return !this.year;
  }
  get value() {
    const v = this.draft.AmountPerYear__c;
    return v === undefined || v === null ? "" : String(v);
  }
  get units() {
    return this.draft.UnitsCasesPerYear__c || "";
  }
  get background() {
    return this.draft.Objective__c || "";
  }

  /* ----- the surgeon, the hospital, the owner ----- */
  get hcpId() {
    return this.hcp ? this.hcp.id : "";
  }
  get hcpName() {
    return this.hcp ? this.hcp.name : "";
  }
  handleHcp(event) {
    this.hcpTouched = true;
    this.hcp = event.detail.id
      ? { id: event.detail.id, name: event.detail.name }
      : null;
    this.errors = [];
  }
  get facilityId() {
    return this.draft.Healthcare_Facility__c || "";
  }
  get facilityName() {
    return this.draftFacilityName || "";
  }
  draftFacilityName = "";
  handleFacility(event) {
    this.draftFacilityName = event.detail.name;
    const next = { ...this.draft };
    if (event.detail.id) next.Healthcare_Facility__c = event.detail.id;
    else delete next.Healthcare_Facility__c;
    this.draft = next;
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

  /* ----- brand, the switches, background ----- */
  get brandChoices() {
    const on = (this.draft.Brand__c || "").split(";").filter(Boolean);
    return this.choices("Brand__c").map((v) => ({
      value: v.value,
      label: v.label || v.value,
      cls: on.includes(v.value) ? "chip on" : "chip"
    }));
  }
  get hasBrands() {
    return this.brandChoices.length > 0;
  }
  handleBrand(event) {
    const value = event.currentTarget.dataset.value;
    const on = (this.draft.Brand__c || "").split(";").filter(Boolean);
    const next = on.includes(value)
      ? on.filter((x) => x !== value)
      : [...on, value];
    this.setDraft("Brand__c", next.join(";"));
  }
  get flags() {
    return FLAGS.map(([field, label, options]) => ({
      api: field,
      label,
      options,
      value: this.draft[field] ? "yes" : "no"
    }));
  }
  handleFlag(event) {
    this.setDraft(
      event.currentTarget.dataset.api,
      event.detail.value === "yes"
    );
  }
  get showMyMoStage() {
    return !!this.draft.myMo__c;
  }
  get myMoStageOptions() {
    return this.choices("myMo_Stage__c").map((v) => ({
      value: v.value,
      label: v.label || v.value,
      selected: v.value === this.draft.myMo_Stage__c
    }));
  }

  /* ----- what is still to fill in, and saving ----- */
  /** The mandatory boxes still empty, by name (the same rules as editing a deal: the quarter and year are both needed, and at least one brand). */
  get missing() {
    const out = [];
    if (!this.port) out.push("Portfolio");
    if (!this.recordType) {
      if (this.port) out.push("Country");
      return out.length ? out : ["Portfolio and country"];
    }
    if (!this.stageNow) out.push("Stage");
    if (!this.hcp) out.push("Primary HCP");
    if (!this.quarter || !this.year) out.push("Closing quarter and year");
    if (this.value === "") out.push("Expected annual value");
    if (!(this.draft.Brand__c || "").split(";").filter(Boolean).length)
      out.push("Brand (at least one)");
    if (!this.owner) out.push("Owner");
    return out;
  }
  get footNote() {
    if (this.saving) return "Creating the deal…";
    if (!this.recordType)
      return "Choose the portfolio and the country to start.";
    return this.missing.length
      ? "Still to fill in: " + this.missing.join(", ") + "."
      : "Ready to save.";
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
        AmountPerYear__c: Number(this.draft.AmountPerYear__c),
        Account__c: this.hcp.id,
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
