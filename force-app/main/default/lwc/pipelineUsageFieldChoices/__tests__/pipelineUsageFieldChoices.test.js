import { createElement } from "lwc";
import PipelineUsageFieldChoices from "c/pipelineUsageFieldChoices";
import { registerLdsTestWireAdapter } from "@salesforce/sfdx-lwc-jest";
import { getPicklistValuesByRecordType } from "lightning/uiObjectInfoApi";

const picklistAdapter = registerLdsTestWireAdapter(
  getPicklistValuesByRecordType
);

describe("c-pipeline-usage-field-choices", () => {
  afterEach(() => {
    while (document.body.firstChild)
      document.body.removeChild(document.body.firstChild);
  });

  it("hands the record type's lists, with each product's company, to the card", async () => {
    const el = createElement("c-pipeline-usage-field-choices", {
      is: PipelineUsageFieldChoices
    });
    el.recordTypeId = "012000000000001";
    const handler = jest.fn();
    el.addEventListener("fieldchoices", handler);
    document.body.appendChild(el);
    picklistAdapter.emit({
      picklistFieldValues: {
        CompanyHipStems__c: {
          values: [{ value: "ZB", label: "ZB" }],
          controllerValues: {}
        },
        ProductHipStems__c: {
          values: [{ value: "Taperloc", label: "Taperloc", validFor: [0] }],
          controllerValues: { ZB: 0 }
        }
      }
    });
    await Promise.resolve();
    expect(handler).toHaveBeenCalledTimes(1);
    const d = handler.mock.calls[0][0].detail;
    expect(d.recordTypeId).toBe("012000000000001");
    expect(d.picks.CompanyHipStems__c.values[0].value).toBe("ZB");
    expect(d.picks.ProductHipStems__c.values[0].validFor).toEqual([0]);
    expect(d.picks.ProductHipStems__c.controllerValues.ZB).toBe(0);
  });
});
