import { createElement } from "lwc";
import PipelineDeal from "c/pipelineDeal";
import { registerLdsTestWireAdapter } from "@salesforce/sfdx-lwc-jest";
import { getRecord } from "lightning/uiRecordApi";
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
  "c/pipelineUsages",
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
    it("puts the summary line under the name in the header, and the stage slider in a band of its own at the top of the area the panels slide over", async () => {
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

  describe("surgeon usages and case bookings panels", () => {
    async function mount(kind = "opp") {
      const el = createElement("c-pipeline-deal", { is: PipelineDeal });
      el.deal = { ...deal, kind, hcp: "Dr Test" };
      el.index = 0;
      el.total = 1;
      document.body.appendChild(el);
      el.open = true;
      await Promise.resolve();
      return el;
    }
    const button = (el, text) =>
      [...el.shadowRoot.querySelectorAll(".fhead .btn.nav")].find((b) =>
        b.textContent.trim().startsWith(text)
      );

    afterEach(() => jest.useRealTimers());

    it("has the two panel buttons in the top row for an opportunity, none for a ROSA deal, and none in the bottom row", async () => {
      const opp = await mount("opp");
      expect(button(opp, "Surgeon Usages")).toBeTruthy();
      expect(button(opp, "MyCase Bookings")).toBeTruthy();
      expect(opp.shadowRoot.querySelectorAll(".foot .btn.nav").length).toBe(0);
      expect(button(opp, "Campaigns")).toBeTruthy();
      const rosa = await mount("rosa");
      // a ROSA deal has no surgeon panels, but it can still be put in a campaign
      expect(rosa.shadowRoot.querySelectorAll(".fhead .btn.nav").length).toBe(
        1
      );
      expect(button(rosa, "Campaigns")).toBeTruthy();
      expect(button(rosa, "Surgeon Usages")).toBeFalsy();
    });

    it("shows how many campaigns the deal is in on the Campaigns button", async () => {
      const el = await mount("opp");
      const count = () =>
        button(el, "Campaigns").querySelector(".badge").textContent;
      expect(count()).toBe("0");
      el.deal = { ...el.deal, campaignCount: 3 };
      await Promise.resolve();
      expect(count()).toBe("3");
    });

    it("opens the Campaigns panel for any kind of deal", async () => {
      jest.useFakeTimers();
      const el = await mount("rosa");
      button(el, "Campaigns").click();
      jest.advanceTimersByTime(40);
      await Promise.resolve();
      expect(
        el.shadowRoot.querySelector("c-pipeline-deal-campaigns")
      ).not.toBeNull();
      expect(el.shadowRoot.querySelector(".shead h2").textContent).toBe(
        "Campaigns"
      );
      jest.useRealTimers();
    });

    it("keeps the bottom row for actions only: the deal's three buttons, nothing over a panel, the panel's own while editing", async () => {
      jest.useFakeTimers();
      const el = await mount();
      const foot = () =>
        [...el.shadowRoot.querySelectorAll(".foot .btn")].map((b) =>
          b.textContent.trim()
        );
      expect(foot()).toEqual(["Open in Salesforce", "Cancel", "Save changes"]);
      button(el, "MyCase Bookings").click();
      jest.advanceTimersByTime(40);
      await Promise.resolve();
      expect(foot()).toEqual([]);
      button(el, "Surgeon Usages").click();
      jest.advanceTimersByTime(40);
      await Promise.resolve();
      expect(foot()).toEqual([]);
      const usages = el.shadowRoot.querySelector("c-pipeline-usages");
      usages.submit = jest.fn();
      usages.cancel = jest.fn();
      usages.dispatchEvent(
        new CustomEvent("actionstate", {
          detail: { kind: "edit", canSubmit: false, saving: false }
        })
      );
      await Promise.resolve();
      expect(foot()).toEqual(["Cancel", "Save changes"]);
      const save = () =>
        [...el.shadowRoot.querySelectorAll(".foot .btn")].find(
          (b) => b.textContent.trim() !== "Cancel"
        );
      expect(save().disabled).toBe(true);
      usages.dispatchEvent(
        new CustomEvent("actionstate", {
          detail: { kind: "edit", canSubmit: true, saving: false }
        })
      );
      await Promise.resolve();
      expect(save().disabled).toBe(false);
      save().click();
      expect(usages.submit).toHaveBeenCalledTimes(1);
      usages.dispatchEvent(
        new CustomEvent("actionstate", {
          detail: { kind: "add", canSubmit: true, saving: false }
        })
      );
      await Promise.resolve();
      expect(foot()).toEqual(["Cancel", "Add usage"]);
      el.shadowRoot.querySelector(".foot .btn.sec").click();
      expect(usages.cancel).toHaveBeenCalledTimes(1);
      usages.dispatchEvent(
        new CustomEvent("actionstate", {
          detail: { kind: "", canSubmit: false, saving: false }
        })
      );
      await Promise.resolve();
      expect(foot()).toEqual([]);
    });

    it("slides the usages panel in and out, and keeps the header and bottom bar", async () => {
      jest.useFakeTimers();
      const el = await mount();
      expect(el.shadowRoot.querySelector(".layer")).toBeNull();
      button(el, "Surgeon Usages").click();
      await Promise.resolve();
      // on the page first, not yet slid in
      expect(el.shadowRoot.querySelector(".layer")).not.toBeNull();
      expect(el.shadowRoot.querySelector(".layer.on")).toBeNull();
      jest.advanceTimersByTime(40);
      await Promise.resolve();
      expect(el.shadowRoot.querySelector(".layer.on")).not.toBeNull();
      expect(el.shadowRoot.querySelector("c-pipeline-usages")).not.toBeNull();
      expect(el.shadowRoot.querySelector(".shead h2").textContent).toBe(
        "Surgeon usages"
      );
      expect(button(el, "Surgeon Usages").className).toContain("on");
      expect(el.shadowRoot.querySelector(".fhead")).not.toBeNull();
      expect(el.shadowRoot.querySelector(".foot")).not.toBeNull();
      // Open in Salesforce belongs to the deal page, so it is hidden while a panel is open
      expect(el.shadowRoot.querySelector(".fl2 .btn")).toBeNull();
      // the same button again slides it away, then takes it off the page
      button(el, "Surgeon Usages").click();
      await Promise.resolve();
      expect(el.shadowRoot.querySelector(".layer.on")).toBeNull();
      expect(el.shadowRoot.querySelector(".layer")).not.toBeNull();
      jest.advanceTimersByTime(460);
      await Promise.resolve();
      expect(el.shadowRoot.querySelector(".layer")).toBeNull();
      expect(el.shadowRoot.querySelector(".fl2 .btn")).not.toBeNull();
    });

    it("swaps to the other panel, and the dimmed deal behind closes it", async () => {
      jest.useFakeTimers();
      const el = await mount();
      button(el, "Surgeon Usages").click();
      jest.advanceTimersByTime(40);
      await Promise.resolve();
      button(el, "MyCase Bookings").click();
      await Promise.resolve();
      expect(el.shadowRoot.querySelector("c-pipeline-usages")).toBeNull();
      expect(el.shadowRoot.querySelector("c-pipeline-bookings")).not.toBeNull();
      expect(el.shadowRoot.querySelector(".layer.on")).not.toBeNull();
      el.shadowRoot.querySelector(".shade").click();
      await Promise.resolve();
      expect(el.shadowRoot.querySelector(".layer.on")).toBeNull();
      jest.advanceTimersByTime(460);
      await Promise.resolve();
      expect(el.shadowRoot.querySelector(".layer")).toBeNull();
    });

    it("shows the surgery count on the MyCase Bookings button only, and reads it again when usages change", async () => {
      getBadges.mockResolvedValue({
        surgeonId: "001",
        hasUsages: true,
        usagesNewest: new Date(Date.now() - 114 * 86400000).toISOString(),
        booked: 38
      });
      const el = await mount();
      await Promise.resolve();
      await Promise.resolve();
      expect(button(el, "Surgeon Usages").textContent.trim()).toBe(
        "Surgeon Usages"
      );
      expect(button(el, "MyCase Bookings").textContent).toContain("38");
      getBadges.mockResolvedValue({
        surgeonId: "001",
        hasUsages: false,
        booked: 39
      });
      button(el, "Surgeon Usages").click();
      jest.useFakeTimers();
      jest.advanceTimersByTime(40);
      await Promise.resolve();
      el.shadowRoot
        .querySelector("c-pipeline-usages")
        .dispatchEvent(new CustomEvent("usageschanged"));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      expect(getBadges).toHaveBeenCalledTimes(2);
      expect(button(el, "MyCase Bookings").textContent).toContain("39");
    });

    it("opens next time with no panel over the deal", async () => {
      jest.useFakeTimers();
      const el = await mount();
      button(el, "Surgeon Usages").click();
      jest.advanceTimersByTime(40);
      await Promise.resolve();
      el.open = false;
      await Promise.resolve();
      expect(el.shadowRoot.querySelector(".layer")).toBeNull();
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

    it("puts the kind of deal in the subheader, not under the name", async () => {
      const el = await open("opp", "Action", OPP);
      const strip = el.shadowRoot
        .querySelector(".strip")
        .textContent.replace(/\s+/g, " ");
      expect(strip).toContain("Opportunity");
      expect(el.shadowRoot.querySelector(".ttl")).toBeNull();
    });
  });
});
