import { createElement } from "lwc";
import PipelineMobileNew from "c/pipelineMobileNew";
import { registerLdsTestWireAdapter } from "@salesforce/sfdx-lwc-jest";
import { createRecord } from "lightning/uiRecordApi";
import {
  getObjectInfo,
  getPicklistValuesByRecordType
} from "lightning/uiObjectInfoApi";
import searchLookup from "@salesforce/apex/PipelineLookupController.search";
import searchNear from "@salesforce/apex/PipelineLookupController.searchNear";
import { FORM_FIELDS, SAVING_TIMING } from "c/pipelineMobileModel";

// the saving screen shows no delay in the tests
SAVING_TIMING.min = 0;
SAVING_TIMING.done = 0;

jest.mock(
  "@salesforce/apex/PipelineLookupController.search",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/PipelineLookupController.searchNear",
  () => ({ default: jest.fn() }),
  { virtual: true }
);

const infoAdapter = registerLdsTestWireAdapter(getObjectInfo);
const picklistAdapter = registerLdsTestWireAdapter(
  getPicklistValuesByRecordType
);

// eslint-disable-next-line @lwc/lwc/no-async-operation
const wait = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const root = (el) => el.shadowRoot;
const RT = (id, name) => ({
  recordTypeId: id,
  name,
  available: true,
  master: false
});
const infoFor = (rts) => {
  const fields = {};
  Object.values(FORM_FIELDS)
    .flat()
    .forEach((f) => {
      fields[f[0]] = { createable: true, updateable: true };
    });
  fields.Stage__c = { createable: true };
  fields.UnitsCasesPerYear__c = { createable: true, dataType: "String" };
  return { fields, recordTypeInfos: rts };
};
const PICKS = {
  picklistFieldValues: {
    Stage__c: {
      values: [{ value: "Plan" }, { value: "Action" }, { value: "Conversion" }],
      defaultValue: { value: "Plan" }
    },
    CurrencyIsoCode: {
      values: [
        { value: "AUD", label: "AUD" },
        { value: "NZD", label: "NZD" }
      ],
      defaultValue: { value: "AUD" }
    },
    Expected_Closure_Quarter__c: {
      values: [
        { value: "Q1", label: "Q1" },
        { value: "Q2", label: "Q2" }
      ]
    },
    Expected_Closing_Year__c: {
      values: [
        { value: "2027", label: "2027" },
        { value: "2028", label: "2028" }
      ]
    }
  }
};
const RTS = {
  a: RT("rtHip", "AU HIP Opportunity"),
  b: RT("rtKnee", "AU KNEE Opportunity"),
  c: RT("rtRisk", "AU RISK"),
  d: RT("rtRosa", "AU ROSA Opportunity")
};

const make = async (rts = RTS) => {
  const el = createElement("c-pipeline-mobile-new", { is: PipelineMobileNew });
  document.body.appendChild(el);
  infoAdapter.emit(infoFor(rts));
  picklistAdapter.emit(PICKS);
  await wait();
  return el;
};
const set = async (el, selector, value, event = "change") => {
  const node = root(el).querySelector(selector);
  node.value = value;
  node.dispatchEvent(new CustomEvent(event));
  await wait();
};
const pickPerson = async (el) => {
  searchLookup.mockResolvedValue([{ id: "001A", name: "Dr Mei Tan", sub: "" }]);
  root(el).querySelector('.lk[data-api="Account__c"]').click();
  await wait();
  const input = root(el).querySelector(".sheet input.search");
  input.value = "mei";
  input.dispatchEvent(new CustomEvent("input"));
  await wait(400);
  root(el).querySelector(".sheet .rs").click();
  await wait();
};

describe("c-pipeline-mobile-new", () => {
  afterEach(() => {
    while (document.body.firstChild)
      document.body.removeChild(document.body.firstChild);
    jest.clearAllMocks();
  });

  it("offers the kinds and portfolios the person may use, and says which record type it will be", async () => {
    const el = await make();
    const kinds = root(el).querySelector("c-pipeline-segmented.kindseg");
    expect(kinds.options.map((o) => o.label)).toEqual([
      "Opportunity",
      "Risk",
      "ROSA"
    ]);
    const portfolios = [
      ...root(el).querySelectorAll('select[aria-label="Portfolio"] option')
    ].map((o) => o.value);
    expect(portfolios).toEqual(["Hip", "Knee"]);
    expect(root(el).querySelector(".note3").textContent).toContain(
      "AU HIP Opportunity"
    );
    // the required ones are starred
    const stars = [...root(el).querySelectorAll(".fl .rq")].map((s) =>
      s.parentElement.textContent.replace("*", "").trim()
    );
    expect(stars).toEqual(
      expect.arrayContaining([
        "Primary HCP",
        "Expected closing quarter and year",
        "Expected annual value"
      ])
    );
  });

  it("starts the stage at the first one and the currency at its default", async () => {
    const el = await make();
    expect(root(el).querySelector(".stgC .sv").textContent).toBe("Plan");
    const money = root(el).querySelector('select[data-api="CurrencyIsoCode"]');
    expect(money.querySelector("option[selected]").value).toBe("AUD");
  });

  it("will not create with a required field empty, and says which", async () => {
    const el = await make();
    root(el).querySelector(".lockbar .save").click();
    await wait();
    expect(createRecord).not.toHaveBeenCalled();
    const text = root(el).querySelector(".errs").textContent;
    expect(text).toContain("Primary HCP: required");
    expect(text).toContain("Expected closing quarter: required");
    expect(text).toContain("Expected annual value: required");
  });

  it("creates the deal as the record type for the portfolio, and tells the screen its Id", async () => {
    createRecord.mockResolvedValue({ id: "a01NEW" });
    const el = await make();
    let made = "";
    el.addEventListener("created", (e) => (made = e.detail));
    await set(el, 'select[aria-label="Portfolio"]', "Knee");
    expect(root(el).querySelector(".note3").textContent).toContain(
      "AU KNEE Opportunity"
    );
    // Salesforce sends the choices of the new record type, which sets the stage and the currency again
    picklistAdapter.emit(PICKS);
    await wait();
    await pickPerson(el);
    await set(el, 'select[data-api="Expected_Closure_Quarter__c"]', "Q2");
    await set(el, 'input[data-api="AmountPerYear__c"]', "250000");
    await set(el, 'input[data-api="UnitsCasesPerYear__c"]', "40");
    root(el).querySelector(".lockbar .save").click();
    // while Salesforce works the saving screen is up, and it is NOT inside the page that scrolls (or it would scroll away with the form)
    await Promise.resolve();
    const saving = root(el).querySelector("c-pipeline-mobile-saving");
    expect(saving.phase).toBe("working");
    expect(saving.word).toBe("Creating…");
    expect(
      root(el).querySelector(".newpage c-pipeline-mobile-saving")
    ).toBeNull();
    await wait();
    const call = createRecord.mock.calls[0][0];
    expect(call.apiName).toBe("SalesRisks__c");
    expect(call.fields).toMatchObject({
      RecordTypeId: "rtKnee",
      Account__c: "001A",
      Expected_Closure_Quarter__c: "Q2",
      AmountPerYear__c: 250000,
      UnitsCasesPerYear__c: "40", // text, as Salesforce holds it
      Stage__c: "Plan",
      CurrencyIsoCode: "AUD"
    });
    expect(made).toBe("a01NEW");
  });

  it("shows what Salesforce says when it refuses, and keeps what was filled in", async () => {
    createRecord.mockRejectedValue({
      body: {
        output: { errors: [{ message: "Close quarter is in the past" }] }
      }
    });
    const el = await make();
    await pickPerson(el);
    await set(el, 'select[data-api="Expected_Closure_Quarter__c"]', "Q1");
    await set(el, 'input[data-api="AmountPerYear__c"]', "1000");
    root(el).querySelector(".lockbar .save").click();
    await wait();
    expect(root(el).querySelector(".errs").textContent).toContain(
      "Close quarter is in the past"
    );
    expect(
      root(el).querySelector('.lk[data-api="Account__c"] .lv').textContent
    ).toBe("Dr Mei Tan");
  });

  it("starts the form again when the kind changes, keeping the surgeon, and asks for the hospital on a ROSA deal", async () => {
    const el = await make();
    await pickPerson(el);
    root(el)
      .querySelector("c-pipeline-segmented.kindseg")
      .dispatchEvent(new CustomEvent("change", { detail: { value: "rosa" } }));
    await wait();
    expect(root(el).querySelector(".note3").textContent).toContain(
      "AU ROSA Opportunity"
    );
    expect(root(el).querySelector('select[aria-label="Portfolio"]')).toBeNull(); // only an opportunity has the portfolio dropdown
    expect(
      root(el).querySelector('.lk[data-api="Account__c"] .lv').textContent
    ).toBe("Dr Mei Tan");
    root(el).querySelector(".lockbar .save").click();
    await wait();
    expect(root(el).querySelector(".errs").textContent).toContain(
      "Healthcare facility: required"
    );
  });

  it("asks which record type when the person may use more than one for the same choice", async () => {
    const el = await make({ ...RTS, e: RT("rtNzKnee", "NZ KNEE Opportunity") });
    await set(el, 'select[aria-label="Portfolio"]', "Knee");
    const options = [
      ...root(el).querySelectorAll('select[aria-label="Record type"] option')
    ].map((o) => o.textContent.trim());
    expect(options.sort()).toEqual([
      "AU KNEE Opportunity",
      "NZ KNEE Opportunity"
    ]);
  });

  it("slides in when opened, and Cancel asks the screen to slide it off", async () => {
    const el = await make();
    expect(root(el).querySelector(".newpage").classList.contains("on")).toBe(
      false
    );
    el.open = true;
    await wait();
    expect(root(el).querySelector(".newpage").classList.contains("on")).toBe(
      true
    );
    let closed = false;
    el.addEventListener("close", () => (closed = true));
    root(el).querySelector(".lockbar .cancel").click();
    expect(closed).toBe(true);
    expect(searchNear).not.toHaveBeenCalled();
  });
});
