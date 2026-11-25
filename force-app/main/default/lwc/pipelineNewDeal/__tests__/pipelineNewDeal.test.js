import { createElement } from "lwc";
import PipelineNewDeal from "c/pipelineNewDeal";
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
  a: RT("rtHip", "AU HIP Opportunity"),
  b: RT("rtKnee", "AU KNEE Opportunity"),
  c: RT("rtRisk", "AU RISK"),
  d: RT("rtRosa", "AU ROSA Opportunity")
};
const TWO_COUNTRIES = {
  ...ONE_COUNTRY,
  e: RT("rtNzKnee", "NZ KNEE Opportunity")
};
const PICKS = {
  picklistFieldValues: {
    Stage__c: {
      values: [
        "Plan",
        "Action",
        "Commit",
        "Conversion",
        "Unsuccessful Conversion"
      ].map((v) => ({ value: v, label: v })),
      defaultValue: { value: "Plan" }
    },
    CurrencyIsoCode: {
      values: [
        { value: "AUD", label: "AUD" },
        { value: "NZD", label: "NZD" },
        { value: "USD", label: "USD" }
      ],
      defaultValue: { value: "AUD" }
    },
    Expected_Closure_Quarter__c: {
      values: ["Q1", "Q2", "Q3", "Q4"].map((q) => ({ value: q, label: q }))
    },
    Expected_Closing_Year__c: {
      values: ["2025", "2026", "2027", "2028"].map((y) => ({
        value: y,
        label: y
      }))
    },
    Brand__c: {
      values: [
        { value: "Persona", label: "Persona" },
        { value: "OptimiZe", label: "OptimiZe" }
      ]
    },
    myMo_Stage__c: { values: [{ value: "Trial", label: "Trial" }] }
  }
};

const make = async (rts = ONE_COUNTRY, props = {}) => {
  const el = createElement("c-pipeline-new-deal", { is: PipelineNewDeal });
  Object.assign(
    el,
    {
      accountId: "001SURGEON",
      accountName: "Dr Priya Nair",
      campaignId: "a0CCAMP"
    },
    props
  );
  document.body.appendChild(el);
  userAdapter.emit({ fields: { Name: { value: "Robert Reeves" } } });
  infoAdapter.emit({ fields: {}, recordTypeInfos: rts });
  await wait();
  return el;
};
const root = (el) => el.shadowRoot;
const portfolio = async (el, name) => {
  root(el)
    .querySelector("c-pipeline-segmented")
    .dispatchEvent(new CustomEvent("change", { detail: { value: name } }));
  await wait();
  picklistAdapter.emit(PICKS);
  await wait();
};
const choose = async (el, selector, value, event = "change") => {
  const node = root(el).querySelector(selector);
  node.value = value;
  node.dispatchEvent(new CustomEvent(event));
  await wait();
};
const fillAll = async (el) => {
  await portfolio(el, "Knee");
  await choose(el, 'select[data-api="Expected_Closure_Quarter__c"]', "Q1");
  await choose(
    el,
    'input[aria-label="Expected annual value"]',
    "120000",
    "input"
  );
  await choose(
    el,
    'input[aria-label="Expected annual units / cases"]',
    "24",
    "input"
  );
  root(el).querySelector(".chips .chip").click(); // Persona: a brand is mandatory
  await wait();
};
const saveButton = (el) => [...root(el).querySelectorAll(".foot .btn")].pop();

describe("c-pipeline-new-deal", () => {
  beforeEach(() => {
    jest.useFakeTimers({
      now: new Date(2026, 10, 19),
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

  it("offers the portfolios the person has an opportunity record type for (not risk or ROSA), and says which record type it will be", async () => {
    const el = await make();
    const seg = root(el).querySelector("c-pipeline-segmented");
    expect(seg.options.map((o) => o.label)).toEqual(["Hip", "Knee"]);
    expect(root(el).textContent).not.toContain("Record type:");
    await portfolio(el, "Knee");
    expect(root(el).textContent).toContain("Record type: AU KNEE Opportunity");
  });

  it("shows the stage slider once a portfolio is chosen, starting at the record type's default, with both closing stages at the end", async () => {
    const el = await make();
    expect(root(el).querySelector("c-pipeline-stage-slider")).toBeNull();
    await portfolio(el, "Knee");
    const slider = root(el).querySelector("c-pipeline-stage-slider");
    expect(slider.steps).toEqual([
      "Plan",
      "Action",
      "Commit",
      "Conversion",
      "Unsuccessful Conversion"
    ]);
    expect(slider.value).toBe("Plan");
    expect(slider.won).toBe("Conversion");
    expect(slider.lost).toBe("Unsuccessful Conversion");
    slider.dispatchEvent(
      new CustomEvent("change", { detail: { value: "Commit" } })
    );
    await wait();
    expect(root(el).querySelector("c-pipeline-stage-slider").value).toBe(
      "Commit"
    );
  });

  it("puts the portfolio and the stage slider in a top card, then two level panels: the surgeon and the rest (with the brand and switches) and the background information", async () => {
    const el = await make();
    await portfolio(el, "Knee");
    const labels = [...root(el).querySelectorAll(".card .fl, .card h3")].map(
      (n) => n.textContent.replace(/\s+/g, " ").replace(" *", "").trim()
    );
    const at = (t) => labels.indexOf(t);
    expect(
      root(el).querySelector(".head .band c-pipeline-stage-slider")
    ).not.toBeNull();
    expect(root(el).querySelectorAll(".cols .card .band").length).toBe(0);
    expect(at("Portfolio")).toBeLessThan(at("Primary HCP"));
    expect(at("Primary HCP")).toBeLessThan(at("Healthcare facility"));
    expect(at("Healthcare facility")).toBeLessThan(
      at("Expected closing quarter and year")
    );
    expect(at("Expected closing quarter and year")).toBeLessThan(
      at("Expected annual value")
    );
    expect(at("Expected annual value")).toBeLessThan(
      at("Expected annual units / cases")
    );
    expect(at("Expected annual units / cases")).toBeLessThan(at("Owner"));
    expect(at("Owner")).toBeLessThan(at("Brand"));
    const cols = root(el).querySelectorAll(".cols > .col");
    expect(cols[0].querySelectorAll(".card").length).toBe(1);
    expect(cols[0].textContent).toContain("Brand");
    expect(cols[1].querySelector("textarea")).not.toBeNull();
  });

  it("starts with only the portfolio and the country; the rest appears once both are chosen", async () => {
    const el = await make();
    expect(root(el).querySelector("c-pipeline-lookup")).toBeNull();
    expect(root(el).querySelector(".chosen")).toBeNull();
    expect(root(el).querySelector("c-pipeline-stage-slider")).toBeNull();
    expect(root(el).querySelector("textarea")).toBeNull();
    expect(root(el).querySelector(".foot .note").textContent).toBe(
      "Choose the portfolio and the country to start."
    );
    expect(saveButton(el).disabled).toBe(true);
    await portfolio(el, "Knee"); // one country, so it is taken at once
    expect(root(el).querySelector("c-pipeline-lookup")).not.toBeNull();
    expect(root(el).querySelector("textarea")).not.toBeNull();
  });

  it("then starts with the surgeon as Primary HCP, the person as owner and Save off, saying what is still to fill in", async () => {
    const el = await make();
    await portfolio(el, "Knee");
    const hcp = root(el).querySelectorAll("c-pipeline-lookup")[0];
    expect(hcp.fieldName).toBe("Account__c");
    expect(hcp.valueId).toBe("001SURGEON");
    expect(hcp.valueName).toBe("Dr Priya Nair");
    expect(root(el).querySelector(".chosen").textContent).toContain(
      "Robert Reeves"
    );
    expect(root(el).querySelector(".chosen").textContent).toContain("(you)");
    expect(saveButton(el).disabled).toBe(true);
    const note = root(el).querySelector(".foot .note").textContent;
    expect(note).toContain("Closing quarter and year");
    expect(note).toContain("Expected annual value");
    expect(note).not.toContain("units");
    expect(note).not.toContain("Portfolio");
    expect(note).not.toContain("Primary HCP");
    expect(note).not.toContain("Owner");
  });

  it("shows the country beside the portfolio as a small list; with one country it is taken at once, with several the rest waits until one is chosen", async () => {
    const one = await make();
    const sel = () => root(one).querySelector("select.country");
    expect(sel()).not.toBeNull();
    await portfolio(one, "Knee");
    expect(sel().value).toBe("AU");
    expect([...sel().options].map((o) => o.textContent.trim())).toEqual([
      "Country…",
      "AU"
    ]);
    // the portfolio and the country share one line
    expect(
      sel().closest(".top").querySelector("c-pipeline-segmented")
    ).not.toBeNull();
    const two = await make(TWO_COUNTRIES);
    await portfolio(two, "Knee");
    const pick = root(two).querySelector("select.country");
    expect([...pick.options].map((o) => o.textContent.trim())).toEqual([
      "Country…",
      "AU",
      "NZ"
    ]);
    expect(pick.value).toBe("");
    expect(root(two).querySelector("c-pipeline-lookup")).toBeNull();
    expect(root(two).querySelector(".foot .note").textContent).toContain(
      "Choose the portfolio and the country"
    );
    pick.value = "NZ";
    pick.dispatchEvent(new CustomEvent("change"));
    await wait();
    picklistAdapter.emit(PICKS);
    await wait();
    expect(root(two).querySelector("c-pipeline-lookup")).not.toBeNull();
    expect(root(two).textContent).toContain("Record type: NZ KNEE Opportunity");
    // a portfolio the chosen country does not have clears the country and hides the rest again
    root(two)
      .querySelector("c-pipeline-segmented")
      .dispatchEvent(new CustomEvent("change", { detail: { value: "Hip" } }));
    await wait();
    expect(root(two).querySelector("select.country").value).toBe("AU");
    expect(root(two).textContent).toContain("Record type: AU HIP Opportunity");
  });

  it("never offers a quarter before the current one, and fills in the year when a quarter is picked", async () => {
    const el = await make();
    await portfolio(el, "Hip");
    const quarters = () =>
      [
        ...root(el).querySelectorAll(
          'select[data-api="Expected_Closure_Quarter__c"] option'
        )
      ].map((o) => o.value);
    // today is 19 Nov 2026 (Q4): with no year yet every quarter is there
    expect(quarters()).toEqual(["", "Q1", "Q2", "Q3", "Q4"]);
    await choose(el, 'select[data-api="Expected_Closing_Year__c"]', "2026");
    expect(quarters()).toEqual(["", "Q4"]);
    // picking Q1 with 2026 chosen is no longer possible; a year before this one is not offered at all
    const years = [
      ...root(el).querySelectorAll(
        'select[data-api="Expected_Closing_Year__c"] option'
      )
    ].map((o) => o.value);
    expect(years).toEqual(["", "2026", "2027", "2028"]);
    // a quarter picked first brings its own year: Q1 is next year
    const fresh = await make();
    await portfolio(fresh, "Hip");
    await choose(fresh, 'select[data-api="Expected_Closure_Quarter__c"]', "Q1");
    expect(
      root(fresh).querySelector('select[data-api="Expected_Closing_Year__c"]')
        .value
    ).toBe("2027");
  });

  it("takes the quarter away when a year is chosen that would put it in the past", async () => {
    const el = await make();
    await portfolio(el, "Hip");
    await choose(el, 'select[data-api="Expected_Closure_Quarter__c"]', "Q1"); // year becomes 2027
    await choose(el, 'select[data-api="Expected_Closing_Year__c"]', "2026");
    expect(
      root(el).querySelector('select[data-api="Expected_Closure_Quarter__c"]')
        .value
    ).toBe("");
    expect(saveButton(el).disabled).toBe(true);
  });

  it("starts in the person's own currency and lets it be changed; the brands follow the record type; MyMobility's stage shows only on Yes", async () => {
    const el = await make();
    await portfolio(el, "Knee");
    const cur = root(el).querySelector('select[data-api="CurrencyIsoCode"]');
    expect(cur.value).toBe("USD"); // the Jest stand-in for the user's own currency
    await choose(el, 'select[data-api="CurrencyIsoCode"]', "NZD");
    expect(
      root(el).querySelector('select[data-api="CurrencyIsoCode"]').value
    ).toBe("NZD");
    const brands = [...root(el).querySelectorAll(".chips .chip")].map((b) =>
      b.textContent.trim()
    );
    expect(brands).toEqual(["Persona", "OptimiZe"]);
    expect(
      root(el).querySelector('select[data-api="myMo_Stage__c"]')
    ).toBeNull();
    root(el)
      .querySelector('c-pipeline-segmented[data-api="myMo__c"]')
      .dispatchEvent(new CustomEvent("change", { detail: { value: "yes" } }));
    await wait();
    expect(
      root(el).querySelector('select[data-api="myMo_Stage__c"]')
    ).not.toBeNull();
  });

  it("does not need the units / cases: a deal with everything else can be saved, and the units are sent only when typed", async () => {
    createRecord.mockResolvedValue({ id: "a01NEW" });
    setLink.mockResolvedValue();
    const el = await make();
    await portfolio(el, "Knee");
    await choose(el, 'select[data-api="Expected_Closure_Quarter__c"]', "Q1");
    await choose(
      el,
      'input[aria-label="Expected annual value"]',
      "1000",
      "input"
    );
    root(el).querySelector(".chips .chip").click();
    await wait();
    const stars = [...root(el).querySelectorAll(".fl")]
      .filter((n) => n.querySelector(".req"))
      .map((n) => n.textContent.replace(/\s+/g, " ").replace(" *", "").trim());
    expect(stars).not.toContain("Expected annual units / cases");
    expect(saveButton(el).disabled).toBe(false);
    saveButton(el).click();
    await wait();
    expect(
      createRecord.mock.calls[0][0].fields.UnitsCasesPerYear__c
    ).toBeUndefined();
  });

  it("will not save without a brand, and shows the brand as mandatory", async () => {
    const el = await make();
    await portfolio(el, "Knee");
    await choose(el, 'select[data-api="Expected_Closure_Quarter__c"]', "Q1");
    await choose(
      el,
      'input[aria-label="Expected annual value"]',
      "1000",
      "input"
    );
    await choose(
      el,
      'input[aria-label="Expected annual units / cases"]',
      "5",
      "input"
    );
    expect(root(el).querySelector(".foot .note").textContent).toBe(
      "Still to fill in: Brand (at least one)."
    );
    expect(saveButton(el).disabled).toBe(true);
    const stars = [...root(el).querySelectorAll(".fl")]
      .filter((n) => n.querySelector(".req"))
      .map((n) => n.textContent.replace(/\s+/g, " ").replace(" *", "").trim());
    expect(stars).toEqual(expect.arrayContaining(["Brand"]));
    root(el).querySelector(".chips .chip").click();
    await wait();
    expect(saveButton(el).disabled).toBe(false);
    // taking the only brand away switches Save off again
    root(el).querySelector(".chips .chip").click();
    await wait();
    expect(saveButton(el).disabled).toBe(true);
  });

  it("changes the owner through a search", async () => {
    searchOwners.mockResolvedValue([
      { id: "005ALEX", name: "Alex Example", title: "Rep" }
    ]);
    const el = await make();
    await portfolio(el, "Knee");
    root(el).querySelector(".chosen .xcirc").click();
    await wait();
    const box = root(el).querySelector("input.ownerin");
    box.value = "ale";
    box.dispatchEvent(new CustomEvent("input"));
    await wait(400);
    expect(searchOwners).toHaveBeenCalledWith({ term: "ale" });
    root(el).querySelector(".pick .opt").click();
    await wait();
    expect(root(el).querySelector(".chosen .nm").textContent).toBe(
      "Alex Example"
    );
    expect(root(el).querySelector(".chosen .you")).toBeNull();
  });

  it("makes the deal as the person, then puts it in the campaign, then says it was created", async () => {
    createRecord.mockResolvedValue({ id: "a01NEW" });
    setLink.mockResolvedValue();
    const el = await make();
    const created = jest.fn();
    el.addEventListener("created", created);
    await fillAll(el);
    expect(saveButton(el).disabled).toBe(false);
    expect(root(el).querySelector(".foot .note").textContent).toBe(
      "Ready to save."
    );
    saveButton(el).click();
    await wait();
    const call = createRecord.mock.calls[0][0];
    expect(call.apiName).toBe("SalesRisks__c");
    expect(call.fields).toMatchObject({
      RecordTypeId: "rtKnee",
      Account__c: "001SURGEON",
      OwnerId: expect.any(String),
      Expected_Closure_Quarter__c: "Q1",
      Expected_Closing_Year__c: "2027",
      AmountPerYear__c: 120000,
      UnitsCasesPerYear__c: "24",
      CurrencyIsoCode: "USD",
      Stage__c: "Plan",
      Brand__c: "Persona"
    });
    expect(setLink).toHaveBeenCalledWith({
      dealId: "a01NEW",
      campaignId: "a0CCAMP",
      linked: true
    });
    expect(created).toHaveBeenCalledTimes(1);
    expect(created.mock.calls[0][0].detail).toEqual({
      id: "a01NEW",
      linkError: ""
    });
  });

  it("still says the deal was created when it could not join the campaign, and says why", async () => {
    createRecord.mockResolvedValue({ id: "a01NEW" });
    setLink.mockRejectedValue({
      body: { message: "This deal does not fit the campaign." }
    });
    const el = await make();
    const created = jest.fn();
    el.addEventListener("created", created);
    await fillAll(el);
    saveButton(el).click();
    await wait();
    expect(created.mock.calls[0][0].detail).toEqual({
      id: "a01NEW",
      linkError: "This deal does not fit the campaign."
    });
  });

  it("shows what Salesforce refused, makes nothing more and keeps everything entered", async () => {
    createRecord.mockRejectedValue({
      body: {
        output: {
          errors: [
            { message: "You need to adjust the Expected Conversion Quarter." }
          ],
          fieldErrors: {}
        }
      }
    });
    const el = await make();
    const created = jest.fn();
    el.addEventListener("created", created);
    await fillAll(el);
    saveButton(el).click();
    await wait();
    expect(root(el).querySelector(".errs").textContent).toContain(
      "adjust the Expected Conversion Quarter"
    );
    expect(setLink).not.toHaveBeenCalled();
    expect(created).not.toHaveBeenCalled();
    expect(
      root(el).querySelector('input[aria-label="Expected annual value"]').value
    ).toBe("120000");
    expect(saveButton(el).disabled).toBe(false);
  });

  it("says cancel from the Cancel button", async () => {
    const el = await make();
    const cancelled = jest.fn();
    el.addEventListener("cancel", cancelled);
    [...root(el).querySelectorAll(".foot .btn")][0].click();
    expect(cancelled).toHaveBeenCalledTimes(1);
  });

  it("says plainly when the person has no opportunity record type", async () => {
    const el = await make({ c: RT("rtRisk", "AU RISK") });
    expect(root(el).querySelector(".err").textContent).toContain(
      "No record type is available"
    );
    // keep the unused mock referenced so the lookup's Apex import resolves in this suite
    expect(searchLookup).toBeDefined();
  });
});
