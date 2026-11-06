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
import removeMembers from "@salesforce/apex/PipelineCampaignController.removeMembers";
import {
  previewName,
  emptyForm,
  formFromCampaign,
  formProblems,
  toggled,
  memberCounts,
  sortRows,
  NAME_LIMIT
} from "c/pipelineCampaignModel";

/** Shown on the screen; raise it with each change that goes out. */
export const CAMPAIGN_VERSION = "0.9";
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
const MEMBER_COLUMNS = [
  ["name", "Surgeon", false, 340],
  ["hospitals", "Current hospitals", false, 380],
  ["place", "Country · city", false, 200],
  ["type", "Type", false, 200],
  ["deal", "Deal in this campaign", false, 240]
];
const TICK_WIDTH = 56;

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
  sorts = { list: { id: "name", dir: 1 }, members: { id: "name", dir: 1 } };
  widths = { list: null, members: null }; // null: the table finds its own widths; otherwise {column: pixels}
  live = null;
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
          members: saved.members || null
        };
    } catch {
      // storage not available: stay on light
    }
    this.run(async () => {
      this.ctx = await getContext();
      this.campaigns = await listCampaigns();
    });
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
  get darkCls() {
    return this.theme === "dark" ? "pill on" : "pill";
  }
  get lightCls() {
    return this.theme === "light" ? "pill on" : "pill";
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
  get ready() {
    return !!this.ctx;
  }
  get canManage() {
    return !!(this.ctx && this.ctx.canManage);
  }
  get cannotManage() {
    return !!this.ctx && !this.ctx.canManage;
  }

  handleTheme(event) {
    this.themeChoice = event.currentTarget.dataset.theme;
    try {
      window.localStorage.setItem(THEME_KEY, this.themeChoice);
    } catch {
      // not remembered, still switches
    }
  }
  handleImport() {
    this.toast =
      "Importing a list of surgeons is the next piece to be built. For now, add them one at a time here.";
  }

  // ---------- where you are: one heading line that is also the trail (Robert, 2026-11-07): "Campaigns" (a link back) then this page's name ----------
  get crumbs() {
    const out = [{ label: "Campaigns", target: "list", link: true }];
    if (this.isDetail) {
      out.push({ label: this.campaignName, target: "", link: false });
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
    if (t === "detail") {
      this.view = "detail";
    } else {
      this.handleBackToList();
    }
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
        (!q || c.name.toLowerCase().includes(q))
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
      statusCls: c.active ? "tag ok" : "tag off",
      gap: Math.max(0, c.memberCount - c.dealCount)
    }));
  }
  get noRows() {
    return this.listRows.length === 0;
  }
  get inactiveCls() {
    return this.showInactive ? "chip on" : "chip";
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
  handleInactive() {
    this.showInactive = !this.showInactive;
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
  get activeSwitchCls() {
    return this.form.active ? "switch on" : "switch";
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
  handleActiveSwitch() {
    this.form = { ...this.form, active: !this.form.active };
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
    return this.campaign && this.campaign.active ? "tag ok" : "tag off";
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
  get toggleActiveText() {
    return this.campaign && this.campaign.active ? "Deactivate" : "Activate";
  }
  get counts() {
    return memberCounts(this.detail ? this.detail.members : []);
  }
  get memberRows() {
    const by = {
      name: (m) => m.name,
      hospitals: (m) => m.hospitals,
      place: (m) => [m.country, m.city].filter(Boolean).join(" · "),
      type: (m) => m.type,
      deal: (m) => m.dealCount
    }[this.sorts.members.id];
    const sorted = sortRows(
      this.detail ? this.detail.members : [],
      by,
      this.sorts.members.dir
    );
    return sorted.map((m) => {
      const has = m.dealCount > 0;
      return {
        ...m,
        key: m.memberId,
        nameText: withEnglish(m.name, m.preferredName),
        placeText: [m.country, m.city].filter(Boolean).join(" · "),
        dealText: has
          ? m.dealCount +
            (m.dealCount > 1 ? " deals" : " deal") +
            (m.stages ? " · " + m.stages : "")
          : "No deal yet",
        dealCls: has ? "tag ok" : "tag warn",
        ticked: !!m.ticked
      };
    });
  }
  get noMembers() {
    return !this.detail || this.detail.members.length === 0;
  }
  get tickedIds() {
    return (this.detail ? this.detail.members : [])
      .filter((m) => m.ticked)
      .map((m) => m.memberId);
  }
  get removeDisabled() {
    return this.tickedIds.length === 0;
  }
  get removeText() {
    const n = this.tickedIds.length;
    return n ? `Remove ${n} ticked` : "Remove ticked";
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

  handleTick(event) {
    const id = event.target.dataset.id;
    this.detail = {
      ...this.detail,
      members: this.detail.members.map((m) => {
        return m.memberId === id ? { ...m, ticked: event.target.checked } : m;
      })
    };
  }
  handleToggleActive() {
    const next = !this.campaign.active;
    this.run(async () => {
      await setActive({ campaignId: this.campaign.id, active: next });
      await this.loadDetail(this.campaign.id);
      this.campaigns = await listCampaigns();
    });
  }
  handleRemove() {
    const ids = this.tickedIds;
    if (!ids.length) return;
    this.run(async () => {
      await removeMembers({ memberIds: ids });
      await this.loadDetail(this.campaign.id);
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
  get memberHeads() {
    return this.heads("members", MEMBER_COLUMNS);
  }
  current(table) {
    return this.live && this.live.table === table
      ? this.live.widths
      : this.widths[table];
  }
  cols(table, defs, lead) {
    const w = this.current(table);
    if (!w) return [];
    const out = defs.map((d) => ({
      id: d[0],
      px: w[d[0]] || d[3],
      style: "width:" + (w[d[0]] || d[3]) + "px"
    }));
    if (lead)
      out.unshift({ id: "__tick", px: lead, style: "width:" + lead + "px" });
    return out;
  }
  get listCols() {
    return this.cols("list", LIST_COLUMNS, 0);
  }
  get memberCols() {
    return this.cols("members", MEMBER_COLUMNS, TICK_WIDTH);
  }
  get listHasWidths() {
    return this.listCols.length > 0;
  }
  get memberHasWidths() {
    return this.memberCols.length > 0;
  }
  tableStyle(cols) {
    if (!cols.length) return "";
    const total = cols.reduce((a, c) => a + c.px, 0);
    return "table-layout:fixed;width:" + total + "px";
  }
  get listTableStyle() {
    return this.tableStyle(this.listCols);
  }
  get memberTableStyle() {
    return this.tableStyle(this.memberCols);
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
