import { createElement } from "lwc";
import PipelineMobile from "c/pipelineMobile";
import getContext from "@salesforce/apex/PipelineController.getContext";
import getDeals from "@salesforce/apex/PipelineController.getDeals";
import { registerLdsTestWireAdapter } from "@salesforce/sfdx-lwc-jest";
import searchLookup from "@salesforce/apex/PipelineLookupController.search";
import searchNear from "@salesforce/apex/PipelineLookupController.searchNear";
import { getRecord, updateRecord } from "lightning/uiRecordApi";
import {
  getObjectInfo,
  getPicklistValuesByRecordType
} from "lightning/uiObjectInfoApi";
import { FORM_FIELDS } from "c/pipelineMobileModel";

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
  "@salesforce/apex/PipelineLookupController.searchNear",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/PipelineLookupController.search",
  () => ({ default: jest.fn() }),
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
  deal("Chen", { value: 5000 }),
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

const make = async () => {
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
      expect(root(el).querySelectorAll(".go.soon").length).toBe(3);
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
          "State priority",
          "MyMo"
        ]);
        expect(flags[0].options[1].tone).toBe("warn");
        expect(flags[1].options[1].tone).toBe("good");
        expect(root(el).querySelector(".lk .lv").textContent).toBe("Dr Chen");
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
        await new Promise((r) => setTimeout(r, 500));
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
  });
});
