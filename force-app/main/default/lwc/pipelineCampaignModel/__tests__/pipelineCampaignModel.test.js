import {
  previewName,
  emptyForm,
  formFromCampaign,
  formProblems,
  toggled,
  memberCounts,
  sortRows,
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
