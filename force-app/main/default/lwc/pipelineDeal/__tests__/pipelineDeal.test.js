import { createElement } from "lwc";
import PipelineDeal from "c/pipelineDeal";
import { registerLdsTestWireAdapter } from "@salesforce/sfdx-lwc-jest";
import { getRecord, updateRecord } from "lightning/uiRecordApi";
import getBadges from "@salesforce/apex/PipelineBookingsController.getBadges";
import {
  getObjectInfo,
  getPicklistValuesByRecordType
} from "lightning/uiObjectInfoApi";

jest.mock(
  "@salesforce/apex/PipelineBookingsController.getBadges",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
const recordAdapter = registerLdsTestWireAdapter(getRecord);
const infoAdapter = registerLdsTestWireAdapter(getObjectInfo);
const picklistAdapter = registerLdsTestWireAdapter(
  getPicklistValuesByRecordType
);

// the cards inside the flyout read their own data from Salesforce; here they are empty stand-ins
jest.mock(
  "c/pipelineChatter",
  () => {
    const { LightningElement } = require("lwc");
    return { __esModule: true, default: class extends LightningElement {} };
  },
  { virtual: true }
);
jest.mock(
  "c/pipelineUsageCard",
  () => {
    const { LightningElement, registerDecorators } = require("lwc");
    class Stub extends LightningElement {}
    registerDecorators(Stub, {
      publicProps: { embedded: { config: 0 }, recordId: { config: 0 } }
    });
    return { __esModule: true, default: Stub };
  },
  { virtual: true }
);
jest.mock(
  "c/pipelineHospitalBookings",
  () => {
    const { LightningElement } = require("lwc");
    return { __esModule: true, default: class extends LightningElement {} };
  },
  { virtual: true }
);
jest.mock(
  "c/pipelineDealCampaigns",
  () => {
    const { LightningElement } = require("lwc");
    return { __esModule: true, default: class extends LightningElement {} };
  },
  { virtual: true }
);
jest.mock(
  "c/pipelineBookings",
  () => {
    const { LightningElement } = require("lwc");
    return { __esModule: true, default: class extends LightningElement {} };
  },
  { virtual: true }
);
jest.mock(
  "c/pipelineLookup",
  () => {
    const { LightningElement } = require("lwc");
    return { __esModule: true, default: class extends LightningElement {} };
  },
  { virtual: true }
);

// Guards the screen-to-flyout hand-over: the screen gives the flyout its deal and says when to slide it in.
describe("c-pipeline-deal", () => {
  beforeEach(() => {
    getBadges.mockReset();
    getBadges.mockResolvedValue(undefined);
  });
  afterEach(() => {
    while (document.body.firstChild)
      document.body.removeChild(document.body.firstChild);
  });

  const deal = {
    id: "a01000000000001",
    name: "Test deal",
    kind: "opp",
    segment: "Hip",
    stage: "Plan",
    ownerName: "Pat Owner",
    value: 1000,
    currencyCode: "AUD"
  };

  it("takes the deal from the screen and shows its owner and value", async () => {
    const el = createElement("c-pipeline-deal", { is: PipelineDeal });
    el.deal = deal;
    el.index = 0;
    el.total = 1;
    document.body.appendChild(el);
    await Promise.resolve();
    expect(el.deal.id).toBe(deal.id);
    expect(el.shadowRoot.textContent).toContain("Pat Owner");
  });

  it("shows the expected annual value in the top row in the deal's own currency, and in US dollars when USD is on", async () => {
    const el = createElement("c-pipeline-deal", { is: PipelineDeal });
    el.deal = { ...deal, value: 150000, currencyCode: "AUD" };
    document.body.appendChild(el);
    await Promise.resolve();
    const strip = () => el.shadowRoot.querySelector(".strip").textContent;
    expect(strip()).toContain("A$150k");
    el.rates = { rates: { USD: 1, AUD: 1.5 } };
    el.usd = true;
    await Promise.resolve();
    expect(strip()).toContain("US$100k");
    expect(strip()).not.toContain("A$150k");
    el.usd = false;
    await Promise.resolve();
    expect(strip()).toContain("A$150k");
  });

  it("slides in only when told to open", async () => {
    const el = createElement("c-pipeline-deal", { is: PipelineDeal });
    el.deal = deal;
    document.body.appendChild(el);
    await Promise.resolve();
    expect(el.shadowRoot.querySelector(".fly.on")).toBeNull();
    el.open = true;
    await Promise.resolve();
    expect(el.shadowRoot.querySelector(".fly.on")).not.toBeNull();
    expect(el.shadowRoot.querySelector(".scrim.on")).not.toBeNull();
  });

  it("shows the Background Information (a text box) from the record, and keeps what is being typed", async () => {
    const el = createElement("c-pipeline-deal", { is: PipelineDeal });
    el.deal = deal;
    el.index = 0;
    el.total = 1;
    document.body.appendChild(el);
    infoAdapter.emit({ fields: { Objective__c: { updateable: true } } });
    recordAdapter.emit({
      recordTypeId: "012000000000001",
      fields: {
        Objective__c: {
          value: "Inherited a shoulder business. Strong interest in research."
        }
      }
    });
    await Promise.resolve();
    await Promise.resolve();
    const box = el.shadowRoot.querySelector("textarea[data-api=Objective__c]");
    expect(box).not.toBeNull();
    expect(box.value).toBe(
      "Inherited a shoulder business. Strong interest in research."
    );
  });

  describe("the header order and the stage", () => {
    it("puts the summary line under the name in the header, and the stage slider in a band of its own at the top of the area under the header", async () => {
      const el = createElement("c-pipeline-deal", { is: PipelineDeal });
      el.deal = { ...deal, kind: "opp", stage: "Commit" };
      document.body.appendChild(el);
      await Promise.resolve();
      const kids = [...el.shadowRoot.querySelector(".fhead").children].map(
        (c) => c.className
      );
      expect(kids).toEqual(["h1", "strip"]);
      const under = [...el.shadowRoot.querySelector(".under").children].map(
        (c) => c.className
      );
      expect(under[0]).toBe("band");
      expect(
        el.shadowRoot.querySelector(".under > .band c-pipeline-stage-slider")
      ).not.toBeNull();
      expect(el.shadowRoot.querySelector(".under .strip")).toBeNull();
    });

    it("has no Stage field in the form, and still reads the stage so the slider shows what is saved", async () => {
      const el = createElement("c-pipeline-deal", { is: PipelineDeal });
      el.deal = { ...deal, kind: "opp" };
      document.body.appendChild(el);
      infoAdapter.emit({
        fields: {
          Stage__c: { updateable: true },
          Priority__c: { updateable: true }
        }
      });
      recordAdapter.emit({
        recordTypeId: "012000000000001",
        fields: { Stage__c: { value: "Commit" }, Priority__c: { value: false } }
      });
      await Promise.resolve();
      await Promise.resolve();
      const labels = [...el.shadowRoot.querySelectorAll(".grid .fl")].map((x) =>
        x.textContent.replace(/[\s*]/g, "")
      );
      expect(labels).not.toContain("Stage");
      expect(el.shadowRoot.querySelector("c-pipeline-stage-slider").value).toBe(
        "Commit"
      );
    });
  });

  describe("the Yes / No fields", () => {
    async function mount(kind, editable, values) {
      const el = createElement("c-pipeline-deal", { is: PipelineDeal });
      el.deal = { ...deal, kind };
      el.index = 0;
      el.total = 1;
      document.body.appendChild(el);
      const names = [
        "OnHold__c",
        "Priority__c",
        "State_Priority__c",
        "myMo__c",
        "myMo_Stage__c"
      ];
      infoAdapter.emit({
        fields: Object.fromEntries(
          names.map((n) => [n, { updateable: editable }])
        )
      });
      recordAdapter.emit({
        recordTypeId: "012000000000001",
        fields: Object.fromEntries(
          names.map((n) => [n, { value: values[n] ?? null }])
        )
      });
      await Promise.resolve();
      await Promise.resolve();
      return el;
    }
    const sliders = (el) => [
      ...el.shadowRoot.querySelectorAll("c-pipeline-segmented")
    ];
    const press = (el, api, value) =>
      el.shadowRoot
        .querySelector(`c-pipeline-segmented[data-api="${api}"]`)
        .dispatchEvent(new CustomEvent("change", { detail: { value } }));

    it("shows an opportunity's four as one row of sliders, each label the left end of its pill", async () => {
      const el = await mount("opp", true, { Priority__c: true });
      expect(el.shadowRoot.querySelectorAll(".flags").length).toBe(1);
      expect(sliders(el).map((x) => x.heading)).toEqual([
        "On hold",
        "Rep priority",
        "State priority",
        "MyMobility"
      ]);
      expect(sliders(el).map((x) => x.value)).toEqual([
        "no",
        "yes",
        "no",
        "no"
      ]);
      expect(el.shadowRoot.querySelector(".tog")).toBeNull();
    });

    it("makes Yes green, and amber for On hold, a warning", async () => {
      const el = await mount("opp", true, {});
      const tone = (api) =>
        el.shadowRoot.querySelector(`c-pipeline-segmented[data-api="${api}"]`)
          .options[1].tone;
      expect(tone("OnHold__c")).toBe("warn");
      ["Priority__c", "State_Priority__c", "myMo__c"].forEach((api) =>
        expect(tone(api)).toBe("good")
      );
    });

    it("shows On hold in amber beside the name while the deal is on hold, following the slider", async () => {
      const el = await mount("opp", true, { OnHold__c: false });
      const tag = () => el.shadowRoot.querySelector(".fhead .hold");
      expect(tag()).not.toBeNull();
      expect(tag().classList.contains("off")).toBe(true);
      press(el, "OnHold__c", "yes");
      await Promise.resolve();
      expect(tag().classList.contains("off")).toBe(false);
      expect(tag().textContent).toBe("On hold");
      press(el, "OnHold__c", "no");
      await Promise.resolve();
      expect(tag().classList.contains("off")).toBe(true);
    });

    it("has no On hold marker on a risk", async () => {
      const el = await mount("risk", true, {});
      expect(el.shadowRoot.querySelector(".fhead .hold")).toBeNull();
    });

    it("gives a risk only the two priorities", async () => {
      const el = await mount("risk", true, {});
      expect(sliders(el).map((x) => x.heading)).toEqual([
        "Rep priority",
        "State priority"
      ]);
    });

    it("changes the value when a slider is pressed, with no outline added", async () => {
      const el = await mount("opp", true, {});
      press(el, "Priority__c", "yes");
      await Promise.resolve();
      expect(el.shadowRoot.querySelector(".flag.chg")).toBeNull();
      expect(
        el.shadowRoot.querySelector(
          'c-pipeline-segmented[data-api="Priority__c"]'
        ).value
      ).toBe("yes");
    });

    it("greys the sliders when the person cannot change the deal", async () => {
      const el = await mount("opp", false, { OnHold__c: true });
      expect(sliders(el).length).toBe(4);
      expect(sliders(el).every((x) => x.disabled === true)).toBe(true);
    });

    it("keeps the MyMo stage folded away while MyMo is No and opens it when MyMo is Yes", async () => {
      const el = await mount("opp", true, {});
      const fold = () => el.shadowRoot.querySelector(".cell.fold");
      expect(fold()).not.toBeNull();
      expect(fold().classList.contains("open")).toBe(false);
      press(el, "myMo__c", "yes");
      await Promise.resolve();
      expect(fold().classList.contains("open")).toBe(true);
      press(el, "myMo__c", "no");
      await Promise.resolve();
      expect(fold().classList.contains("open")).toBe(false);
    });
  });

  describe("the four screens: the deal, surgeon usages, MyCase bookings and campaigns", () => {
    async function mount(kind = "opp", extra = {}) {
      const el = createElement("c-pipeline-deal", { is: PipelineDeal });
      el.deal = { ...deal, kind, hcp: "Dr Test", ...extra };
      el.index = 0;
      el.total = 1;
      document.body.appendChild(el);
      el.open = true;
      await Promise.resolve();
      return el;
    }
    const pills = (el) => [
      ...el.shadowRoot.querySelectorAll(".fhead .btn.nav")
    ];
    const pill = (el, text) =>
      pills(el).find((b) => b.textContent.trim().startsWith(text));
    const lit = (el) =>
      pills(el)
        .filter((b) => b.className.includes(" on"))
        .map((b) => b.textContent.trim().replace(/\s+/g, " "));

    it("names the deal on the first pill (Extremities Opportunity, Knee Risk, ROSA) and lights only that pill on the deal screen", async () => {
      const opp = await mount("opp", { segment: "Extremities" });
      expect(
        pills(opp).map((b) => b.textContent.trim().split("\n")[0].trim())
      ).toEqual([
        "Extremities Opportunity",
        "Surgeon Usages",
        "MyCase Bookings",
        "Campaigns0"
      ]);
      expect(lit(opp)).toEqual(["Extremities Opportunity"]);
      const risk = await mount("risk", { segment: "Knee" });
      expect(pill(risk, "Knee Risk")).toBeTruthy();
      const several = await mount("risk", { segment: "Hip;Knee" });
      expect(pill(several, "Risk")).toBeTruthy();
      const rosa = await mount("rosa", { segment: undefined });
      expect(pill(rosa, "ROSA")).toBeTruthy();
    });

    it("gives a ROSA deal three pills (no Surgeon Usages) and the other kinds four", async () => {
      expect(pills(await mount("opp")).length).toBe(4);
      expect(pills(await mount("risk")).length).toBe(4);
      const rosa = await mount("rosa");
      expect(pills(rosa).length).toBe(3);
      expect(pill(rosa, "Surgeon Usages")).toBeFalsy();
      expect(pill(rosa, "MyCase Bookings")).toBeTruthy();
      expect(pill(rosa, "Campaigns")).toBeTruthy();
    });

    it("keeps the facts row, stage path and fields on the deal screen only, and the bottom row too", async () => {
      const el = await mount();
      expect(el.shadowRoot.querySelector(".fhead .strip")).not.toBeNull();
      expect(el.shadowRoot.querySelector(".under .band")).not.toBeNull();
      expect(el.shadowRoot.querySelector(".under .body")).not.toBeNull();
      expect(el.shadowRoot.querySelector(".foot")).not.toBeNull();
      pill(el, "Surgeon Usages").click();
      await Promise.resolve();
      expect(el.shadowRoot.querySelector(".fhead .strip")).toBeNull();
      expect(el.shadowRoot.querySelector(".under .band")).toBeNull();
      expect(el.shadowRoot.querySelector(".under .body")).toBeNull();
      expect(el.shadowRoot.querySelector(".foot")).toBeNull();
      expect(el.shadowRoot.querySelector(".fhead .h1")).not.toBeNull();
      pills(el)[0].click();
      await Promise.resolve();
      expect(el.shadowRoot.querySelector(".fhead .strip")).not.toBeNull();
      expect(el.shadowRoot.querySelector(".foot")).not.toBeNull();
    });

    it("shows the Usage Card for the deal's surgeon, filling the flyout, and lights the Surgeon Usages pill", async () => {
      const el = await mount();
      pill(el, "Surgeon Usages").click();
      await Promise.resolve();
      const card = el.shadowRoot.querySelector("c-pipeline-usage-card");
      expect(card).not.toBeNull();
      expect(card.embedded).toBe(true);
      expect(lit(el)).toEqual(["Surgeon Usages"]);
      expect(el.shadowRoot.querySelector("c-pipeline-usages")).toBeNull();
      expect(el.shadowRoot.querySelector(".layer")).toBeNull();
    });

    it("shows the surgeon's MyCase bookings for an opportunity and the hospital's for a ROSA deal", async () => {
      const opp = await mount("opp");
      pill(opp, "MyCase Bookings").click();
      await Promise.resolve();
      expect(
        opp.shadowRoot.querySelector("c-pipeline-bookings")
      ).not.toBeNull();
      expect(
        opp.shadowRoot.querySelector("c-pipeline-hospital-bookings")
      ).toBeNull();
      expect(lit(opp)).toEqual(["MyCase Bookings"]);
      const rosa = await mount("rosa");
      pill(rosa, "MyCase Bookings").click();
      await Promise.resolve();
      expect(
        rosa.shadowRoot.querySelector("c-pipeline-hospital-bookings")
      ).not.toBeNull();
      expect(rosa.shadowRoot.querySelector("c-pipeline-bookings")).toBeNull();
      expect(rosa.shadowRoot.querySelector(".screen.fill")).not.toBeNull();
    });

    it("shows how many campaigns the deal is in on the Campaigns pill, and opens Campaigns for any kind of deal", async () => {
      const el = await mount("opp");
      const count = () =>
        pill(el, "Campaigns").querySelector(".badge").textContent;
      expect(count()).toBe("0");
      el.deal = { ...el.deal, campaignCount: 3 };
      await Promise.resolve();
      expect(count()).toBe("3");
      const rosa = await mount("rosa");
      pill(rosa, "Campaigns").click();
      await Promise.resolve();
      expect(
        rosa.shadowRoot.querySelector("c-pipeline-deal-campaigns")
      ).not.toBeNull();
      expect(lit(rosa)).toEqual(["Campaigns0"]);
    });

    it("swaps screens in place: one screen at a time, the top row never goes", async () => {
      const el = await mount();
      pill(el, "Surgeon Usages").click();
      await Promise.resolve();
      pill(el, "MyCase Bookings").click();
      await Promise.resolve();
      expect(el.shadowRoot.querySelector("c-pipeline-usage-card")).toBeNull();
      expect(el.shadowRoot.querySelector("c-pipeline-bookings")).not.toBeNull();
      pill(el, "Campaigns").click();
      await Promise.resolve();
      expect(el.shadowRoot.querySelector("c-pipeline-bookings")).toBeNull();
      expect(
        el.shadowRoot.querySelector("c-pipeline-deal-campaigns")
      ).not.toBeNull();
      expect(el.shadowRoot.querySelector(".fhead .h1")).not.toBeNull();
    });

    it("has no ask-to-check button and no old sliding panel", async () => {
      const el = await mount("opp", { ownerId: "005other" });
      el.isManager = true;
      el.viewerId = "005me";
      pill(el, "Surgeon Usages").click();
      await Promise.resolve();
      expect(el.shadowRoot.textContent).not.toContain("check them");
      expect(el.shadowRoot.querySelector(".sheet")).toBeNull();
      expect(el.shadowRoot.querySelector(".shade")).toBeNull();
    });

    it("stays on Surgeon Usages when Next lands on another opportunity, and shows the deal when it lands on a ROSA deal", async () => {
      const el = await mount("opp");
      pill(el, "Surgeon Usages").click();
      await Promise.resolve();
      el.deal = { ...deal, id: "a01000000000002", kind: "risk", hcp: "Dr Two" };
      await Promise.resolve();
      expect(
        el.shadowRoot.querySelector("c-pipeline-usage-card")
      ).not.toBeNull();
      el.deal = { ...deal, id: "a01000000000003", kind: "rosa" };
      await Promise.resolve();
      expect(el.shadowRoot.querySelector("c-pipeline-usage-card")).toBeNull();
      expect(el.shadowRoot.querySelector(".fhead .strip")).not.toBeNull();
      expect(lit(el)).toEqual(["ROSA"]);
    });

    it("shows the surgery count on the MyCase Bookings pill only", async () => {
      getBadges.mockResolvedValue({ surgeonId: "001", booked: 38 });
      const el = await mount();
      await Promise.resolve();
      await Promise.resolve();
      expect(pill(el, "Surgeon Usages").textContent.trim()).toBe(
        "Surgeon Usages"
      );
      expect(pill(el, "MyCase Bookings").textContent).toContain("38");
    });

    it("opens on Surgeon Usages when told to start there (a rating plate was pressed), and on the deal for a ROSA deal", async () => {
      const el = createElement("c-pipeline-deal", { is: PipelineDeal });
      el.deal = { ...deal, kind: "opp", hcp: "Dr Test" };
      el.startScreen = "usages";
      el.index = 0;
      el.total = 1;
      document.body.appendChild(el);
      await Promise.resolve();
      el.open = true;
      await Promise.resolve();
      expect(
        el.shadowRoot.querySelector("c-pipeline-usage-card")
      ).not.toBeNull();
      expect(el.shadowRoot.querySelector(".fhead .strip")).toBeNull();
      const rosa = createElement("c-pipeline-deal", { is: PipelineDeal });
      rosa.deal = { ...deal, kind: "rosa" };
      rosa.startScreen = "usages";
      document.body.appendChild(rosa);
      rosa.open = true;
      await Promise.resolve();
      expect(rosa.shadowRoot.querySelector("c-pipeline-usage-card")).toBeNull();
      expect(rosa.shadowRoot.querySelector(".fhead .strip")).not.toBeNull();
    });

    it("opens next time on the deal itself", async () => {
      const el = await mount();
      pill(el, "Surgeon Usages").click();
      await Promise.resolve();
      el.open = false;
      await Promise.resolve();
      expect(el.shadowRoot.querySelector("c-pipeline-usage-card")).toBeNull();
      expect(el.shadowRoot.querySelector(".fhead .strip")).not.toBeNull();
    });
  });

  describe("the owner and the rules when editing an opportunity", () => {
    const FIELDS_ON = [
      "Account__c",
      "OwnerId",
      "AmountPerYear__c",
      "UnitsCasesPerYear__c",
      "Brand__c",
      "Expected_Closure_Quarter__c",
      "Expected_Closing_Year__c",
      "Objective__c",
      "Healthcare_Facility__c",
      "ROSAGrowthDollar__c"
    ];
    const BASE = {
      Account__c: { value: "001SURGEON" },
      Account__r: { value: { fields: { Name: { value: "Dr Priya Nair" } } } },
      OwnerId: { value: "005ME" },
      Owner: { value: { fields: { Name: { value: "Robert Reeves" } } } },
      AmountPerYear__c: { value: 120000 },
      UnitsCasesPerYear__c: { value: "24" },
      Brand__c: { value: "Persona" },
      Expected_Closure_Quarter__c: { value: "Q1" },
      Expected_Closing_Year__c: { value: "2027" }
    };
    const list = (values) => values.map((v) => ({ value: v, label: v }));
    async function openDeal(kind = "opp", record = {}) {
      const el = createElement("c-pipeline-deal", { is: PipelineDeal });
      el.deal = { ...deal, kind, hcp: "Dr Priya Nair" };
      el.index = 0;
      el.total = 1;
      document.body.appendChild(el);
      const info = {};
      FIELDS_ON.forEach((f) => {
        info[f] = { updateable: true };
      });
      infoAdapter.emit({ fields: info });
      recordAdapter.emit({
        recordTypeId: "012000000000001",
        fields: { ...BASE, ...record }
      });
      picklistAdapter.emit({
        picklistFieldValues: {
          Brand__c: { values: list(["Persona", "OptimiZe"]) },
          Expected_Closure_Quarter__c: {
            values: list(["Q1", "Q2", "Q3", "Q4"])
          },
          Expected_Closing_Year__c: { values: list(["2026", "2027"]) }
        }
      });
      await Promise.resolve();
      await Promise.resolve();
      return el;
    }
    const root = (el) => el.shadowRoot;
    const save = (el) =>
      [...root(el).querySelectorAll(".foot .btn")].find((b) =>
        b.textContent.includes("Save changes")
      );
    const errors = (el) =>
      [...root(el).querySelectorAll(".errs div")].map((d) => d.textContent);
    const type = async (el, api, value) => {
      const box = root(el).querySelector(`input[data-api=${api}]`);
      box.value = value;
      box.dispatchEvent(new CustomEvent("change"));
      await Promise.resolve();
    };
    const brand = (el) =>
      root(el).querySelector("button.pill[data-value=Persona]");
    const star = (el, text) =>
      [...root(el).querySelectorAll(".fl")].some(
        (n) => n.textContent.includes(text) && n.querySelector(".req")
      );
    beforeEach(() => {
      updateRecord.mockReset();
      updateRecord.mockResolvedValue({});
    });

    it("shows the Owner as a person search with the current owner's name, starred, for an opportunity, a risk and a ROSA deal", async () => {
      for (const kind of ["opp", "risk", "rosa"]) {
        // eslint-disable-next-line no-await-in-loop
        const el = await openDeal(kind);
        const owner = [...root(el).querySelectorAll("c-pipeline-lookup")].find(
          (l) => l.fieldName === "OwnerId"
        );
        expect(owner.valueId).toBe("005ME");
        expect(owner.valueName).toBe("Robert Reeves");
        expect(star(el, "Owner")).toBe(true);
      }
    });

    it("saves a new owner with the deal", async () => {
      const el = await openDeal("opp");
      const owner = [...root(el).querySelectorAll("c-pipeline-lookup")].find(
        (l) => l.fieldName === "OwnerId"
      );
      owner.dispatchEvent(
        new CustomEvent("change", {
          detail: { id: "005ALEX", name: "Alex Example" }
        })
      );
      await Promise.resolve();
      expect(save(el).disabled).toBe(false);
      save(el).click();
      await Promise.resolve();
      expect(updateRecord).toHaveBeenCalledTimes(1);
      expect(updateRecord.mock.calls[0][0].fields).toEqual({
        Id: deal.id,
        OwnerId: "005ALEX"
      });
    });

    it("will not save an opportunity with no brand left: it says so, saves nothing and keeps the changes", async () => {
      const el = await openDeal("opp");
      expect(star(el, "Brand")).toBe(true);
      brand(el).click(); // the only brand comes off
      await Promise.resolve();
      save(el).click();
      await Promise.resolve();
      expect(errors(el)).toEqual(["Choose at least one brand."]);
      expect(updateRecord).not.toHaveBeenCalled();
      brand(el).click();
      await Promise.resolve();
      expect(brand(el).className).toContain("on");
    });

    it("will not save without an expected annual value, even when cases are typed", async () => {
      const el = await openDeal("opp");
      expect(star(el, "Expected annual value")).toBe(true);
      await type(el, "AmountPerYear__c", "");
      await type(el, "UnitsCasesPerYear__c", "30");
      save(el).click();
      await Promise.resolve();
      expect(errors(el)).toEqual(["Expected annual value is needed."]);
      expect(updateRecord).not.toHaveBeenCalled();
      await type(el, "AmountPerYear__c", "5000");
      save(el).click();
      await Promise.resolve();
      expect(updateRecord).toHaveBeenCalledTimes(1);
    });

    it("needs both the closing quarter and the year, and does not need the units / cases", async () => {
      const el = await openDeal("opp", {
        Expected_Closure_Quarter__c: { value: null }
      });
      expect(star(el, "Expected closing quarter and year")).toBe(true);
      await type(el, "UnitsCasesPerYear__c", "");
      save(el).click();
      await Promise.resolve();
      expect(errors(el)).toEqual([
        "Expected closing quarter and year are both needed."
      ]);
      expect(star(el, "units")).toBe(false);
      expect(updateRecord).not.toHaveBeenCalled();
    });

    it("lists everything that is missing at once", async () => {
      const el = await openDeal("opp", {
        AmountPerYear__c: { value: null },
        Brand__c: { value: null },
        OwnerId: { value: null }
      });
      await type(el, "UnitsCasesPerYear__c", "31");
      save(el).click();
      await Promise.resolve();
      expect(errors(el)).toEqual([
        "Expected annual value is needed.",
        "Choose at least one brand.",
        "Owner is needed."
      ]);
    });

    it("applies the rules to a risk too: its annual value at risk, the quarter and year, at least one brand and an owner", async () => {
      const el = await openDeal("risk", {
        AmountPerYear__c: { value: null },
        Brand__c: { value: null },
        Expected_Closing_Year__c: { value: null }
      });
      expect(star(el, "Annual value at risk")).toBe(true);
      expect(star(el, "Brand")).toBe(true);
      const note = root(el).querySelector("textarea[data-api=Objective__c]");
      note.value = "A note";
      note.dispatchEvent(new CustomEvent("change"));
      await Promise.resolve();
      save(el).click();
      await Promise.resolve();
      expect(errors(el)).toEqual([
        "Annual value at risk is needed.",
        "Expected closing quarter and year are both needed.",
        "Choose at least one brand."
      ]);
      expect(updateRecord).not.toHaveBeenCalled();
    });

    it("applies the rules to a ROSA deal: the facility, the ROSA growth value, the quarter and year and an owner, with no brand and the surgeon optional", async () => {
      const el = await openDeal("rosa", {
        Healthcare_Facility__c: { value: null },
        ROSAGrowthDollar__c: { value: null },
        OwnerId: { value: null },
        Account__c: { value: null },
        Brand__c: { value: null }
      });
      expect(star(el, "Healthcare facility")).toBe(true);
      expect(star(el, "ROSA growth $")).toBe(true);
      expect(star(el, "Primary HCP")).toBe(false);
      expect(star(el, "Brand")).toBe(false);
      const note = root(el).querySelector("textarea[data-api=Objective__c]");
      note.value = "A note";
      note.dispatchEvent(new CustomEvent("change"));
      await Promise.resolve();
      save(el).click();
      await Promise.resolve();
      expect(errors(el)).toEqual([
        "Healthcare facility is needed.",
        "ROSA growth $ is needed.",
        "Owner is needed."
      ]);
      expect(updateRecord).not.toHaveBeenCalled();
    });

    it("saves a risk and a ROSA deal that have everything", async () => {
      const risk = await openDeal("risk");
      const note = root(risk).querySelector("textarea[data-api=Objective__c]");
      note.value = "A note";
      note.dispatchEvent(new CustomEvent("change"));
      await Promise.resolve();
      save(risk).click();
      await Promise.resolve();
      expect(updateRecord).toHaveBeenCalledTimes(1);
      const rosa = await openDeal("rosa", {
        Healthcare_Facility__c: { value: "001HOSP" },
        ROSAGrowthDollar__c: { value: 50000 }
      });
      const note2 = root(rosa).querySelector("textarea[data-api=Objective__c]");
      note2.value = "Another note";
      note2.dispatchEvent(new CustomEvent("change"));
      await Promise.resolve();
      save(rosa).click();
      await Promise.resolve();
      expect(updateRecord).toHaveBeenCalledTimes(2);
    });
  });

  describe("expected closing quarter and year", () => {
    const years = ["2028", "2027", "2026", "2025"].map((v) => ({
      value: v,
      label: v
    }));
    const quarters = ["Q1", "Q2", "Q3", "Q4"].map((v) => ({
      value: v,
      label: v
    }));

    async function open(quarter, year) {
      const el = createElement("c-pipeline-deal", { is: PipelineDeal });
      el.deal = deal;
      el.index = 0;
      el.total = 1;
      document.body.appendChild(el);
      infoAdapter.emit({
        fields: {
          Expected_Closure_Quarter__c: { updateable: true },
          Expected_Closing_Year__c: { updateable: true }
        }
      });
      recordAdapter.emit({
        recordTypeId: "012000000000001",
        fields: {
          Expected_Closure_Quarter__c: { value: quarter },
          Expected_Closing_Year__c: { value: year }
        }
      });
      picklistAdapter.emit({
        picklistFieldValues: {
          Expected_Closure_Quarter__c: { values: quarters },
          Expected_Closing_Year__c: { values: years }
        }
      });
      await Promise.resolve();
      await Promise.resolve();
      return el;
    }
    const pick = async (el, api, value) => {
      const select = el.shadowRoot.querySelector(`select[data-api=${api}]`);
      select.value = value;
      select.dispatchEvent(new CustomEvent("change"));
      await Promise.resolve();
      return el.shadowRoot.querySelector(`select[data-api=${api}]`);
    };

    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date("2026-11-02T10:00:00"));
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it("shows the year beside the quarter, as a list of years", async () => {
      const el = await open("Q4", "2026");
      const year = el.shadowRoot.querySelector(
        "select[data-api=Expected_Closing_Year__c]"
      );
      expect(year).not.toBeNull();
      expect(year.value).toBe("2026");
      expect(Array.from(year.options).map((o) => o.value)).toEqual([
        "",
        "2028",
        "2027",
        "2026",
        "2025"
      ]);
    });

    it("suggests the year when a quarter is picked and there is no year yet", async () => {
      const el = await open(null, null);
      await pick(el, "Expected_Closure_Quarter__c", "Q1");
      const year = el.shadowRoot.querySelector(
        "select[data-api=Expected_Closing_Year__c]"
      );
      expect(year.value).toBe("2027"); // today is in Q4 2026, so Q1 means next year
      await pick(el, "Expected_Closure_Quarter__c", "Q4");
      expect(
        el.shadowRoot.querySelector("select[data-api=Expected_Closing_Year__c]")
          .value
      ).toBe("2027"); // a year already chosen that is still ahead is kept
    });

    it("moves a year that would put the quarter in the past", async () => {
      const el = await open("Q4", "2026");
      await pick(el, "Expected_Closure_Quarter__c", "Q2"); // Q2 2026 is past: next Q2 is 2027
      expect(
        el.shadowRoot.querySelector("select[data-api=Expected_Closing_Year__c]")
          .value
      ).toBe("2027");
    });
  });

  describe("the stage path", () => {
    async function open(kind, stage, values) {
      const el = createElement("c-pipeline-deal", { is: PipelineDeal });
      el.deal = { ...deal, kind, stage };
      el.index = 0;
      el.total = 1;
      document.body.appendChild(el);
      infoAdapter.emit({ fields: { Stage__c: { updateable: true } } });
      recordAdapter.emit({
        recordTypeId: "012000000000001",
        fields: { Stage__c: { value: stage } }
      });
      picklistAdapter.emit({
        picklistFieldValues: {
          Stage__c: { values: values.map((v) => ({ value: v, label: v })) }
        }
      });
      await Promise.resolve();
      await Promise.resolve();
      return el;
    }
    const slider = (el) =>
      el.shadowRoot.querySelector("c-pipeline-stage-slider");
    const OPP = ["Plan", "Action", "Conversion", "Unsuccessful Conversion"];

    it("gives the slider every stage, with both closing stages at the end, the winning one then the losing one", async () => {
      const el = await open("opp", "Action", OPP);
      expect(slider(el).steps).toEqual([
        "Plan",
        "Action",
        "Conversion",
        "Unsuccessful Conversion"
      ]);
      expect(slider(el).won).toBe("Conversion");
      expect(slider(el).lost).toBe("Unsuccessful Conversion");
      expect(slider(el).value).toBe("Action");
    });

    it("uses each kind's own closing stages", async () => {
      const el = await open("rosa", "Closed Won", [
        "Sales Pipeline",
        "Closed Won",
        "Deal Lost"
      ]);
      expect(slider(el).steps).toEqual([
        "Sales Pipeline",
        "Closed Won",
        "Deal Lost"
      ]);
      expect(slider(el).won).toBe("Closed Won");
      expect(slider(el).lost).toBe("Deal Lost");
    });

    it("sets the stage when a stage is clicked on the slider", async () => {
      const el = await open("opp", "Action", OPP);
      slider(el).dispatchEvent(
        new CustomEvent("change", {
          detail: { value: "Unsuccessful Conversion" }
        })
      );
      await Promise.resolve();
      expect(slider(el).value).toBe("Unsuccessful Conversion");
    });

    it("names the kind of deal on the first pill, not under the name and not again in the facts row", async () => {
      const el = await open("opp", "Action", OPP);
      const strip = el.shadowRoot
        .querySelector(".strip")
        .textContent.replace(/\s+/g, " ");
      expect(strip).not.toContain("Opportunity");
      expect(
        el.shadowRoot.querySelector(".fhead .btn.nav.on").textContent
      ).toContain("Opportunity");
      expect(el.shadowRoot.querySelector(".ttl")).toBeNull();
    });
  });
});
