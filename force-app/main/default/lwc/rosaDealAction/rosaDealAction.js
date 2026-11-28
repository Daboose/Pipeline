import { LightningElement, api } from "lwc";

/**
 * rosaDealAction: the Open ROSA deal button on the ROSA deal record page (quick action SalesRisks__c.ROSA_Open_Deal). A headless
 * action: it opens the ROSA deal screen full window on its own page (/apex/ROSADeal), with no Salesforce frame (Robert, 2026-11-28:
 * the pop-up inside Salesforce's frame was too small). Close on that page comes back to the deal.
 */
export default class RosaDealAction extends LightningElement {
  @api recordId;

  @api invoke() {
    window.location.assign(
      "/apex/ROSADeal?id=" + encodeURIComponent(this.recordId)
    );
  }
}
