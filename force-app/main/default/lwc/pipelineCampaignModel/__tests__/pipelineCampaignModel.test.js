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
  ratingRank,
  memberTiles,
  valueByRating,
  rosaValue,
  toUsd,
  usdAmount,
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
  it("ranks the ratings Platinum first and leaves unrated last", () => {
    expect(ratingRank("Platinum")).toBe(0);
    expect(ratingRank("BRONZE")).toBe(3);
    expect(ratingRank(null)).toBeNull();
  });
  it("counts the tiles above the members list, with the value per currency", () => {
    const t = memberTiles([
      {
        deals: [
          { value: 100, currencyCode: "SGD" },
          { value: 50, currencyCode: "SGD" }
        ]
      },
      { deals: [{ value: 70, currencyCode: "MYR" }] },
      { deals: [] }
    ]);
    expect(t.surgeons).toBe(3);
    expect(t.withDeal).toBe(2);
    expect(t.noDeal).toBe(1);
    expect(t.deals).toBe(3);
    expect(t.value).toEqual([
      { currencyCode: "MYR", total: 70 },
      { currencyCode: "SGD", total: 150 }
    ]);
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

describe("valueByRating and toUsd", () => {
  const members = [
    {
      ratings: [
        { portfolio: "Knee", rating: "GOLD" },
        { portfolio: "Hip", rating: "PLATINUM" }
      ],
      deals: [
        { portfolio: "Knee", value: 100000, currencyCode: "AUD" },
        { portfolio: "Hip", value: 50000, currencyCode: "AUD" }
      ]
    },
    {
      ratings: [{ portfolio: "Knee", rating: null }],
      deals: [
        { portfolio: "Knee", value: 30000, currencyCode: "NZD" },
        { portfolio: "Hip", value: 20000, currencyCode: "NZD" }
      ]
    },
    { ratings: [], deals: [] }
  ];

  it("counts each deal under the surgeon's rating for the deal's own portfolio, and the rest under none", () => {
    const v = valueByRating(members);
    expect(v.GOLD).toEqual({ AUD: 100000 });
    expect(v.PLATINUM).toEqual({ AUD: 50000 });
    expect(v.NONE).toEqual({ NZD: 50000 }); // no rating for Knee, and no Hip rating at all
    expect(v.SILVER).toEqual({});
    expect(v.BRONZE).toEqual({});
  });

  it("keeps every currency apart, and the five rating groups add up to the total", () => {
    const v = valueByRating(members);
    expect(v.total).toEqual({ AUD: 150000, NZD: 50000 });
    ["AUD", "NZD"].forEach((c) => {
      const parts = ["PLATINUM", "GOLD", "SILVER", "BRONZE", "NONE"].reduce(
        (a, k) => a + (v[k][c] || 0),
        0
      );
      expect(parts).toBe(v.total[c]);
    });
    expect(valueByRating(null).total).toEqual({});
  });

  it("converts to US dollars by dividing by the currency's rate, and names a currency with no rate", () => {
    const rates = { rates: { USD: 1, AUD: 1.5, NZD: 2 } };
    expect(toUsd({ AUD: 150000, NZD: 50000 }, rates)).toEqual({
      usd: 125000,
      missing: []
    });
    expect(toUsd({ AUD: 150000, JPY: 1000 }, rates)).toEqual({
      usd: 100000,
      missing: ["JPY"]
    });
    expect(toUsd({}, rates).usd).toBe(0);
    expect(toUsd({ AUD: 10 }, null).missing).toEqual(["AUD"]);
  });

  it("converts one amount to US dollars, or says there is no rate", () => {
    const rates = { rates: { USD: 1, AUD: 1.5 } };
    expect(usdAmount(150000, "AUD", rates)).toBe(100000);
    expect(usdAmount(100, "USD", rates)).toBe(100);
    expect(usdAmount(100, "JPY", rates)).toBeNull();
    expect(usdAmount(100, "AUD", null)).toBeNull();
  });

  it("leaves healthcare facilities and ROSA deals out of the tiles and the value by rating (their own value box comes later)", () => {
    const mixed = [
      {
        accountId: "a1",
        ratings: [{ portfolio: "Knee", rating: "GOLD" }],
        deals: [
          { kind: "opp", portfolio: "Knee", value: 1000, currencyCode: "AUD" },
          // a ROSA deal can never sit under a surgeon, but if one did it is still not counted
          { kind: "rosa", portfolio: "Knee", value: 9000, currencyCode: "AUD" }
        ]
      },
      {
        accountId: "f1",
        isFacility: true,
        ratings: [],
        deals: [
          { kind: "rosa", portfolio: "Knee", value: 5000, currencyCode: "AUD" }
        ]
      }
    ];
    const t = memberTiles(mixed);
    expect(t.surgeons).toBe(1);
    expect(t.withDeal).toBe(1);
    expect(t.noDeal).toBe(0);
    expect(t.deals).toBe(1);
    expect(t.value).toEqual([{ currencyCode: "AUD", total: 1000 }]);
    const v = valueByRating(mixed);
    expect(v.total).toEqual({ AUD: 1000 });
    expect(v.GOLD).toEqual({ AUD: 1000 });
    expect(v.NONE).toEqual({});
  });

  it("adds up the ROSA deals of a campaign per currency, and says whether there are any", () => {
    expect(rosaValue(null)).toEqual({ hasRosa: false, total: {} });
    expect(
      rosaValue([{ deals: [{ kind: "opp", value: 5, currencyCode: "AUD" }] }])
        .hasRosa
    ).toBe(false);
    const r = rosaValue([
      {
        isFacility: true,
        deals: [
          { kind: "rosa", value: 690000, currencyCode: "AUD" },
          { kind: "rosa", value: 10000, currencyCode: "AUD" },
          { kind: "rosa", value: 500, currencyCode: "NZD" },
          { kind: "rosa", value: null, currencyCode: "AUD" }
        ]
      }
    ]);
    expect(r.hasRosa).toBe(true);
    expect(r.total).toEqual({ AUD: 700000, NZD: 500 });
  });
});
