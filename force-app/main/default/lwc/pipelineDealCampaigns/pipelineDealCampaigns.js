import { LightningElement, api } from "lwc";
import getDealCampaigns from "@salesforce/apex/PipelineDealCampaignController.getDealCampaigns";
import setLink from "@salesforce/apex/PipelineDealCampaignController.setLink";

const yesNo = (yesTone) => [
  { value: "no", label: "No" },
  yesTone
    ? { value: "yes", label: "Yes", tone: yesTone }
    : { value: "yes", label: "Yes" }
];

/** A plain message from an Apex error. */
const errorText = (e) =>
  (e && e.body && e.body.message) ||
  (e && e.message) ||
  "Something went wrong. Please try again.";

/**
 * pipelineDealCampaigns: the Campaigns control of a deal (Robert, 2026-11-06; mockup pipeline_deal_campaigns_v2.html).
 * Lists the campaigns the deal can be in and puts it in or out of each with a Yes / No slider; each change is saved at once.
 * Used in the deal flyout (Pipeline), and built to be reused by the record page quick action. Reads and saves through
 * PipelineDealCampaignController, which decides which campaigns are offered.
 */
export default class PipelineDealCampaigns extends LightningElement {
  _recordId;
  data = null;
  loading = false;
  error = "";
  busyId = "";
  /**
   * "good" turns the whole slider solid green while it is Yes, as the Yes / No sliders on the phone's deal form do (Robert, 2026-11-07).
   * Unset (the default), Yes stays the slider's ordinary highlight, as in the desktop flyout and the record page's Campaigns button.
   */
  @api yesTone = "";

  @api
  get recordId() {
    return this._recordId;
  }
  set recordId(value) {
    if (value !== this._recordId) {
      this._recordId = value;
      this.load();
    }
  }

  /** Reads the campaigns again (the flyout calls this when the deal is saved). */
  @api refresh() {
    return this.load();
  }

  async load() {
    const id = this._recordId;
    if (!id) return;
    this.loading = !this.data;
    this.error = "";
    try {
      const d = await getDealCampaigns({ dealId: id });
      if (id === this._recordId) this.data = d;
    } catch (e) {
      this.error = errorText(e);
    } finally {
      this.loading = false;
    }
  }

  get yesNo() {
    return yesNo(this.yesTone);
  }
  get ready() {
    return !!this.data;
  }
  get hasHcp() {
    return !!(this.data && this.data.hasHcp);
  }
  get noHcp() {
    return !!this.data && !this.data.hasHcp;
  }
  get hcpName() {
    return (this.data && this.data.hcpName) || "the surgeon";
  }
  get factsText() {
    const d = this.data;
    if (!d) return "";
    const bits = [];
    if (d.hcpName) bits.push("Primary HCP " + d.hcpName);
    if (d.ownerCountry) bits.push("owner's country " + d.ownerCountry);
    if (d.portfolios) bits.push("portfolio " + d.portfolios);
    return bits.join(" · ");
  }
  get rows() {
    return ((this.data && this.data.offered) || []).map((c) => ({
      id: c.id,
      name: c.name,
      meta: c.portfolios,
      manager: c.managerName,
      note: c.note
        ? "No longer fits: " + c.note + ". You can still take it out."
        : "",
      value: c.linked ? "yes" : "no",
      label: "In " + c.name,
      busy: this.busyId === c.id
    }));
  }
  get hasOffered() {
    return this.rows.length > 0;
  }
  get noOffered() {
    return this.hasHcp && this.rows.length === 0;
  }
  async handlePick(event) {
    const campaignId = event.currentTarget.dataset.id;
    const linked = event.detail.value === "yes";
    this.error = "";
    this.busyId = campaignId;
    try {
      await setLink({ dealId: this._recordId, campaignId, linked });
      this.data = {
        ...this.data,
        offered: this.data.offered.map((c) => {
          return c.id === campaignId ? { ...c, linked } : c;
        })
      };
      this.dispatchEvent(
        new CustomEvent("campaignschanged", {
          detail: {
            linkedCount: this.data.offered.filter((c) => c.linked).length
          }
        })
      );
    } catch (e) {
      const message = errorText(e);
      await this.load(); // show what is really saved, then say what went wrong
      this.error = message;
    } finally {
      this.busyId = "";
    }
  }
}
