import { LightningElement, api } from "lwc";
import { CloseActionScreenEvent } from "lightning/actions";
import phoneTemplate from "./pipelineDealCampaignAction.html";
import panelTemplate from "./pipelineDealCampaignActionPanel.html";

/**
 * pipelineDealCampaignAction: the Campaigns button on a deal's record page (Robert, 2026-11-07; mockup pipeline_deal_campaigns_v3.html).
 * The rep puts the deal in or out of campaigns with Yes / No sliders (the list itself is pipelineDealCampaigns) and presses Done.
 * Launched two ways, the way APAC Events launches Nominate for Event:
 *  - desktop: the quick action SalesRisks__c.Pipeline_Campaigns runs this component directly; Salesforce supplies the pop-up frame
 *    (title, scrolling body, footer), so the panel template is used and Done is in the footer;
 *  - phone: an LWC quick action cannot run in the Salesforce mobile app, so the quick action SalesRisks__c.Pipeline_Campaigns_Phone
 *    runs the Aura component pipelineDealCampaignActionPhone, which hosts this component with isEmbedded set; the phone template
 *    fills the screen under Salesforce's own Cancel and title, with Done fixed at the bottom.
 * Touches nothing itself: the list reads and saves through PipelineDealCampaignController.
 */
export default class PipelineDealCampaignAction extends LightningElement {
  @api recordId;
  /** Set by the Aura wrapper (the phone). Unset when run as the desktop quick action. */
  @api isEmbedded = false;

  render() {
    return this.isEmbedded ? phoneTemplate : panelTemplate;
  }

  connectedCallback() {
    this.onViewport = () => this.fit();
    window.addEventListener("resize", this.onViewport);
  }

  disconnectedCallback() {
    window.removeEventListener("resize", this.onViewport);
  }

  renderedCallback() {
    this.fit();
  }

  /** Phone only: fill the visible screen from where the component starts (measured, never guessed), so Done sits at the bottom and only the list scrolls. */
  fit() {
    const shell = this.template.querySelector(".shell");
    if (!shell || !this.isEmbedded) return;
    const viewport = window.visualViewport
      ? window.visualViewport.height
      : window.innerHeight;
    const height = viewport - shell.getBoundingClientRect().top - 8;
    shell.style.setProperty("--fit-height", `${Math.max(height, 240)}px`);
  }

  handleDone() {
    if (this.isEmbedded) {
      this.dispatchEvent(new CustomEvent("done"));
    } else {
      this.dispatchEvent(new CloseActionScreenEvent());
    }
  }
}
