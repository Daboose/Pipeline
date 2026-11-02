import { LightningElement, api, wire } from "lwc";
import { getPicklistValuesByRecordType } from "lightning/uiObjectInfoApi";
import USAGE from "@salesforce/schema/Usage__c";

/** The company field of each product line on a usage record (the choices differ by record type). */
const COMPANY_FIELDS = {
  stems: "CompanyHipStems__c",
  cups: "CompanyHipCups__c",
  knee: "CompanyTotalKnee__c",
  anatomical: "CompanyAnatomical__c",
  reverse: "CompanyReverse__c",
  cmft: "Company_CMFT__c"
};

/**
 * Pipeline: reads the company choices of one usage record type from Salesforce and hands them to the Usages panel. It shows
 * nothing. A record type may allow different companies for a product line (the Australian knee type has no "ZB", for
 * example), so the choices are never typed into Pipeline and are read once for each record type in use.
 * Who uses it: pipelineUsages, while a usage is being edited or added.
 */
export default class PipelineUsageChoices extends LightningElement {
  @api recordTypeId;

  @wire(getPicklistValuesByRecordType, {
    objectApiName: USAGE,
    recordTypeId: "$recordTypeId"
  })
  picklists({ data }) {
    if (!data || !data.picklistFieldValues) return;
    const byKey = {};
    Object.entries(COMPANY_FIELDS).forEach(([key, field]) => {
      const f = data.picklistFieldValues[field];
      byKey[key] = f ? f.values.map((v) => v.value) : [];
    });
    this.dispatchEvent(
      new CustomEvent("choices", {
        detail: { recordTypeId: this.recordTypeId, byKey }
      })
    );
  }
}
