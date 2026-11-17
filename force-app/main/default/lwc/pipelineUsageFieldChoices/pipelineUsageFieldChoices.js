import { LightningElement, api, wire } from "lwc";
import { getPicklistValuesByRecordType } from "lightning/uiObjectInfoApi";
import USAGE from "@salesforce/schema/Usage__c";

/**
 * Pipeline: reads, from Salesforce, every list a usage tile offers for ONE usage record type (companies, products with the company each
 * product belongs to, stem type, bearing type, CMFT segment, procedure types, supporting technologies) and hands them to the Usage card.
 * It shows nothing and changes no data. The lists are never typed into Pipeline: a record type may allow different choices, and a
 * product list follows its company, so the card asks Salesforce for each record type in use.
 * Who uses it: pipelineUsageCard, while a usage is being edited or added.
 */
export default class PipelineUsageFieldChoices extends LightningElement {
  @api recordTypeId;

  @wire(getPicklistValuesByRecordType, {
    objectApiName: USAGE,
    recordTypeId: "$recordTypeId"
  })
  picklists({ data }) {
    if (!data || !data.picklistFieldValues) return;
    const picks = {};
    Object.entries(data.picklistFieldValues).forEach(([field, f]) => {
      picks[field] = {
        values: (f.values || []).map((v) => ({
          value: v.value,
          label: v.label,
          validFor: v.validFor || []
        })),
        controllerValues: f.controllerValues || {}
      };
    });
    this.dispatchEvent(
      new CustomEvent("fieldchoices", {
        detail: { recordTypeId: this.recordTypeId, picks }
      })
    );
  }
}
