import { createElement } from "lwc";
import PipelineNewRosaDeal from "c/pipelineNewRosaDeal";
import { registerLdsTestWireAdapter } from "@salesforce/sfdx-lwc-jest";
import { createRecord, getRecord } from "lightning/uiRecordApi";
import {
  getObjectInfo,
  getPicklistValuesByRecordType
} from "lightning/uiObjectInfoApi";
import searchOwners from "@salesforce/apex/PipelineFilterController.searchOwners";
import setLink from "@salesforce/apex/PipelineDealCampaignController.setLink";
import searchLookup from "@salesforce/apex/PipelineLookupController.search";

jest.mock(
  "@salesforce/apex/PipelineFilterController.searchOwners",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/PipelineDealCampaignController.setLink",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/PipelineLookupController.search",
  () => ({ default: jest.fn() }),
  { virtual: true }
);

const userAdapter = registerLdsTestWireAdapter(getRecord);
const infoAdapter = registerLdsTestWireAdapter(getObjectInfo);
const picklistAdapter = registerLdsTestWireAdapter(
  getPicklistValuesByRecordType
);

// eslint-disable-next-line @lwc/lwc/no-async-operation
const wait = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const RT = (id, name) => ({
  recordTypeId: id,
  name,
  available: true,
  master: false
});
const ONE_COUNTRY = {
  a: RT("rtKnee", "AU KNEE Opportunity"),
  b: RT("rtRosa", "AU ROSA Opportunity")
};
const TWO_COUNTRIES = {
  ...ONE_COUNTRY,
  c: RT("rtNzRosa", "NZ ROSA Opportunity")
};
const NO_ROSA = { a: RT("rtKnee", "AU KNEE Opportunity") };
const list = (...v) => v.map((x) => ({ value: x, label: x }));
const PICKS = {
  picklistFieldValues: {
    Stage__c: {
      values: list(
        "Sales Pipeline",
        "Surgeon Engagement",
        "Negotiation",
        "Closed Won",
        "Deal Lost"
      ),
      defaultValue: { value: "Sales Pipeline" }
    },
    CurrencyIsoCode: {
      values: list("AUD", "NZD", "USD"),
      defaultValue: { value: "AUD" }
    },
    Expected_Closure_Quarter__c: { values: list("Q1", "Q2", "Q3", "Q4") },
    Expected_Closing_Year__c: { values: list("2025", "2026", "2027") },
    ROSA_Deal_Type__c: { values: list("Placement", "Capital sale") },
    ROSA_Sales_Type__c: { values: list("Hip", "Knee", "Shoulder") },
    ROSA_Platform_Hip_Stage__c: { values: list("Trial", "Installed") }
  }
};

const make = async (rts = ONE_COUNTRY, props = {}) => {
  const el = createElement("c-pipeline-new-rosa-deal", {
    is: PipelineNewRosaDeal
  });
  Object.assign(
    el,
    {
      accountId: "001FACILITY",
      accountName: "Bathurst Base Hospital",
      campaignId: "a0CCAMP"
    },
    props
  );
  document.body.appendChild(el);
  userAdapter.emit({ fields: { Name: { value: "Robert Reeves" } } });
  infoAdapter.emit({ fields: {}, recordTypeInfos: rts });
  await wait();
  picklistAdapter.emit(PICKS);
  await wait();
  return el;
};
const root = (el) => el.shadowRoot;
const choose = async (el, selector, value, event = "change") => {
  const node = root(el).querySelector(selector);
  node.value = value;
  node.dispatchEvent(new CustomEvent(event));
  await wait();
};
const saveButton = (el) => [...root(el).querySelectorAll(".foot .btn")].pop();
const note = (el) => root(el).querySelector(".foot .note").textContent;

describe("c-pipeline-new-rosa-deal", () => {
  beforeEach(() => {
    jest.useFakeTimers({
      now: new Date(2026, 10, 25),
      doNotFake: [
        "setTimeout",
        "clearTimeout",
        "setInterval",
        "clearInterval",
        "nextTick",
        "setImmediate",
        "clearImmediate",
        "queueMicrotask"
      ]
    });
  });
  afterEach(() => {
    jest.useRealTimers();
    while (document.body.firstChild)
      document.body.removeChild(document.body.firstChild);
    jest.clearAllMocks();
  });

  it("has no portfolio: with one country the form is there at once, starting at the record type's default stage, with the facility filled in", async () => {
    const el = await make();
    expect(root(el).textContent).not.toContain("Portfolio");
    expect(root(el).querySelector('select[aria-label="Country"]')).toBeNull();
    const slider = root(el).querySelector("c-pipeline-stage-slider");
    expect(slider.steps).toEqual([
      "Sales Pipeline",
      "Surgeon Engagement",
      "Negotiation",
      "Closed Won",
      "Deal Lost"
    ]);
    expect(slider.value).toBe("Sales Pipeline");
    const lookups = root(el).querySelectorAll("c-pipeline-lookup");
    expect(lookups[0].fieldName).toBe("Healthcare_Facility__c");
    expect(lookups[0].valueName).toBe("Bathurst Base Hospital");
    expect(lookups[1].fieldName).toBe("Account__c");
    expect(lookups[1].valueId).toBe("");
    expect(
      [...root(el).querySelectorAll(".chips .chip")].map((c) =>
        c.textContent.trim()
      )
    ).toEqual(["Hip", "Knee", "Shoulder"]);
  });

  it("with several countries asks for the country first and shows the form once one is chosen", async () => {
    const el = await make(TWO_COUNTRIES);
    expect(
      root(el).querySelector('select[aria-label="Country"]')
    ).not.toBeNull();
    expect(root(el).querySelector("c-pipeline-stage-slider")).toBeNull();
    expect(note(el)).toBe("Choose the country to start.");
    await choose(el, 'select[aria-label="Country"]', "NZ");
    picklistAdapter.emit(PICKS);
    await wait();
    expect(root(el).querySelector("c-pipeline-stage-slider")).not.toBeNull();
    expect(root(el).querySelector(".rtype").textContent).toBe(
      "Record type: NZ ROSA Opportunity"
    );
  });

  it("says plainly when the person has no ROSA record type", async () => {
    const el = await make(NO_ROSA);
    expect(root(el).querySelector(".err").textContent).toContain("No ROSA");
  });

  it("needs the facility, the growth, the owner and the quarter and year, and says what is still to fill in", async () => {
    const el = await make();
    expect(saveButton(el).disabled).toBe(true);
    expect(note(el)).toBe(
      "Still to fill in: ROSA growth $, Closing quarter and year."
    );
    await choose(el, 'input[aria-label="ROSA growth $"]', "250000", "input");
    await choose(el, 'select[aria-label="Expected closing quarter"]', "Q1");
    expect(
      root(el).querySelector('select[aria-label="Expected closing year"]').value
    ).toBe("2027");
    expect(saveButton(el).disabled).toBe(false);
    expect(note(el)).toContain("Ready to save");
    root(el)
      .querySelectorAll("c-pipeline-lookup")[0]
      .dispatchEvent(
        new CustomEvent("change", { detail: { id: "", name: "" } })
      );
    await wait();
    expect(note(el)).toBe("Still to fill in: Healthcare facility.");
  });

  it("makes the ROSA deal as the person, then puts it in the campaign, then says it was created", async () => {
    createRecord.mockResolvedValue({ id: "a01ROSA" });
    setLink.mockResolvedValue();
    const el = await make();
    const created = jest.fn();
    el.addEventListener("created", created);
    await choose(el, 'input[aria-label="ROSA growth $"]', "250000", "input");
    await choose(el, 'select[aria-label="Expected closing quarter"]', "Q1");
    await choose(el, 'select[data-api="ROSA_Deal_Type__c"]', "Placement");
    await choose(el, 'select[data-api="CurrencyIsoCode"]', "NZD");
    await choose(el, 'input[data-api="Install_Date__c"]', "2027-02-01");
    root(el).querySelectorAll(".chips .chip")[1].click(); // Knee
    root(el).querySelectorAll(".chips .chip")[0].click(); // Hip
    await wait();
    saveButton(el).click();
    await wait();
    const call = createRecord.mock.calls[0][0];
    expect(call.apiName).toBe("SalesRisks__c");
    expect(call.fields).toMatchObject({
      RecordTypeId: "rtRosa",
      Healthcare_Facility__c: "001FACILITY",
      OwnerId: expect.any(String),
      ROSAGrowthDollar__c: 250000,
      CurrencyIsoCode: "NZD",
      Stage__c: "Sales Pipeline",
      ROSA_Deal_Type__c: "Placement",
      ROSA_Sales_Type__c: "Knee;Hip",
      Install_Date__c: "2027-02-01",
      Expected_Closure_Quarter__c: "Q1",
      Expected_Closing_Year__c: "2027"
    });
    expect(call.fields.Account__c).toBeUndefined(); // the physician is optional and was left empty
    expect(setLink).toHaveBeenCalledWith({
      dealId: "a01ROSA",
      campaignId: "a0CCAMP",
      linked: true
    });
    expect(created.mock.calls[0][0].detail).toEqual({
      id: "a01ROSA",
      linkError: ""
    });
  });

  it("still says the deal was created when it could not join the campaign, and says why", async () => {
    createRecord.mockResolvedValue({ id: "a01ROSA" });
    setLink.mockRejectedValue({ body: { message: "Not allowed" } });
    const el = await make();
    const created = jest.fn();
    el.addEventListener("created", created);
    await choose(el, 'input[aria-label="ROSA growth $"]', "1000", "input");
    await choose(el, 'select[aria-label="Expected closing quarter"]', "Q2");
    saveButton(el).click();
    await wait();
    expect(created.mock.calls[0][0].detail).toEqual({
      id: "a01ROSA",
      linkError: "Not allowed"
    });
  });

  it("shows what Salesforce refused, makes nothing more and keeps everything entered", async () => {
    createRecord.mockRejectedValue({
      body: {
        output: {
          errors: [{ message: "Quarter is in the past" }],
          fieldErrors: {}
        }
      }
    });
    const el = await make();
    const created = jest.fn();
    el.addEventListener("created", created);
    await choose(el, 'input[aria-label="ROSA growth $"]', "1000", "input");
    await choose(el, 'select[aria-label="Expected closing quarter"]', "Q2");
    saveButton(el).click();
    await wait();
    expect(root(el).querySelector(".errs").textContent).toContain(
      "Quarter is in the past"
    );
    expect(setLink).not.toHaveBeenCalled();
    expect(created).not.toHaveBeenCalled();
    expect(
      root(el).querySelector('input[aria-label="ROSA growth $"]').value
    ).toBe("1000");
  });

  it("changes the owner through a search, and says cancel from the Cancel button", async () => {
    searchOwners.mockResolvedValue([
      { id: "005X", name: "Sam Rep", title: "Rep" }
    ]);
    searchLookup.mockResolvedValue([]);
    const el = await make();
    root(el).querySelector(".chosen .xcirc").click();
    await wait();
    await choose(el, "input.ownerin", "Sam", "input");
    await wait(400);
    root(el).querySelector(".pick .opt").click();
    await wait();
    expect(root(el).querySelector(".chosen .nm").textContent).toBe("Sam Rep");
    const cancel = jest.fn();
    el.addEventListener("cancel", cancel);
    [...root(el).querySelectorAll(".foot .btn")][0].click();
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
