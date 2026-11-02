import { createElement } from "lwc";
import PipelineUsageChoices from "c/pipelineUsageChoices";
import { registerLdsTestWireAdapter } from "@salesforce/sfdx-lwc-jest";
import { getPicklistValuesByRecordType } from "lightning/uiObjectInfoApi";

const picklistAdapter = registerLdsTestWireAdapter(
  getPicklistValuesByRecordType
);

describe("c-pipeline-usage-choices", () => {
  afterEach(() => {
    while (document.body.firstChild)
      document.body.removeChild(document.body.firstChild);
  });

  it("hands the record type's company choices to the panel, by product line", async () => {
    const el = createElement("c-pipeline-usage-choices", {
      is: PipelineUsageChoices
    });
    el.recordTypeId = "012000000000001";
    const handler = jest.fn();
    el.addEventListener("choices", handler);
    document.body.appendChild(el);
    picklistAdapter.emit({
      picklistFieldValues: {
        CompanyHipStems__c: { values: [{ value: "ZB" }, { value: "Lima" }] },
        CompanyTotalKnee__c: { values: [{ value: "Lima" }] }
      }
    });
    await Promise.resolve();
    expect(handler).toHaveBeenCalledTimes(1);
    const d = handler.mock.calls[0][0].detail;
    expect(d.recordTypeId).toBe("012000000000001");
    expect(d.byKey.stems).toEqual(["ZB", "Lima"]);
    expect(d.byKey.knee).toEqual(["Lima"]);
    expect(d.byKey.cups).toEqual([]);
  });
});
