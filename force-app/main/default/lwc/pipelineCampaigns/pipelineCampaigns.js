import { LightningElement } from "lwc";
import { beginColumnDrag } from "c/pipelineColumnResize";
import getContext from "@salesforce/apex/PipelineCampaignController.getContext";
import listCampaigns from "@salesforce/apex/PipelineCampaignController.listCampaigns";
import getCampaign from "@salesforce/apex/PipelineCampaignController.getCampaign";
import saveCampaign from "@salesforce/apex/PipelineCampaignController.saveCampaign";
import setActive from "@salesforce/apex/PipelineCampaignController.setActive";
import searchPeople from "@salesforce/apex/PipelineCampaignController.searchPeople";
import searchSurgeons from "@salesforce/apex/PipelineCampaignController.searchSurgeons";
import addMember from "@salesforce/apex/PipelineCampaignController.addMember";
import deleteCampaign from "@salesforce/apex/PipelineCampaignController.deleteCampaign";
import removeMembers from "@salesforce/apex/PipelineCampaignController.removeMembers";
import matchNames from "@salesforce/apex/PipelineCampaignController.matchNames";
import addMembers from "@salesforce/apex/PipelineCampaignController.addMembers";
import {
  previewName,
  emptyForm,
  formFromCampaign,
  formProblems,
  toggled,
  sortRows,
  parseLines,
  cleaningReport,
  importCounts,
  MAX_IMPORT_LINES,
  NAME_LIMIT
} from "c/pipelineCampaignModel";

/** Shown on the screen; raise it with each change that goes out. */
export const CAMPAIGN_VERSION = "0.31";
const THEME_KEY = "pipelineCampaignTheme";
const WIDTHS_KEY = "pipelineCampaignWidths";

/** The sortable, resizable columns of the two tables: [id, heading, number?, default width]. */
const LIST_COLUMNS = [
  ["name", "Campaign", false, 420],
  ["portfolio", "Portfolio", false, 200],
  ["countries", "Countries", false, 180],
  ["manager", "Manager", false, 220],
  ["status", "Status", false, 130],
  ["members", "Members", true, 130],
  ["deals", "Deals linked", true, 150]
];
const RECON_COLUMNS = [
  ["file", "In your file", false, 260],
  ["match", "Match in Salesforce", false, 340],
  ["hospitals", "Current hospitals", false, 320],
  ["place", "Country · city", false, 170],
  ["status", "What we found", false, 230]
];
const TICK_WIDTH = 56;
const ACTION_WIDTH = 236; // the check screen's last column holds the Confirm button or the "will be added" mark, and the delete cross
const STATUS_ORDER = { exact: 0, suggest: 1, many: 2, none: 3, dup: 4 };

/** The name, with the English name after it only when it says something different. */
function withEnglish(name, english) {
  const same =
    !english ||
    english.trim().toLowerCase() === (name || "").trim().toLowerCase();
  return same ? name : name + " (English: " + english + ")";
}

function errorText(e) {
  return (
    (e && e.body && e.body.message) ||
    (e && e.message) ||
    "Something went wrong."
  );
}

/**
 * Pipeline: Campaign Management, the full-screen tool for campaign managers. A list of the Sales Campaigns, a form to create or
 * change one (the name is built by the system from the friendly name and the country codes), and one campaign with its members:
 * add a surgeon by searching (two letters or more, in the name or the English name, inside the campaign's countries until the
 * search is widened), remove members, switch the campaign off or on. All reading and saving is done by
 * PipelineCampaignController; this component keeps the screen state and holds no rules of its own (those are in
 * pipelineCampaignModel and in Salesforce).
 */
export default class PipelineCampaigns extends LightningElement {
  ctx = null;
  campaigns = [];
  view = "list"; // list, form or detail
  q = "";
  showInactive = false;
  fManager = ""; // list filters (Robert, 2026-11-07): a manager's id, a country code, a portfolio; empty means all
  fCountry = "";
  fPortfolio = "";
  busyCount = 0;
  error = "";
  detail = null;
  form = emptyForm("", "");
  problems = [];
  mgrQ = "";
  mgrOpen = false;
  mgrHits = [];
  memberQ = "";
  search = null;
  wide = false;
  timer;
  seq = 0;
  toast = "";
  descPending = false;
  pasteText = "";
  rows = []; // the check screen's rows
  sorts = {
    list: { id: "name", dir: 1 },
    recon: { id: "", dir: 1 }
  };
  widths = { list: null, recon: null }; // null: the table finds its own widths; otherwise {column: pixels}
  live = null;
  selectedIds = []; // the ticked members of the list
  deleteAsking = false; // the campaign screen is asking "are you sure?" before deleting
  removeAsking = false; // the members card is asking "are you sure?" before removing
  leaveAsking = false; // the check screen is asking "leave without adding?"
  leaveThen = null; // what to do if the person confirms they want to leave
  themeChoice = "light"; // light unless the person chose dark here (remembered on this computer)

  connectedCallback() {
    try {
      if (window.localStorage.getItem(THEME_KEY) === "dark") {
        this.themeChoice = "dark";
      }
      const saved = JSON.parse(
        window.localStorage.getItem(WIDTHS_KEY) || "null"
      );
      if (saved)
        this.widths = {
          list: saved.list || null,
          recon: saved.recon || null
        };
    } catch {
      // storage not available: stay on light
    }
    // a browser warning if the page is closed or left while a pasted list or a check screen holds work that is not added yet
    this.beforeUnload = (e) => {
      if (this.unsaved) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", this.beforeUnload);
    this.run(async () => {
      this.ctx = await getContext();
      this.campaigns = await listCampaigns();
    });
  }

  disconnectedCallback() {
    window.removeEventListener("beforeunload", this.beforeUnload);
  }

  /** Runs one thing behind the "please wait" cover and shows a plain message if it fails. */
  async run(work) {
    this.busyCount += 1;
    this.error = "";
    try {
      await work();
    } catch (e) {
      this.error = errorText(e);
    } finally {
      this.busyCount -= 1;
    }
  }

  // ---------- screen ----------
  get busy() {
    return this.busyCount > 0;
  }
  get theme() {
    return this.themeChoice;
  }
  get headColour() {
    return this.ctx ? this.ctx.headColour : "pink";
  }
  get version() {
    return "v" + CAMPAIGN_VERSION;
  }
  get themeOptions() {
    return [
      { value: "light", label: "Light", icon: "sun" },
      { value: "dark", label: "Dark", icon: "moon" }
    ];
  }
  get showOptions() {
    return [
      { value: "active", label: "Active" },
      { value: "all", label: "All" }
    ];
  }
  get showValue() {
    return this.showInactive ? "all" : "active";
  }
  handleShowPick(event) {
    this.showInactive = event.detail.value === "all";
  }
  get statusOptions() {
    return [
      { value: "active", label: "Active" },
      { value: "inactive", label: "Inactive" }
    ];
  }
  get statusValue() {
    return this.form.active ? "active" : "inactive";
  }
  handleStatusPick(event) {
    this.form = { ...this.form, active: event.detail.value === "active" };
  }
  get isList() {
    return this.view === "list";
  }
  get isForm() {
    return this.view === "form";
  }
  get isDetail() {
    return this.view === "detail";
  }
  get isImport() {
    return this.view === "import";
  }
  get isReconcile() {
    return this.view === "reconcile";
  }
  get ready() {
    return !!this.ctx;
  }
  get canManage() {
    return !!(this.ctx && this.ctx.canManage);
  }
  get cannotManage() {
    return !!this.ctx && !this.ctx.canManage;
  }

  handleThemePick(event) {
    this.themeChoice = event.detail.value;
    try {
      window.localStorage.setItem(THEME_KEY, this.themeChoice);
    } catch {
      // not remembered, still switches
    }
  }
  handleImport() {
    this.pasteText = "";
    this.rows = [];
    this.error = "";
    this.view = "import";
  }

  // ---------- where you are: one heading line that is also the trail (Robert, 2026-11-07): "Campaigns" (a link back) then this page's name ----------
  get crumbs() {
    const out = [{ label: "Sales Campaigns", target: "list", link: true }];
    if (this.isDetail) {
      out.push({ label: this.campaignName, target: "", link: false });
    } else if (this.isImport || this.isReconcile) {
      out.push({
        label: this.detail.campaign.name,
        target: "detail",
        link: true
      });
      out.push({ label: "Import members", target: "", link: false });
    } else if (this.form.id && this.detail) {
      out.push({
        label: this.detail.campaign.name,
        target: "detail",
        link: true
      });
      out.push({ label: "Edit", target: "", link: false });
    } else {
      out.push({ label: "New campaign", target: "", link: false });
    }
    return out.map((c, i) => ({ ...c, key: i }));
  }
  handleCrumb(event) {
    const t = event.currentTarget.dataset.target;
    this.guard(() => {
      if (t === "detail") {
        this.view = "detail";
      } else {
        this.handleBackToList();
      }
    });
  }
  /** True while the person holds work that is not saved: names on the check screen, or a pasted list (Robert, 2026-11-07). */
  get unsaved() {
    if (this.view === "reconcile") return this.rows.length > 0;
    if (this.view === "import") return this.pasteText.trim().length > 0;
    return false;
  }
  /** Runs a way out of the page; if work would be lost, asks first (the banner shows Stay here / Leave anyway). */
  guard(go) {
    if (this.view === "reconcile" && this.unsaved) {
      this.leaveThen = go;
      this.leaveAsking = true;
      return;
    }
    go();
  }
  handleStay() {
    this.leaveAsking = false;
    this.leaveThen = null;
  }
  handleLeave() {
    const go = this.leaveThen;
    this.leaveAsking = false;
    this.leaveThen = null;
    this.rows = [];
    if (go) go();
  }
  handleFullScreen() {
    let inFrame = true;
    try {
      inFrame = window.self !== window.top;
    } catch {
      inFrame = true;
    }
    if (inFrame) {
      window.open(
        window.location.origin + "/apex/PipelineCampaigns?nocache=1",
        "_blank",
        "noopener"
      );
      return;
    }
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen();
    }
  }

  // ---------- the list ----------
  get listRows() {
    const q = this.q.trim().toLowerCase();
    const keep = this.campaigns.filter(
      (c) =>
        (this.showInactive || c.active) &&
        (!q || c.name.toLowerCase().includes(q)) &&
        (!this.fManager || c.managerId === this.fManager) &&
        (!this.fCountry || c.countries.includes(this.fCountry)) &&
        (!this.fPortfolio || c.portfolios.includes(this.fPortfolio))
    );
    const by = {
      name: (c) => c.name,
      portfolio: (c) => c.portfolios.join(", "),
      countries: (c) => c.countries.join(" "),
      manager: (c) => c.managerName,
      status: (c) => (c.active ? 0 : 1),
      members: (c) => c.memberCount,
      deals: (c) => c.dealCount
    }[this.sorts.list.id];
    return sortRows(keep, by, this.sorts.list.dir).map((c) => ({
      ...c,
      countriesText: c.countries.join(" "),
      portfoliosText: c.portfolios.join(", "),
      statusText: c.active ? "Active" : "Inactive",
      statusCls: c.active ? "tag fill good" : "tag fill bad",
      gap: Math.max(0, c.memberCount - c.dealCount)
    }));
  }
  /** The choices of a filter dropdown, the first being "all". */
  filterOptions(all, items, chosen) {
    return [{ value: "", label: all, selected: !chosen }, ...items].map(
      (o) => ({ ...o, selected: o.value === chosen })
    );
  }
  get managerOptions() {
    const me = this.ctx ? this.ctx.userId : "";
    const seen = new Map();
    this.campaigns.forEach((c) => {
      if (c.managerId && !seen.has(c.managerId))
        seen.set(c.managerId, c.managerName);
    });
    const items = [...seen.entries()]
      .map(([value, label]) => ({
        value,
        label: value === me ? "Me: " + label : label
      }))
      .sort((a, b) => {
        if (a.value === me) return -1;
        if (b.value === me) return 1;
        return a.label.localeCompare(b.label);
      });
    return this.filterOptions("All managers", items, this.fManager);
  }
  get countryOptions() {
    const items = (this.ctx ? this.ctx.countries : []).map((o) => ({
      value: o.value,
      label: o.label
    }));
    return this.filterOptions("All countries", items, this.fCountry);
  }
  get portfolioOptions() {
    const items = (this.ctx ? this.ctx.portfolios : []).map((o) => ({
      value: o.value,
      label: o.label
    }));
    return this.filterOptions("All portfolios", items, this.fPortfolio);
  }
  get filtersOn() {
    return !!(this.q || this.fManager || this.fCountry || this.fPortfolio);
  }
  get listCountText() {
    const n = this.listRows.length;
    const total = this.campaigns.filter(
      (c) => this.showInactive || c.active
    ).length;
    return n === total
      ? `${n} campaign${n === 1 ? "" : "s"}`
      : `${n} of ${total} campaigns`;
  }
  handleFManager(event) {
    this.fManager = event.target.value;
  }
  handleFCountry(event) {
    this.fCountry = event.target.value;
  }
  handleFPortfolio(event) {
    this.fPortfolio = event.target.value;
  }
  handleClearFilters() {
    this.q = "";
    this.fManager = "";
    this.fCountry = "";
    this.fPortfolio = "";
  }
  get noRows() {
    return this.listRows.length === 0;
  }
  get hasQ() {
    return this.q.length > 0;
  }
  handleQ(event) {
    this.q = event.target.value;
  }
  handleQClear() {
    this.q = "";
  }
  handleOpen(event) {
    this.openCampaign(event.currentTarget.dataset.id);
  }
  openCampaign(id) {
    this.run(async () => {
      await this.loadDetail(id);
      this.toast = "";
    });
  }
  handleBackToList() {
    this.toast = "";
    this.run(async () => {
      this.campaigns = await listCampaigns();
      this.view = "list";
      this.detail = null;
    });
  }

  // ---------- the form ----------
  get countryChips() {
    return (this.ctx ? this.ctx.countries : []).map((o) => ({
      ...o,
      cls: this.form.countries.includes(o.value) ? "chip on" : "chip"
    }));
  }
  get portfolioChips() {
    return (this.ctx ? this.ctx.portfolios : []).map((o) => ({
      ...o,
      cls: this.form.portfolios.includes(o.value) ? "chip caps on" : "chip caps"
    }));
  }
  get nameLength() {
    return this.form.friendlyName.length;
  }
  get nameCount() {
    return `${this.nameLength} / ${NAME_LIMIT}`;
  }
  get nameLimit() {
    return NAME_LIMIT;
  }
  get namePreview() {
    return previewName(
      this.form.friendlyName,
      this.form.countries,
      this.ctx ? this.ctx.countries : []
    );
  }
  get activeText() {
    return this.form.active
      ? "Active: deals can be linked to it"
      : "Inactive: hidden from the choices";
  }
  get saveDisabled() {
    return formProblems(this.form).length > 0;
  }
  get hasProblems() {
    return this.problems.length > 0;
  }
  get problemItems() {
    return this.problems.map((p, i) => ({ key: i, text: p }));
  }
  get managerShown() {
    return this.mgrOpen ? this.mgrQ : this.form.managerName;
  }
  get hasManagerText() {
    return this.managerShown.length > 0;
  }
  get showMgrPop() {
    return this.mgrOpen && this.mgrQ.trim().length >= 1;
  }
  get mgrNone() {
    return this.mgrHits.length === 0 && this.mgrQ.trim().length >= 2;
  }
  get mgrShort() {
    return this.mgrQ.trim().length < 2;
  }

  /** A textarea cannot take its text from the template, so the description is put in once when the form opens. */
  renderedCallback() {
    if (this.descPending && this.isForm) {
      const area = this.template.querySelector("textarea");
      if (area) {
        area.value = this.form.description;
        this.descPending = false;
      }
    }
    // the column headings (and, on the check screen, the banner) stay in view while the list scrolls: measure the top bar and the banner so the headings stick just under them
    if (this.isReconcile || this.isDetail || this.isList) {
      const root = this.template.querySelector(".root");
      const bar = this.template.querySelector(".top");
      const banner = this.template.querySelector(".unsaved");
      if (root && bar) {
        root.style.setProperty("--topbar", bar.offsetHeight + "px");
        root.style.setProperty(
          "--stick",
          bar.offsetHeight + (banner ? banner.offsetHeight : 0) + "px"
        );
      }
    }
  }

  handleNew() {
    this.descPending = true;
    this.form = emptyForm(
      this.ctx ? this.ctx.userId : "",
      this.ctx ? this.ctx.userName : ""
    );
    this.problems = [];
    this.mgrOpen = false;
    this.view = "form";
  }
  handleEdit() {
    this.descPending = true;
    this.form = formFromCampaign(this.detail.campaign);
    this.problems = [];
    this.mgrOpen = false;
    this.view = "form";
  }
  handleCancelForm() {
    if (this.form.id && this.detail) {
      this.view = "detail";
    } else {
      this.view = "list";
    }
  }
  handleName(event) {
    this.form = { ...this.form, friendlyName: event.target.value };
  }
  handleCountry(event) {
    this.form = {
      ...this.form,
      countries: toggled(this.form.countries, event.currentTarget.dataset.v)
    };
  }
  handlePortfolio(event) {
    this.form = {
      ...this.form,
      portfolios: toggled(this.form.portfolios, event.currentTarget.dataset.v)
    };
  }
  handleStart(event) {
    this.form = { ...this.form, startDate: event.target.value };
  }
  handleEnd(event) {
    this.form = { ...this.form, endDate: event.target.value };
  }
  handleDesc(event) {
    this.form = { ...this.form, description: event.target.value };
  }
  handleMgrInput(event) {
    this.mgrQ = event.target.value;
    this.mgrOpen = true;
    clearTimeout(this.timer);
    const mine = ++this.seq;
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    this.timer = setTimeout(async () => {
      if (this.mgrQ.trim().length < 2) {
        this.mgrHits = [];
        return;
      }
      try {
        const hits = await searchPeople({ term: this.mgrQ });
        if (mine === this.seq) this.mgrHits = hits;
      } catch (e) {
        this.error = errorText(e);
      }
    }, 250);
  }
  handleMgrClear() {
    this.mgrQ = "";
    this.mgrOpen = true;
    this.mgrHits = [];
    this.form = { ...this.form, managerId: "", managerName: "" };
  }
  handleMgrPick(event) {
    const d = event.currentTarget.dataset;
    this.form = { ...this.form, managerId: d.id, managerName: d.name };
    this.mgrOpen = false;
    this.mgrQ = "";
  }
  handleSave() {
    this.problems = formProblems(this.form);
    if (this.problems.length) return;
    this.run(async () => {
      const id = await saveCampaign({ payload: JSON.stringify(this.form) });
      this.campaigns = await listCampaigns();
      await this.loadDetail(id);
    });
  }
  async loadDetail(id) {
    this.detail = await getCampaign({ campaignId: id });
    this.view = "detail";
    this.selectedIds = [];
    this.deleteAsking = false;
    this.removeAsking = false;
    this.memberQ = "";
    this.search = null;
    this.wide = false;
  }

  // ---------- one campaign ----------
  get campaign() {
    return this.detail ? this.detail.campaign : null;
  }
  get campaignName() {
    return this.campaign ? this.campaign.name : "";
  }
  get statusTag() {
    return this.campaign && this.campaign.active
      ? "tag fill good"
      : "tag fill bad";
  }
  get statusText() {
    return this.campaign && this.campaign.active ? "Active" : "Inactive";
  }
  get facts() {
    const c = this.campaign;
    if (!c) return "";
    const bits = [c.portfolios.join(", ")];
    if (c.managerName) bits.push("Manager " + c.managerName);
    if (c.startDate || c.endDate)
      bits.push((c.startDate || "…") + " to " + (c.endDate || "…"));
    return bits.join(" · ");
  }
  /** Deactivate is red (it switches something off); Activate is green (Robert, 2026-11-07: red is for destructive actions). */
  get toggleActiveCls() {
    return this.campaign && this.campaign.active ? "btn danger" : "btn good";
  }
  get toggleActiveText() {
    return this.campaign && this.campaign.active ? "Deactivate" : "Activate";
  }
  get noMembers() {
    return !this.detail || this.detail.members.length === 0;
  }
  /** The members ticked in the list (the list tells us). */
  get tickedIds() {
    return this.selectedIds;
  }
  handleSelection(event) {
    this.selectedIds = event.detail.ids;
  }
  /** The Remove button only appears once something is ticked (Robert, 2026-11-07): no greyed-out button taking up room. */
  get showRemoveButton() {
    return this.canManage && this.tickedIds.length > 0;
  }
  get removeDisabled() {
    return this.tickedIds.length === 0;
  }
  get removeText() {
    const n = this.tickedIds.length;
    return n
      ? `Remove ${n} campaign member${n === 1 ? "" : "s"}`
      : "Remove campaign members";
  }
  get truncated() {
    return !!(this.detail && this.detail.truncated);
  }
  get activeNote() {
    return this.campaign && !this.campaign.active
      ? "This campaign is inactive: deals cannot be linked to it, and it is hidden from the choices."
      : "";
  }
  get hasActiveNote() {
    return this.activeNote.length > 0;
  }
  get hasToast() {
    return this.toast.length > 0;
  }

  // Delete campaign only asks "Are you sure?" under the top bar; the second button does the deleting (Robert, 2026-11-07)
  get deleteAskText() {
    const c = this.campaign;
    if (!c) return "";
    const m = c.memberCount;
    const d = c.dealCount;
    const has = `${m} member${m === 1 ? "" : "s"} and ${d} linked deal${d === 1 ? "" : "s"}`;
    return `Delete ${c.name} for good? It has ${has}. The members and the links are removed; the surgeons and the deals are not. Deactivate hides it instead.`;
  }
  handleDelete() {
    this.deleteAsking = true;
  }
  handleDeleteNo() {
    this.deleteAsking = false;
  }
  handleDeleteYes() {
    const c = this.campaign;
    this.deleteAsking = false;
    if (!c) return;
    this.run(async () => {
      await deleteCampaign({ campaignId: c.id });
      this.campaigns = await listCampaigns();
      this.detail = null;
      this.view = "list";
      this.toast = `Deleted ${c.name}.`;
    });
  }
  handleToggleActive() {
    const next = !this.campaign.active;
    this.run(async () => {
      await setActive({ campaignId: this.campaign.id, active: next });
      await this.loadDetail(this.campaign.id);
      this.campaigns = await listCampaigns();
    });
  }
  // the Remove button only asks "Are you sure?" underneath; the second button does the removing (Robert, 2026-11-07)
  get removeAskText() {
    const n = this.tickedIds.length;
    const name = this.campaign ? this.campaign.name : "this campaign";
    return `Remove ${n} member${n === 1 ? "" : "s"} from ${name}? The surgeon${n === 1 ? " stays" : "s stay"} in Salesforce; only the link to this campaign is removed.`;
  }
  get removeYesText() {
    const n = this.tickedIds.length;
    return `Yes, remove ${n}`;
  }
  get showRemoveAsk() {
    return this.removeAsking && this.tickedIds.length > 0;
  }
  handleRemove() {
    if (this.tickedIds.length) this.removeAsking = true;
  }
  handleRemoveNo() {
    this.removeAsking = false;
  }
  handleRemoveYes() {
    const ids = this.tickedIds;
    this.removeAsking = false;
    if (!ids.length) return;
    this.run(async () => {
      await removeMembers({ memberIds: ids });
      await this.loadDetail(this.campaign.id);
      const list = this.template.querySelector("c-pipeline-campaign-members");
      if (list) list.clearSelection();
      this.toast = `Removed ${ids.length} from the campaign.`;
    });
  }

  // ---------- adding a surgeon ----------
  get hasMemberQ() {
    return this.memberQ.length > 0;
  }
  get showSearch() {
    return this.memberQ.trim().length >= 1;
  }
  get searchShort() {
    return this.memberQ.trim().length < 2;
  }
  get hits() {
    return ((this.search && this.search.hits) || []).map((h) => ({
      ...h,
      key: h.id,
      nameText: withEnglish(h.name, h.preferredName),
      sub: [
        h.hospitals ? "Hospitals: " + h.hospitals : "",
        [h.country, h.city].filter(Boolean).join(" · "),
        h.type
      ]
        .filter(Boolean)
        .join(" · "),
      disabled: h.alreadyMember,
      already: h.alreadyMember
    }));
  }
  get noHits() {
    return !this.searchShort && this.search && this.search.hits.length === 0;
  }
  get scopeText() {
    if (!this.search) return "";
    return this.search.scope === "ALL"
      ? "Searching every country."
      : "Searching " + this.search.scope + ".";
  }
  get widenText() {
    return this.wide ? "Back to the campaign's countries" : "Widen search";
  }
  get outsideText() {
    return !this.wide && this.search && this.search.outside > 0
      ? `${this.search.outside >= 50 ? "50 or more" : this.search.outside} more match outside these countries.`
      : "";
  }
  get heldBackText() {
    return this.search && this.search.heldBack > 0
      ? `${this.search.heldBack >= 50 ? "50 or more" : this.search.heldBack} staging, demo or clinic-contact accounts with this name are not offered: only real physicians and emerging consultants can join a campaign.`
      : "";
  }

  handleMemberQ(event) {
    this.memberQ = event.target.value;
    this.runSearch();
  }
  handleMemberQClear() {
    this.memberQ = "";
    this.search = null;
  }
  handleWiden() {
    this.wide = !this.wide;
    this.runSearch(true);
  }
  runSearch(now) {
    clearTimeout(this.timer);
    const mine = ++this.seq;
    if (this.memberQ.trim().length < 2) {
      this.search = null;
      return;
    }
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    this.timer = setTimeout(
      async () => {
        try {
          const r = await searchSurgeons({
            campaignId: this.campaign.id,
            term: this.memberQ,
            wide: this.wide
          });
          if (mine === this.seq) this.search = r;
        } catch (e) {
          this.error = errorText(e);
        }
      },
      now ? 0 : 250
    );
  }
  handleAdd(event) {
    const id = event.currentTarget.dataset.id;
    this.run(async () => {
      await addMember({ campaignId: this.campaign.id, surgeonId: id });
      await this.loadDetail(this.campaign.id);
      this.toast = "Added to the campaign.";
    });
  }

  // ---------- importing a list of names (Robert, 2026-11-07): paste or file, then a check screen; nothing is saved until every row is settled ----------
  get pasteCount() {
    return parseLines(this.pasteText).length;
  }
  get pasteDisabled() {
    return this.pasteCount === 0;
  }
  get pasteCountText() {
    const n = this.pasteCount;
    return n === 1 ? "1 name" : `${n} names`;
  }
  get cleanLineCount() {
    return cleaningReport(this.pasteText).lines;
  }
  get hasCleanNote() {
    return this.cleanLineCount > 0;
  }
  /** Symbols are taken out of the pasted names before they are matched; the person is told, never surprised. */
  get cleanNote() {
    const r = cleaningReport(this.pasteText);
    const lines = r.lines === 1 ? "1 line" : `${r.lines} lines`;
    return `Symbols (${r.symbols.join(" ")}) are removed from ${lines}, and the names are matched without them.`;
  }
  get maxLines() {
    return MAX_IMPORT_LINES;
  }
  handlePaste(event) {
    this.pasteText = event.target.value;
  }
  handleFile(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      this.pasteText = String(reader.result || "");
      const box = this.template.querySelector("textarea");
      if (box) box.value = this.pasteText;
    };
    reader.readAsText(file);
  }
  handleBackToCampaign() {
    this.guard(() => {
      this.view = "detail";
    });
  }
  handleCheckNames() {
    const lines = parseLines(this.pasteText);
    if (!lines.length) return;
    if (lines.length > MAX_IMPORT_LINES) {
      this.error = `Please import up to ${MAX_IMPORT_LINES} names at a time (this list has ${lines.length}).`;
      return;
    }
    this.run(async () => {
      const found = await matchNames({
        campaignId: this.campaign.id,
        lines
      });
      this.rows = found.map((r) => {
        const chosen = r.pickId
          ? (r.cands || []).find((c) => c.id === r.pickId) || null
          : null;
        return {
          text: r.text,
          status: r.status,
          cands: r.cands || [],
          pick: r.pickId || "",
          chosen,
          ok: r.status === "exact" && !!chosen, // an exact match arrives ticked; everything else waits for the person's Confirm

          del: false,
          look: false,
          q: "",
          search: null
        };
      });
      this.leaveAsking = false;
      this.view = "reconcile";
    });
  }
  get reconCounts() {
    return importCounts(this.rows);
  }
  get unsavedText() {
    const name = this.campaign ? this.campaign.name : "the campaign";
    return `Nothing is added to ${name} until you press ${this.addAllText}.`;
  }
  get tickedText() {
    const c = this.reconCounts;
    const parts = [`${c.toAdd} ready to add`];
    if (c.need) parts.push(`${c.need} need a decision`);
    return parts.join(" · ");
  }
  get addAllDisabled() {
    return this.reconCounts.toAdd === 0;
  }
  get addAllText() {
    const n = this.reconCounts.toAdd;
    return `Add ${n} member${n === 1 ? "" : "s"}`;
  }
  statusInfo(r) {
    const t = {
      exact: ["Exact match", "tag ok"],
      suggest: ["Possible match", "tag warn"],
      many: ["Several people share this name", "tag warn"],
      none: ["Not found", "tag bad"],
      dup: ["Already a member: skipped", "tag off"]
    }[r.status];
    return { text: t[0], cls: t[1] };
  }
  get reconRows() {
    const place = (c) => {
      return c ? [c.country, c.city].filter(Boolean).join(" · ") : "";
    };
    const by = {
      file: (r) => r.text,
      match: (r) => (r.chosen ? r.chosen.name : ""),
      hospitals: (r) => (r.chosen ? r.chosen.hospitals : ""),
      place: (r) => place(r.chosen),
      status: (r) => STATUS_ORDER[r.status]
    };
    const indexed = this.rows.map((r, i) => ({ ...r, i }));
    const sort = this.sorts.recon;
    const ordered = sort.id
      ? sortRows(indexed, by[sort.id], sort.dir)
      : indexed;
    return ordered.map((r) => {
      const info = this.statusInfo(r);
      const lookMode = r.look || r.status === "none";
      const showLookupBox = !r.del && lookMode && !r.pick;
      const showSelect = !r.del && !lookMode && r.status === "many";
      const showName = !r.del && !!r.pick && !showSelect;
      const hits = ((r.search && r.search.hits) || []).map((h) => ({
        ...h,
        key: h.id,
        nameText: withEnglish(h.name, h.preferredName),
        hospitalsText: h.hospitals || "no hospital on record",
        placeText: [h.country, h.city].filter(Boolean).join(" · ")
      }));
      const typed = r.q.trim().length;
      return {
        key: "r" + r.i,
        i: r.i,
        text: r.text,
        rowCls: r.del ? "gone" : "",
        statusText: info.text,
        statusCls: info.cls,
        showTick: r.status !== "dup" && !r.del,
        tickDisabled: !r.pick,
        ok: r.ok,
        showConfirm: !r.del && r.status !== "dup" && !!r.pick && !r.ok,
        confirmText: r.status === "suggest" ? "Yes, this one" : "Confirm",
        showReady: !r.del && r.status !== "dup" && !!r.pick && r.ok,
        showNeeds: !r.del && r.status !== "dup" && !r.pick,
        showSelect,
        options: [
          { value: "", label: "Choose who it is…", selected: !r.pick },
          ...r.cands.map((c) => ({
            value: c.id,
            selected: r.pick === c.id,
            label:
              withEnglish(c.name, c.preferredName) +
              " · " +
              (c.hospitals || "no hospital on record") +
              " · " +
              place(c)
          }))
        ],
        showName,
        nameText: r.chosen
          ? withEnglish(r.chosen.name, r.chosen.preferredName)
          : "",
        showUnpick: showName && lookMode,
        showLookupBox,
        showLookupBtn:
          !r.del &&
          !lookMode &&
          (r.status === "many" || r.status === "suggest"),
        q: r.q,
        hasQ: typed > 0,
        popOpen: showLookupBox && typed > 0,
        popShort: typed < 2,
        popHits: hits,
        popNone: typed >= 2 && r.search && hits.length === 0,
        popScope: r.search
          ? r.search.scope === "ALL"
            ? "Searching every country."
            : "Searching " + r.search.scope + "."
          : "",
        wideText: r.wide ? "Back to the campaign's countries" : "Widen search",
        hospitals: r.chosen ? r.chosen.hospitals : "",
        placeText: place(r.chosen),
        showDel: !r.del && r.status !== "dup", // an existing member needs no action: they are simply passed over
        showUndo: r.del,
        note:
          r.status === "many" && !r.pick && !r.del
            ? "Check who this is before you pick."
            : ""
      };
    });
  }
  patchRow(i, patch) {
    this.rows = this.rows.map((r, k) => (k === i ? { ...r, ...patch } : r));
  }
  rowIndex(event) {
    return Number(event.currentTarget.dataset.i);
  }
  handleRowOk(event) {
    this.patchRow(this.rowIndex(event), { ok: event.target.checked });
  }
  handleRowSelect(event) {
    const i = this.rowIndex(event);
    const id = event.target.value;
    const chosen = this.rows[i].cands.find((c) => c.id === id) || null;
    this.patchRow(i, { pick: id, chosen, ok: false });
  }
  handleRowConfirm(event) {
    this.patchRow(this.rowIndex(event), { ok: true });
  }
  handleRowLookup(event) {
    this.patchRow(this.rowIndex(event), {
      look: true,
      pick: "",
      chosen: null,
      ok: false,
      q: "",
      search: null
    });
  }
  handleRowUnpick(event) {
    this.patchRow(this.rowIndex(event), {
      pick: "",
      chosen: null,
      ok: false,
      q: "",
      search: null
    });
  }
  handleRowQ(event) {
    const i = this.rowIndex(event);
    this.patchRow(i, { q: event.target.value });
    this.runRowSearch(i, false);
  }
  handleRowQClear(event) {
    this.patchRow(this.rowIndex(event), { q: "", search: null });
  }
  handleRowWiden(event) {
    const i = this.rowIndex(event);
    this.patchRow(i, { wide: !this.rows[i].wide });
    this.runRowSearch(i, true);
  }
  runRowSearch(i, now) {
    clearTimeout(this.timer);
    const mine = ++this.seq;
    const row = () => this.rows[i];
    if (row().q.trim().length < 2) {
      this.patchRow(i, { search: null });
      return;
    }
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    this.timer = setTimeout(
      async () => {
        try {
          const r = await searchSurgeons({
            campaignId: this.campaign.id,
            term: row().q,
            wide: !!row().wide
          });
          if (mine === this.seq) this.patchRow(i, { search: r });
        } catch (e) {
          this.error = errorText(e);
        }
      },
      now ? 0 : 250
    );
  }
  handleRowPickFound(event) {
    const i = this.rowIndex(event);
    const id = event.currentTarget.dataset.id;
    const hit = this.rows[i].search.hits.find((h) => h.id === id);
    this.patchRow(i, {
      pick: id,
      chosen: hit,
      ok: false,
      q: "",
      search: null
    });
  }
  handleRowCreate() {
    window.open(
      window.location.origin + "/lightning/o/Account/new",
      "_blank",
      "noopener"
    );
  }
  handleRowDelete(event) {
    this.patchRow(this.rowIndex(event), { del: true });
  }
  handleRowUndo(event) {
    this.patchRow(this.rowIndex(event), { del: false });
  }
  handleAddAll() {
    const ids = [
      ...new Set(
        this.rows
          .filter((r) => !r.del && r.status !== "dup" && r.pick && r.ok)
          .map((r) => r.pick)
      )
    ];
    if (!ids.length) return;
    this.run(async () => {
      const r = await addMembers({
        campaignId: this.campaign.id,
        surgeonIds: ids
      });
      await this.loadDetail(this.campaign.id);
      this.campaigns = await listCampaigns();
      let msg = `Added ${r.added} member${r.added === 1 ? "" : "s"}.`;
      if (r.alreadyMembers)
        msg += ` ${r.alreadyMembers} were already in the campaign.`;
      if (r.problems && r.problems.length)
        msg += " Some could not be added: " + r.problems.join("; ");
      this.toast = msg;
      this.rows = [];
      this.leaveAsking = false;
    });
  }

  // ---------- tables: click a heading to sort, drag its edge to resize, double-click the edge to reset ----------
  heads(table, defs) {
    const sort = this.sorts[table];
    return defs.map((d) => ({
      id: d[0],
      label: d[1],
      cls: d[2] ? "num" : "",
      arrow: sort.id === d[0] ? (sort.dir === 1 ? " ▲" : " ▼") : ""
    }));
  }
  get listHeads() {
    return this.heads("list", LIST_COLUMNS);
  }
  current(table) {
    return this.live && this.live.table === table
      ? this.live.widths
      : this.widths[table];
  }
  cols(table, defs, lead, trail) {
    const w = this.current(table);
    if (!w) return [];
    const out = defs.map((d) => ({
      id: d[0],
      px: w[d[0]] || d[3],
      style: "width:" + (w[d[0]] || d[3]) + "px"
    }));
    if (lead)
      out.unshift({ id: "__tick", px: lead, style: "width:" + lead + "px" });
    if (trail)
      out.push({ id: "__end", px: trail, style: "width:" + trail + "px" });
    return out;
  }
  get listCols() {
    return this.cols("list", LIST_COLUMNS, 0);
  }
  get reconCols() {
    return this.cols("recon", RECON_COLUMNS, TICK_WIDTH, ACTION_WIDTH);
  }
  get reconHasWidths() {
    return this.reconCols.length > 0;
  }
  get reconTableStyle() {
    return this.tableStyle(this.reconCols);
  }
  get reconHeads() {
    return this.heads("recon", RECON_COLUMNS);
  }
  get listHasWidths() {
    return this.listCols.length > 0;
  }
  tableStyle(cols) {
    if (!cols.length) return "";
    const total = cols.reduce((a, c) => a + c.px, 0);
    return "table-layout:fixed;width:" + total + "px";
  }
  get listTableStyle() {
    return this.tableStyle(this.listCols);
  }

  handleSort(event) {
    const { table, id } = event.currentTarget.dataset;
    const now = this.sorts[table];
    this.sorts = {
      ...this.sorts,
      [table]: { id, dir: now.id === id ? -now.dir : 1 }
    };
  }
  handleResizeStart(event) {
    const { table, id } = event.currentTarget.dataset;
    const snapshot = {};
    this.template
      .querySelectorAll('th[data-table="' + table + '"][data-id]')
      .forEach((th) => {
        snapshot[th.dataset.id] = Math.round(th.getBoundingClientRect().width);
      });
    this.live = { table, widths: { ...snapshot } };
    beginColumnDrag(
      event,
      snapshot[id] || 140,
      60,
      (width) => {
        this.live = { table, widths: { ...this.live.widths, [id]: width } };
      },
      () => {
        const done = this.live.widths;
        this.live = null;
        this.widths = { ...this.widths, [table]: done };
        this.saveWidths();
      }
    );
  }
  handleWidthsReset(event) {
    const table = event.currentTarget.dataset.table;
    this.widths = { ...this.widths, [table]: null };
    this.saveWidths();
  }
  saveWidths() {
    try {
      window.localStorage.setItem(WIDTHS_KEY, JSON.stringify(this.widths));
    } catch {
      // not remembered
    }
  }
}
