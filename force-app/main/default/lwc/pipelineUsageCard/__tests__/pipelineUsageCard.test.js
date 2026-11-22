import { createElement } from "lwc";
import PipelineUsageCard from "c/pipelineUsageCard";
import getCard from "@salesforce/apex/PipelineUsageCardController.getCard";
import deleteUsage from "@salesforce/apex/PipelineUsageController.deleteUsage";
import saveWhole from "@salesforce/apex/PipelineUsageEditController.save";
import addWhole from "@salesforce/apex/PipelineUsageEditController.add";
import searchLookup from "@salesforce/apex/PipelineLookupController.search";

jest.mock(
  "@salesforce/apex/PipelineUsageCardController.getCard",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/PipelineUsageController.deleteUsage",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/PipelineUsageEditController.save",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/PipelineUsageEditController.add",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/PipelineLookupController.search",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
// the lists are read from Salesforce; here a stand-in that shows nothing
jest.mock(
  "c/pipelineUsageFieldChoices",
  () => {
    const { LightningElement } = require("lwc");
    return { __esModule: true, default: class extends LightningElement {} };
  },
  { virtual: true }
);

// eslint-disable-next-line @lwc/lwc/no-async-operation
const flush = () => new Promise((r) => setTimeout(r, 0));

const hipUsage = (over) => ({
  usageId: "u1",
  hospital: "North Hospital",
  hospitalId: "h1",
  portfolio: "Hip",
  recordType: "ANZ HIP",
  recordTypeId: "rt1",
  values: {
    CompanyHipStems__c: "ZB",
    ProductHipStems__c: "Taperloc",
    Hip_Stem_Type__c: "Cementless",
    CasesPAHipStem__c: "60",
    CompanyHipCups__c: "Lima",
    ProductHipCups__c: "Trinity",
    HipBearingType__c: "Ceramic on Poly",
    Procedure_Types__c: "Total;Revision",
    Supporting_Technologies__c: "ROSA"
  },
  ...over
});
const kneeUsage = () => ({
  usageId: "u2",
  hospital: "Harbour Private",
  hospitalId: "h2",
  portfolio: "Knee",
  recordType: "ANZ KNEE",
  recordTypeId: "rt2",
  values: {
    CompanyTotalKnee__c: "Stryker",
    ProductTotalKnee__c: "Triathlon",
    CasesPATotalKnee__c: "40"
  }
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
  lines: [],
  usages: [hipUsage(), kneeUsage()],
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
/** The tile components of the card; their own content is in their shadow. */
const tiles = (el) => qa(el, "c-pipeline-usage-tile");
const tq = (tile, sel) => tile.shadowRoot.querySelector(sel);
const tqa = (tile, sel) => Array.from(tile.shadowRoot.querySelectorAll(sel));
const ttext = (tile) => tile.shadowRoot.textContent;
/** Tells the card what a tile reported, the way the tile does. */
const report = (tile, name, detail) =>
  tile.dispatchEvent(new CustomEvent(name, { detail }));

afterEach(() => {
  while (document.body.firstChild)
    document.body.removeChild(document.body.firstChild);
  jest.clearAllMocks();
});

// Jest cannot see a style sheet being wrong, and a rewrite of the plate styles once deleted the category's and the coin's rules without any test
// noticing (the plates went to UAT with no coin and the words run together). This reads the style sheet and checks each part of a plate still has its rule.
describe("pipeline-usage-card, the plate style sheet", () => {
  const css = require("fs").readFileSync(
    require("path").resolve(__dirname, "../pipelineUsageCard.css"),
    "utf8"
  );
  it("draws no rivets on a plate", () => {
    const html = require("fs").readFileSync(
      require("path").resolve(__dirname, "../pipelineUsageCard.html"),
      "utf8"
    );
    expect(html).not.toContain("screw");
  });

  it("keeps a rule for every part of a plate: the text block, the category, the rating word, the stars and the coin", () => {
    [
      ".plate .txt {",
      ".plate .area {",
      ".plate .rank {",
      ".plate .stars {",
      ".plate .stars svg {",
      ".plate .coin {",
      ".plate .coin svg {",
      ".plate .coin svg path {"
    ].forEach((selector) => {
      expect(css).toContain(selector);
    });
    // the category is the first row, the rating word the second and the stars the third, so they stack instead of sharing a line
    expect(css).toMatch(/\.plate \.area \{[^}]*grid-row: 1;/);
    expect(css).toMatch(/\.plate \.rank \{[^}]*grid-row: 2;/);
    expect(css).toMatch(/\.plate \.stars \{[^}]*grid-row: 3;/);
    expect(css).toMatch(/\.plate \.area \{[^}]*#14100a/);
    // 120 px tall, and no rivets in the corners (Robert, 2026-11-20)
    expect(css).toMatch(/\.plate \{[^}]*height: 120px;/);
    expect(css).not.toContain("screw");
  });
});

describe("pipeline-usage-card, a surgeon", () => {
  it("draws a star for each step of the rating: Platinum four, Gold three, Silver two, Bronze one, and none without a rating; the category reads first, then the rating, then the stars", async () => {
    const el = await mount(
      surgeon({
        ratings: [
          { area: "Hip", rating: "PLATINUM" },
          { area: "Knee", rating: "GOLD" },
          { area: "Shoulder", rating: "SILVER" },
          { area: "CMF", rating: "BRONZE" }
        ]
      })
    );
    const counts = qa(el, ".plate").map(
      (p) => p.querySelectorAll(".stars svg").length
    );
    expect(counts).toEqual([4, 3, 2, 1]);
    const first = qa(el, ".plate")[0];
    expect(
      [...first.querySelector(".txt").children].map((c) => c.className)
    ).toEqual(["area", "rank", "stars"]);
    expect(first.querySelector(".coin")).not.toBeNull();
    expect(qa(el, ".plate")[3].querySelector(".area").textContent).toBe("CMFT");
  });

  it("shows the four ratings as metal plates, each usage as a tile under its hospital, and the bookings", async () => {
    const el = await mount(surgeon());
    const plates = qa(el, ".plate");
    expect(plates).toHaveLength(4);
    expect(plates[0].className).toContain("m-GOLD");
    expect(plates[1].className).toContain("m-SILVER");
    expect(plates[2].className).toContain("m-BRONZE");
    expect(plates[3].className).toContain("m-NONE");
    expect(plates[0].querySelector(".rank").textContent).toBe("Gold");
    expect(plates[0].querySelectorAll(".stars svg")).toHaveLength(3); // Gold: three drawn stars
    expect(plates[3].querySelectorAll(".stars svg")).toHaveLength(0); // no rating: none
    expect(plates[0].querySelector(".txt .area").textContent).toBe("Hip");
    expect(plates[3].querySelector(".rank").textContent).toBe("No rating");
    expect(qa(el, ".uhosp").map((h) => h.textContent)).toEqual([
      "North Hospital",
      "Harbour Private"
    ]);
    expect(tiles(el)).toHaveLength(2);
    expect(text(el)).toContain("MyCase bookings, last 12 months");
    expect(text(el)).toContain("Latest booking");
  });

  it("draws the column headings once, and a hip as a stem line then a cup line with the bearing on the cup, and the chips", async () => {
    const el = await mount(surgeon());
    expect(
      Array.from(q(el, ".cgh").children).map((c) => c.textContent.trim())
    ).toEqual([
      "",
      "",
      "Company",
      "Product",
      "Type",
      "Cases / year",
      "Procedures and technologies",
      "Last updated",
      ""
    ]);
    expect(qa(el, ".cgh")).toHaveLength(1);
    const hip = tiles(el)[0];
    const t = ttext(hip);
    expect(tq(hip, ".pc").textContent).toContain("Hip");
    expect(tqa(hip, ".gh")).toHaveLength(0);
    expect(
      tqa(hip, ".lc").map((h) => h.textContent.trim().replace("*", ""))
    ).toEqual(["Stem", "Cup"]);
    expect(t).toContain("Taperloc");
    expect(t).toContain("Trinity");
    expect(t).toContain("Ceramic on Poly");
    expect(tqa(hip, ".xc .chip.p").map((c) => c.textContent.trim())).toEqual([
      "Total",
      "Revision"
    ]);
    expect(tqa(hip, ".xc .chip.t").map((c) => c.textContent.trim())).toEqual([
      "ROSA"
    ]);
    expect(tq(hip, ".xc .gap")).not.toBeNull();
    expect(ttext(tiles(el)[1])).toContain("Triathlon");
  });

  it("when embedded in the deal leaves out the Usages heading row and the MyCase bookings, and keeps the rest", async () => {
    getCard.mockResolvedValue(surgeon());
    const el = createElement("c-pipeline-usage-card", {
      is: PipelineUsageCard
    });
    el.recordId = "001";
    el.embedded = true;
    document.body.appendChild(el);
    await flush();
    expect(q(el, ".head")).toBeNull();
    expect(text(el)).not.toContain("MyCase");
    expect(qa(el, ".plate")).toHaveLength(4);
    expect(tiles(el)).toHaveLength(2);
    expect(q(el, "h3 button.btn").textContent).toContain("Add usage");
  });

  it("keeps the heading row and the MyCase bookings on an Account page", async () => {
    const el = await mount(surgeon());
    expect(q(el, ".head h2").textContent).toBe("Usages");
    expect(text(el)).toContain("MyCase bookings, last 12 months");
  });

  it("keeps a hospital's heading and switch even when embedded", async () => {
    getCard.mockResolvedValue(hospital());
    const el = createElement("c-pipeline-usage-card", {
      is: PipelineUsageCard
    });
    el.recordId = "001h";
    el.embedded = true;
    document.body.appendChild(el);
    await flush();
    expect(q(el, ".head h2").textContent).toContain("North Hospital");
  });

  it("says nothing under the plates about when the usages were last changed, even for old usages", async () => {
    const el = await mount(
      surgeon({ newest: new Date(Date.now() - 500 * 86400000).toISOString() })
    );
    expect(text(el)).not.toContain("Usages last changed");
    expect(text(el)).not.toContain("Worth checking");
    expect(q(el, ".note.warn")).toBeNull();
    expect(q(el, ".note.ok")).toBeNull();
  });

  it("shows each usage's own Last updated date as DD/MM/YY, in amber when it is more than a year old", async () => {
    const recent = new Date(Date.now() - 30 * 86400000);
    const old = new Date(Date.now() - 500 * 86400000);
    const two = (n) => String(n).padStart(2, "0");
    const dmy = (d) =>
      `${two(d.getDate())}/${two(d.getMonth() + 1)}/${two(d.getFullYear() % 100)}`;
    const el = await mount(
      surgeon({
        usages: [
          hipUsage({ lastModified: recent.toISOString() }),
          { ...kneeUsage(), lastModified: old.toISOString() }
        ]
      })
    );
    const cells = tiles(el).map((tile) => tq(tile, ".lu"));
    expect(cells.map((c) => c.textContent.trim())).toEqual([
      dmy(recent),
      dmy(old)
    ]);
    expect(cells[0].classList.contains("old")).toBe(false);
    expect(cells[1].classList.contains("old")).toBe(true);
    // a hip's stem and cup are one usage: one date, not two
    expect(tqa(tiles(el)[0], ".lu")).toHaveLength(1);
  });

  it("draws no date cell while a usage is being edited", async () => {
    saveWhole.mockResolvedValue();
    const el = await mount(
      surgeon({
        usages: [hipUsage({ lastModified: new Date().toISOString() })]
      })
    );
    tq(tiles(el)[0], ".ib").click();
    await flush();
    expect(tqa(tiles(el)[0], ".lu")).toHaveLength(0);
  });

  it("says there were 0 MyCase bookings in one line, with no table, when there are none", async () => {
    const el = await mount(surgeon({ canMyCase: true, bookings: [] }));
    expect(text(el)).toContain(
      "MyCase: there were 0 MyCase bookings in the last 12 months"
    );
    expect(text(el)).toContain("for information only");
    expect(text(el)).not.toContain("Latest booking");
    expect(text(el)).not.toContain("MyCase bookings, last 12 months");
  });

  it("leaves MyCase out completely for someone who cannot see it", async () => {
    const el = await mount(surgeon({ canMyCase: false, bookings: [] }));
    expect(text(el)).not.toContain("MyCase");
    expect(qa(el, ".plate")).toHaveLength(4);
    expect(ttext(tiles(el)[1])).toContain("Stryker");
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
    tiles(el).forEach((t) => {
      expect(tqa(t, ".ib")).toHaveLength(0);
      expect(tqa(t, ".iconbtn")).toHaveLength(0);
    });
    expect(qa(el, "button.btn")).toHaveLength(0); // no Add usage, and no add panel at all
    expect(q(el, ".fold")).toBeNull();
  });

  it("edits a usage in place and saves every field of its layout", async () => {
    saveWhole.mockResolvedValue();
    const el = await mount(surgeon());
    const changed = jest.fn();
    el.addEventListener("usageschanged", changed);
    tq(tiles(el)[0], ".ib").click();
    await flush();
    const hip = tiles(el)[0];
    expect(tqa(hip, "select")).toHaveLength(6); // stem co, product, type, cup co, product, bearing
    const cases = tq(hip, "input.inp");
    cases.value = "75";
    cases.dispatchEvent(new CustomEvent("input"));
    await flush();
    // a chip is switched off
    tqa(tiles(el)[0], "button.chip.p")
      .find((c) => c.textContent.trim() === "Revision")
      .click();
    await flush();
    tq(tiles(el)[0], ".tfoot .btn:not(.sec2)").click();
    await flush();
    expect(saveWhole).toHaveBeenCalledTimes(1);
    expect(saveWhole.mock.calls[0][0].usageId).toBe("u1");
    const sent = JSON.parse(saveWhole.mock.calls[0][0].fieldsJson);
    expect(sent.CasesPAHipStem__c).toBe(75);
    expect(sent.CompanyHipStems__c).toBe("ZB");
    expect(sent.Procedure_Types__c).toEqual(["Total"]);
    expect(sent.Supporting_Technologies__c).toEqual(["ROSA"]);
    expect(getCard).toHaveBeenCalledTimes(2); // read again after the change
    expect(text(el)).toContain("Usages changed just now");
    expect(changed).toHaveBeenCalledTimes(1); // so the host can read the lists' ratings again
  });

  it("will not save while a mandatory field is empty, and clearing a company clears its product", async () => {
    const el = await mount(surgeon());
    tq(tiles(el)[0], ".ib").click();
    await flush();
    const save = () => tq(tiles(el)[0], ".tfoot .btn:not(.sec2)");
    expect(save().disabled).toBe(false);
    report(tiles(el)[0], "fieldchange", {
      id: "u1",
      field: "CompanyHipStems__c",
      value: ""
    });
    await flush();
    expect(save().disabled).toBe(true);
    expect(tqa(tiles(el)[0], ".sel.bad").length).toBeGreaterThan(0);
    const product = tqa(tiles(el)[0], "select")[1];
    expect(product.value).toBe("");
    expect(product.disabled).toBe(true);
  });

  it("greys the cup until the stem company and product are filled", async () => {
    const el = await mount(
      surgeon({
        usages: [
          hipUsage({ values: { Hip_Stem_Type__c: "Cemented" } }),
          kneeUsage()
        ]
      })
    );
    tq(tiles(el)[0], ".ib").click();
    await flush();
    expect(tqa(tiles(el)[0], ".cc.off").length).toBeGreaterThan(0);
    expect(tqa(tiles(el)[0], ".lc.off")).toHaveLength(1);
    expect(ttext(tiles(el)[0])).toContain(
      "Fill the stem company and product first."
    );
  });

  it("asks before deleting a usage, then calls deleteUsage", async () => {
    deleteUsage.mockResolvedValue();
    const el = await mount(surgeon());
    tq(tiles(el)[0], ".iconbtn.del").click();
    await flush();
    expect(tq(tiles(el)[0], ".confirm").textContent).toContain(
      "Delete this Hip usage at North Hospital?"
    );
    tq(tiles(el)[0], ".confirm .sec2").click(); // Keep
    await flush();
    expect(tq(tiles(el)[0], ".confirm")).toBeNull();
    expect(deleteUsage).not.toHaveBeenCalled();
    tq(tiles(el)[0], ".iconbtn.del").click();
    await flush();
    tq(tiles(el)[0], ".confirm .danger").click();
    await flush();
    expect(deleteUsage).toHaveBeenCalledWith({ usageId: "u1" });
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

  it("finds a hospital, adds a whole usage, and says so when one already exists", async () => {
    searchLookup.mockResolvedValue([
      { id: "h9", name: "Harbour Private", sub: "Sydney" }
    ]);
    addWhole.mockResolvedValue({ usageId: "u1", existing: true });
    const el = await mount(surgeon());
    q(el, "h3 button.btn").click();
    await flush();
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
    const add = () => q(el, ".addfoot button.btn");
    expect(add().disabled).toBe(true); // the mandatory fields are empty
    const addTile = () => q(el, ".addbox c-pipeline-usage-tile");
    [
      ["CompanyHipStems__c", "ZB"],
      ["ProductHipStems__c", "Taperloc"],
      ["Hip_Stem_Type__c", "Cementless"],
      ["CasesPAHipStem__c", "12"]
    ].forEach(([field, value]) =>
      report(addTile(), "fieldchange", { id: "add", field, value })
    );
    report(addTile(), "chip", {
      id: "add",
      field: "Procedure_Types__c",
      value: "Total"
    });
    await flush();
    expect(add().disabled).toBe(false);
    add().click();
    await flush();
    expect(addWhole).toHaveBeenCalledTimes(1);
    const call = addWhole.mock.calls[0][0];
    expect(call.surgeonId).toBe("001");
    expect(call.hospitalId).toBe("h9");
    expect(call.portfolio).toBe("Hip");
    const sent = JSON.parse(call.fieldsJson);
    expect(sent.CompanyHipStems__c).toBe("ZB");
    expect(sent.CasesPAHipStem__c).toBe(12);
    expect(sent.Procedure_Types__c).toEqual(["Total"]);
    expect(sent.CompanyHipCups__c).toBeNull();
    expect(text(el)).toContain("already has a Hip usage");
  });

  it("changes the fields of the add panel when another portfolio is chosen", async () => {
    const el = await mount(surgeon());
    q(el, "h3 button.btn").click();
    await flush();
    const addTile = () => q(el, ".addbox c-pipeline-usage-tile");
    // a hip: a stem line and a cup line, the bearing type on the cup line
    expect(
      tqa(addTile(), ".lc").map((l) => l.textContent.trim().replace("*", ""))
    ).toEqual(["Stem", "Cup"]);
    expect(
      tqa(addTile(), "select").map((x) => x.getAttribute("aria-label"))
    ).toContain("Bearing type");
    q(el, ".addbox c-pipeline-segmented").dispatchEvent(
      new CustomEvent("change", { detail: { value: "Knee" } })
    );
    await flush();
    expect(
      tqa(addTile(), "select").map((x) => x.getAttribute("aria-label"))
    ).toEqual(["Company", "Product"]);
    expect(tqa(addTile(), "input")).toHaveLength(1);
  });

  it("will not add without a hospital", async () => {
    const el = await mount(surgeon());
    q(el, "h3 button.btn").click();
    await flush();
    expect(q(el, ".addfoot button.btn").disabled).toBe(true);
    expect(addWhole).not.toHaveBeenCalled();
  });

  it("shows a refused change as a message and keeps the screen", async () => {
    saveWhole.mockRejectedValue({
      body: { message: "No access to that usage." }
    });
    const el = await mount(surgeon());
    tq(tiles(el)[0], ".ib").click();
    await flush();
    tq(tiles(el)[0], ".tfoot .btn:not(.sec2)").click();
    await flush();
    expect(text(el)).toContain("No access to that usage.");
    expect(q(el, ".wait")).toBeNull();
  });
});

describe("pipeline-usage-card, a hospital", () => {
  it("shows MyCase cases by surgeon first, with a switch to usage records split ZB and other", async () => {
    const el = await mount(hospital());
    expect(qa(el, ".plate")).toHaveLength(0);
    expect(q(el, "h2").textContent).toBe("Cases by Surgeon at North Hospital");
    expect(text(el)).toContain("Dr One");
    expect(text(el)).not.toContain("Dr Two".concat(" 0")); // sanity
    const rows = qa(el, "tbody tr");
    expect(rows[0].textContent).toContain("Dr One");
    expect(rows[0].textContent).toContain("12"); // 10 + 2
    expect(rows[1].textContent).toContain("Dr Two");
    expect(text(el)).not.toContain("Other");
    q(el, "c-pipeline-segmented").dispatchEvent(
      new CustomEvent("change", { detail: { value: "us" } })
    );
    await flush();
    expect(text(el)).toContain("Other");
    expect(text(el)).toContain("A hip counts its stems only");
    expect(qa(el, "tbody tr")).toHaveLength(2); // Dr One and the total: Dr Two has no usage records
    expect(text(el)).not.toContain("Dr Two");
  });

  it("has no MyCase switch and always splits ZB from other for someone who cannot see MyCase", async () => {
    const el = await mount(hospital({ canMyCase: false }));
    expect(q(el, "c-pipeline-segmented")).toBeNull();
    expect(text(el)).toContain("Other");
    expect(text(el)).not.toContain("MyCase");
  });

  it("says so when there is nothing to show", async () => {
    const el = await mount(hospital({ surgeons: [] }));
    expect(text(el)).toContain("No surgeons to show");
  });
});
