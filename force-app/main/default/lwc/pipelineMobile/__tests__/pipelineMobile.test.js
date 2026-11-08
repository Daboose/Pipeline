import { createElement } from "lwc";
import PipelineMobile from "c/pipelineMobile";
import getContext from "@salesforce/apex/PipelineController.getContext";
import getDeals from "@salesforce/apex/PipelineController.getDeals";
import { registerLdsTestWireAdapter } from "@salesforce/sfdx-lwc-jest";
import getFeed from "@salesforce/apex/PipelineChatterController.getFeed";
import getUsages from "@salesforce/apex/PipelineSurgeonController.getUsages";
import getBookings from "@salesforce/apex/PipelineBookingsController.getBookings";
import searchLookup from "@salesforce/apex/PipelineLookupController.search";
import searchNear from "@salesforce/apex/PipelineLookupController.searchNear";
import { getRecord, updateRecord } from "lightning/uiRecordApi";
import {
  getObjectInfo,
  getPicklistValuesByRecordType
} from "lightning/uiObjectInfoApi";
import { FORM_FIELDS, SAVING_TIMING } from "c/pipelineMobileModel";

// the saving screen shows no delay in the tests
SAVING_TIMING.min = 0;
SAVING_TIMING.done = 0;

jest.mock(
  "@salesforce/apex/PipelineController.getContext",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/PipelineController.getDeals",
  () => ({ default: jest.fn() }),
  { virtual: true }
);

jest.mock(
  "@salesforce/apex/PipelineChatterController.getFeed",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/PipelineChatterController.post",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/PipelineChatterController.reply",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/PipelineChatterController.searchPeople",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/PipelineBookingsController.getBookings",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/PipelineLookupController.searchNear",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/PipelineLookupController.search",
  () => ({ default: jest.fn() }),
  { virtual: true }
);

// the Campaigns list has its own tests; here it is an empty stand-in
jest.mock(
  "c/pipelineDealCampaigns",
  () => {
    const { LightningElement } = require("lwc");
    return { __esModule: true, default: class extends LightningElement {} };
  },
  { virtual: true }
);

jest.mock(
  "@salesforce/apex/PipelineSurgeonController.getUsages",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/PipelineUsageController.saveUsage",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/PipelineUsageController.deleteUsage",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/PipelineUsageController.addUsage",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "c/pipelineUsageChoices",
  () => {
    const { LightningElement } = require("lwc");
    return { __esModule: true, default: class extends LightningElement {} };
  },
  { virtual: true }
);

const recordAdapter = registerLdsTestWireAdapter(getRecord);
const infoAdapter = registerLdsTestWireAdapter(getObjectInfo);
const picklistAdapter = registerLdsTestWireAdapter(
  getPicklistValuesByRecordType
);

// eslint-disable-next-line @lwc/lwc/no-async-operation
const flush = () => new Promise((r) => setTimeout(r, 0));
const deal = (id, o = {}) => ({
  id,
  kind: "opp",
  hcp: "Dr " + id,
  facility: "Mater Hospital",
  stage: "Plan",
  quarter: "Q1 2027",
  value: 1000,
  currencyCode: "AUD",
  isClosed: false,
  onHold: false,
  campaignCount: 0,
  ...o
});
const DEALS = [
  deal("Chen", { value: 5000, segment: "Hip" }),
  deal("Ward", { onHold: true, value: 3000 }),
  deal("Patel", { isClosed: true, stage: "Conversion", value: 9000 }),
  deal("Torres", { kind: "risk", stage: "Unhappy" }),
  deal("Wesley", {
    kind: "rosa",
    facility: "Wesley Hospital",
    hcp: "",
    rosaDealType: "ROSA sales opportunity"
  })
];

const FEED = [
  {
    id: "0D5A",
    who: "Lewis Dawson",
    posted: new Date(Date.now() - 2 * 86400000).toISOString(),
    text: "Visited Mater.",
    replies: []
  }
];
const make = async () => {
  getFeed.mockResolvedValue(FEED);
  getUsages.mockResolvedValue({
    surgeonId: "001S",
    newest: new Date(Date.now() - 100 * 86400000).toISOString(),
    ratings: [],
    lines: [],
    addable: []
  });
  getBookings.mockResolvedValue({
    surgeonId: "001S",
    windowStart: "2025-11-01",
    today: "2026-11-07",
    types: [
      {
        name: "Hip",
        split: true,
        booked: 5,
        primary: [1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0],
        revision: [],
        partial: [0, 0],
        rows: []
      }
    ]
  });
  getContext.mockResolvedValue({
    stageOrder: ["Plan", "Action", "Conversion"]
  });
  getDeals.mockResolvedValue({ deals: DEALS, truncated: false });
  const el = createElement("c-pipeline-mobile", { is: PipelineMobile });
  document.body.appendChild(el);
  await flush();
  return el;
};
const root = (el) => el.shadowRoot;
const heads = (el) =>
  [...root(el).querySelectorAll(".sechead")].map((h) => {
    const n = h.querySelector(".n");
    return `${h.querySelector("h2").textContent}${n ? " " + n.textContent : ""}`;
  });
const secs = (el) => [...root(el).querySelectorAll("section.sec")];

describe("c-pipeline-mobile", () => {
  afterEach(() => {
    while (document.body.firstChild)
      document.body.removeChild(document.body.firstChild);
    jest.clearAllMocks();
  });

  it("asks only for the person's own deals, and opens with every section folded", async () => {
    const el = await make();
    const sent = JSON.parse(getDeals.mock.calls[0][0].filterJson);
    expect(sent.mineOnly).toBe(true);
    expect(sent.kinds).toEqual(["opp", "risk", "rosa"]);
    expect(secs(el).length).toBe(4); // Charts, Opportunities, Risks, ROSA
    expect(secs(el).every((s) => s.classList.contains("shut"))).toBe(true);
  });

  it("shows the Open deals to start (no closed ones), with counts on the headings", async () => {
    const el = await make();
    const hs = heads(el);
    expect(hs[1]).toBe("Opportunities 2"); // Chen and Ward; Patel is closed
    expect(hs[2]).toBe("Risks 1");
    expect(hs[3]).toBe("ROSA 1");
    // the on-hold deal carries an amber pill; the open ones carry none on an Open list
    const pills = [...root(el).querySelectorAll(".stp")].map(
      (p) => p.textContent
    );
    expect(pills).toEqual(["On Hold"]);
  });

  it("reads the deals again, quietly, when the person comes back to the app, so a deal made elsewhere shows", async () => {
    const el = await make();
    expect(heads(el)[1]).toBe("Opportunities 2");
    const extra = { ...DEALS.find((d) => d.id === "Chen"), id: "NewOne" };
    getDeals.mockResolvedValue({ deals: [...DEALS, extra], truncated: false });
    const before = getDeals.mock.calls.length;
    document.dispatchEvent(new CustomEvent("visibilitychange"));
    await flush();
    expect(getDeals.mock.calls.length).toBe(before + 1);
    expect(heads(el)[1]).toBe("Opportunities 3");
    // the please-wait cover is not used for this
    expect(root(el).querySelector(".loading")).toBeNull();
    // a second signal straight after (focus as well as visibility) does not read again
    window.dispatchEvent(new CustomEvent("focus"));
    await flush();
    expect(getDeals.mock.calls.length).toBe(before + 1);
  });

  it("opens and folds a section with a tap", async () => {
    const el = await make();
    const head = root(el).querySelectorAll(".sechead")[1];
    head.click();
    await flush();
    expect(secs(el)[1].classList.contains("shut")).toBe(false);
    head.click();
    await flush();
    expect(secs(el)[1].classList.contains("shut")).toBe(true);
  });

  it("follows the Status slider and the search", async () => {
    const el = await make();
    const status = root(el).querySelector("c-pipeline-segmented.seg");
    status.dispatchEvent(
      new CustomEvent("change", { detail: { value: "closed" } })
    );
    await flush();
    expect(heads(el)[1]).toBe("Opportunities 1"); // Patel
    status.dispatchEvent(
      new CustomEvent("change", { detail: { value: "both" } })
    );
    await flush();
    const input = root(el).querySelector(".page input.search");
    input.value = "chen";
    input.dispatchEvent(new CustomEvent("input"));
    await flush();
    const h2 = heads(el);
    expect(h2[1]).toBe("Opportunities 1");
    expect(root(el).querySelector(".sclear")).not.toBeNull();
  });

  it("draws a chart block for the kind chosen, one at a time", async () => {
    const el = await make();
    const blocks = () => root(el).querySelectorAll(".block");
    expect(blocks().length).toBe(1); // opportunities, one currency
    expect(root(el).querySelectorAll(".hbar").length).toBe(1); // Plan only (2 open opportunities, both at Plan)
    const type = root(el).querySelector("c-pipeline-segmented.typeseg");
    type.dispatchEvent(
      new CustomEvent("change", { detail: { value: "risk" } })
    );
    await flush();
    expect(root(el).querySelector(".hbar .nm").textContent).toContain(
      "Unhappy"
    );
  });

  it("says plainly when something goes wrong", async () => {
    getContext.mockResolvedValue({});
    getDeals.mockRejectedValue({ body: { message: "No access" } });
    const el = createElement("c-pipeline-mobile", { is: PipelineMobile });
    document.body.appendChild(el);
    await flush();
    expect(root(el).querySelector(".err").textContent).toBe("No access");
  });
  it("keeps the Status slider and the search together in one locked block at the top", async () => {
    const el = await make();
    const ctl = root(el).querySelector(".ctl");
    expect(ctl).not.toBeNull();
    expect(ctl.querySelector("c-pipeline-segmented")).not.toBeNull();
    expect(ctl.querySelector("input.search")).not.toBeNull();
    // the Charts type slider is inside a section, not in the locked block
    expect(ctl.querySelector(".typeseg")).toBeNull();
  });
  describe("the deal screen", () => {
    const open = async (el, id) => {
      root(el).querySelector(`.deal[data-id="${id}"]`).click();
      await flush();
    };
    const sections = (el) => [...root(el).querySelectorAll(".sechead")];

    it("opens a deal on its own screen with a locked back bar instead of the Status slider and the search", async () => {
      const el = await make();
      sections(el)[1].click(); // open Opportunities
      await flush();
      await open(el, "Ward");
      expect(root(el).querySelector(".dname").textContent).toBe("Dr Ward");
      expect(root(el).querySelector(".stp.st-hold")).not.toBeNull(); // Ward is on hold
      expect(root(el).querySelector(".ctl.bar .backbtn")).not.toBeNull();
      expect(root(el).querySelector(".dealpage input.search")).toBeNull();
      expect(root(el).querySelector(".dealpage").classList.contains("on")).toBe(
        true
      ); // the deal has slid in over the list
      expect(root(el).querySelectorAll(".dealpage .tile").length).toBe(8);
    });

    it("goes back to the list exactly as it was left", async () => {
      const el = await make();
      root(el)
        .querySelector("c-pipeline-segmented.seg")
        .dispatchEvent(
          new CustomEvent("change", { detail: { value: "both" } })
        );
      await flush();
      sections(el)[1].click();
      await flush();
      await open(el, "Patel");
      root(el).querySelector(".backbtn").click();
      await flush();
      expect(root(el).querySelector(".page input.search")).not.toBeNull();
      expect(root(el).querySelector("c-pipeline-segmented.seg").value).toBe(
        "both"
      );
      expect(secs(el)[1].classList.contains("shut")).toBe(false); // Opportunities still open
    });

    it("names the stage on one row and lists the stages, the deal's own marked; with no edit access it stays plain text", async () => {
      const el = await make();
      sections(el)[1].click();
      await flush();
      await open(el, "Ward");
      recordAdapter.emit({
        recordTypeId: "012000000000001",
        fields: {
          UnitsCasesPerYear__c: { value: 24 },
          myMo__c: { value: true }
        }
      });
      picklistAdapter.emit({
        picklistFieldValues: {
          Stage__c: {
            values: [
              { value: "Plan" },
              { value: "Conversion" },
              { value: "Unsuccessful Conversion" }
            ]
          }
        }
      });
      await flush();
      expect(root(el).querySelector(".stgC .sv").textContent).toBe("Plan");
      expect(root(el).querySelector(".stsec").classList.contains("shut")).toBe(
        true
      );
      root(el).querySelector(".stgC").click();
      await flush();
      expect(root(el).querySelector(".stsec").classList.contains("shut")).toBe(
        false
      );
      const names = [...root(el).querySelectorAll(".listsheet div")].map(
        (d) => d.querySelector("span").textContent
      );
      expect(names).toEqual(["Plan", "Conversion", "Unsuccessful Conversion"]);
      expect(root(el).querySelector(".listsheet .here").textContent).toContain(
        "Plan"
      );
      // no field access reported: the record's fields are plain text and a tap on a stage changes nothing
      const texts = [...root(el).querySelectorAll(".ro")].map(
        (r) => r.textContent
      );
      expect(texts).toContain("24");
      root(el).querySelector('.listsheet div[data-name="Conversion"]').click();
      await flush();
      expect(root(el).querySelector(".stgC .sv").textContent).toBe("Plan");
      expect(root(el).querySelector(".savewrap").classList.contains("on")).toBe(
        false
      );
    });

    it("colours the stage row green for a won deal", async () => {
      const el = await make();
      root(el)
        .querySelector("c-pipeline-segmented.seg")
        .dispatchEvent(
          new CustomEvent("change", { detail: { value: "closed" } })
        );
      await flush();
      sections(el)[1].click();
      await flush();
      await open(el, "Patel");
      expect(root(el).querySelector(".stgC").classList.contains("good")).toBe(
        true
      );
      // the outline round the row and its list takes the same colour
      expect(root(el).querySelector(".stsec").classList.contains("good")).toBe(
        true
      );
    });

    describe("editing", () => {
      const emitFields = async (el, extra = {}) => {
        const info = {};
        FORM_FIELDS.opp.forEach((f) => {
          info[f[0]] = { updateable: true };
        });
        info.Stage__c = { updateable: true };
        infoAdapter.emit({ fields: info });
        recordAdapter.emit({
          recordTypeId: "012000000000001",
          fields: {
            Stage__c: { value: "Plan" },
            Account__c: { value: "001A" },
            Account__r: { value: { fields: { Name: { value: "Dr Chen" } } } },
            OnHold__c: { value: false },
            Priority__c: { value: true },
            State_Priority__c: { value: false },
            myMo__c: { value: false },
            AmountPerYear__c: { value: 5000 },
            CurrencyIsoCode: { value: "AUD" },
            ...extra
          }
        });
        picklistAdapter.emit({
          picklistFieldValues: {
            Stage__c: {
              values: [
                { value: "Plan" },
                { value: "Conversion" },
                { value: "Unsuccessful Conversion" }
              ]
            },
            CurrencyIsoCode: {
              values: [
                { value: "AUD", label: "AUD" },
                { value: "NZD", label: "NZD" }
              ]
            }
          }
        });
        await flush();
      };
      const openChen = async () => {
        const el = await make();
        sections(el)[1].click();
        await flush();
        await open(el, "Chen");
        await emitFields(el);
        return el;
      };
      const bar = (el) => root(el).querySelector(".savewrap");
      const hold = (el) =>
        root(el).querySelector('c-pipeline-segmented[data-api="OnHold__c"]');

      it("draws the fields as a form, with the four Yes / No sliders coloured as on the desktop", async () => {
        const el = await openChen();
        expect(bar(el).classList.contains("on")).toBe(false);
        const flags = [...root(el).querySelectorAll(".flagseg")];
        expect(flags.map((f) => f.heading)).toEqual([
          "On hold",
          "Rep priority",
          "MyMobility"
        ]);
        expect(flags[0].options[1].tone).toBe("warn");
        expect(flags[1].options[1].tone).toBe("good");
        expect(root(el).querySelector(".lk .lv").textContent).toBe("Dr Chen");
      });

      it("keeps the Brand box out of the sections: one section above it, one below, the box as wide as the Stage", async () => {
        const el = await openChen();
        picklistAdapter.emit({
          picklistFieldValues: {
            Stage__c: { values: [{ value: "Plan" }] },
            Brand__c: {
              values: [
                { value: "Persona", label: "Persona" },
                { value: "Arcos", label: "Arcos" }
              ]
            }
          }
        });
        await flush();
        const cards = [...root(el).querySelectorAll("section.card")];
        expect(cards.length).toBe(2);
        const brand = root(el).querySelector("c-pipeline-mobile-choices");
        expect(brand).not.toBeNull();
        expect(
          root(el).querySelector(".card c-pipeline-mobile-choices")
        ).toBeNull();
        // the order on the screen: section, Brand box, section
        expect(cards[0].nextElementSibling).toBe(brand);
        expect(brand.nextElementSibling).toBe(cards[1]);
        // no section has a heading ("The deal" is gone)
        expect(cards[0].querySelector("h3")).toBeNull();
        expect(cards[1].querySelector("h3")).toBeNull();
        expect(root(el).textContent).not.toContain("The deal");
        // sorted A to Z
        expect(brand.options.map((o) => o.label)).toEqual(["Arcos", "Persona"]);
      });

      it("folds the Save bar up on the first change, and Cancel puts everything back", async () => {
        const el = await openChen();
        hold(el).dispatchEvent(
          new CustomEvent("change", { detail: { value: "yes" } })
        );
        await flush();
        expect(bar(el).classList.contains("on")).toBe(true);
        expect(root(el).querySelector(".stp.st-hold")).not.toBeNull(); // the On Hold pill follows at once
        root(el).querySelector(".cancel").click();
        await flush();
        expect(bar(el).classList.contains("on")).toBe(false);
        expect(hold(el).value).toBe("no");
      });

      it("makes a tap on a stage a draft: the row takes its colour and the list folds shut", async () => {
        const el = await openChen();
        root(el).querySelector(".stgC").click();
        await flush();
        root(el)
          .querySelector('.listsheet div[data-name="Conversion"]')
          .click();
        await flush();
        expect(root(el).querySelector(".stgC .sv").textContent).toBe(
          "Conversion"
        );
        expect(
          root(el).querySelector(".stsec").classList.contains("good")
        ).toBe(true);
        expect(
          root(el).querySelector(".stsec").classList.contains("shut")
        ).toBe(true);
        expect(bar(el).classList.contains("on")).toBe(true);
      });

      it("gives the units a number box (the number keyboard) but sends the text Salesforce holds, not a number", async () => {
        updateRecord.mockResolvedValue({});
        const el = await make();
        sections(el)[1].click();
        await flush();
        await open(el, "Chen");
        await emitFields(el, { UnitsCasesPerYear__c: { value: "24" } });
        const info = {};
        FORM_FIELDS.opp.forEach((f) => {
          info[f[0]] = { updateable: true };
        });
        info.UnitsCasesPerYear__c = { updateable: true, dataType: "String" };
        infoAdapter.emit({ fields: info });
        await flush();
        const box = root(el).querySelector(
          'input.in[data-api="UnitsCasesPerYear__c"]'
        );
        expect(box.type).toBe("number");
        box.value = "30";
        box.dispatchEvent(new CustomEvent("change"));
        await flush();
        root(el).querySelector(".save").click();
        await flush();
        expect(updateRecord).toHaveBeenCalledWith({
          fields: { Id: "Chen", UnitsCasesPerYear__c: "30" }
        });
      });

      it("saves only what changed, then reads the deals again", async () => {
        updateRecord.mockResolvedValue({});
        const el = await openChen();
        hold(el).dispatchEvent(
          new CustomEvent("change", { detail: { value: "yes" } })
        );
        await flush();
        const before = getDeals.mock.calls.length;
        root(el).querySelector(".save").click();
        await flush();
        expect(updateRecord).toHaveBeenCalledWith({
          fields: { Id: "Chen", OnHold__c: true }
        });
        expect(getDeals.mock.calls.length).toBe(before + 1);
        expect(bar(el).classList.contains("on")).toBe(false);
        expect(root(el).querySelector(".okmsg").classList.contains("on")).toBe(
          true
        );
      });

      it("shows what Salesforce says when a save is refused, and keeps the changes", async () => {
        updateRecord.mockRejectedValue({
          body: {
            output: { errors: [{ message: "Close quarter is in the past" }] }
          }
        });
        const el = await openChen();
        hold(el).dispatchEvent(
          new CustomEvent("change", { detail: { value: "yes" } })
        );
        await flush();
        root(el).querySelector(".save").click();
        await flush();
        expect(root(el).querySelector(".errs").textContent).toContain(
          "Close quarter is in the past"
        );
        expect(bar(el).classList.contains("on")).toBe(true);
      });

      it("asks before leaving with unsaved changes: Stay keeps them, Leave drops them", async () => {
        const el = await openChen();
        hold(el).dispatchEvent(
          new CustomEvent("change", { detail: { value: "yes" } })
        );
        await flush();
        root(el).querySelector(".backbtn").click();
        await flush();
        expect(
          root(el).querySelector(".askwrap").classList.contains("on")
        ).toBe(true);
        root(el).querySelector(".stay").click();
        await flush();
        expect(
          root(el).querySelector(".askwrap").classList.contains("on")
        ).toBe(false);
        expect(root(el).querySelector(".dname")).not.toBeNull();
        root(el).querySelector(".backbtn").click();
        await flush();
        root(el).querySelector(".leave").click();
        await flush();
        expect(
          root(el).querySelector(".dealpage").classList.contains("on")
        ).toBe(false); // it slides off
        expect(root(el).querySelector(".page input.search")).not.toBeNull();
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        await new Promise((r) => setTimeout(r, 600));
        expect(root(el).querySelector(".dname")).toBeNull(); // and is taken off the page once it has gone
      });

      it("goes straight back when nothing has changed", async () => {
        const el = await openChen();
        root(el).querySelector(".backbtn").click();
        await flush();
        expect(
          root(el).querySelector(".dealpage").classList.contains("on")
        ).toBe(false);
      });

      it("opens a search page for a lookup, finds names after two letters, and drafts the pick", async () => {
        searchLookup.mockResolvedValue([
          { id: "001Z", name: "Dr Mei Tan", sub: "Epworth Richmond" }
        ]);
        const el = await openChen();
        root(el).querySelector('.lk[data-api="Account__c"]').click();
        await flush();
        const sheet = root(el).querySelector(".sheet");
        expect(sheet.classList.contains("on")).toBe(true);
        expect(root(el).querySelector(".sht").textContent).toBe("Primary HCP");
        const input = sheet.querySelector("input.search");
        input.value = "me";
        input.dispatchEvent(new CustomEvent("input"));
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        await new Promise((r) => setTimeout(r, 400));
        expect(searchLookup).toHaveBeenCalledWith({
          fieldName: "Account__c",
          term: "me"
        });
        sheet.querySelector(".rs").click();
        await flush();
        expect(sheet.classList.contains("on")).toBe(false);
        expect(root(el).querySelector(".lk .lv").textContent).toBe(
          "Dr Mei Tan"
        );
        expect(bar(el).classList.contains("on")).toBe(true);
      });

      it("searches the hospitals with the chosen surgeon, and says when the list is full", async () => {
        searchNear.mockResolvedValue(
          Array.from({ length: 8 }, (_, i) => ({
            id: "0010" + i,
            name: "Hospital " + i,
            sub: ""
          }))
        );
        const el = await openChen();
        root(el)
          .querySelector('.lk[data-api="Healthcare_Facility__c"]')
          .click();
        await flush();
        const sheet = root(el).querySelector(".sheet");
        expect(sheet.textContent).toContain("Type part of the name");
        const input = sheet.querySelector("input.search");
        input.value = "hosp";
        input.dispatchEvent(new CustomEvent("input"));
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        await new Promise((r) => setTimeout(r, 400));
        expect(searchNear).toHaveBeenCalledWith({
          fieldName: "Healthcare_Facility__c",
          term: "hosp",
          surgeonId: "001A"
        });
        expect(sheet.textContent).toContain(
          "Showing the first 8. Type more of the name to narrow it down."
        );
      });

      it("clears an optional lookup with the cross (saved as empty), and gives a required one no cross", async () => {
        updateRecord.mockResolvedValue({});
        const el = await make();
        sections(el)[1].click();
        await flush();
        await open(el, "Chen");
        await emitFields(el, {
          Link_To_ROSA_Deal__c: { value: "a01X" },
          Link_To_ROSA_Deal__r: {
            value: { fields: { Name: { value: "ROSA Mater" } } }
          }
        });
        expect(
          root(el).querySelector('.lkclear[data-api="Account__c"]')
        ).toBeNull(); // Primary HCP is required
        const cross = root(el).querySelector(
          '.lkclear[data-api="Link_To_ROSA_Deal__c"]'
        );
        expect(cross).not.toBeNull();
        cross.click();
        await flush();
        expect(
          root(el).querySelector('.lk[data-api="Link_To_ROSA_Deal__c"] .lv')
            .textContent
        ).toBe("Search by name…");
        expect(
          root(el).querySelector(".savewrap").classList.contains("on")
        ).toBe(true);
        root(el).querySelector(".save").click();
        await flush();
        expect(updateRecord).toHaveBeenCalledWith({
          fields: { Id: "Chen", Link_To_ROSA_Deal__c: null }
        });
      });
    });

    describe("Chatter", () => {
      it("shows how many posts on the deal screen's Chatter row, and slides the Chatter screen in when it is tapped", async () => {
        const el = await make();
        sections(el)[1].click();
        await flush();
        await open(el, "Chen");
        await flush();
        expect(getFeed).toHaveBeenCalledWith({ dealId: "Chen" });
        const row = root(el).querySelector(".go.live");
        expect(row.textContent).toContain("Chatter");
        expect(row.textContent).toContain("1 post · last 2 d ago");
        const chat = root(el).querySelector("c-pipeline-mobile-chatter");
        expect(chat.open).toBe(false);
        row.click();
        await flush();
        expect(chat.open).toBe(true);
        chat.dispatchEvent(new CustomEvent("close"));
        await flush();
        expect(chat.open).toBe(false);
      });
    });

    describe("Campaigns", () => {
      it("shows how many campaigns the deal is in on its row, slides the Campaigns screen in, and follows a change made there", async () => {
        const el = await make();
        sections(el)[1].click();
        await flush();
        await open(el, "Chen");
        await flush();
        const row = [...root(el).querySelectorAll(".go.live")].find((r) =>
          r.textContent.includes("Campaigns")
        );
        expect(row.textContent).toContain("In no campaign");
        // the Campaigns sliders take the same label width as the form's Yes / No sliders (set from the measured labels)
        expect(
          root(el)
            .querySelector("c-pipeline-mobile-campaigns")
            .style.getPropertyValue("--seg-label-width")
        ).toMatch(/^\d+px$/);
        const screen = root(el).querySelector("c-pipeline-mobile-campaigns");
        expect(screen.open).toBe(false);
        row.click();
        await flush();
        expect(screen.open).toBe(true);
        screen.dispatchEvent(new CustomEvent("changed", { detail: 2 }));
        await flush();
        expect(row.textContent).toContain("In 2 campaigns");
        const before = getDeals.mock.calls.length;
        screen.dispatchEvent(new CustomEvent("close"));
        await flush();
        expect(screen.open).toBe(false);
        expect(getDeals.mock.calls.length).toBe(before + 1); // read again so the card's star follows
      });
    });

    describe("MyCase Bookings", () => {
      it("shows the cases in 12 months on the deal screen's row, and slides the Bookings screen in when it is tapped", async () => {
        const el = await make();
        sections(el)[1].click();
        await flush();
        await open(el, "Chen");
        await flush();
        expect(getBookings).toHaveBeenCalledWith({ dealId: "Chen" });
        const row = [...root(el).querySelectorAll(".go.live")].find((r) =>
          r.textContent.includes("MyCase Bookings")
        );
        expect(row.textContent).toContain("5 cases in 12 months");
        const screen = root(el).querySelector("c-pipeline-mobile-bookings");
        expect(screen.open).toBe(false);
        row.click();
        await flush();
        expect(screen.open).toBe(true);
        screen.dispatchEvent(new CustomEvent("close"));
        await flush();
        expect(screen.open).toBe(false);
      });
    });

    describe("Surgeon Usages", () => {
      it("shows how fresh the usages are on the deal screen's row, and slides the Usages screen in when it is tapped", async () => {
        const el = await make();
        sections(el)[1].click();
        await flush();
        await open(el, "Chen");
        await flush();
        expect(getUsages).toHaveBeenCalledWith({ dealId: "Chen" });
        const row = [...root(el).querySelectorAll(".go.live")].find((r) =>
          r.textContent.includes("Surgeon Usages")
        );
        expect(row.textContent).toContain("updated 3 months ago");
        const screen = root(el).querySelector("c-pipeline-mobile-usages");
        expect(screen.open).toBe(false);
        row.click();
        await flush();
        expect(screen.open).toBe(true);
        screen.dispatchEvent(new CustomEvent("close"));
        await flush();
        expect(screen.open).toBe(false);
      });

      it("shows the surgeon's usage rating for the deal's own area in the Portfolio tile's place, in the plate's metal", async () => {
        const el = await make();
        getUsages.mockResolvedValue({
          surgeonId: "001S",
          newest: new Date(Date.now() - 100 * 86400000).toISOString(),
          ratings: [
            { area: "Hip", rating: "GOLD" },
            { area: "Knee", rating: "PLATINUM" }
          ],
          lines: [],
          addable: []
        });
        sections(el)[1].click();
        await flush();
        await open(el, "Chen"); // an opportunity at Hip
        await flush();
        const tiles = () => [
          ...root(el).querySelectorAll(".dealpage .tile, .dealpage .plate")
        ];
        expect(tiles().length).toBe(8);
        const rating = root(el).querySelector(".dealpage .plate");
        expect(rating.querySelector(".area").textContent).toBe("Usage rating");
        expect(rating.querySelector(".rank").textContent.trim()).toBe("Gold"); // the Hip rating, not the Knee one
        expect(rating.querySelector(".stars").textContent).toBe(
          "\u2605\u2605\u2605"
        );
        expect(rating.querySelector(".coin svg")).not.toBeNull();
        expect(rating.classList.contains("m-GOLD")).toBe(true);
        expect(
          tiles().some(
            (n) =>
              n.querySelector(".tl") &&
              n.querySelector(".tl").textContent === "Portfolio"
          )
        ).toBe(false);
      });

      it("has no Surgeon Usages or MyCase Bookings row on a ROSA deal (as on the desktop)", async () => {
        const el = await make();
        sections(el)[3].click(); // ROSA
        await flush();
        await open(el, "Wesley");
        await flush();
        const rows = [...root(el).querySelectorAll(".go.live")].map(
          (r) => r.textContent
        );
        expect(rows.some((t) => t.includes("Chatter"))).toBe(true);
        expect(rows.some((t) => t.includes("Surgeon Usages"))).toBe(false);
        expect(rows.some((t) => t.includes("MyCase Bookings"))).toBe(false);
        expect(root(el).querySelector("c-pipeline-mobile-usages")).toBeNull();
        const labels = [
          ...root(el).querySelectorAll(".dealpage .tile .tl")
        ].map((n) => n.textContent);
        expect(labels).toContain("Portfolio"); // no surgeon, so no rating tile
        expect(labels).not.toContain("Usage rating");
      });
    });

    describe("a new deal", () => {
      it("has a Create New bar at the bottom of the list that slides the New deal page in", async () => {
        const el = await make();
        const bar = root(el).querySelector(".newbar .newbtn");
        expect(bar.textContent).toContain("Create New");
        const page = root(el).querySelector("c-pipeline-mobile-new");
        expect(page.open).toBe(false);
        bar.click();
        await flush();
        expect(page.open).toBe(true);
        page.dispatchEvent(new CustomEvent("close"));
        await flush();
        expect(page.open).toBe(false);
      });

      it("opens a deal just created on its own screen with Created. at the top, after reading the deals again", async () => {
        const el = await make();
        const page = root(el).querySelector("c-pipeline-mobile-new");
        getDeals.mockResolvedValue({
          deals: [...DEALS, deal("Newly", { stage: "Plan" })],
          truncated: false
        });
        const before = getDeals.mock.calls.length;
        page.dispatchEvent(new CustomEvent("created", { detail: "Newly" }));
        await flush();
        await flush();
        expect(getDeals.mock.calls.length).toBe(before + 1);
        expect(
          root(el).querySelector(".dealpage").classList.contains("on")
        ).toBe(true);
        expect(root(el).querySelector(".dname").textContent).toBe("Dr Newly");
        expect(root(el).querySelector(".createdmsg").textContent).toBe(
          "Created."
        );
        expect(page.open).toBe(false);
      });

      it("has no Create bar while a deal is open (it is on the list only)", async () => {
        const el = await make();
        sections(el)[1].click();
        await flush();
        await open(el, "Chen");
        expect(root(el).querySelectorAll(".newbar").length).toBe(1); // the list's own bar, under the deal screen
        expect(root(el).querySelector(".dealpage .newbar")).toBeNull();
      });
    });
  });
});
