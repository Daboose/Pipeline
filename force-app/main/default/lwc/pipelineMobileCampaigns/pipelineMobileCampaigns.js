import { LightningElement, api } from "lwc";

/**
 * Pipeline Mobile: the Campaigns screen of one deal on the phone (Robert, 2026-11-07). It slides in over the deal when the Campaigns row
 * is tapped and holds the Campaigns list that already works on the desktop and in the record page's Campaigns button
 * (pipelineDealCampaigns: the campaigns the deal can be in, each with an In campaign Yes / No slider that saves at once). This component
 * only gives it the sliding screen, the locked "Back to deal" bar and a heading; it reads and saves nothing itself. It tells the parent
 * ("changed") how many campaigns the deal is now in, and asks it to slide the screen off ("close").
 */
export default class PipelineMobileCampaigns extends LightningElement {
  @api recordId;
  @api dealLabel = "";
  @api open = false;

  get pageCls() {
    return "page campaignspage" + (this.open ? " on" : "");
  }
  renderedCallback() {
    this.lockScroll();
  }
  /** A swipe on this page scrolls the page and is stopped at its top and bottom, not passed on to Salesforce's page underneath. */
  lockScroll() {
    const page = this.template.querySelector(".campaignspage");
    if (!page || this.lockedPage === page) return;
    this.lockedPage = page;
    let touchY = 0;
    page.addEventListener(
      "touchstart",
      (e) => {
        touchY = e.touches[0].clientY;
      },
      { passive: true }
    );
    page.addEventListener(
      "touchmove",
      (e) => {
        const dy = e.touches[0].clientY - touchY;
        const atTop = page.scrollTop <= 0;
        const atBottom =
          page.scrollTop + page.clientHeight >= page.scrollHeight - 1;
        if ((atTop && dy > 0) || (atBottom && dy < 0)) e.preventDefault();
      },
      { passive: false }
    );
  }
  handleBack() {
    this.dispatchEvent(new CustomEvent("close"));
  }
  handleChanged(event) {
    this.dispatchEvent(
      new CustomEvent("changed", { detail: event.detail.linkedCount })
    );
  }
}
