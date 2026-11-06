import {
  previewName,
  emptyForm,
  formFromCampaign,
  formProblems,
  toggled,
  memberCounts,
  sortRows,
  parseLines,
  cleanLine,
  cleaningReport,
  rowDone,
  importCounts,
  NAME_LIMIT
} from "c/pipelineCampaignModel";

const COUNTRIES = ["AU", "NZ", "SG", "MY", "TH"].map((v) => ({
  value: v,
  label: v
}));

describe("previewName", () => {
  it("adds the country codes in the order Salesforce lists them", () => {
    expect(
      previewName("Shoulder Symposium", ["TH", "SG", "MY"], COUNTRIES)
    ).toBe("Shoulder Symposium SG-MY-TH");
  });
  it("shows dots until a name is typed and no codes until a country is picked", () => {
    expect(previewName("", [], COUNTRIES)).toBe("…");
    expect(previewName("  Hip  ", [], COUNTRIES)).toBe("Hip");
  });
  it("puts a country Salesforce does not list last", () => {
    expect(previewName("X", ["ZZ", "AU"], COUNTRIES)).toBe("X AU-ZZ");
  });
});

describe("the form", () => {
  it("starts blank and active", () => {
    const f = emptyForm("005", "Mei");
    expect(f.active).toBe(true);
    expect(f.managerName).toBe("Mei");
    expect(f.countries).toEqual([]);
  });
  it("is filled from a campaign without sharing its lists", () => {
    const c = {
      id: "a",
      friendlyName: "N",
      countries: ["SG"],
      portfolios: ["Hip"],
      active: false,
      managerId: "005"
    };
    const f = formFromCampaign(c);
    f.countries.push("AU");
    expect(c.countries).toEqual(["SG"]);
    expect(f.active).toBe(false);
  });
  it("says what is missing", () => {
    expect(formProblems(emptyForm("", "")).length).toBe(4);
    const ok = {
      ...emptyForm("005", "Mei"),
      friendlyName: "Hip",
      countries: ["AU"],
      portfolios: ["Hip"]
    };
    expect(formProblems(ok)).toEqual([]);
    expect(
      formProblems({ ...ok, friendlyName: "x".repeat(NAME_LIMIT + 1) })
    ).toHaveLength(1);
    expect(
      formProblems({ ...ok, startDate: "2026-12-02", endDate: "2026-12-01" })
    ).toHaveLength(1);
  });
});

describe("helpers", () => {
  it("toggles a value in a list", () => {
    expect(toggled(["a"], "b")).toEqual(["a", "b"]);
    expect(toggled(["a", "b"], "a")).toEqual(["b"]);
  });
  it("counts members with and without a deal", () => {
    expect(
      memberCounts([{ dealCount: 2 }, { dealCount: 0 }, { dealCount: 1 }])
    ).toEqual({ total: 3, withDeal: 2, none: 1 });
  });
});

describe("sortRows", () => {
  const rows = [
    { n: "banana", c: 2 },
    { n: "Apple", c: 10 },
    { n: "", c: 1 },
    { n: "cherry", c: null }
  ];
  it("sorts text without regard to capitals and puts blanks last both ways", () => {
    expect(sortRows(rows, (r) => r.n, 1).map((r) => r.n)).toEqual([
      "Apple",
      "banana",
      "cherry",
      ""
    ]);
    expect(sortRows(rows, (r) => r.n, -1).map((r) => r.n)).toEqual([
      "cherry",
      "banana",
      "Apple",
      ""
    ]);
  });
  it("sorts numbers as numbers", () => {
    expect(sortRows(rows, (r) => r.c, 1).map((r) => r.c)).toEqual([
      1,
      2,
      10,
      null
    ]);
    expect(sortRows(rows, (r) => r.c, -1).map((r) => r.c)).toEqual([
      10,
      2,
      1,
      null
    ]);
  });
  it("leaves the original list alone", () => {
    const copy = [...rows];
    sortRows(rows, (r) => r.n, 1);
    expect(rows).toEqual(copy);
  });
});

describe("the importer", () => {
  it("reads one name per line, skipping blanks, a header row and repeats", () => {
    expect(
      parseLines(
        "Name,Hospital\r\nDr A One, SGH\n\n  Dr B Two  \ndr a one, sgh\n"
      )
    ).toEqual(["Dr A One, SGH", "Dr B Two"]);
    expect(parseLines("")).toEqual([]);
    expect(parseLines("Name Only One")).toEqual(["Name Only One"]);
  });
  it("removes symbols but keeps names in any language, brackets, hyphens, commas, full stops and apostrophes", () => {
    expect(cleanLine("Stephen Andrews (NZ) ★")).toBe("Stephen Andrews (NZ)");
    expect(cleanLine("★ Rishi  Narasimhan ★")).toBe("Rishi Narasimhan");
    expect(cleanLine("Dr. Mary O’Brien-Smith, SGH")).toBe(
      "Dr. Mary O'Brien-Smith, SGH"
    );
    expect(cleanLine("王小明 ✔ 台北")).toBe("王小明 台北");
    expect(cleanLine("김민수 / 서울")).toBe("김민수 서울");
    expect(cleanLine("สมชาย ใจดี")).toBe("สมชาย ใจดี");
    expect(cleanLine("Zoë Müller 😀")).toBe("Zoë Müller");
    expect(cleanLine("Wei Ming Lim\tSGH")).toBe("Wei Ming Lim\tSGH");
    expect(parseLines("Jillian Lee ★\nJillian Lee ★\nJillian Lee")).toEqual([
      "Jillian Lee"
    ]);
  });
  it("reports how many lines held symbols", () => {
    expect(cleaningReport("A One ★\nB Two\nC Three ★ ✔")).toEqual({
      lines: 2,
      symbols: ["★", "✔"]
    });
    expect(cleaningReport("A One, SGH (NZ)\nB-Two")).toEqual({
      lines: 0,
      symbols: []
    });
  });
  it("settles a row when it is deleted, a member already, or confirmed", () => {
    expect(rowDone({ status: "exact", pick: "1", ok: false })).toBe(false);
    expect(rowDone({ status: "exact", pick: "1", ok: true })).toBe(true);
    expect(rowDone({ status: "none", pick: "", ok: true })).toBe(false);
    expect(rowDone({ status: "none", del: true })).toBe(true);
    expect(rowDone({ status: "dup" })).toBe(true);
  });
  it("counts what is left to decide and what will be added", () => {
    const rows = [
      { status: "exact", pick: "1", ok: true },
      { status: "exact", pick: "2", ok: false },
      { status: "many", pick: "", ok: false },
      { status: "none", del: true },
      { status: "dup", pick: "9" }
    ];
    expect(importCounts(rows)).toEqual({
      exact: 2,
      choose: 1,
      none: 0,
      dup: 1,
      need: 2,
      toAdd: 1
    });
  });
});
