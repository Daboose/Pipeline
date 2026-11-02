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
      [...el.shadowRoot.querySelectorAll(".foot .btn.nav")].find((b) =>
        b.textContent.trim().startsWith(text)
      );

    afterEach(() => jest.useRealTimers());

    it("has the two buttons in the bottom bar for an opportunity, none for a ROSA deal", async () => {
      const opp = await mount("opp");
      expect(button(opp, "Surgeon Usages")).toBeTruthy();
      expect(button(opp, "My Case Bookings")).toBeTruthy();
      const rosa = await mount("rosa");
      expect(rosa.shadowRoot.querySelectorAll(".foot .btn.nav").length).toBe(0);
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
      button(el, "My Case Bookings").click();
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

    it("shows what the bottom-bar buttons stand for as badges, and reads them again when usages change", async () => {
      getBadges.mockResolvedValue({
        surgeonId: "001",
        hasUsages: true,
        usagesNewest: new Date(Date.now() - 114 * 86400000).toISOString(),
        booked: 38
      });
      const el = await mount();
      await Promise.resolve();
      await Promise.resolve();
      expect(button(el, "Surgeon Usages").textContent).toContain(
        "4 months old"
      );
      expect(button(el, "My Case Bookings").textContent).toContain("38");
      getBadges.mockResolvedValue({
        surgeonId: "001",
        hasUsages: false,
        booked: 38
      });
      button(el, "My Case Bookings").click();
      jest.useFakeTimers();
      jest.advanceTimersByTime(40);
      await Promise.resolve();
      el.shadowRoot
        .querySelector("c-pipeline-bookings")
        .dispatchEvent(new CustomEvent("usageschanged"));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      expect(getBadges).toHaveBeenCalledTimes(2);
      expect(button(el, "Surgeon Usages").textContent).toContain("none");
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
});
