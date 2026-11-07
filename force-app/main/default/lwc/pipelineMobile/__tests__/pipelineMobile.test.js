import { createElement } from "lwc";
import PipelineMobile from "c/pipelineMobile";
import getContext from "@salesforce/apex/PipelineController.getContext";
import getDeals from "@salesforce/apex/PipelineController.getDeals";
import { registerLdsTestWireAdapter } from "@salesforce/sfdx-lwc-jest";
import { getRecord } from "lightning/uiRecordApi";
import { getPicklistValuesByRecordType } from "lightning/uiObjectInfoApi";

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

const recordAdapter = registerLdsTestWireAdapter(getRecord);
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
    const input = root(el).querySelector("input.search");
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
      expect(root(el).querySelector("input.search")).toBeNull();
      expect(root(el).querySelectorAll(".tile").length).toBe(8);
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
      expect(root(el).querySelector("input.search")).not.toBeNull();
      expect(root(el).querySelector("c-pipeline-segmented.seg").value).toBe(
        "both"
      );
      expect(secs(el)[1].classList.contains("shut")).toBe(false); // Opportunities still open
    });

    it("names the stage on one row and lists the stages, the deal's own marked, read only", async () => {
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
      // the record's own fields come in too
      const labels = [...root(el).querySelectorAll(".frow")].map(
        (r) => r.textContent
      );
      expect(labels.some((t) => t.includes("24"))).toBe(true);
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
    });
  });
});
