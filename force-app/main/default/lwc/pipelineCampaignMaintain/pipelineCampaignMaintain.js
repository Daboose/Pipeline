import { LightningElement, api } from "lwc";
import maintainDeals from "@salesforce/apex/PipelineCampaignController.maintainDeals";
import removeMemberAndDeals from "@salesforce/apex/PipelineCampaignController.removeMemberAndDeals";
import setLink from "@salesforce/apex/PipelineDealCampaignController.setLink";
import { formatMoney } from "c/pipelineFormat";
import { usdAmount } from "c/pipelineCampaignModel";

const TOAST_MS = 2500;
const ASK_MS = 450; // the confirmation fades out over 0.4 s, then comes off the page

/** "Name (English: Name)" the way the members list writes it, so a surgeon is named the same in both modes. */
function withEnglish(name, english) {
  const same =
    !english ||
    english.trim().toLowerCase() === (name || "").trim().toLowerCase();
  return same ? name : name + " (English: " + english + ")";
}
/** The Type column's words (Robert, 2026-11-25), plain text. */
const KIND_WORD = { opp: "Opportunity", risk: "Risk", rosa: "ROSA" };
/** "GOLD" as "Gold". */
function proper(rating) {
  const t = String(rating || "").toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * Pipeline: the Maintain mode of the campaign view (Robert, 2026-11-16; mockup docs/mockups/pipeline_campaign_maintain_v1.html). For each
 * surgeon the parent hands it, it lists that surgeon's open deals (open and closed when Include Closed is ticked) that fit the campaign (opportunities and, when ticked, risks; never ROSA),
 * whoever owns them, with the brand, value, owner and stage, and a round + to put the deal in the campaign or a minus to take it out.
 * Each press is saved at once, under a "Please wait" cover, by PipelineDealCampaignController.setLink (which checks the person may edit the
 * deal and that the deal fits the campaign), and announces `dealchange` so the screen can re-read the campaign's tiles and the deals.
 *
 * Who calls it: pipelineCampaignMembers, in Pipeline only. What it touches: reads through PipelineCampaignController.maintainDeals and
 * changes only the links between a deal and this campaign. It never changes a deal.
 */
export default class PipelineCampaignMaintain extends LightningElement {
  /**
   * The surgeons to list (MemberRow), in order. When the surgeons themselves change (one was added or taken out in this screen or
   * elsewhere), the deals are read again, because they are read for the campaign's members: without this a surgeon added just now showed
   * "no open deals" until the person left Maintain and came back (Robert, 2026-11-20).
   */
  @api
  get members() {
    return this._members;
  }
  set members(value) {
    this._members = value || [];
    const key = this._members
      .map((m) => m.accountId)
      .sort()
      .join(",");
    const changed = this._memberKey !== undefined && key !== this._memberKey;
    this._memberKey = key;
    if (changed && this.connected && this._campaign) this.load(true);
  }
  /** US dollars: the value column shows each deal in US dollars with these Salesforce rates (usd true and rates read), else its own currency. */
  @api usd = false;
  @api rates = null;
  /** Which kinds of deal to list: { opp: true, risk: false, rosa: true }. */
  @api types = { opp: true, risk: false, rosa: true };
  /** Include Closed (Robert, 2026-11-19): true also lists the closed deals that fit; false lists open deals only. A change reads the deals again. */
  @api
  get includeClosed() {
    return this._includeClosed;
  }
  set includeClosed(value) {
    const next = value === true;
    const changed = next !== this._includeClosed;
    this._includeClosed = next;
    if (changed && this.connected && this._campaign) this.load();
  }
  /** The campaign (CampaignRow). A different campaign reads its deals again. */
  @api
  get campaign() {
    return this._campaign;
  }
  set campaign(value) {
    const before = this._campaign && this._campaign.id;
    this._campaign = value;
    if (value && value.id !== before && this.connected) this.load();
  }
  /** Reads the deals again without the "reading" note (after a change somewhere else). */
  @api refresh() {
    return this.load(true);
  }

  _members = [];
  _memberKey; // the accounts of the surgeons listed, to tell when the surgeons (not just their details) change
  _campaign = null;
  _includeClosed = false;
  connected = false;
  deals = [];
  loaded = false;
  loading = false;
  saving = false;
  error = "";
  toast = "";
  toastTimer;
  askMember = null; // the surgeon the "Are you sure?" box is about: { memberId, name }
  askOpen = false; // the box is on the page
  askOn = false; // and showing (a moment after it is on the page, so it fades in)
  askTimer;

  connectedCallback() {
    this.connected = true;
    this.load();
  }
  disconnectedCallback() {
    this.connected = false;
    clearTimeout(this.toastTimer);
    clearTimeout(this.askTimer);
  }

  async load(quiet) {
    const id = this._campaign && this._campaign.id;
    if (!id) return;
    const includeClosed = this._includeClosed;
    if (!quiet) this.loading = true;
    try {
      const rows = await maintainDeals({
        campaignId: id,
        includeClosed
      });
      if (
        this._campaign &&
        this._campaign.id === id &&
        this._includeClosed === includeClosed
      ) {
        this.deals = rows || [];
        this.loaded = true;
        if (!quiet) this.error = "";
      }
    } catch (e) {
      this.error = this.message(e, "The deals could not be read.");
    } finally {
      this.loading = false;
    }
  }
  message(e, fallback) {
    return e && e.body && e.body.message ? e.body.message : fallback;
  }

  // ---------- what is shown ----------
  get active() {
    return !!(this._campaign && this._campaign.active);
  }
  get inactive() {
    return !!this._campaign && !this._campaign.active;
  }
  /** None of Opportunities, Risks and ROSA is ticked: nothing is listed. */
  get noKinds() {
    const t = this.types || {};
    return !(t.opp || t.risk || t.rosa);
  }
  /** A surgeon is listed while Opportunities or Risks is ticked; a facility (it finds ROSA deals only) while ROSA is ticked. */
  isListed(m) {
    const t = this.types || {};
    return m.isFacility ? !!t.rosa : !!(t.opp || t.risk);
  }
  /** "Knee" for a one-portfolio campaign, so the counts read "3 open Knee deals"; nothing for several portfolios. */
  get portfolioWord() {
    const p = (this._campaign && this._campaign.portfolios) || [];
    return p.length === 1 ? p[0] + " " : "";
  }
  get kindWord() {
    const t = this.types || {};
    return t.risk && !t.opp ? "risk" : "deal";
  }
  get groups() {
    const t = this.types || {};
    const byAccount = new Map();
    this.deals.forEach((d) => {
      if (!t[d.kind]) return;
      if (!byAccount.has(d.accountId)) byAccount.set(d.accountId, []);
      byAccount.get(d.accountId).push(d);
    });
    return (this.members || [])
      .filter((m) => this.isListed(m))
      .map((m) => {
        const list = byAccount.get(m.accountId) || [];
        const inCount = list.filter((d) => d.inCampaign).length;
        const word = m.isFacility
          ? "ROSA deal"
          : `${this.portfolioWord}${this.kindWord}`;
        const openWord = this._includeClosed ? "" : "open ";
        const plural = list.length === 1 ? "" : "s";
        return {
          key: m.memberId,
          memberId: m.memberId,
          shortName: m.name,
          isFacility: !!m.isFacility,
          name: withEnglish(m.name, m.preferredName),
          plates: (m.ratings || [])
            .filter((r) => r.rating)
            .map((r) => ({
              key: r.portfolio,
              text:
                (m.ratings.length > 1 ? (r.area || r.portfolio) + " " : "") +
                proper(r.rating),
              cls: "rplate " + proper(r.rating)
            })),
          count: list.length
            ? `${list.length} ${openWord}${word}${plural} · ${inCount} in the campaign`
            : `no ${openWord}${word}s`,
          rows: list.map((d) => this.row(d))
        };
      });
  }
  /**
   * The table as one flat list of lines, each with its own stable key: a surgeon's heading, then that surgeon's deals. A surgeon with no
   * deals is the heading alone, its count ("no open Extremities deals") on the right (Robert, 2026-11-19: no second "Nothing to add" line).
   * A flat list of the same kind of row because the engine lost track of rows that came and went inside a group when Include Closed was
   * switched on and off.
   */
  get lines() {
    const out = [];
    this.groups.forEach((g) => {
      out.push({
        key: "h-" + g.key,
        cls: "sg",
        isHead: true,
        isDeal: false,
        g
      });
      g.rows.forEach((r) => {
        out.push({
          key: "d-" + r.key,
          cls: r.cls,
          isHead: false,
          isDeal: true,
          r
        });
      });
    });
    return out;
  }
  row(d) {
    const cannotEdit = !d.canEdit;
    const cannotAdd = !d.inCampaign && !this.active;
    const disabled = this.saving || cannotEdit || cannotAdd;
    let title = d.inCampaign
      ? "Take out of the campaign"
      : "Put in the campaign";
    if (cannotEdit) title = "You cannot edit this deal";
    else if (cannotAdd) title = "This campaign is not active";
    return {
      key: d.id,
      id: d.id,
      name: d.name,
      typeWord: KIND_WORD[d.kind] || KIND_WORD.opp,
      physician: d.kind === "rosa" && d.physician ? d.physician : "",
      brand: d.brand || "–",
      value: this.valueText(d),
      owner: d.ownerName || "–",
      stage: d.stage || "–",
      inCampaign: d.inCampaign,
      cls: `dl${d.inCampaign ? " in" : ""}${cannotEdit ? " lock" : ""}`,
      btnCls: d.inCampaign ? "rb rem" : "rb add",
      disabled,
      title,
      note: cannotEdit ? "cannot edit" : ""
    };
  }
  valueText(d) {
    if (this.usd && this.rates) {
      const u = usdAmount(d.value, d.currencyCode, this.rates);
      if (u !== null) return formatMoney(u, "USD");
    }
    return formatMoney(d.value, d.currencyCode);
  }
  get busy() {
    return this.saving || (this.loading && !this.loaded);
  }
  get busyText() {
    return this.saving ? "Please wait…" : "Reading the deals…";
  }

  // ---------- a surgeon's minus: ask, then take the surgeon out of the campaign (Robert, 2026-11-20) ----------
  /** "Are you sure you want to remove this surgeon from the campaign?" (this facility, for a facility). */
  get askText() {
    const f = this.askMember && this.askMember.facility;
    return `Are you sure you want to remove this ${f ? "facility" : "surgeon"} from the campaign?`;
  }
  get askCls() {
    return this.askOn ? "scrim on" : "scrim";
  }
  handleAskMember(event) {
    if (this.saving) return;
    const id = event.currentTarget.dataset.member;
    const g = this.groups.find((x) => x.memberId === id);
    if (!g) return;
    this.askMember = {
      memberId: id,
      name: g.shortName,
      facility: g.isFacility
    };
    this.askOpen = true;
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    this.askTimer = setTimeout(() => {
      this.askOn = true;
    }, 30);
  }
  closeAsk() {
    this.askOn = false;
    clearTimeout(this.askTimer);
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    this.askTimer = setTimeout(() => {
      this.askOpen = false;
      this.askMember = null;
    }, ASK_MS);
  }
  handleAskNo() {
    this.closeAsk();
  }
  async handleAskYes() {
    const who = this.askMember;
    if (!who || this.saving) return;
    this.closeAsk();
    this.saving = true;
    this.error = "";
    try {
      await removeMemberAndDeals({ memberId: who.memberId });
      this.say(`${who.name} taken out of the campaign`);
      this.dispatchEvent(
        new CustomEvent("memberchange", {
          detail: { memberId: who.memberId, removed: true }
        })
      );
    } catch (e) {
      this.error = this.message(e, "That could not be taken out.");
    } finally {
      this.saving = false;
    }
  }

  // ---------- a press on a + or a minus ----------
  async handlePress(event) {
    const dealId = event.currentTarget.dataset.id;
    const deal = this.deals.find((d) => d.id === dealId);
    if (!deal || this.saving) return;
    const linked = !deal.inCampaign;
    this.saving = true;
    this.error = "";
    try {
      await setLink({
        dealId,
        campaignId: this._campaign.id,
        linked
      });
      this.deals = this.deals.map((d) => {
        return d.id === dealId ? { ...d, inCampaign: linked } : d;
      });
      this.say(
        `${linked ? "Added to" : "Removed from"} the campaign: ${deal.name}`
      );
      this.dispatchEvent(
        new CustomEvent("dealchange", { detail: { dealId, linked } })
      );
    } catch (e) {
      this.error = this.message(e, "That change could not be saved.");
      this.load(true);
    } finally {
      this.saving = false;
    }
  }
  say(text) {
    this.toast = text;
    clearTimeout(this.toastTimer);
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    this.toastTimer = setTimeout(() => {
      this.toast = "";
    }, TOAST_MS);
  }
}
