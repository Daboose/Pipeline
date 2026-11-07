import { createElement } from "lwc";
import { SAVING_TIMING } from "c/pipelineMobileModel";
import PipelineMobileUsages from "c/pipelineMobileUsages";
import getUsages from "@salesforce/apex/PipelineSurgeonController.getUsages";
import saveUsage from "@salesforce/apex/PipelineUsageController.saveUsage";
import deleteUsage from "@salesforce/apex/PipelineUsageController.deleteUsage";
import addUsage from "@salesforce/apex/PipelineUsageController.addUsage";
import searchLookup from "@salesforce/apex/PipelineLookupController.search";

// the saving screen shows no delay in the tests
SAVING_TIMING.min = 0;
SAVING_TIMING.done = 0;

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
  "@salesforce/apex/PipelineLookupController.search",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
// the company lists are read from Salesforce by their own component; here it is an empty stand-in that the test can send choices from
jest.mock(
  "c/pipelineUsageChoices",
  () => {
    const { LightningElement } = require("lwc");
    return { __esModule: true, default: class extends LightningElement {} };
  },
  { virtual: true }
);

// eslint-disable-next-line @lwc/lwc/no-async-operation
const wait = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const DATA = {
  surgeonId: "001S",
  surgeonName: "Dr Chris Lee",
  newest: new Date(Date.now() - 100 * 86400000).toISOString(),
  ratings: [
    { area: "Hip", rating: "GOLD" },
    { area: "Knee", rating: "PLATINUM" },
    { area: "Shoulder", rating: "SILVER" },
    { area: "CMF", rating: "" }
  ],
  canEdit: true,
  canCreate: true,
  canDelete: true,
  addable: [
    { portfolio: "Hip", recordType: "ANZ HIP", recordTypeId: "rtHip" },
    { portfolio: "Knee", recordType: "ANZ KNEE", recordTypeId: "rtKnee" }
  ],
  lines: [
    {
      usageId: "u1",
      hospital: "Mater Hospital",
      hospitalId: "h1",
      portfolio: "Hip",
      key: "stems",
      label: "Stems",
      company: "ZB",
      cases: 24,
      recordTypeId: "rtHip"
    },
    {
      usageId: "u1",
      hospital: "Mater Hospital",
      hospitalId: "h1",
      portfolio: "Hip",
      key: "cups",
      label: "Cups",
      company: "ZB",
      cases: 18,
      recordTypeId: "rtHip"
    },
    {
      usageId: "u2",
      hospital: "Mater Hospital",
      hospitalId: "h1",
      portfolio: "Knee",
      key: "knee",
      label: "Knee",
      company: "ZB",
      cases: 30,
      recordTypeId: "rtKnee"
    }
  ]
};
const CHOICES = {
  stems: ["ZB", "Stryker"],
  cups: ["ZB", "Stryker"],
  knee: ["ZB", "Other"]
};

const make = async (data = DATA, props = {}) => {
  getUsages.mockResolvedValue(data);
  const heard = [];
  const el = createElement("c-pipeline-mobile-usages", {
    is: PipelineMobileUsages
  });
  el.addEventListener("summary", (e) => heard.push(e.detail));
  Object.assign(el, {
    recordId: "a01X",
    area: "Hip",
    dealLabel: "Dr Chris Lee · Opportunity",
    ...props
  });
  document.body.appendChild(el);
  await wait();
  return { el, heard };
};
const root = (el) => el.shadowRoot;
const sendChoices = (el) =>
  [...root(el).querySelectorAll("c-pipeline-usage-choices")].forEach((c) =>
    c.dispatchEvent(
      new CustomEvent("choices", {
        detail: { recordTypeId: c.recordTypeId, byKey: CHOICES }
      })
    )
  );

describe("c-pipeline-mobile-usages", () => {
  afterEach(() => {
    while (document.body.firstChild)
      document.body.removeChild(document.body.firstChild);
    jest.clearAllMocks();
  });

  it("shows the four rating plates, how fresh the usages are, and a card for each usage under its hospital", async () => {
    const { el, heard } = await make();
    expect(getUsages).toHaveBeenCalledWith({ dealId: "a01X" });
    const plates = [...root(el).querySelectorAll(".plate")];
    expect(plates.map((p) => p.querySelector(".rank").textContent)).toEqual([
      "Gold",
      "Platinum",
      "Silver",
      "No rating"
    ]);
    expect(plates[0].classList.contains("mine")).toBe(true); // the deal's own area
    expect(root(el).querySelector(".fresh").textContent).toContain(
      "Usages updated 3 months ago"
    );
    expect(root(el).querySelector(".hh").textContent).toBe("Mater Hospital");
    const cards = [...root(el).querySelectorAll(".ucard")];
    expect(cards.map((c) => c.querySelector(".utop span").textContent)).toEqual(
      ["Hip", "Knee"]
    );
    expect(cards[0].classList.contains("mine")).toBe(true);
    expect(cards[0].querySelectorAll(".ln").length).toBe(2);
    expect(cards[0].querySelector(".co.zb")).not.toBeNull();
    expect(heard).toEqual([
      { text: "updated 3 months ago", old: false, rating: "Gold" }
    ]);
    // every line starts with the brand, then the product, then the cases a year
    const spans = [...cards[0].querySelector(".ln").children].map(
      (s) => s.textContent
    );
    expect(spans).toEqual(["ZB", "Stems", "24 a year"]);
  });

  it("warns when the usages are old", async () => {
    const { el, heard } = await make({
      ...DATA,
      newest: "2023-01-01T00:00:00Z"
    });
    expect(root(el).querySelector(".fresh").classList.contains("w")).toBe(true);
    expect(root(el).querySelector(".fresh b").textContent).toContain(
      "next time you see this surgeon"
    );
    expect(heard[0].old).toBe(true);
  });

  it("says plainly when there is no Primary HCP, or no usages", async () => {
    let r = await make({ surgeonId: null, lines: [], ratings: [] });
    expect(root(r.el).querySelector(".nomsg").textContent).toContain(
      "no Primary HCP"
    );
    expect(r.heard[0].text).toBe("no Primary HCP");
    document.body.removeChild(r.el);
    r = await make({ ...DATA, lines: [], newest: null });
    expect(root(r.el).querySelector(".nomsg").textContent).toContain(
      "No usages are recorded"
    );
  });

  it("slides in when opened, and the Back bar asks the screen to slide it off", async () => {
    const { el } = await make();
    expect(root(el).querySelector(".usagespage").classList.contains("on")).toBe(
      false
    );
    el.open = true;
    await wait();
    expect(root(el).querySelector(".usagespage").classList.contains("on")).toBe(
      true
    );
    let closed = false;
    el.addEventListener("close", () => (closed = true));
    root(el).querySelector(".usagespage .backbtn").click();
    expect(closed).toBe(true);
  });

  it("opens one usage for editing, saves only the lines that changed, and reads the usages again", async () => {
    saveUsage.mockResolvedValue();
    const { el } = await make();
    root(el).querySelector(".ucard").click();
    await wait();
    sendChoices(el);
    await wait();
    const page = root(el).querySelector(".pg.e");
    expect(page.classList.contains("on")).toBe(true);
    expect(page.querySelector(".psub").textContent).toBe(
      "Mater Hospital · Hip"
    );
    expect(page.querySelector(".row2 .p").disabled).toBe(true); // nothing changed yet
    const stems = page.querySelector('input[data-key="stems"]');
    stems.value = "30";
    stems.dispatchEvent(new CustomEvent("change"));
    await wait();
    expect(page.querySelector(".row2 .p").disabled).toBe(false);
    page.querySelector(".row2 .p").click();
    await wait();
    expect(saveUsage).toHaveBeenCalledWith({
      usageId: "u1",
      linesJson: JSON.stringify([{ key: "stems", company: "ZB", cases: 30 }])
    });
    expect(getUsages.mock.calls.length).toBe(2);
    expect(page.classList.contains("on")).toBe(false);
    expect(root(el).querySelector(".okmsg").textContent).toBe("Saved.");
  });

  it("shows Salesforce's message when a change is refused, and keeps the page and the changes", async () => {
    saveUsage.mockRejectedValue({ body: { message: "Insufficient access" } });
    const { el } = await make();
    root(el).querySelector(".ucard").click();
    await wait();
    const stems = root(el).querySelector('.pg.e input[data-key="stems"]');
    stems.value = "30";
    stems.dispatchEvent(new CustomEvent("change"));
    await wait();
    root(el).querySelector(".pg.e .row2 .p").click();
    await wait();
    expect(root(el).querySelector(".pg.e .errs").textContent).toContain(
      "Insufficient access"
    );
    expect(root(el).querySelector(".pg.e").classList.contains("on")).toBe(true);
  });

  it("asks before deleting a usage, and deletes it on Delete", async () => {
    deleteUsage.mockResolvedValue();
    const { el } = await make();
    root(el).querySelector(".ucard").click();
    await wait();
    root(el).querySelector(".pg.e .del").click();
    await wait();
    const ask = root(el).querySelector(".askwrap");
    expect(ask.classList.contains("on")).toBe(true);
    expect(ask.querySelector("p").textContent).toBe(
      "Delete the Hip usage at Mater Hospital? This cannot be undone."
    );
    ask.querySelector(".stay").click();
    await wait();
    expect(ask.classList.contains("on")).toBe(false);
    expect(deleteUsage).not.toHaveBeenCalled();
    root(el).querySelector(".pg.e .del").click();
    await wait();
    ask.querySelector(".leave").click();
    await wait();
    expect(deleteUsage).toHaveBeenCalledWith({ usageId: "u1" });
    expect(root(el).querySelector(".okmsg").textContent).toBe("Deleted.");
  });

  it("adds a usage: the hospital from a search page, the portfolio, the lines", async () => {
    addUsage.mockResolvedValue({ usageId: "u9", existing: false });
    searchLookup.mockResolvedValue([
      { id: "h9", name: "Wesley Hospital", sub: "Auchenflower" }
    ]);
    const { el } = await make();
    root(el).querySelector(".addbtn").click();
    await wait();
    const add = root(el).querySelector(".pg.a");
    expect(add.classList.contains("on")).toBe(true);
    expect(add.querySelector(".row2 .p").disabled).toBe(true); // no hospital yet
    expect(add.querySelector(".note").textContent).toContain("ANZ HIP");
    add.querySelector(".hosp").click();
    await wait();
    const search = root(el).querySelector(".pg.h");
    expect(search.classList.contains("on")).toBe(true);
    const input = search.querySelector("input.search");
    input.value = "wes";
    input.dispatchEvent(new CustomEvent("input"));
    await wait(400);
    expect(searchLookup).toHaveBeenCalledWith({
      fieldName: "Healthcare_Facility__c",
      term: "wes"
    });
    search.querySelector(".rs").click();
    await wait();
    expect(add.querySelector(".hosp").textContent).toContain("Wesley Hospital");
    expect(add.querySelector(".row2 .p").disabled).toBe(false);
    const cases = add.querySelector('input[data-key="stems"]');
    cases.value = "12";
    cases.dispatchEvent(new CustomEvent("change"));
    await wait();
    add.querySelector(".row2 .p").click();
    await wait();
    expect(addUsage).toHaveBeenCalledWith({
      dealId: "a01X",
      hospitalId: "h9",
      portfolio: "Hip",
      linesJson: JSON.stringify([
        { key: "stems", company: null, cases: 12 },
        { key: "cups", company: null, cases: null }
      ])
    });
    expect(root(el).querySelector(".okmsg").textContent).toBe("Added.");
  });

  it("opens the existing usage for editing when the surgeon already has one at that hospital and portfolio", async () => {
    addUsage.mockResolvedValue({ usageId: "u1", existing: true });
    const { el } = await make();
    root(el).querySelector(".addbtn").click();
    await wait();
    root(el).querySelector(".pg.a .hosp").click();
    root(el).querySelector(".pg.h .rs"); // no hits yet
    // pick the hospital straight through the search page's own handler
    searchLookup.mockResolvedValue([
      { id: "h1", name: "Mater Hospital", sub: "" }
    ]);
    const input = root(el).querySelector(".pg.h input.search");
    input.value = "mat";
    input.dispatchEvent(new CustomEvent("input"));
    await wait(400);
    root(el).querySelector(".pg.h .rs").click();
    await wait();
    root(el).querySelector(".pg.a .row2 .p").click();
    await wait(20);
    expect(root(el).querySelector(".okmsg").textContent).toContain(
      "already has a Hip usage at Mater Hospital"
    );
    expect(root(el).querySelector(".pg.e").classList.contains("on")).toBe(true);
  });

  it("follows what Salesforce lets the person do: no Add, cards that do not open, no Delete", async () => {
    const { el } = await make({
      ...DATA,
      canEdit: false,
      canCreate: false,
      canDelete: false
    });
    expect(root(el).querySelector(".addbtn")).toBeNull();
    const card = root(el).querySelector(".ucard");
    expect(card.classList.contains("fixed")).toBe(true);
    card.click();
    await wait();
    expect(root(el).querySelector(".pg.e").classList.contains("on")).toBe(
      false
    );
  });
});
