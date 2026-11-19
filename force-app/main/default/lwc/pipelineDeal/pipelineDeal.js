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
  STAGE_ENDS
} from "c/pipelineFormat";
import { usdAmount } from "c/pipelineCurrency";

/**
 * Fields that exist in only some orgs and that only some people may see: a row for one of them is shown only when Salesforce
 * reports the field to this person. None at the moment (the Link to APAC Event field was taken out on 2026-11-07).
 */
const OPTIONAL_FIELDS = [];
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
    ["Expected_Closure_Quarter__c", "Expected closing quarter", "picklist"],
    ["Expected_Closing_Year__c", "Expected closing year", "picklist"],
    ["AmountPerYear__c", "Expected annual value", "number"],
    ["CurrencyIsoCode", "Currency", "picklist"],
    ["UnitsCasesPerYear__c", "Expected annual units / cases", "number"],
    ["OwnerId", "Owner", "lookup"],
    ["Brand__c", "Brand", "multi", false, true],
    ["OnHold__c", "On hold", "bool"],
    ["Priority__c", "Rep priority", "bool"],
    ["State_Priority__c", "State priority", "bool"],
    ["myMo__c", "MyMobility", "bool"],
    ["myMo_Stage__c", "MyMobility stage", "picklist"],
    ["Link_To_ROSA_Deal__c", "Link to ROSA deal", "lookup"],
    ["Objective__c", "Background information", "textarea", false, true]
  ],
  risk: [
    ["Account__c", "Primary HCP", "lookup", true],
    ["Healthcare_Facility__c", "Healthcare facility", "lookup"],
    ["Expected_Closure_Quarter__c", "Expected closing quarter", "picklist"],
    ["Expected_Closing_Year__c", "Expected closing year", "picklist"],
    ["AmountPerYear__c", "Annual value at risk", "number"],
    ["CurrencyIsoCode", "Currency", "picklist"],
    ["OwnerId", "Owner", "lookup"],
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
    ["OwnerId", "Owner", "lookup"],
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
/**
 * What a deal must have to be saved (Robert, 2026-11-19: the same rules on a new deal and when editing one, for every kind of deal). Each is
 * checked when Save is pressed and shown with a red star. An implant opportunity: the surgeon, the expected annual value, the expected
 * closing quarter and year (both), at least one brand and an owner (the units / cases is optional). A risk: the same, with its own value
 * (the annual value at risk). A ROSA deal: the healthcare facility (its customer; it has no brand), the ROSA growth value, the closing
 * quarter and year (both) and an owner; the surgeon is optional there, as before.
 */
const MUST = {
  opp: [
    ["Account__c", "Primary HCP"],
    ["AmountPerYear__c", "Expected annual value"],
    [QUARTER_FIELD, "Expected closing quarter"],
    [YEAR_FIELD, "Expected closing year"],
    ["Brand__c", "Brand"],
    ["OwnerId", "Owner"]
  ],
  risk: [
    ["Account__c", "Primary HCP"],
    ["AmountPerYear__c", "Annual value at risk"],
    [QUARTER_FIELD, "Expected closing quarter"],
    [YEAR_FIELD, "Expected closing year"],
    ["Brand__c", "Brand"],
    ["OwnerId", "Owner"]
  ],
  rosa: [
    ["Healthcare_Facility__c", "Healthcare facility"],
    ["ROSAGrowthDollar__c", "ROSA growth $"],
    [QUARTER_FIELD, "Expected closing quarter"],
    [YEAR_FIELD, "Expected closing year"],
    ["OwnerId", "Owner"]
  ]
};
const MYMO_FIELD = "myMo__c";
const MYMO_STAGE_FIELD = "myMo_Stage__c"; // shown only while MyMobility is Yes
/** Yes turns the whole slider solid green; for On hold, a warning rather than good news, solid amber (Robert, 2026-11-07). */
const YES_NO_GOOD = [
  { value: "no", label: "No" },
  { value: "yes", label: "Yes", tone: "good" }
];
const YES_NO_WARN = [
  { value: "no", label: "No" },
  { value: "yes", label: "Yes", tone: "warn" }
];
const ON_HOLD_FIELD = "OnHold__c";
const VALUE_LABEL = {
  opp: "Expected annual value",
  risk: "Annual value at risk",
  rosa: "ROSA growth value"
};

/** The relationship that holds a lookup's record: Account__c is Account__r, but the owner (OwnerId) is Owner. */
function relationOf(fieldName) {
  return fieldName === "OwnerId" ? "Owner" : fieldName.replace(/__c$/, "__r");
}

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
 * The top row holds four pills (the first names the deal, then Surgeon Usages, MyCase Bookings, Campaigns): each swaps the whole
 * space under the top row for its own screen (the Usage Card, the surgeon's or the hospital's bookings, the campaigns); a ROSA deal
 * has no surgeon, so no Surgeon Usages and hospital bookings. Mockup docs/mockups/pipeline_deal_screens_v1.html.
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
    const wasOpen = this._open;
    this._open = value;
    if (!value)
      this.screen = "deal"; // the flyout is sliding away; it opens next time on the deal itself
    else if (!wasOpen) {
      // opened from a rating plate it starts on Surgeon Usages (a ROSA deal has none, so it starts on the deal)
      this.screen = this.startScreen || "deal";
      if (this.screen === "usages" && !this.showSurgeon) this.screen = "deal";
    }
  }
  /** The screen to open on: "deal" (the default) or "usages" (Robert, 2026-11-19: a click on a rating plate opens the surgeon's usages). */
  @api startScreen = "deal";
  _deal;
  /** USD chosen and the Salesforce rates read: the expected annual value in the top row is shown in US dollars (the field below stays in the deal's own currency, which is what is edited). */
  @api usd = false;
  @api rates = null;
  @api index = 0;
  @api total = 0;
  @api isManager = false;
  @api viewerId = "";

  draft = {};
  draftNames = {}; // the names of records picked in this edit, by field
  savedTick = 0; // counts saves, so the MyCase Bookings screens read again
  campaignsNow = null; // the campaign count after a change made on the Campaigns screen; null until then
  screen = "deal"; // which of the four screens is shown under the top row: deal, usages, cases or campaigns
  badges; // what the MyCase Bookings pill shows: { booked }
  errors = [];
  savedMsg = false;
  saving = false;
  confirming = false;
  pending = "";

  get scrimCls() {
    return this.open ? "scrim on" : "scrim";
  }

  /* ----- the four screens (Robert, 2026-11-19): the top row stays, the pills choose what fills the space under it ----- */
  get onDeal() {
    return this.screen === "deal";
  }
  get usagesOpen() {
    return this.screen === "usages";
  }
  get casesOpen() {
    return this.screen === "cases" && this.showSurgeon;
  }
  /** A ROSA deal has no surgeon: its MyCase Bookings are the hospital's. */
  get hospitalCasesOpen() {
    return this.screen === "cases" && !this.showSurgeon;
  }
  get campaignsOpen() {
    return this.screen === "campaigns";
  }
  /** The usages, the surgeon's bookings and the campaigns scroll inside the flyout; the hospital chart fits the space it is given. */
  get scrollScreen() {
    return !this.hospitalCasesOpen;
  }
  /** A usage was added, changed or deleted on the Usages screen: the screen is told, so the lists read the ratings again. */
  handleUsagesChanged() {
    this.dispatchEvent(new CustomEvent("usageschanged"));
  }
  handleScreen(event) {
    this.screen = event.currentTarget.dataset.screen;
  }
  /** Goes up when the deal is saved, so the bookings read their data again. */
  get panelRefresh() {
    return this.savedTick;
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
  /** The lit pill is the screen on show (a filled indigo pill; the others are filled slate). */
  pillCls(name) {
    return this.screen === name ? "btn nav on" : "btn nav";
  }
  get dealBtnCls() {
    return this.pillCls("deal");
  }
  get usagesBtnCls() {
    return this.pillCls("usages");
  }
  get casesBtnCls() {
    return this.pillCls("cases");
  }
  get campaignsBtnCls() {
    return this.pillCls("campaigns");
  }
  /** The first pill names the deal: "Extremities Opportunity", "Knee Risk", "ROSA". A risk with several portfolios is just "Risk". */
  get kindLabel() {
    const d = this._deal || {};
    if (this.kind === "rosa") return "ROSA";
    const seg = d.segment && !d.segment.includes(";") ? d.segment + " " : "";
    return seg + (this.kind === "risk" ? "Risk" : "Opportunity");
  }
  /** The surgeon (Primary HCP) of the deal as saved: the Usages screen reads and edits this account's usages. */
  get accountId() {
    return this.current("Account__c") || undefined;
  }
  /** How many campaigns the deal is in: from the list, and kept right while the person puts the deal in or out. */
  get campaignsCount() {
    if (this.campaignsNow !== null) return this.campaignsNow;
    return (this._deal && this._deal.campaignCount) || 0;
  }
  handleCampaignsChanged(event) {
    this.campaignsNow = event.detail.linkedCount;
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
    // Next or Previous may land on a ROSA deal, which has no Surgeon Usages: it shows the deal itself instead
    if (this.screen === "usages" && !this.showSurgeon) this.screen = "deal";
    if (changed) {
      this.campaignsNow = null;
      this.badges = undefined;
      this.loadBadges();
    }
  }

  get showSurgeon() {
    return this.kind !== "rosa";
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
    // the stage is not a field of the form (the slider sets it) but it is still read, so the slider shows the saved stage
    const out = ["SalesRisks__c.Stage__c"];
    FIELDS[this.kind].forEach((f) => out.push(`SalesRisks__c.${f[0]}`));
    FIELDS[this.kind]
      .filter((f) => f[2] === "lookup")
      .forEach((f) => out.push(`SalesRisks__c.${relationOf(f[0])}.Name`));
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
  /** Only an opportunity has an On hold field (a risk and a ROSA deal have none), so only an opportunity can carry the marker. */
  get hasHoldTag() {
    return this.kind === "opp";
  }
  /** On hold now: what is on the slider (so it follows a change before it is saved), or, before the record has loaded, what the list said. */
  get isOnHold() {
    return this.fieldsLoaded
      ? !!this.valueOf(ON_HOLD_FIELD)
      : !!(this._deal && this._deal.onHold);
  }
  get holdTagCls() {
    return this.isOnHold ? "hold" : "hold off";
  }
  get holdTagHidden() {
    return this.isOnHold ? "false" : "true";
  }
  get title() {
    const d = this._deal || {};
    return (this.kind === "rosa" ? d.facility : d.hcp) || d.name || "";
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
  /**
   * The stage slider (Robert, 2026-11-07): the open stages, then the winning and the losing stage at the end, so a deal can be
   * set to either from the slider. The slider itself draws the colours (a blue trail, a green fill, a red pill).
   */
  get stageSteps() {
    const ends = STAGE_ENDS[this.kind];
    const values = (this.choices("Stage__c") || []).map((v) => v.value);
    const now = this.stageNow;
    const open = values.filter((v) => v !== ends.won && v !== ends.lost);
    if (!values.length && now) open.push(now);
    const closing = values.length
      ? [ends.won, ends.lost].filter((v) => values.includes(v) || v === now)
      : [];
    return [...open, ...closing];
  }
  get stageWon() {
    return STAGE_ENDS[this.kind].won;
  }
  get stageLost() {
    return STAGE_ENDS[this.kind].lost;
  }
  get stageReadonly() {
    return !this.updateable("Stage__c");
  }
  handleStageChange(event) {
    if (!this.updateable("Stage__c")) return;
    this.setDraft("Stage__c", event.detail.value);
  }
  stripMoney(d) {
    if (this.usd && this.rates) {
      const u = usdAmount(d.value, d.currencyCode, this.rates);
      if (u !== null) return formatMoney(u, "USD");
    }
    return formatMoney(d.value, d.currencyCode);
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
        value: this.stripMoney(d)
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
        value: d.isClosed ? "Closed" : d.onHold ? "On Hold" : "Open"
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
    let rows = this.flagged(this.rawFieldRows);
    const quarter = rows.find((r) => r.api === QUARTER_FIELD);
    const year = rows.find((r) => r.api === YEAR_FIELD);
    if (quarter && year && quarter.isSelect && year.isSelect) {
      quarter.pair = year;
      quarter.label = "Expected closing quarter and year";
      quarter.cls =
        "field paired" +
        (QUARTER_FIELD in this.draft || YEAR_FIELD in this.draft
          ? " changed"
          : "");
      rows = rows.filter((r) => r !== year);
    }
    return rows.map((r) => {
      const fold = r.api === MYMO_STAGE_FIELD;
      return {
        ...r,
        wrapCls:
          "cell" +
          (r.cls.includes(" wide") || r.isFlags || fold ? " wide" : "") +
          (fold ? " fold" + (this.valueOf(MYMO_FIELD) ? " open" : "") : "")
      };
    });
  }
  /**
   * The Yes / No fields (On hold, Rep priority, State priority, MyMobility) come together as one row of one-pill sliders, each
   * with its label as the left end of the pill (Robert, 2026-11-07; mockup pipeline_deal_toggles_v1.html, option B).
   */
  flagged(rows) {
    const bools = rows.filter((r) => r.isBool);
    if (!bools.length) return rows;
    const flagRow = {
      api: "__flags",
      cls: "field",
      hasLabel: false,
      isFlags: true,
      flags: bools.map((r) => ({
        api: r.api,
        label: r.label,
        value: r.on ? "yes" : "no",
        options: r.api === ON_HOLD_FIELD ? YES_NO_WARN : YES_NO_GOOD,
        locked: !r.canEdit,
        cls: "flag"
      }))
    };
    const out = [];
    rows.forEach((r) => {
      if (!r.isBool) out.push(r);
      else if (r === bools[0]) out.push(flagRow);
    });
    return out;
  }

  get rawFieldRows() {
    if (!this.fieldsLoaded) return [];
    return FIELDS[this.kind]
      .filter(([fieldName]) => this.fieldAvailable(fieldName))
      .map(([fieldName, label, type, req, wide]) => {
        const value = this.valueOf(fieldName);
        const choices = this.choices(fieldName);
        const editable = type !== "readonly" && this.updateable(fieldName);
        const row = {
          api: fieldName,
          label,
          hasLabel: true,
          req: !!req || this.isMust(fieldName),
          value: value === null || value === undefined ? "" : value,
          cls:
            "field" +
            (wide ? " wide" : "") +
            (fieldName in this.draft ? " changed" : "")
        };
        let control = editable ? type : "readonly";
        if (type === "bool") control = "bool"; // shown as a slider even when the person cannot change it (greyed)
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
          row.canEdit = editable;
          row.on = !!value;
        } else if (control === "textarea") {
          row.isTextarea = true;
        } else {
          row.isReadOnly = true;
          row.text = this.readText(fieldName, type, value);
        }
        return row;
      });
  }
  /** False for an optional field (see OPTIONAL_FIELDS) that Salesforce does not report to this person. */
  fieldAvailable(fieldName) {
    if (!OPTIONAL_FIELDS.includes(fieldName)) return true;
    const info = this.objectInfo && this.objectInfo.data;
    return !!(info && info.fields[fieldName]);
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
      this.record.data.fields[relationOf(fieldName)];
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
  handleFlag(event) {
    this.setDraft(
      event.currentTarget.dataset.api,
      event.detail.value === "yes"
    );
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
  /** True for a field this kind of deal must have filled in (shown with a red star, and checked when Save is pressed). */
  isMust(fieldName) {
    return (MUST[this.kind] || []).some(([field]) => field === fieldName);
  }
  /** What a deal must have that is empty now (counting what has been typed but not saved), as messages. The quarter and the year are named together. */
  get missingMust() {
    const empty = (fieldName) => {
      const v = this.valueOf(fieldName);
      return v === null || v === undefined || v === "";
    };
    const out = [];
    (MUST[this.kind] || []).forEach(([field, label]) => {
      if (!empty(field) || !this.fieldAvailable(field)) return;
      if (field === QUARTER_FIELD || field === YEAR_FIELD) {
        const text = "Expected closing quarter and year are both needed.";
        if (!out.includes(text)) out.push(text);
      } else if (field === "Brand__c") {
        out.push("Choose at least one brand.");
      } else {
        out.push(`${label} is needed.`);
      }
    });
    return out;
  }
  handleSave() {
    const missing = this.missingMust;
    if (missing.length) {
      this.errors = missing.map((text, key) => ({ key, text }));
      const body = this.template.querySelector(".body");
      if (body) body.scrollTop = 0;
      return;
    }
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
