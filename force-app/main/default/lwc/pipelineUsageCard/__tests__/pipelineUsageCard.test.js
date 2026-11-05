import { createElement } from "lwc";
import PipelineUsageCard from "c/pipelineUsageCard";
import getCard from "@salesforce/apex/PipelineUsageCardController.getCard";
import deleteLine from "@salesforce/apex/PipelineUsageCardController.deleteLine";
import addUsageFor from "@salesforce/apex/PipelineUsageCardController.addUsageFor";
import saveUsage from "@salesforce/apex/PipelineUsageController.saveUsage";
import searchLookup from "@salesforce/apex/PipelineLookupController.search";

jest.mock(
  "@salesforce/apex/PipelineUsageCardController.getCard",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/PipelineUsageCardController.deleteLine",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/PipelineUsageCardController.addUsageFor",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/PipelineUsageController.saveUsage",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/PipelineLookupController.search",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
// the company choices are read from Salesforce; here a stand-in that the tests drive by an event
jest.mock(
  "c/pipelineUsageChoices",
  () => {
    const { LightningElement } = require("lwc");
    return { __esModule: true, default: class extends LightningElement {} };
  },
  { virtual: true }
);

// eslint-disable-next-line @lwc/lwc/no-async-operation
const flush = () => new Promise((r) => setTimeout(r, 0));

const line = (over) => ({
  usageId: "u1",
  hospital: "North Hospital",
  hospitalId: "h1",
  portfolio: "Hip",
  label: "Stems",
  key: "stems",
  company: "ZB",
  cases: 60,
  recordType: "ANZ HIP",
  recordTypeId: "rt1",
  empty: false,
  ...over
});
const surgeon = (over) => ({
  accountId: "001",
  name: "Dr Test",
  isPerson: true,
  canMyCase: true,
  ratings: [
    { area: "Hip", rating: "GOLD" },
    { area: "Knee", rating: "SILVER" },
    { area: "Shoulder", rating: "BRONZE" },
    { area: "CMF", rating: null }
  ],
  newest: new Date(Date.now() - 20 * 86400000).toISOString(),
  lines: [
    line(),
    line({
      key: "cups",
      label: "Cups",
      company: null,
      cases: null,
      empty: true
    }),
    line({
      usageId: "u2",
      portfolio: "Knee",
      label: "Knee",
      key: "knee",
      company: "Stryker",
      cases: 40,
      recordType: "ANZ KNEE",
      recordTypeId: "rt2"
    })
  ],
  canEdit: true,
  canCreate: true,
  canDelete: true,
  addable: [
    { portfolio: "Hip", recordType: "ANZ HIP", recordTypeId: "rt1" },
    { portfolio: "Knee", recordType: "ANZ KNEE", recordTypeId: "rt2" }
  ],
  bookings: [
    { type: "Hip", primary: 5, revision: 1, latest: "2026-10-29" },
    { type: "Knee", primary: 0, revision: 0 },
    { type: "Shoulder", primary: 0, revision: 0 },
    { type: "CMFT", primary: 0, revision: 0 }
  ],
  surgeons: [],
  ...over
});
const hospital = (over) => ({
  accountId: "001h",
  name: "North Hospital",
  isPerson: false,
  canMyCase: true,
  ratings: [],
  lines: [],
  addable: [],
  bookings: [],
  surgeons: [
    {
      id: "s1",
      name: "Dr One",
      mycase: [10, 2, 0, 0],
      zb: [30, 5, 0, 0],
      other: [0, 8, 0, 0]
    },
    {
      id: "s2",
      name: "Dr Two",
      mycase: [3, 0, 0, 0],
      zb: [0, 0, 0, 0],
      other: [0, 0, 0, 0]
    }
  ],
  ...over
});

async function mount(data) {
  getCard.mockResolvedValue(data);
  const el = createElement("c-pipeline-usage-card", { is: PipelineUsageCard });
  el.recordId = "001";
  document.body.appendChild(el);
  await flush();
  return el;
}
const q = (el, sel) => el.shadowRoot.querySelector(sel);
const qa = (el, sel) => Array.from(el.shadowRoot.querySelectorAll(sel));
const text = (el) => el.shadowRoot.textContent;

afterEach(() => {
  while (document.body.firstChild)
    document.body.removeChild(document.body.firstChild);
  jest.clearAllMocks();
});

describe("pipeline-usage-card, a surgeon", () => {
  it("shows the four ratings as metal plates, the usages and the bookings", async () => {
    const el = await mount(surgeon());
    const plates = qa(el, ".plate");
    expect(plates).toHaveLength(4);
    expect(plates[0].className).toContain("m-GOLD");
    expect(plates[1].className).toContain("m-SILVER");
    expect(plates[2].className).toContain("m-BRONZE");
    expect(plates[3].className).toContain("m-NONE");
    expect(plates[0].querySelector(".rank").textContent).toBe("Gold");
    expect(plates[0].querySelector(".stars").textContent).toBe("★★★");
    expect(plates[3].querySelector(".rank").textContent).toBe("No rating");
    expect(text(el)).toContain("North Hospital");
    expect(text(el)).toContain("Stryker");
    expect(text(el)).toContain("MyCase bookings, last 12 months");
    expect(text(el)).toContain("Latest booking");
    expect(text(el)).not.toContain("Cups"); // an empty line stays hidden until it is opened
  });

  it("warns when the usages have not changed for over a year", async () => {
    const el = await mount(
      surgeon({ newest: new Date(Date.now() - 500 * 86400000).toISOString() })
    );
    expect(q(el, ".note.warn").textContent).toContain("Worth checking");
  });

  it("leaves MyCase out completely for someone who cannot see it", async () => {
    const el = await mount(surgeon({ canMyCase: false, bookings: [] }));
    expect(text(el)).not.toContain("MyCase");
    expect(qa(el, ".plate")).toHaveLength(4);
    expect(text(el)).toContain("Stryker");
  });

  it("hides edit, delete and add from someone who may not change usages", async () => {
    const el = await mount(
      surgeon({
        canEdit: false,
        canDelete: false,
        canCreate: false,
        addable: []
      })
    );
    expect(qa(el, ".iconbtn")).toHaveLength(0);
    expect(qa(el, "button.btn")).toHaveLength(0); // no Add usage, and no add panel at all
    expect(q(el, ".fold")).toBeNull();
  });

  it("edits a line and saves it through the usage controller", async () => {
    saveUsage.mockResolvedValue();
    const el = await mount(surgeon());
    q(el, ".iconbtn").click();
    await flush();
    const input = q(el, "tr.editing input.inp");
    input.value = "75";
    input.dispatchEvent(new CustomEvent("change"));
    await flush();
    q(el, "tr.editing button.btn").click();
    await flush();
    expect(saveUsage).toHaveBeenCalledTimes(1);
    expect(saveUsage.mock.calls[0][0].usageId).toBe("u1");
    expect(JSON.parse(saveUsage.mock.calls[0][0].linesJson)).toEqual([
      { key: "stems", company: "ZB", cases: 75 }
    ]);
    expect(getCard).toHaveBeenCalledTimes(2); // read again after the change
    expect(text(el)).toContain("Usages changed just now");
  });

  it("asks before taking a line off, then calls deleteLine", async () => {
    deleteLine.mockResolvedValue();
    const el = await mount(surgeon());
    q(el, ".iconbtn.del").click();
    await flush();
    expect(q(el, "tr.deleting").textContent).toContain("Take off Stems");
    q(el, "tr.deleting button.sec2").click(); // Keep
    await flush();
    expect(q(el, "tr.deleting")).toBeNull();
    expect(deleteLine).not.toHaveBeenCalled();
    q(el, ".iconbtn.del").click();
    await flush();
    q(el, "tr.deleting button.danger").click();
    await flush();
    expect(deleteLine).toHaveBeenCalledWith({ usageId: "u1", key: "stems" });
  });

  it("folds the add panel open and closed", async () => {
    const el = await mount(surgeon());
    expect(q(el, ".fold").className).not.toContain("open");
    q(el, "h3 button.btn").click();
    await flush();
    expect(q(el, ".fold").className).toContain("open");
    expect(q(el, "h3 button.btn").textContent).toContain("Close");
    q(el, "h3 button.btn").click();
    await flush();
    expect(q(el, ".fold").className).not.toContain("open");
  });

  it("finds a hospital, adds a usage for the surgeon, and says so when one already exists", async () => {
    searchLookup.mockResolvedValue([
      { id: "h9", name: "Harbour Private", sub: "Sydney" }
    ]);
    addUsageFor.mockResolvedValue({ usageId: "u1", existing: true });
    const el = await mount(surgeon());
    q(el, "h3 button.btn").click();
    await Promise.resolve();
    const box = q(el, ".sbox input");
    box.value = "harb";
    box.dispatchEvent(new CustomEvent("input"));
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    await new Promise((r) => setTimeout(r, 320)); // the search waits a moment after typing
    await flush();
    expect(searchLookup).toHaveBeenCalledWith({
      fieldName: "Healthcare_Facility__c",
      term: "harb"
    });
    q(el, ".pick .opt").click();
    await flush();
    expect(q(el, ".chosen").textContent).toContain("Harbour Private");
    const cases = q(el, ".addbox input.inp");
    cases.value = "12";
    cases.dispatchEvent(new CustomEvent("change"));
    q(el, ".addfoot button.btn").click();
    await flush();
    expect(addUsageFor).toHaveBeenCalledTimes(1);
    const call = addUsageFor.mock.calls[0][0];
    expect(call.surgeonId).toBe("001");
    expect(call.hospitalId).toBe("h9");
    expect(call.portfolio).toBe("Hip");
    expect(JSON.parse(call.linesJson)).toEqual([
      { key: "stems", company: null, cases: 12 }
    ]);
    expect(text(el)).toContain("already has a Hip usage");
    expect(text(el)).toContain("Cups"); // the empty line of that usage is opened so it can be filled in
  });

  it("will not add without a hospital or without cases", async () => {
    const el = await mount(surgeon());
    q(el, "h3 button.btn").click();
    await flush();
    q(el, ".addfoot button.btn").click();
    await flush();
    expect(q(el, ".addbox .note.bad").textContent).toContain(
      "Pick a hospital first"
    );
    expect(addUsageFor).not.toHaveBeenCalled();
  });

  it("shows a refused change as a message and keeps the screen", async () => {
    saveUsage.mockRejectedValue({
      body: { message: "No access to that usage." }
    });
    const el = await mount(surgeon());
    q(el, ".iconbtn").click();
    await flush();
    q(el, "tr.editing button.btn").click();
    await flush();
    expect(text(el)).toContain("No access to that usage.");
    expect(q(el, ".wait")).toBeNull();
  });
});

describe("pipeline-usage-card, a hospital", () => {
  it("shows MyCase cases by surgeon first, with a switch to usage records split ZB and other", async () => {
    const el = await mount(hospital());
    expect(qa(el, ".plate")).toHaveLength(0);
    expect(text(el)).toContain("Dr One");
    expect(text(el)).not.toContain("Dr Two".concat(" 0")); // sanity
    const rows = qa(el, "tbody tr");
    expect(rows[0].textContent).toContain("Dr One");
    expect(rows[0].textContent).toContain("12"); // 10 + 2
    expect(rows[1].textContent).toContain("Dr Two");
    expect(text(el)).not.toContain("Other");
    qa(el, ".switch button")[1].click();
    await flush();
    expect(text(el)).toContain("Other");
    expect(qa(el, "tbody tr")).toHaveLength(2); // Dr One and the total: Dr Two has no usage records
    expect(text(el)).not.toContain("Dr Two");
  });

  it("has no MyCase switch and always splits ZB from other for someone who cannot see MyCase", async () => {
    const el = await mount(hospital({ canMyCase: false }));
    expect(q(el, ".switch")).toBeNull();
    expect(text(el)).toContain("Other");
    expect(text(el)).not.toContain("MyCase");
  });

  it("says so when there is nothing to show", async () => {
    const el = await mount(hospital({ surgeons: [] }));
    expect(text(el)).toContain("No surgeons to show");
  });
});
