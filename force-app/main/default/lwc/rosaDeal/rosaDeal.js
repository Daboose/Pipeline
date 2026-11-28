import { LightningElement, api, wire } from "lwc";
import { getPicklistValuesByRecordType } from "lightning/uiObjectInfoApi";
import getDeal from "@salesforce/apex/ROSADealController.getDeal";
import saveRecord from "@salesforce/apex/ROSADealController.saveRecord";
import addSurgeon from "@salesforce/apex/ROSADealController.addSurgeon";
import deleteSurgeon from "@salesforce/apex/ROSADealController.deleteSurgeon";
import saveAnswers from "@salesforce/apex/ROSADealController.saveAnswers";
import surgeonOpportunities from "@salesforce/apex/ROSADealController.surgeonOpportunities";
import surgeonBookings from "@salesforce/apex/ROSADealController.surgeonBookings";
import surgeonBooked from "@salesforce/apex/ROSADealController.surgeonBooked";
import getPrefs from "@salesforce/apex/ROSADealController.getPrefs";
import savePrefs from "@salesforce/apex/ROSADealController.savePrefs";
import linkOpportunity from "@salesforce/apex/ROSADealController.linkOpportunity";
import addChecklist from "@salesforce/apex/ROSADealController.addChecklist";

/**
 * rosaDeal: the ROSA deal screen (docs/ROSA_Deal_Modal_Build_Spec.md; approved mockup docs/mockups/rosa_deal_modal_v4.html).
 * One ROSA deal: header (hospital, stage bar, five totals, checklist pill), a left menu, and Overview, Surgeons and growth, each
 * Surgeon (details and volumes, Q&A, credentialing, opportunities), Checklist, Implementation, Readiness and Chatter.
 * Shown inside rosaDealModal (from the deal page's Open ROSA deal button and from Pipeline for ROSA deals).
 * Reads and saves through ROSADealController (and PipelineChatterController for Chatter). Everything is read-only unless the person
 * holds ROSA Deal Management (decision 2). Stage clicks may jump ahead of the checklist (decision 1).
 * Fires "close" when the person closes it, and "saved" after any change (so the caller can refresh).
 */
export const VERSION = "ROSA Deal Manager 0.49";

const STAGES = [
  "Sales Pipeline",
  "Surgeon Engagement",
  "Executive Presentation",
  "Negotiation",
  "Closed Won"
];
const LOST = "Deal Lost";
const JOINTS = [
  { k: "TKA", d: "TKA", label: "Knee (TKA)", short: "TKA" },
  { k: "PKA", d: "PKA", label: "Partial knee (PKA)", short: "PKA" },
  { k: "THA", d: "THA", label: "Hip (THA)", short: "THA" },
  { k: "TSA_RSA", d: "Shoulder", label: "Shoulder (TSA/RSA)", short: "TSA/RSA" }
];
const STEPS = [
  {
    phase: "Opportunity",
    steps: [
      ["1", "Engage surgeon"],
      ["2", "Validate with deal lead"],
      ["3", "Deal summary complete"]
    ]
  },
  {
    phase: "Contract",
    steps: [
      ["4", "Commercial assessment and governance"],
      ["5", "Proposal and negotiation"],
      ["6", "Contract signed"]
    ]
  },
  {
    phase: "Implement",
    steps: [
      ["7a", "Install date communicated"],
      ["7b", "Instruments delivered"],
      ["7c", "Surgeon credentialed"],
      ["7d", "First cases done"]
    ]
  }
];
const STEPLIST = STEPS.flatMap((p) => p.steps);
const CRED = ["Not started", "Booked", "Attended", "Credentialed"];
const SUPPLIERS_FIELD = "ROSA_TKA_Current_Supplier__c";
const SHARES = [
  ["ZB", "ROSA_Share_ZB__c"],
  ["J&J", "ROSA_Share_JJ__c"],
  ["Stryker", "ROSA_Share_Stryker__c"],
  ["Smith & Nephew", "ROSA_Share_SN__c"],
  ["Other", "ROSA_Share_Other__c"]
];
const MASTER_RT = "012000000000000AAA";

const err = (e) =>
  (e &&
    e.body &&
    (e.body.message ||
      (e.body.pageErrors &&
        e.body.pageErrors[0] &&
        e.body.pageErrors[0].message))) ||
  (e && e.message) ||
  "Something went wrong.";
const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec"
];
const MC_TYPES = ["Hip", "Knee", "Shoulder", "CMFT"];
const MC_PROCS = ["Primary", "Revision", "Demo"];
/** A credentialing wave only for Booked, Attended or Credentialed (Robert, 2026-11-28). */
const waveAllowed = (status) =>
  status === "Booked" || status === "Attended" || status === "Credentialed";
/** The date that goes with a surgeon's credentialing status, as a day number for sorting (0 when none). */
const credDay = (s) => {
  const d = s.ROSA_Credentialed_Date__c || s.ROSA_Course_Date__c;
  return d ? Math.floor(new Date(d).getTime() / 86400000) : 0;
};
const n = (v) => (v === null || v === undefined || v === "" ? 0 : Number(v));
/** "Stryker 20": the supplier then the cases; the number alone when no supplier is set, a dash when there are no cases. */
const volText = (sup, cases) => {
  const c = n(cases);
  if (!c) return "–";
  return sup ? sup + " " + c : String(c);
};
const fmtDate = (d) => {
  if (!d) return "";
  const x = new Date(String(d).length === 10 ? d + "T00:00:00" : d);
  return x.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
};
const fmtShort = (d) => {
  if (!d) return "";
  const x = new Date(String(d).length === 10 ? d + "T00:00:00" : d);
  return x.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
};
const money = (v, cur) => {
  if (v === null || v === undefined || v === "") return "";
  return (
    (cur ? cur + " " : "") +
    Number(v).toLocaleString("en-AU", { maximumFractionDigits: 0 })
  );
};

/** The ROSA / non-ROSA choice on myCase bookings, with no heading (Robert, 2026-11-28). */
const ROBOT_OPTIONS = [
  { value: "all", label: "All" },
  { value: "rosa", label: "ROSA only" },
  { value: "non", label: "Non-ROSA" }
];

/** Completed surgeries (the default) or bookings from today (Robert, 2026-11-28); no "all". */
const WHEN_OPTIONS = [
  { value: "past", label: "Completed" },
  { value: "future", label: "Booked" }
];

export default class RosaDeal extends LightningElement {
  @api dealId;
  /** Optional: the caller's theme (Pipeline passes its own); otherwise the person's saved Pipeline theme. */
  @api theme;
  /** True on the ROSADeal page (full window): Close goes back to the deal instead of telling a parent. */
  @api fullPage = false;
  /** The zoom of the screen that opened this one, in percent (Pipeline passes its own, e.g. 80); nothing means 100% (Robert, 2026-11-28). */
  @api zoom;
  /**
   * Optional: the person's remembered choices from the caller (Pipeline passes { hospBook, rosaDeal } from its own settings and keeps
   * what this screen sends back with prefschange). Without it (the full-window page) the screen reads and saves them itself.
   */
  @api prefs;

  data; // ROSADealController.Deal
  sec = "overview";
  sid = null;
  stab = "details";
  edit = null; // which card is in Edit
  draft = {};
  qaDraft = {}; // answer Id => value, saved together by Save Now
  names = {}; // picked lookup names, by field
  busy = true;
  error;
  toast;
  toastBad = false;
  confirmLeave = false;
  adding = false;
  add = null;
  opps = {}; // surgeon id => list
  books = {}; // surgeon id => { windowStart, lines } (myCase bookings)
  mcOn = { Hip: true, Knee: true, Shoulder: true, CMFT: true };
  mcPr = { Primary: true, Revision: true, Demo: true };
  mcRobot = "all"; // ROSA / non-ROSA on the surgeon's myCase tab
  mcWhen = "past"; // Completed (past, with usage) or Booked (from today) on the surgeon's myCase tab
  hospBook = null; // the hospital MyCase Bookings' remembered view, chips and ROSA choice (shared with Pipeline)
  zoomPct = null; // the zoom chosen on this screen (60 to 100); null until known
  sortKey = "name";
  sortAsc = true;
  widths = {};
  dealPicklists = {};
  surgeonPicklists = {};
  version = VERSION;

  connectedCallback() {
    this.load();
    this.readPrefs();
  }

  /* ----- remembered choices (Robert, 2026-11-28: the view, chips, ROSA / non-ROSA and Zoom are remembered) ----- */
  readPrefs() {
    if (this.prefs) {
      this.applyPrefs(this.prefs);
      return;
    }
    getPrefs()
      .then((json) => this.applyPrefs(JSON.parse(json || "{}")))
      .catch(() => this.applyPrefs({}));
  }
  applyPrefs(p) {
    const r = (p && p.rosaDeal) || {};
    this.hospBook = (p && p.hospBook) || null;
    const off = (list) => (Array.isArray(list) ? list : []);
    const types = { Hip: true, Knee: true, Shoulder: true, CMFT: true };
    off(r.types).forEach((t) => {
      if (t in types) types[t] = false;
    });
    const procs = { Primary: true, Revision: true, Demo: true };
    off(r.procs).forEach((x) => {
      if (x in procs) procs[x] = false;
    });
    this.mcOn = types;
    this.mcPr = procs;
    this.mcRobot = ["all", "rosa", "non"].includes(r.robot) ? r.robot : "all";
    this.mcWhen = r.when === "future" ? "future" : "past";
    if (this.stab === "mycase") this.loadBooks();
    // opened from Pipeline: Pipeline's own Zoom; on its own: the Zoom chosen here, 80% until the person chooses
    const saved = Number(r.zoom);
    if (this.zoom) this.zoomPct = Number(this.zoom);
    else this.zoomPct = [60, 70, 80, 90, 100].includes(saved) ? saved : 80;
  }
  get rosaDealPrefs() {
    const offOf = (m) => Object.keys(m).filter((k) => !m[k]);
    return {
      zoom: this.zoomPct,
      types: offOf(this.mcOn),
      procs: offOf(this.mcPr),
      robot: this.mcRobot,
      when: this.mcWhen
    };
  }
  /** Keeps the choices: hands them to Pipeline when it opened the screen, else saves them (a moment after the last change). */
  keepPrefs() {
    const detail = { hospBook: this.hospBook, rosaDeal: this.rosaDealPrefs };
    if (this.prefs) {
      this.dispatchEvent(new CustomEvent("prefschange", { detail }));
      return;
    }
    clearTimeout(this.prefsTimer);
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    this.prefsTimer = setTimeout(() => {
      savePrefs({ prefsJson: JSON.stringify(detail) }).catch(() => {
        // a choice that cannot be kept is not worth an error on screen
      });
    }, 600);
  }
  handleZoom(event) {
    this.zoomPct = Number(event.detail.value);
    this.keepPrefs();
  }
  handleHospPrefs(event) {
    this.hospBook = event.detail;
    this.keepPrefs();
  }
  get robotOptions() {
    return ROBOT_OPTIONS;
  }
  handleMcRobot(event) {
    this.mcRobot = event.detail.value;
    this.keepPrefs();
  }
  get whenOptions() {
    return WHEN_OPTIONS;
  }
  get mcBooked() {
    return this.mcWhen === "future";
  }
  handleMcWhen(event) {
    this.mcWhen = event.detail.value === "future" ? "future" : "past";
    this.keepPrefs();
    this.loadBooks();
  }

  /* ----- reading ----- */
  load(keepView) {
    this.busy = true;
    return getDeal({ dealId: this.dealId })
      .then((d) => {
        this.data = d;
        this.error = undefined;
        if (!keepView) {
          this.sec = "overview";
        }
        if (this.sid && !d.surgeons.some((s) => s.Id === this.sid))
          this.sid = null;
      })
      .catch((e) => {
        this.error = err(e);
      })
      .finally(() => {
        this.busy = false;
      });
  }

  get dealRt() {
    return this.data ? this.data.rec.RecordTypeId : undefined;
  }

  @wire(getPicklistValuesByRecordType, {
    objectApiName: "SalesRisks__c",
    recordTypeId: "$dealRt"
  })
  wiredDealPicklists({ data }) {
    if (data) this.dealPicklists = data.picklistFieldValues;
  }

  @wire(getPicklistValuesByRecordType, {
    objectApiName: "Robotics_Surgeons__c",
    recordTypeId: MASTER_RT
  })
  wiredSurgeonPicklists({ data }) {
    if (data) this.surgeonPicklists = data.picklistFieldValues;
  }

  opts(source, field) {
    const p = source && source[field];
    return p ? p.values.map((v) => ({ value: v.value, label: v.label })) : [];
  }

  /* ----- look ----- */
  get themeName() {
    return this.theme || (this.data && this.data.theme) || "dark";
  }
  get rec() {
    return this.data ? this.data.rec : {};
  }
  get canEdit() {
    return !!(this.data && this.data.canEdit);
  }
  get ready() {
    return !!this.data;
  }
  get dealName() {
    const r = this.rec;
    return (
      (r.Healthcare_Facility__r && r.Healthcare_Facility__r.Name) ||
      r.Name ||
      "ROSA deal"
    );
  }
  get salesTag() {
    return this.rec.ROSA_Sales_Type__c
      ? "ROSA " + this.rec.ROSA_Sales_Type__c.split(";").join(", ")
      : "ROSA";
  }
  get typeTag() {
    return this.rec.ROSA_Deal_Type__c;
  }
  get subLine() {
    const r = this.rec;
    const bits = [];
    const country =
      r.Healthcare_Facility__r && r.Healthcare_Facility__r.BillingCountry;
    if (country) bits.push(country);
    bits.push(
      "Deal lead " +
        ((r.ROSA_Overlord__r && r.ROSA_Overlord__r.Name) || "not set")
    );
    const q = [r.Expected_Closure_Quarter__c, r.Expected_Closing_Year__c]
      .filter((x) => x)
      .join(" ");
    if (q) bits.push("Expected close " + q);
    else if (r.Close_Date__c) bits.push("Close " + fmtDate(r.Close_Date__c));
    return bits.join(" · ");
  }
  get isWon() {
    return this.rec.Stage__c === "Closed Won";
  }
  get stages() {
    const at = STAGES.indexOf(this.rec.Stage__c);
    const lost = this.rec.Stage__c === LOST;
    const list = STAGES.map((s, i) => ({
      name: s,
      cls:
        "st" +
        (lost ? "" : i < at ? " done" : i === at ? " cur" : "") +
        (this.canEdit ? " can" : ""),
      title: this.canEdit ? "Set stage to " + s : s
    }));
    list.push({
      name: LOST,
      cls: "st lost" + (lost ? " lostcur" : "") + (this.canEdit ? " can" : ""),
      title: this.canEdit ? "Set stage to Deal Lost" : LOST
    });
    return list;
  }

  /* ----- totals (from the deal's own totals, kept by ROSAAutomation) ----- */
  get surgeons() {
    return this.data ? this.data.surgeons : [];
  }
  get totals() {
    const r = this.rec;
    const now = JOINTS.reduce(
      (a, j) => a + n(r["ROSA_Current_ZB_" + j.d + "__c"]),
      0
    );
    const ros = JOINTS.reduce(
      (a, j) => a + n(r["ROSA_With_ROSA_ZB_" + j.d + "__c"]),
      0
    );
    const g = n(r.ROSA_Growth_Cases__c);
    const inCred = this.surgeons.filter((s) => s.ROSA_Pathway__c).length;
    return {
      count: this.surgeons.length,
      now,
      ros,
      growth: (g > 0 ? "+" : "") + g,
      growthCls: "v " + (g < 0 ? "minus" : "plus"),
      cred:
        n(r.ROSA_Surgeons_Credentialed__c) +
        " / " +
        (inCred || this.surgeons.length),
      dollars: money(r.ROSAGrowthDollar__c, r.CurrencyIsoCode)
    };
  }

  /* ----- the checklist ----- */
  get cl() {
    return this.data && this.data.checklist;
  }
  done(s) {
    return !!(this.cl && this.cl["ROSA_Step_" + s + "_Done__c"]);
  }
  get segs() {
    return STEPLIST.map(([k]) => ({
      k,
      cls: (this.done(k) ? "on" : "") + (k === "7a" ? " gap" : "")
    }));
  }
  get lastDone() {
    let c = null;
    STEPLIST.forEach(([k, l]) => {
      if (this.done(k)) c = k + ". " + l;
    });
    return c || "nothing yet";
  }
  get nextStep() {
    const x = STEPLIST.find(
      ([k]) => !this.done(k) && !(k.startsWith("7") && !this.isWon)
    );
    return x ? x[0] + ". " + x[1] : null;
  }
  get doneCount() {
    return STEPLIST.filter(([k]) => this.done(k)).length;
  }
  get phases() {
    return STEPS.map((p) => ({
      phase: p.phase,
      count:
        p.steps.filter(([k]) => this.done(k)).length + "/" + p.steps.length,
      steps: p.steps.map(([k, l]) => this.stepRow(k, l))
    }));
  }
  get implSteps() {
    return STEPS[2].steps.map(([k, l]) => this.stepRow(k, l));
  }
  stepRow(k, l) {
    const d = this.done(k);
    const lock = k.startsWith("7") && !this.isWon;
    const date = this.cl && this.cl["ROSA_Step_" + k + "_Date__c"];
    const who = this.data && this.data.doneBy[k];
    return {
      k,
      label: k + ". " + l,
      boxCls: "box" + (d ? " on" : "") + (lock || !this.canEdit ? " off" : ""),
      rowCls: "step" + (lock ? " lock" : ""),
      meta: d
        ? [fmtDate(date), who].filter((x) => x).join(" · ")
        : lock
          ? "Opens at Closed Won"
          : "Not done",
      title: d ? "Untick" : "Tick"
    };
  }

  /* ----- the left menu ----- */
  navCls(k) {
    return "nav" + (this.sec === k && !this.sid ? " on" : "");
  }
  get navOverview() {
    return this.navCls("overview");
  }
  get navSurgeons() {
    return this.navCls("surgeons");
  }
  get navChecklist() {
    // amber while the deal has no checklist (Robert, 2026-11-28: every deal is checklist-driven)
    return (
      this.navCls("checklist") +
      (this.data && !this.hasChecklist ? " missing" : "")
    );
  }
  handleAddChecklist() {
    this.busy = true;
    addChecklist({ dealId: this.dealId })
      .then(() => this.load(true))
      .then(() => {
        this.flash("Checklist added.");
        this.dispatchEvent(new CustomEvent("saved"));
      })
      .catch((e) => {
        this.busy = false;
        this.flash(err(e), true);
      });
  }
  get navImplement() {
    return this.navCls("implement") + (this.isWon ? "" : " off");
  }
  get navReady() {
    return this.navCls("ready");
  }
  get navHospCase() {
    return this.navCls("hospcase");
  }
  get isHospCase() {
    return !this.sid && this.sec === "hospcase";
  }
  get mainCls() {
    return "main" + (this.isHospCase ? " fillsec" : "");
  }
  get hospitalName() {
    const h = this.rec && this.rec.Healthcare_Facility__r;
    return h && h.Name ? h.Name : "the hospital";
  }
  get navChatter() {
    return this.navCls("chatter");
  }
  get implementNote() {
    return this.isWon ? "" : "at Closed Won";
  }
  get checklistCount() {
    if (this.data && !this.hasChecklist) return "Missing";
    return this.doneCount + " of 10";
  }
  surgeonName(s) {
    const a = s.Surgeon_Name__r;
    if (!a) return s.Name;
    return a.Name || [a.FirstName, a.LastName].filter((x) => x).join(" ");
  }
  get railSurgeons() {
    return this.surgeons.map((s) => ({
      id: s.Id,
      name: this.surgeonName(s),
      cls: "nav sg" + (this.sid === s.Id ? " on" : ""),
      dot:
        "dot" +
        (s.ROSA_Credentialing_Status__c === "Credentialed"
          ? " ok"
          : s.ROSA_Credentialing_Status__c &&
              s.ROSA_Credentialing_Status__c !== "Not started"
            ? " wait"
            : "")
    }));
  }

  get isOverview() {
    return !this.sid && this.sec === "overview";
  }
  get isSurgeons() {
    return !this.sid && this.sec === "surgeons";
  }
  get isSurgeon() {
    return !!this.sid;
  }
  get isChecklist() {
    return !this.sid && this.sec === "checklist";
  }
  get isImplement() {
    return !this.sid && this.sec === "implement";
  }
  get isReady() {
    return !this.sid && this.sec === "ready";
  }
  get isChatter() {
    return !this.sid && this.sec === "chatter";
  }

  /* ----- navigation ----- */
  leaveEdit() {
    if (this.qaDirty) {
      this.flash("Save or cancel your answers first.", true);
      return false;
    }
    if (this.edit && Object.keys(this.draft).length) {
      this.flash("Save or cancel your changes first.", true);
      return false;
    }
    this.edit = null;
    this.draft = {};
    this.names = {};
    return true;
  }
  handleNav(event) {
    const k = event.currentTarget.dataset.sec;
    if (!k || (k === "implement" && !this.isWon) || !this.leaveEdit()) return;
    this.sec = k;
    this.sid = null;
  }
  handleSurgeon(event) {
    const id = event.currentTarget.dataset.sid;
    if (!id || !this.leaveEdit()) return;
    this.sid = id;
    this.stab = event.currentTarget.dataset.go || "details";
    if (this.stab === "opps") this.loadOpps();
    if (this.stab === "mycase") this.loadBooks();
  }
  handleTab(event) {
    if (!this.leaveEdit()) return;
    this.stab = event.currentTarget.dataset.stab;
    if (this.stab === "opps") this.loadOpps();
    if (this.stab === "mycase") this.loadBooks();
  }

  /* ----- stage bar (decision 1: any stage, even ahead of the checklist) ----- */
  handleStage(event) {
    if (!this.canEdit) return;
    const stage = event.currentTarget.dataset.stage;
    if (stage === this.rec.Stage__c) return;
    this.save(
      "SalesRisks__c",
      this.rec.Id,
      { Stage__c: stage },
      "Stage set to " + stage + "."
    );
  }

  /* ----- saving ----- */
  save(objectName, recordId, values, okText) {
    this.busy = true;
    return saveRecord({ objectName, recordId, values })
      .then(() => this.load(true))
      .then(() => {
        this.edit = null;
        this.draft = {};
        this.names = {};
        if (okText) this.flash(okText);
        this.dispatchEvent(new CustomEvent("saved"));
      })
      .catch((e) => {
        this.busy = false;
        this.flash(err(e), true);
      });
  }
  flash(text, bad) {
    this.toast = text;
    this.toastBad = !!bad;
    clearTimeout(this.toastTimer);
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    this.toastTimer = setTimeout(
      () => {
        this.toast = undefined;
      },
      bad ? 6000 : 2600
    );
  }
  get toastCls() {
    return "toast" + (this.toastBad ? " bad" : "");
  }

  /* ----- cards: read-only until Edit ----- */
  handleEdit(event) {
    if (!this.leaveEdit()) return;
    this.edit = event.currentTarget.dataset.edit;
    // editing the volumes: read the surgeon's myCase (both sets) so the panel can sit under Case Volumes Per Year
    if (this.edit === "svol") {
      this.loadBooks("past");
      this.loadBooks("future");
    }
  }
  handleCancel() {
    this.edit = null;
    this.draft = {};
    this.names = {};
    this.confirmLeave = false;
  }
  handleField(event) {
    const { key, value, name } = event.detail;
    this.draft = { ...this.draft, [key]: value };
    if (
      key === "ROSA_Credentialing_Status__c" &&
      !waveAllowed(value) &&
      this.cur &&
      this.cur.ROSA_Wave__c
    ) {
      this.draft = { ...this.draft, ROSA_Wave__c: "" };
    }
    if (name !== undefined) this.names = { ...this.names, [key]: name };
  }
  get dirty() {
    return Object.keys(this.draft).length > 0;
  }
  get actsCls() {
    return "acts" + (this.dirty ? " dirty" : "");
  }
  handleSave(event) {
    const card = event.currentTarget.dataset.save;
    if (!this.dirty) {
      this.handleCancel();
      return;
    }
    const isSurgeonCard = ["sdet", "svol", "scred"].includes(card);
    this.save(
      isSurgeonCard ? "Robotics_Surgeons__c" : "SalesRisks__c",
      isSurgeonCard ? this.sid : this.rec.Id,
      { ...this.draft },
      "Saved."
    );
  }
  val(obj, key) {
    return Object.prototype.hasOwnProperty.call(this.draft, key)
      ? this.draft[key]
      : obj[key];
  }
  f(obj, key, label, kind, extra) {
    const value = this.val(obj, key);
    let display = value;
    if (kind === "date") display = fmtDate(value);
    if (kind === "check") display = value ? "Yes" : "No";
    if (kind === "multi")
      display = String(value || "")
        .split(";")
        .filter((x) => x)
        .join(", ");
    if (kind === "pick") {
      const rel = obj[key.replace("__c", "__r")];
      display =
        this.names[key] !== undefined ? this.names[key] : rel ? rel.Name : "";
    }
    return { key, label, kind, value, display, valueName: display, ...extra };
  }
  card(k) {
    return {
      editing: this.edit === k,
      cls: "card" + (this.edit === k ? " editing" : ""),
      showEdit: this.canEdit && this.edit !== k
    };
  }

  /* ----- Overview ----- */
  get ovCard() {
    return this.card("ov");
  }
  get ovFields() {
    const r = this.rec;
    const P = this.dealPicklists;
    const won = r.ROSA_Has_Surgeons__c;
    return [
      this.f(r, "Healthcare_Facility__c", "Hospital", "pick", {
        pickKind: "facility"
      }),
      this.f(r, "Account__c", "Primary HCP", "pick", { pickKind: "surgeon" }),
      this.f(r, "ROSA_Overlord__c", "ROSA deal lead", "pick", {
        pickKind: "user"
      }),
      this.f(r, "ROSA_Sales_Rep__c", "Sales rep", "pick", { pickKind: "user" }),
      this.f(r, "ROSA_Deal_Type__c", "Deal type", "select", {
        options: this.opts(P, "ROSA_Deal_Type__c")
      }),
      this.f(r, "ROSA_Sales_Type__c", "Sales type", "multi", {
        options: this.opts(P, "ROSA_Sales_Type__c")
      }),
      { key: "stage", label: "Stage", kind: "ro", display: r.Stage__c },
      this.f(
        r,
        "Expected_Closure_Quarter__c",
        "Expected close quarter",
        "select",
        { options: this.opts(P, "Expected_Closure_Quarter__c") }
      ),
      this.f(r, "Expected_Closing_Year__c", "Expected close year", "select", {
        options: this.opts(P, "Expected_Closing_Year__c")
      }),
      this.f(r, "Close_Date__c", "Close date", "date"),
      this.f(r, "Install_Date__c", "Install date", "date"),
      won
        ? {
            key: "growth",
            label: "ROSA growth $ (from the surgeons)",
            kind: "ro",
            display: money(r.ROSAGrowthDollar__c, r.CurrencyIsoCode)
          }
        : {
            ...this.f(r, "ROSAGrowthDollar__c", "ROSA growth $", "number"),
            display: money(
              this.val(r, "ROSAGrowthDollar__c"),
              r.CurrencyIsoCode
            )
          },
      this.f(r, "Priority__c", "Rep priority", "check"),
      this.f(r, "State_Priority__c", "State priority", "check"),
      { key: "cur", label: "Currency", kind: "ro", display: r.CurrencyIsoCode },
      {
        key: "owner",
        label: "Owner",
        kind: "ro",
        display: r.Owner && r.Owner.Name
      }
    ];
  }
  get linkedOpps() {
    const r = this.data ? this.data.linked : [];
    return r.map((o) => ({
      id: o.Id,
      name: o.Name,
      kind: o.RecordType && o.RecordType.Name,
      who: o.Account__r && o.Account__r.Name,
      stage: o.Stage__c,
      value: money(o.AmountPerYear__c, o.CurrencyIsoCode)
    }));
  }
  get hasLinked() {
    return this.linkedOpps.length > 0;
  }
  handleOpenRecord(event) {
    const id = event.currentTarget.dataset.id;
    window.open("/lightning/r/SalesRisks__c/" + id + "/view", "_blank");
  }
  handleOpenSalesforce() {
    window.open(
      "/lightning/r/SalesRisks__c/" + this.dealId + "/view",
      "_blank"
    );
  }
  handleOpenChecklist() {
    if (!this.leaveEdit()) return;
    this.sid = null;
    this.sec = "checklist";
  }

  /* ----- Surgeons and growth ----- */
  get usedJoints() {
    return JOINTS.filter((j) =>
      this.surgeons.some(
        (s) =>
          n(s["ROSA_" + j.k + "_Current_Cases__c"]) +
            n(s["ROSA_" + j.k + "_ROSA_Cases__c"]) >
          0
      )
    );
  }
  /** Footnote under the surgeons table (Robert, 2026-11-28): the prices used, only for the joints in the table. Read from ROSA_Prices_Used__c ("AU · AUD: TSA/RSA 6,000 + 750, ..."). */
  get priceNotes() {
    const txt = (this.rec && this.rec.ROSA_Prices_Used__c) || "";
    const m = txt.match(/·\s*([A-Z]{3}):\s*(.*?)\s*\(/);
    if (!m) return [];
    const cur = m[1];
    const byJoint = {};
    m[2].split(/,\s+(?=[A-Z])/).forEach((part) => {
      const x = part.trim().match(/^(\S+)\s+([\d,.]+)\s*\+\s*([\d,.]+)$/);
      if (x) byJoint[x[1]] = { imp: x[2], disp: x[3] };
    });
    const used = this.usedJoints.filter((j) => byJoint[j.short]);
    if (!used.length) return [];
    // each line shows the working (Robert, 2026-11-28): "TSA/RSA: Implant Growth of 105 cases x AUD 6,000 = AUD 630,000"
    const num = (x) => Number(String(x).replace(/,/g, ""));
    const amt = (v) => money(v, cur);
    const cases = (v) => v + (Math.abs(v) === 1 ? " case" : " cases");
    const sumBy = (f) => this.surgeons.reduce((a, s) => a + f(s), 0);
    const zbNow = (s, j) => {
      return s["ROSA_" + j.k + "_Current_Supplier__c"] === "ZB"
        ? n(s["ROSA_" + j.k + "_Current_Cases__c"])
        : 0;
    };
    const zbRosa = (s, j) => {
      return s["ROSA_" + j.k + "_ROSA_Supplier__c"] === "ZB"
        ? n(s["ROSA_" + j.k + "_ROSA_Cases__c"])
        : 0;
    };
    const lines = used.map((j) => {
      const g = sumBy((s) => zbRosa(s, j) - zbNow(s, j));
      const p = num(byJoint[j.short].imp);
      return {
        k: "i" + j.k,
        text: `${j.short}: Implant Growth of ${cases(g)} x ${amt(p)} = ${amt(g * p)}`
      };
    });
    const disps = [...new Set(used.map((j) => byJoint[j.short].disp))];
    if (disps.length === 1) {
      const c = used.reduce((a, j) => a + sumBy((s) => zbRosa(s, j)), 0);
      const p = num(disps[0]);
      lines.push({
        k: "d",
        text: `Consumables: Consumable Growth of ${cases(c)} x ${amt(p)} = ${amt(c * p)}`
      });
    } else
      used.forEach((j) => {
        const c = sumBy((s) => zbRosa(s, j));
        const p = num(byJoint[j.short].disp);
        lines.push({
          k: "d" + j.k,
          text: `${j.short} consumables: Consumable Growth of ${cases(c)} x ${amt(p)} = ${amt(c * p)}`
        });
      });
    return lines;
  }
  get hasPriceNotes() {
    return this.priceNotes.length > 0;
  }
  get usedWave() {
    return this.surgeons.some((s) => s.ROSA_Wave__c);
  }
  answersOf(sid) {
    return this.data
      ? this.data.answers.filter((a) => a.surgeonId === sid)
      : [];
  }
  growthOf(s) {
    return JOINTS.reduce(
      (a, j) =>
        a +
        (s["ROSA_" + j.k + "_ROSA_Supplier__c"] === "ZB"
          ? n(s["ROSA_" + j.k + "_ROSA_Cases__c"])
          : 0) -
        (s["ROSA_" + j.k + "_Current_Supplier__c"] === "ZB"
          ? n(s["ROSA_" + j.k + "_Current_Cases__c"])
          : 0),
      0
    );
  }
  /** Consumable growth (Robert, 2026-11-28): every case with ROSA where the supplier with ROSA is ZB; each ROSA case uses the consumables. */
  consumablesOf(s) {
    return JOINTS.reduce(
      (a, j) =>
        a +
        (s["ROSA_" + j.k + "_ROSA_Supplier__c"] === "ZB"
          ? n(s["ROSA_" + j.k + "_ROSA_Cases__c"])
          : 0),
      0
    );
  }
  credTag(s) {
    const st = s.ROSA_Credentialing_Status__c;
    return {
      text: s.ROSA_Credentialing_Summary__c || "Not set",
      cls:
        "tag" +
        (st === "Credentialed"
          ? " ok"
          : st === "Booked" || st === "Attended"
            ? " wait"
            : "")
    };
  }
  get columns() {
    const cols = [{ key: "name", label: "Surgeon", cls: "" }];
    this.usedJoints.forEach((j) =>
      cols.push({ key: "j" + j.k, label: j.short, cls: "num" })
    );
    cols.push({ key: "growth", label: "Implant growth", cls: "num" });
    cols.push({ key: "cons", label: "Consumable growth", cls: "num" });
    cols.push({ key: "gval", label: "Growth $", cls: "num" });
    cols.push({ key: "qa", label: "Q&A", cls: "num" });
    cols.push({ key: "cred", label: "Credentialing", cls: "num" });
    if (this.usedWave) cols.push({ key: "wave", label: "Wave", cls: "num" });
    return cols.map((c) => ({
      ...c,
      thCls: c.cls + " sortable",
      arrow: this.sortKey === c.key ? (this.sortAsc ? "↑" : "↓") : "",
      style: this.widths[c.key] ? `width:${this.widths[c.key]}px` : ""
    }));
  }
  get surgeonRows() {
    const joints = this.usedJoints;
    const rows = this.surgeons.map((s) => {
      const ans = this.answersOf(s.Id);
      const answered = ans.filter((a) => a.answered).length;
      const no = ans.filter((a) => a.yesNo === "No").length;
      const g = this.growthOf(s);
      return {
        id: s.Id,
        name: this.surgeonName(s),
        champ: s.ROSA_Champion__c,
        cells: joints.map((j) => ({
          k: j.k,
          // the supplier before each number, so the growth adds up (Robert, 2026-11-28: "Stryker 20 → ZB 30")
          text:
            volText(
              s["ROSA_" + j.k + "_Current_Supplier__c"],
              s["ROSA_" + j.k + "_Current_Cases__c"]
            ) +
            " → " +
            volText(
              s["ROSA_" + j.k + "_ROSA_Supplier__c"],
              s["ROSA_" + j.k + "_ROSA_Cases__c"]
            )
        })),
        growth: (g > 0 ? "+" : "") + g,
        growthN: g,
        growthCls: "num " + (g < 0 ? "minus" : "plus"),
        cons: (this.consumablesOf(s) > 0 ? "+" : "") + this.consumablesOf(s),
        consN: this.consumablesOf(s),
        consCls: "num " + (this.consumablesOf(s) > 0 ? "plus" : ""),
        gval: money(s.ROSA_Growth_Value__c, s.CurrencyIsoCode) || "–",
        gvalN: n(s.ROSA_Growth_Value__c),
        gvalCls: "num " + (n(s.ROSA_Growth_Value__c) > 0 ? "plus" : ""),
        qa: ans.length ? answered + "/" + ans.length : "–",
        qaN: answered,
        no: no ? "· " + no + " No" : "",
        cred: this.credTag(s),
        wave: s.ROSA_Wave__c || "–",
        waveN: s.ROSA_Wave__c ? Number(s.ROSA_Wave__c) : null,
        gvalRaw:
          s.ROSA_Growth_Value__c === null ||
          s.ROSA_Growth_Value__c === undefined
            ? null
            : Number(s.ROSA_Growth_Value__c),
        // credentialing: by how far along (Not started first), then by the date in the words
        credN:
          CRED.indexOf(s.ROSA_Credentialing_Status__c) < 0
            ? null
            : CRED.indexOf(s.ROSA_Credentialing_Status__c) * 1e9 + credDay(s),
        // a joint column sorts by its cases with ROSA
        jointN: Object.fromEntries(
          joints.map((j) => [
            j.k,
            s["ROSA_" + j.k + "_ROSA_Cases__c"] === null ||
            s["ROSA_" + j.k + "_ROSA_Cases__c"] === undefined
              ? null
              : n(s["ROSA_" + j.k + "_ROSA_Cases__c"])
          ])
        )
      };
    });
    const k = this.sortKey;
    const dir = this.sortAsc ? 1 : -1;
    // Blanks always sort last, whichever way (Robert, 2026-11-28: "1, 2, 3, then the blanks"); numbers compare as numbers.
    const keyOf = (r) => {
      if (k === "name") return r.name.toLowerCase();
      if (k === "growth") return r.growthN;
      if (k === "cons") return r.consN;
      if (k === "gval") return r.gvalRaw;
      if (k === "qa") return r.qaN;
      if (k === "cred") return r.credN;
      if (k === "wave") return r.waveN;
      if (k.startsWith("j")) return r.jointN[k.slice(1)];
      return r.name.toLowerCase();
    };
    const blank = (v) =>
      v === null ||
      v === undefined ||
      v === "" ||
      (typeof v === "number" && isNaN(v));
    return rows.sort((a, b) => {
      const x = keyOf(a);
      const y = keyOf(b);
      if (blank(x) || blank(y))
        return blank(x) === blank(y)
          ? a.name.localeCompare(b.name)
          : blank(x)
            ? 1
            : -1;
      return x > y ? dir : x < y ? -dir : a.name.localeCompare(b.name);
    });
  }
  get hasSurgeons() {
    return this.surgeons.length > 0;
  }
  handleSort(event) {
    const k = event.currentTarget.dataset.key;
    if (this.resizing) return;
    if (this.sortKey === k) this.sortAsc = !this.sortAsc;
    else {
      this.sortKey = k;
      this.sortAsc = true;
    }
  }
  handleResizeStart(event) {
    event.preventDefault();
    event.stopPropagation();
    const key = event.currentTarget.dataset.key;
    const th = event.currentTarget.parentElement;
    const startX = event.clientX;
    // drawn pixels divided by the zoom give the column's own units (AAADESIGN/zoom.md)
    const z = this.z;
    const startW = th.getBoundingClientRect().width / z;
    this.resizing = true;
    const move = (e) => {
      this.widths = {
        ...this.widths,
        [key]: Math.max(60, Math.round(startW + (e.clientX - startX) / z))
      };
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      // eslint-disable-next-line @lwc/lwc/no-async-operation
      setTimeout(() => {
        this.resizing = false;
      }, 0);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }
  handleResizeReset(event) {
    event.stopPropagation();
    const key = event.currentTarget.dataset.key;
    const w = { ...this.widths };
    delete w[key];
    this.widths = w;
  }
  get zbUsers() {
    const r = this.rec;
    return this.usedJoints.map((j) => {
      const now = this.surgeons.filter(
        (s) => s["ROSA_" + j.k + "_Current_Supplier__c"] === "ZB"
      ).length;
      const ros = this.surgeons.filter(
        (s) => s["ROSA_" + j.k + "_ROSA_Supplier__c"] === "ZB"
      ).length;
      const g = n(r["ROSA_Growth_" + j.d + "_Cases__c"]);
      return {
        k: j.k,
        label: j.label,
        now,
        ros,
        nowWord: now === 1 ? "surgeon" : "surgeons",
        rosWord: ros === 1 ? "surgeon" : "surgeons",
        growth: (g > 0 ? "+" : "") + g,
        growthCls: g < 0 ? "minus" : g > 0 ? "plus" : ""
      };
    });
  }
  get shares() {
    return SHARES.map(([label, f]) => {
      const p = Math.round(n(this.rec[f]));
      return {
        label,
        pct: p + "%",
        style: `width:${p}%;` + (label === "ZB" ? "" : "background:var(--edge)")
      };
    });
  }

  /* ----- one surgeon ----- */
  get cur() {
    return this.surgeons.find((s) => s.Id === this.sid);
  }
  get curIndex() {
    return this.surgeons.findIndex((s) => s.Id === this.sid);
  }
  get curName() {
    return this.cur ? this.surgeonName(this.cur) : "";
  }
  get curChamp() {
    return this.cur && this.cur.ROSA_Champion__c;
  }
  get curSub() {
    const s = this.cur;
    if (!s) return "";
    const g = this.growthOf(s);
    return (
      (s.ROSA_Career_Position__c || "Position not set") +
      " · Growth " +
      (g > 0 ? "+" : "") +
      g +
      " ZB cases a year"
    );
  }
  get curOf() {
    return this.curIndex + 1 + " of " + this.surgeons.length;
  }
  get prevId() {
    const s = this.surgeons[this.curIndex - 1];
    return s ? s.Id : null;
  }
  get nextId() {
    const s = this.surgeons[this.curIndex + 1];
    return s ? s.Id : null;
  }
  get noPrev() {
    return !this.prevId;
  }
  get noNext() {
    return !this.nextId;
  }
  get tabs() {
    const ans = this.answersOf(this.sid);
    const os = this.opps[this.sid];
    return [
      ["details", "Details & Volumes"],
      ["qa", "Q&A " + ans.filter((a) => a.answered).length + "/" + ans.length],
      ["cred", "Credentialing"],
      [
        "opps",
        "Opportunities" +
          (os ? " " + os.filter((o) => o.linked).length + "/" + os.length : "")
      ],
      ["mycase", "myCase"]
    ].map(([k, l]) => ({
      k,
      label: l,
      // myCase keeps its brand spelling, never capitals (Robert, 2026-11-28)
      cls:
        "pill" +
        (this.stab === k ? " on" : "") +
        (k === "mycase" ? " brand" : "")
    }));
  }
  get isDetails() {
    return this.stab === "details";
  }
  get isQa() {
    return this.stab === "qa";
  }
  get isCred() {
    return this.stab === "cred";
  }
  get isOpps() {
    return this.stab === "opps";
  }
  get isMyCase() {
    return this.stab === "mycase";
  }
  get sdetCard() {
    return this.card("sdet");
  }
  get sdetFields() {
    const s = this.cur || {};
    return [
      { key: "sn", label: "Surgeon", kind: "ro", display: this.curName },
      this.f(s, "ROSA_Career_Position__c", "Career position", "select", {
        options: this.opts(this.surgeonPicklists, "ROSA_Career_Position__c")
      }),
      this.f(s, "ROSA_Champion__c", "Champion", "check"),
      // the surgeon's share of the deal's ROSA growth $: growth cases x (price + disposables), kept by the ROSA automation (Robert, 2026-11-28)
      {
        key: "sgv",
        label: "ROSA Growth $",
        kind: "ro",
        col: 6, // under the ZB growth column of Case Volumes Per Year (Robert, 2026-11-28)
        good: n(s.ROSA_Growth_Value__c) > 0,
        display:
          s.ROSA_Growth_Value__c === null ||
          s.ROSA_Growth_Value__c === undefined
            ? ""
            : money(
                s.ROSA_Growth_Value__c,
                s.CurrencyIsoCode || (this.rec && this.rec.CurrencyIsoCode)
              )
      }
    ];
  }
  get svolCard() {
    return this.card("svol");
  }
  volRows(obj, editing) {
    const sup = this.opts(this.surgeonPicklists, SUPPLIERS_FIELD);
    return JOINTS.map((j) => {
      const key = (side, what) =>
        "ROSA_" + j.k + "_" + side + "_" + what + "__c";
      const get = (k) => {
        if (Object.prototype.hasOwnProperty.call(this.draft, k))
          return this.draft[k];
        return obj[k];
      };
      const cs = get(key("Current", "Supplier"));
      const cc = get(key("Current", "Cases"));
      const rs = get(key("ROSA", "Supplier"));
      const rc = get(key("ROSA", "Cases"));
      const g = (rs === "ZB" ? n(rc) : 0) - (cs === "ZB" ? n(cc) : 0);
      const sel = (k, v) => ({
        key: k,
        value: v || "",
        opts: sup.map((o) => ({
          ...o,
          selected: o.value === v,
          okey: k + o.value
        }))
      });
      return {
        k: j.k,
        label: j.label,
        editing,
        cs: sel(key("Current", "Supplier"), cs),
        rs: sel(key("ROSA", "Supplier"), rs),
        cc: {
          key: key("Current", "Cases"),
          value: cc === null || cc === undefined ? "" : cc
        },
        rc: {
          key: key("ROSA", "Cases"),
          value: rc === null || rc === undefined ? "" : rc
        },
        csText: cs || "–",
        rsText: rs || "–",
        ccText: n(cc) || "–",
        rcText: n(rc) || "–",
        growth: (g > 0 ? "+" : "") + g,
        growthCls: g > 0 ? "plus" : g < 0 ? "minus" : ""
      };
    });
  }
  get curVolRows() {
    const editing = this.edit === "svol";
    const rows = this.volRows(this.cur || {}, editing);
    // Read mode shows only the joints with cases now or with ROSA; Edit shows all four.
    return editing
      ? rows
      : rows.filter((r) => n(r.cc.value) > 0 || n(r.rc.value) > 0);
  }
  handleVol(event) {
    const t = event.target;
    this.draft = { ...this.draft, [t.dataset.key]: t.value };
  }
  get qaRows() {
    return this.answersOf(this.sid).map((a, i) => {
      const t = a.type;
      const changed = Object.prototype.hasOwnProperty.call(this.qaDraft, a.id);
      const d = changed ? this.qaDraft[a.id] : undefined;
      const yn = changed ? d : a.yesNo;
      return {
        id: a.id,
        no: i + 1,
        question: a.question,
        isYesNo: t === "Yes/No",
        isNumber: t === "Number",
        isDate: t === "Date",
        isText: t === "Text",
        yesCls: yn === "Yes" ? "y" : "",
        noCls: yn === "No" ? "n" : "",
        value: changed
          ? d
          : t === "Number"
            ? a.num === null || a.num === undefined
              ? ""
              : a.num
            : t === "Date"
              ? a.dt || ""
              : a.txt || "",
        by: changed
          ? "Not saved yet"
          : a.answered
            ? [a.answeredBy, fmtShort(a.at)].filter((x) => x).join(" · ")
            : "Not answered",
        byCls: "by" + (changed ? " unsaved" : ""),
        disabled: !this.canEdit,
        clearable: this.canEdit && t === "Date" && !!(changed ? d : a.dt)
      };
    });
  }
  get hasQa() {
    return this.qaRows.length > 0;
  }
  get qaSummary() {
    const a = this.answersOf(this.sid);
    return {
      answered: a.filter((x) => x.answered).length,
      total: a.length,
      gaps: a.filter((x) => x.yesNo === "No").length
    };
  }
  get gapsCls() {
    return this.qaSummary.gaps ? "bad" : "";
  }
  /* Q&A: clicks change the answers on screen only; Save Now saves them all at once (Robert, 2026-11-28) */
  handleYesNo(event) {
    if (!this.canEdit) return;
    const id = event.currentTarget.dataset.id;
    const v = event.currentTarget.dataset.v;
    const a = this.data.answers.find((x) => x.id === id);
    const now = Object.prototype.hasOwnProperty.call(this.qaDraft, id)
      ? this.qaDraft[id]
      : a && a.yesNo;
    this.setAnswer(id, now === v ? "" : v, a ? a.yesNo || "" : "");
  }
  handleAnswerInput(event) {
    if (!this.canEdit) return;
    const id = event.target.dataset.id;
    const a = this.data.answers.find((x) => x.id === id);
    const saved = !a
      ? ""
      : a.type === "Number"
        ? a.num === null || a.num === undefined
          ? ""
          : String(a.num)
        : a.type === "Date"
          ? a.dt || ""
          : a.txt || "";
    this.setAnswer(id, event.target.value, saved);
  }
  handleAnswerClear(event) {
    if (!this.canEdit) return;
    const id = event.currentTarget.dataset.id;
    const a = this.data.answers.find((x) => x.id === id);
    const inp = this.template.querySelector(
      'input[type="date"][data-id="' + id + '"]'
    );
    if (inp) inp.value = "";
    this.setAnswer(id, "", a ? a.dt || "" : "");
  }
  handleAddClear(event) {
    const key = event.currentTarget.dataset.key;
    const inp = this.template.querySelector(
      'input[type="date"][data-key="' + key + '"]'
    );
    if (inp) inp.value = "";
    this.add = { ...this.add, [key]: null };
  }
  setAnswer(id, value, saved) {
    const d = { ...this.qaDraft };
    if (String(value || "") === String(saved || "")) delete d[id];
    else d[id] = value;
    this.qaDraft = d;
  }
  get qaDirty() {
    return Object.keys(this.qaDraft).length > 0;
  }
  get qaChangeCount() {
    const k = Object.keys(this.qaDraft).length;
    return k + (k === 1 ? " answer" : " answers");
  }
  handleQaCancel() {
    this.qaDraft = {};
  }
  handleQaSave() {
    const answers = { ...this.qaDraft };
    this.busy = true;
    saveAnswers({ answers })
      .then(() => this.load(true))
      .then(() => {
        this.qaDraft = {};
        this.flash("Answers saved.");
        this.dispatchEvent(new CustomEvent("saved"));
      })
      .catch((e) => {
        this.busy = false;
        this.flash(err(e), true);
      });
  }
  get scredCard() {
    return this.card("scred");
  }
  get track() {
    const st = this.cur ? this.cur.ROSA_Credentialing_Status__c : null;
    const ix = CRED.indexOf(st);
    return CRED.map((t, i) => ({
      t,
      cls: i < ix ? "done" : i === ix ? "cur" : ""
    }));
  }
  get scredFields() {
    const s = this.cur || {};
    const P = this.surgeonPicklists;
    return [
      this.f(s, "ROSA_Pathway__c", "Pathway", "select", {
        options: this.opts(P, "ROSA_Pathway__c")
      }),
      this.f(s, "ROSA_Credentialing_Status__c", "Status", "select", {
        options: this.opts(P, "ROSA_Credentialing_Status__c")
      }),
      // a wave only once Booked, Attended or Credentialed (Robert, 2026-11-28)
      waveAllowed(this.val(s, "ROSA_Credentialing_Status__c"))
        ? this.f(s, "ROSA_Wave__c", "Wave", "select", {
            options: this.opts(P, "ROSA_Wave__c")
          })
        : {
            key: "ROSA_Wave__c",
            label: "Wave",
            kind: "ro",
            display: "None until Booked"
          },
      this.f(s, "ROSA_Course_Date__c", "Course date (Med Ed lab)", "date"),
      this.f(s, "ROSA_Credentialed_Date__c", "Credentialed date", "date"),
      this.f(s, "ROSA_First_Case_Date__c", "First case date", "date")
    ];
  }
  /* ----- myCase bookings (Robert, 2026-11-28): the Surgeon / Brand table of Pipeline's hospital bookings, for one surgeon ----- */
  loadBooks(whenArg) {
    const s = this.cur;
    const when = whenArg || this.mcWhen;
    const key = s && s.Id + "|" + when;
    if (!s || !s.Surgeon_Name__c || this.books[key]) return;
    const read = when === "future" ? surgeonBooked : surgeonBookings;
    read({ accountId: s.Surgeon_Name__c })
      .then((b) => {
        this.books = { ...this.books, [key]: b };
      })
      .catch((e) => this.flash(err(e), true));
  }
  get mcData() {
    return this.books[this.sid + "|" + this.mcWhen];
  }
  /**
   * The surgeon's myCase panel is shown on the myCase tab, and also under Case Volumes Per Year while the volumes are being edited (Robert,
   * 2026-11-28, mockup rosa_deal_add_surgeons_v9), there only when the surgeon has myCase cases, completed or booked (no myCase, as in
   * New Zealand, shows nothing extra).
   */
  get showMcCard() {
    if (this.isMyCase) return true;
    if (!(this.isDetails && this.edit === "svol")) return false;
    const has = (when) => {
      const b = this.books[this.sid + "|" + when];
      return !!(b && b.lines && b.lines.length);
    };
    return has("past") || has("future");
  }
  get mcLoaded() {
    return !!this.mcData;
  }
  get mcTitle() {
    return this.mcBooked
      ? "myCase Bookings (booked)"
      : "myCase Bookings (cases with usages)";
  }
  get mcNote() {
    return this.mcBooked
      ? "Booked surgeries from today on. ROSA is the booking's Technology (ROSA or ROSA+PSI). Cancelled bookings aren't shown."
      : "Only cases where items were used in surgery. Planned or cancelled bookings aren't shown.";
  }
  get mcEmpty() {
    return this.mcBooked
      ? "No bookings for this surgeon from today."
      : "No myCase bookings for this surgeon in the last 12 months.";
  }
  get mcAll() {
    const all = (this.mcData && this.mcData.lines) || [];
    if (this.mcRobot === "all") return all;
    const want = this.mcRobot === "rosa";
    return all.filter((l) => !!l.rosa === want);
  }
  get mcHasData() {
    return ((this.mcData && this.mcData.lines) || []).length > 0;
  }
  get mcHasAny() {
    return this.mcAll.length > 0;
  }
  get mcMonths() {
    const start = this.mcData && this.mcData.windowStart;
    if (!start) return [];
    const [y, m] = String(start).split("-").map(Number);
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(y, m - 1 + i, 1);
      return {
        k: "m" + i,
        short: MONTH_SHORT[d.getMonth()],
        // the column heading: every month with its two-digit year, "Nov 25", "Dec 25" (Robert, 2026-11-28)
        head:
          MONTH_SHORT[d.getMonth()] + " " + String(d.getFullYear()).slice(2),
        long: d.toLocaleString("en-AU", { month: "long", year: "numeric" })
      };
    });
  }
  get mcWindow() {
    const ms = this.mcMonths;
    if (!ms.length) return "";
    return (
      ms[0].short +
      " " +
      ms[0].long.slice(-4) +
      " to " +
      ms[11].short +
      " " +
      ms[11].long.slice(-4) +
      (this.mcBooked ? ", from today" : "") +
      ", every hospital"
    );
  }
  mcSum(f) {
    return this.mcAll
      .filter(f)
      .reduce((a, l) => a + l.months.reduce((x, y) => x + y, 0), 0);
  }
  get mcChips() {
    const types = MC_TYPES.map((t) => ({
      k: "t" + t,
      grp: "t",
      name: t,
      n: this.mcSum((l) => l.anatomy === t && this.mcPr[l.procedure]),
      on: this.mcOn[t],
      style: "--c: var(--" + t.toLowerCase() + ")"
    }));
    const procs = MC_PROCS.map((p) => ({
      k: "p" + p,
      grp: "p",
      name: p,
      n: this.mcSum((l) => l.procedure === p && this.mcOn[l.anatomy]),
      on: this.mcPr[p],
      style: "--c: var(--indigo)"
    }));
    const cls = (c) => ({ ...c, cls: "lg" + (c.on ? "" : " off") });
    return { types: types.map(cls), procs: procs.map(cls) };
  }
  handleMcChip(event) {
    const { grp, name } = event.currentTarget.dataset;
    if (grp === "t") this.mcOn = { ...this.mcOn, [name]: !this.mcOn[name] };
    else this.mcPr = { ...this.mcPr, [name]: !this.mcPr[name] };
    this.keepPrefs();
  }
  get mcTable() {
    const merged = new Map();
    this.mcAll
      .filter((l) => this.mcOn[l.anatomy] && this.mcPr[l.procedure])
      .forEach((l) => {
        const key = l.brand + "|" + l.anatomy;
        if (!merged.has(key))
          merged.set(key, {
            brand: l.brand,
            anatomy: l.anatomy,
            m: Array(12).fill(0)
          });
        const x = merged.get(key);
        l.months.forEach((v, i) => {
          x.m[i] += v;
        });
      });
    const rows = [...merged.values()]
      .map((r) => ({ ...r, tot: r.m.reduce((a, b) => a + b, 0) }))
      .filter((r) => r.tot > 0)
      .sort((a, b) => b.tot - a.tot || a.brand.localeCompare(b.brand));
    const tot = rows.reduce((a, r) => a + r.tot, 0);
    const max = Math.max(1, ...rows.flatMap((r) => r.m));
    const months = this.mcMonths;
    return {
      has: rows.length > 0,
      tot,
      casesText: tot + (tot === 1 ? " case" : " cases"),
      span: rows.length,
      rows: rows.map((r, i) => ({
        k: r.brand + "|" + r.anatomy,
        first: i === 0,
        brand: r.brand,
        sq: "background: var(--" + r.anatomy.toLowerCase() + ")",
        tot: r.tot,
        cells: r.m.map((v, mi) => ({
          k: "c" + mi,
          v,
          cls: v ? "" : "zero",
          style: v
            ? "background: rgba(var(--cell), " +
              (0.12 + (0.6 * v) / max).toFixed(2) +
              ")"
            : "",
          tip: v
            ? r.brand +
              " (" +
              r.anatomy +
              "), " +
              (months[mi] ? months[mi].long : "") +
              ": " +
              v
            : ""
        }))
      })),
      cols: months.map((mo, mi) => ({
        k: mo.k,
        v: rows.reduce((a, r) => a + r.m[mi], 0)
      }))
    };
  }

  loadOpps() {
    const s = this.cur;
    if (!s || !s.Surgeon_Name__c) return;
    surgeonOpportunities({ accountId: s.Surgeon_Name__c })
      .then((rows) => {
        this.opps = {
          ...this.opps,
          [s.Id]: rows.map((o) => ({
            id: o.Id,
            name: o.Name,
            kind: o.RecordType && o.RecordType.Name,
            stage: o.Stage__c,
            value: money(o.AmountPerYear__c, o.CurrencyIsoCode),
            linked: o.Link_To_ROSA_Deal__c === this.dealId,
            other:
              o.Link_To_ROSA_Deal__c && o.Link_To_ROSA_Deal__c !== this.dealId
          }))
        };
      })
      .catch((e) => this.flash(err(e), true));
  }
  get oppRows() {
    return this.opps[this.sid] || [];
  }
  get hasOpps() {
    return this.oppRows.length > 0;
  }
  get oppsLoaded() {
    return !!this.opps[this.sid];
  }
  handleLink(event) {
    const id = event.currentTarget.dataset.id;
    const link = event.currentTarget.dataset.link === "1";
    this.busy = true;
    linkOpportunity({ opportunityId: id, dealId: this.dealId, link })
      .then(() => this.load(true))
      .then(() => {
        this.loadOpps();
        this.flash(link ? "Linked to this ROSA deal." : "Unlinked.");
        this.dispatchEvent(new CustomEvent("saved"));
      })
      .catch((e) => {
        this.busy = false;
        this.flash(err(e), true);
      });
  }
  handleRecordInSf(event) {
    window.open(
      "/lightning/r/Robotics_Surgeons__c/" +
        event.currentTarget.dataset.id +
        "/view",
      "_blank"
    );
  }

  /* ----- Add surgeon ----- */
  blank() {
    return {
      Surgeon_Name__c: null,
      pickName: "",
      ROSA_Career_Position__c: "",
      ROSA_Champion__c: false,
      ROSA_Pathway__c: "",
      ROSA_Credentialing_Status__c: "",
      ROSA_Course_Date__c: "",
      ROSA_Wave__c: ""
    };
  }
  handleAdd() {
    if (!this.leaveEdit()) return;
    this.add = this.blank();
    this.adding = true;
  }
  handleAddClose() {
    this.adding = false;
    this.add = null;
  }
  handleAddPick(event) {
    this.add = {
      ...this.add,
      Surgeon_Name__c: event.detail.id,
      pickName: event.detail.name
    };
  }
  handleAddField(event) {
    const t = event.target;
    const v = t.type === "checkbox" ? t.checked : t.value;
    this.add = { ...this.add, [t.dataset.key]: v };
    if (t.dataset.key === "ROSA_Credentialing_Status__c" && !waveAllowed(v)) {
      this.add = { ...this.add, ROSA_Wave__c: "" };
    }
  }
  get addPicked() {
    return !!(this.add && this.add.Surgeon_Name__c);
  }
  get addWaveOff() {
    return !waveAllowed(this.add && this.add.ROSA_Credentialing_Status__c);
  }
  get addBlocked() {
    return !this.addPicked;
  }
  get addVolRows() {
    return this.volRows(this.add || {}, true).map((r) => ({ ...r }));
  }
  handleAddVol(event) {
    const t = event.target;
    this.add = { ...this.add, [t.dataset.key]: t.value };
  }
  addOpts(field) {
    const v = this.add ? this.add[field] : "";
    return this.opts(this.surgeonPicklists, field).map((o) => ({
      ...o,
      selected: o.value === v,
      okey: field + o.value
    }));
  }
  get addCareerOpts() {
    return this.addOpts("ROSA_Career_Position__c");
  }
  get addPathwayOpts() {
    return this.addOpts("ROSA_Pathway__c");
  }
  get addStatusOpts() {
    return this.addOpts("ROSA_Credentialing_Status__c");
  }
  get addWaveOpts() {
    return this.addOpts("ROSA_Wave__c");
  }
  handleAddSave(event) {
    if (!this.addPicked) return;
    const again = event.currentTarget.dataset.again === "1";
    const values = {};
    Object.keys(this.add).forEach((k) => {
      if (k !== "pickName" && this.add[k] !== "" && this.add[k] !== null)
        values[k] = this.add[k];
    });
    const who = this.add.pickName;
    this.busy = true;
    addSurgeon({ dealId: this.dealId, values })
      .then(() => this.load(true))
      .then(() => {
        this.flash(
          "Saved " + who + "." + (again ? " Add the next surgeon." : "")
        );
        this.dispatchEvent(new CustomEvent("saved"));
        if (again) this.add = this.blank();
        else this.handleAddClose();
      })
      .catch((e) => {
        this.busy = false;
        this.flash(err(e), true);
      });
  }

  /* ----- adding a surgeon from the hospital's myCase (Robert, 2026-11-28, mockup rosa_deal_add_surgeons_v9) ----- */
  /** The Account ids of the deal's surgeons, so the hospital myCase can tick them. */
  get dealSurgeonIds() {
    return ((this.data && this.data.surgeons) || [])
      .map((s) => s.Surgeon_Name__c)
      .filter((x) => x);
  }
  handleMcAdd(event) {
    const { accountId, name } = event.detail || {};
    if (!this.canEdit || !accountId) return;
    this.busy = true;
    addSurgeon({ dealId: this.dealId, values: { Surgeon_Name__c: accountId } })
      .then(() => this.load(true))
      .then(() => {
        this.flash(name + " added to Surgeons and Growth.");
        this.dispatchEvent(new CustomEvent("saved"));
      })
      .catch((e) => {
        this.busy = false;
        this.flash(err(e), true);
      });
  }

  /* ----- deleting a surgeon added in error (Robert, 2026-11-28): Delete surgeon at the bottom left of Details in Edit, then Are you sure ----- */
  askDelete = false;
  askOn = false;
  get askCls() {
    return "ask" + (this.askOn ? " on" : "");
  }
  get askScrimCls() {
    return "askscrim" + (this.askOn ? " on" : "");
  }
  /**
   * The warning (Robert, 2026-11-28): the surgeon, plus their Q&A and their credentialing, each named only when it exists.
   */
  get deleteText() {
    const s = this.cur || {};
    const qa = this.answersOf(this.sid).length;
    const parts = [];
    if (qa)
      parts.push(`their Q&A (${qa} ${qa === 1 ? "question" : "questions"})`);
    const credFields = [
      "ROSA_Credentialing_Status__c",
      "ROSA_Pathway__c",
      "ROSA_Course_Date__c",
      "ROSA_Credentialed_Date__c",
      "ROSA_First_Case_Date__c"
    ];
    if (credFields.some((f) => s[f])) parts.push("their credentialing");
    return (
      `You're about to delete ${this.curName}` +
      (parts.length ? ", plus " + parts.join(" and ") : "") +
      ". This cannot be undone. Do you wish to continue?"
    );
  }
  handleAskDelete() {
    if (!this.canEdit || !this.sid) return;
    this.askDelete = true;
    // put the box on the page first, then switch it on so it opens with the standard motion
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    setTimeout(() => {
      this.askOn = true;
    }, 30);
  }
  closeAsk() {
    this.askOn = false;
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    setTimeout(() => {
      this.askDelete = false;
    }, 450);
  }
  handleKeep() {
    this.closeAsk();
  }
  handleDelete() {
    const id = this.sid;
    const who = this.curName;
    this.closeAsk();
    this.busy = true;
    deleteSurgeon({ surgeonId: id })
      .then(() => {
        this.edit = null;
        this.draft = {};
        this.names = {};
        this.sid = null;
        this.sec = "surgeons";
        return this.load(true);
      })
      .then(() => {
        this.flash(who + " deleted from this deal.");
        this.dispatchEvent(new CustomEvent("saved"));
      })
      .catch((e) => {
        this.busy = false;
        this.flash(err(e), true);
      });
  }

  /* ----- checklist ----- */
  handleStep(event) {
    if (!this.canEdit || !this.cl) return;
    const k = event.currentTarget.dataset.step;
    if (k.startsWith("7") && !this.isWon) return;
    const on = !this.done(k);
    this.save(
      "Robotics__c",
      this.cl.Id,
      { ["ROSA_Step_" + k + "_Done__c"]: on },
      on ? "Step " + k + " done." : "Step " + k + " unticked."
    );
  }
  get hasChecklist() {
    return !!this.cl;
  }
  get credBySurgeon() {
    return this.surgeons.map((s) => ({
      id: s.Id,
      name: this.surgeonName(s),
      wave: s.ROSA_Wave__c ? "Wave " + s.ROSA_Wave__c : "No wave",
      cred: this.credTag(s)
    }));
  }

  /* ----- Readiness ----- */
  get siteCard() {
    return this.card("site");
  }
  get siteFields() {
    const r = this.rec;
    const P = this.dealPicklists;
    return [
      this.f(r, "ROSA_Rep_Trained__c", "Sales Rep ROSA Trained", "select", {
        options: this.opts(P, "ROSA_Rep_Trained__c")
      }),
      this.f(
        r,
        "ROSA_Rep_Case_Cover_Suitable__c",
        "Sales Rep Suitable for Case Cover",
        "select",
        { options: this.opts(P, "ROSA_Rep_Case_Cover_Suitable__c") }
      ),
      this.f(r, "ROSA_Primary_Case_Cover__c", "Primary case cover", "pick", {
        pickKind: "user"
      }),
      this.f(
        r,
        "ROSA_Secondary_Case_Cover__c",
        "Secondary case cover",
        "pick",
        { pickKind: "user" }
      ),
      this.f(
        r,
        "ROSA_Additional_Support__c",
        "Additional case support needed",
        "select",
        { options: this.opts(P, "ROSA_Additional_Support__c") }
      ),
      this.f(
        r,
        "ROSA_Additional_Support_Who__c",
        "Who provides additional support",
        "text"
      ),
      this.f(r, "ROSA_Trainees__c", "Trainee surgeons on site", "number"),
      this.f(r, "ROSA_Fellows__c", "Fellows on site", "number"),
      this.f(r, "ROSA_Exposure_Plan__c", "Exposure plan", "area", {
        wide: true
      }),
      this.f(
        r,
        "ROSA_Critical_To_Approval__c",
        "Critical to approval",
        "area",
        { wide: true }
      )
    ];
  }
  get apCard() {
    return this.card("ap");
  }
  get apFields() {
    const r = this.rec;
    const P = this.dealPicklists;
    return [
      this.f(
        r,
        "ROSA_Existing_Unit__c",
        "Site already has a ROSA unit",
        "select",
        { options: this.opts(P, "ROSA_Existing_Unit__c") }
      ),
      this.f(
        r,
        "ROSA_Unit_Utilisation__c",
        "Current ROSA utilisation",
        "select",
        { options: this.opts(P, "ROSA_Unit_Utilisation__c") }
      ),
      this.f(
        r,
        "ROSA_Additional_Unit_Required__c",
        "Additional unit required",
        "select",
        { options: this.opts(P, "ROSA_Additional_Unit_Required__c") }
      ),
      this.f(
        r,
        "ROSA_Competitor_Robotics__c",
        "Competitor robotics on site",
        "multi",
        { options: this.opts(P, "ROSA_Competitor_Robotics__c") }
      ),
      this.f(
        r,
        "ROSA_Additional_Opportunities__c",
        "Additional opportunities",
        "area",
        { wide: true }
      ),
      this.f(r, "ROSA_Identified_Risks__c", "Identified risks", "area", {
        wide: true
      })
    ];
  }

  /* ----- Chatter ----- */
  /**
   * Chatter (Robert, 2026-11-28): Pipeline's own Chatter panel (pipelineChatter), so posts and replies can @mention people,
   * the same as on an implant deal; it says when something was posted, and the deal reloads nothing.
   */
  handleChatterPosted() {
    this.dispatchEvent(new CustomEvent("saved"));
  }

  /* ----- closing ----- */
  handleClose() {
    if (this.dirty || this.qaDirty || (this.adding && this.addPicked)) {
      this.confirmLeave = true;
      return;
    }
    this.leave();
  }
  handleLeaveDiscard() {
    this.qaDraft = {};
  }
  handleStay() {
    this.confirmLeave = false;
  }
  handleLeave() {
    this.confirmLeave = false;
    this.leave();
  }
  get rootCls() {
    return "root" + (this.fullPage ? " full" : "");
  }
  get z() {
    const v = Number(this.zoomPct || this.zoom || 80);
    return v >= 50 && v <= 100 ? v / 100 : 0.8;
  }
  get zoomValue() {
    return Math.round(this.z * 100);
  }
  get rootStyle() {
    return "--z:" + this.z;
  }
  /** Close: on the full-window page, back to the deal (or close the tab if it was opened on its own); otherwise tell the parent. */
  leave() {
    if (this.fullPage) {
      if (window.history.length > 1) window.history.back();
      else window.close();
      return;
    }
    this.dispatchEvent(new CustomEvent("close"));
  }
}
