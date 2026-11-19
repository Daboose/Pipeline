import { LightningElement, api } from "lwc";
import { NavigationMixin } from "lightning/navigation";
import getCard from "@salesforce/apex/PipelineUsageCardController.getCard";
import deleteUsage from "@salesforce/apex/PipelineUsageController.deleteUsage";
import saveWhole from "@salesforce/apex/PipelineUsageEditController.save";
import addWhole from "@salesforce/apex/PipelineUsageEditController.add";
import searchLookup from "@salesforce/apex/PipelineLookupController.search";
import { formatDate } from "c/pipelineFormat";
import {
  COLUMNS,
  GRID,
  buildTile,
  draftOf,
  isComplete,
  payloadOf,
  portfolioTitle,
  setField,
  toggleChip
} from "c/pipelineUsageModel";

/** Usages not changed for longer than this (days) get the "worth checking" warning. */
const OLD_DAYS = 365;
const DAY_MS = 86400000;
const TYPES = ["Hip", "Knee", "Shoulder", "CMFT"];
const STARS = { PLATINUM: 4, GOLD: 3, SILVER: 2, BRONZE: 1 };
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
 * Pipeline: the Usage card on an Account record page, and the Usages screen of the Pipeline deal. One component, two behaviours chosen
 * by the account it is given. A surgeon (person account): the four usage ratings as metal plates (Platinum, Gold, Silver, Bronze), a
 * note on when the usages last changed, the usages grouped by hospital (edit a line, take a line off, add a usage), and, only for
 * people who can read the MyCase objects, the MyCase bookings of the last 12 months by type, for information only. A hospital
 * (business account): the cases by surgeon and type, from MyCase bookings (only for people who can read MyCase) or from the usage
 * records, where Zimmer Biomet ("ZB") is split from every other company. Light theme by default so it sits quietly on the page; the
 * Pipeline deal restyles it by setting the --pcu-* custom properties (see pipelineUsageCard.css).
 * `embedded` (set by the Pipeline deal's Usages screen): a surgeon shows no "Usages" heading row and no MyCase bookings section,
 * because the deal has its own MyCase Bookings screen; nothing else changes.
 * Each usage is a tile (pipelineUsageTile) in the compact layout (Robert, 2026-11-19; mockup docs/mockups/pipeline_deal_screens_v1.html):
 * a row per product line in the same columns for every portfolio, the column headings once, locked at the top of the list (layout
 * and logic in pipelineUsageModel). Everything changes through Salesforce in the person's own access; the lists (companies, products
 * that follow the company, stem type, bearing, segment, procedure types, technologies) are read live from Salesforce for each
 * usage record type (pipelineUsageFieldChoices) and never typed in here. Opening and closing follow the Pipeline motion standard
 * (a fold over 0.4 s).
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
  keepInView = false;
  hmode = "mc"; // hospital view: mc (MyCase bookings) or us (usage records)
  /** True inside the Pipeline deal's Usages screen: no heading row and no MyCase section for a surgeon. */
  @api embedded = false;

  /* editing a usage, deleting one */
  editId = null;
  editDraft = {};
  delId = null;
  flashId = null; // a usage id that is highlighted
  rowMsg = "";
  rowMsgCls = "note warn";

  /* adding a usage */
  addOpen = false;
  addHospital = null; // { id, name }
  addPortfolio = "";
  addDraft = {};
  addMsg = "";
  search = "";
  hits = [];
  searched = false;
  _timer;

  picks = {}; // the lists Salesforce gave, by usage record type id

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
    if (this.isPerson) return "Usages";
    const name = this.data && this.data.name;
    return name ? "Cases by Surgeon at " + name : "Cases by Surgeon";
  }
  get canMyCase() {
    return !!(this.data && this.data.canMyCase);
  }
  /** The heading row ("Usages" or "Cases by Surgeon at ..." with the hospital switch); an embedded surgeon card has none. */
  get showHead() {
    return !this.embedded || this.isHospital;
  }
  /** A surgeon's MyCase bookings table; the deal has its own MyCase Bookings screen, so an embedded card leaves it out. */
  get showBookings() {
    return this.canMyCase && !this.embedded;
  }
  /** The headings of the four field columns, drawn once above the whole list of usages. */
  get columnHeads() {
    return COLUMNS;
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

  /* ----- the surgeon's usages, as tiles under their hospital ----- */
  get usages() {
    return ((this.data && this.data.usages) || []).filter(
      (u) => !!GRID[u.portfolio]
    );
  }
  get noUsages() {
    return this.usages.length === 0;
  }
  get groups() {
    const byHosp = new Map();
    this.usages.forEach((u) => {
      const h = u.hospital || "No hospital recorded";
      if (!byHosp.has(h)) byHosp.set(h, []);
      byHosp.get(h).push(u);
    });
    return [...byHosp.entries()].map(([hospital, list]) => ({
      hospital,
      tiles: list.map((u) => this.tileOf(u))
    }));
  }
  usageById(id) {
    return this.usages.find((u) => u.usageId === id);
  }
  tileOf(u) {
    const portfolio = u.portfolio;
    const editing = this.editId === u.usageId;
    const deleting = this.delId === u.usageId;
    const draft = editing ? this.editDraft : draftOf(portfolio, u.values);
    const title = portfolioTitle(portfolio);
    return {
      ...buildTile(
        portfolio,
        draft,
        editing,
        this.picks[u.recordTypeId] || {},
        u.usageId
      ),
      id: u.usageId,
      key: u.usageId,
      title,
      cls:
        "us" +
        (editing ? " editing" : "") +
        (this.flashId === u.usageId ? " flash" : ""),
      showActions: !editing && !deleting && (this.canEdit || this.canDelete),
      canEdit: this.canEdit,
      canDelete: this.canDelete,
      editable: editing,
      deleting,
      delText: `Delete this ${title} usage at ${u.hospital || "this hospital"}?`,
      showFoot: editing,
      saveDisabled: !isComplete(portfolio, draft)
    };
  }
  handleChoices(event) {
    const { recordTypeId, picks } = event.detail;
    this.picks = { ...this.picks, [recordTypeId]: picks };
  }
  /** The record types whose lists are needed now: the usage being edited, or the portfolio being added. */
  get neededRts() {
    const ids = new Set();
    const u = this.editId && this.usageById(this.editId);
    if (u && u.recordTypeId) ids.add(u.recordTypeId);
    if (this.addOpen && this.addRecordTypeId) ids.add(this.addRecordTypeId);
    return [...ids].map((id) => ({ id }));
  }

  /* ----- what the tiles report (edit, field, chip, save, cancel, delete) ----- */
  handleTileEdit(event) {
    const u = this.usageById(event.detail.id);
    if (!u) return;
    this.clearRowState();
    this.editId = u.usageId;
    this.editDraft = draftOf(u.portfolio, u.values);
  }
  handleTileCancel() {
    this.clearRowState();
  }
  handleTileField(event) {
    const { id, field, value } = event.detail;
    if (id === "add") {
      this.addDraft = setField(this.addPortfolio, this.addDraft, field, value);
      return;
    }
    const u = this.usageById(id);
    if (u && id === this.editId) {
      this.editDraft = setField(u.portfolio, this.editDraft, field, value);
    }
  }
  handleTileChip(event) {
    const { id, field, value } = event.detail;
    if (id === "add") {
      this.addDraft = toggleChip(this.addDraft, field, value);
    } else if (id === this.editId) {
      this.editDraft = toggleChip(this.editDraft, field, value);
    }
  }
  handleTileSave(event) {
    const u = this.usageById(event.detail.id);
    if (!u || u.usageId !== this.editId) return;
    const usageId = u.usageId;
    this.run(
      () =>
        saveWhole({
          usageId,
          fieldsJson: JSON.stringify(payloadOf(u.portfolio, this.editDraft))
        }),
      () => {
        this.clearRowState();
        this.flashId = usageId;
        this.touched();
      }
    );
  }
  handleTileDelete(event) {
    this.clearRowState();
    this.delId = event.detail.id;
  }
  handleTileDeleteNo() {
    this.delId = null;
  }
  handleTileDeleteYes(event) {
    const usageId = event.detail.id;
    this.run(
      () => deleteUsage({ usageId }),
      () => {
        this.clearRowState();
        this.touched();
      }
    );
  }
  clearRowState() {
    this.editId = null;
    this.editDraft = {};
    this.delId = null;
    this.flashId = null;
    this.rowMsg = "";
  }
  touched() {
    this.changedNote = true;
    // tells whoever hosts the card (the deal flyout, the surgeon flyout) that a usage was added, changed or deleted, so the lists can read the ratings again
    this.dispatchEvent(new CustomEvent("usageschanged"));
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
    this.addDraft = draftOf(this.addPortfolio, {});
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
    this.addDraft = {};
    this.search = "";
    this.hits = [];
    this.searched = false;
  }
  /** The sliding choice of portfolio (the shared one-pill slider). */
  get portfolioOptions() {
    return this.addable.map((o) => ({
      value: o.portfolio,
      label: portfolioTitle(o.portfolio)
    }));
  }
  get addRecordTypeId() {
    const o = this.addable.find((x) => x.portfolio === this.addPortfolio);
    return o ? o.recordTypeId : "";
  }
  get addTile() {
    if (!GRID[this.addPortfolio]) return null;
    return {
      ...buildTile(
        this.addPortfolio,
        this.addDraft,
        true,
        this.picks[this.addRecordTypeId] || {},
        "add"
      ),
      id: "add",
      key: "add",
      cls: "us bare",
      editable: true,
      showFoot: false
    };
  }
  handleAddPortfolio(event) {
    const next = event.detail && event.detail.value;
    if (!next || next === this.addPortfolio) return;
    this.addPortfolio = next;
    this.addDraft = draftOf(next, {});
  }
  get addDisabled() {
    return !(
      this.addHospital &&
      this.addPortfolio &&
      isComplete(this.addPortfolio, this.addDraft)
    );
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
    if (!isComplete(this.addPortfolio, this.addDraft)) {
      this.addMsg = "Fill in the fields marked with a red star.";
      return;
    }
    const portfolio = this.addPortfolio;
    const hospital = this.addHospital;
    this.run(
      () =>
        addWhole({
          surgeonId: this._recordId,
          hospitalId: hospital.id,
          portfolio,
          fieldsJson: JSON.stringify(payloadOf(portfolio, this.addDraft))
        }),
      (res) => {
        this.touched();
        this.flashId = res.usageId;
        if (res.existing) {
          this.rowMsgCls = "note warn";
          this.rowMsg = `This surgeon already has a ${portfolioTitle(portfolio)} usage for that company at ${hospital.name}, so nothing was added. It is highlighted below: use its pencil to change it.`;
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
  /** The sliding choice (Robert, 2026-11-17): short words, the shared one-pill slider. */
  get modeOptions() {
    return [
      { value: "mc", label: "MyCase" },
      { value: "us", label: "Usage" }
    ];
  }
  handleMode(event) {
    const next = event.detail && event.detail.value;
    if (!next || next === this.hmode) return;
    this.hmode = next;
    this.keepInView = true;
  }
  renderedCallback() {
    if (!this.keepInView) return;
    this.keepInView = false;
    this.fitOnScreen();
  }
  /**
   * After the table changes size, scroll the page just enough to show the whole card: its bottom edge if the card fits the window,
   * its top edge if the card is taller than the window (Robert, 2026-11-17: no re-scrolling after switching back to the longer table).
   */
  fitOnScreen() {
    const card = this.template.querySelector(".comp");
    if (!card || !card.scrollIntoView) return;
    const r = card.getBoundingClientRect();
    const high = window.innerHeight || document.documentElement.clientHeight;
    if (r.height >= high) {
      if (r.top < 0 || r.top > 0) card.scrollIntoView({ block: "start" });
    } else if (r.bottom > high || r.top < 0) {
      card.scrollIntoView({ block: "nearest" });
    }
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
      ? "Cases per year from the usage records, Zimmer Biomet (ZB) against every other company. A hip counts its stems only; the cups are implied."
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
