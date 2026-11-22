import {
  isOverAYear,
  shortDate,
  choicesFor,
  draftOf,
  fieldsOf,
  isComplete,
  payloadOf,
  rowOff,
  setField,
  toggleChip,
  GRID,
  COLUMNS,
  buildTile
} from "c/pipelineUsageModel";

const picks = {
  Company_CMFT__c: {
    values: [{ value: "ZB" }, { value: "Other" }, { value: "Stryker" }],
    controllerValues: {}
  },
  Product_CMFT__c: {
    values: [
      { value: "RibLoc", validFor: [0] },
      { value: "TMJ", validFor: [1] }
    ],
    controllerValues: { ZB: 0, Stryker: 1 }
  }
};

describe("pipelineUsageModel", () => {
  it("lists the fields of each portfolio, chips only where the layout has them", () => {
    expect(fieldsOf("Hip")).toContain("HipBearingType__c");
    expect(fieldsOf("Hip")).toContain("Procedure_Types__c");
    expect(fieldsOf("CMF")).not.toContain("Procedure_Types__c");
    expect(fieldsOf("Hip")).not.toContain("CasesPAHipCup__c"); // the stems drive the cases
  });

  it("offers only the products of the chosen company, and never 'Other' as a CMFT company", () => {
    expect(
      choicesFor("Company_CMFT__c", picks, {}).map((c) => c.value)
    ).toEqual(["ZB", "Stryker"]);
    expect(
      choicesFor("Product_CMFT__c", picks, { Company_CMFT__c: "ZB" }).map(
        (c) => c.value
      )
    ).toEqual(["RibLoc"]);
    expect(choicesFor("Product_CMFT__c", picks, {})).toEqual([]);
  });

  it("never offers 'Other' as a hip stem or cup company, but an old usage that has it still shows it", () => {
    const hip = {
      CompanyHipStems__c: {
        values: [{ value: "ZB" }, { value: "Other" }, { value: "Stryker" }],
        controllerValues: {}
      },
      CompanyHipCups__c: {
        values: [{ value: "Other" }, { value: "Medacta" }],
        controllerValues: {}
      }
    };
    expect(
      choicesFor("CompanyHipStems__c", hip, {}).map((c) => c.value)
    ).toEqual(["ZB", "Stryker"]);
    expect(
      choicesFor("CompanyHipCups__c", hip, {}).map((c) => c.value)
    ).toEqual(["Medacta"]);
    expect(
      choicesFor("CompanyHipStems__c", hip, {
        CompanyHipStems__c: "Other"
      })[0].value
    ).toBe("Other");
  });

  it("keeps a current value that is no longer offered, so an old usage still shows", () => {
    expect(
      choicesFor("Product_CMFT__c", picks, {
        Company_CMFT__c: "ZB",
        Product_CMFT__c: "Old"
      })[0].value
    ).toBe("Old");
  });

  it("clears the product when the company changes", () => {
    const next = setField(
      "CMF",
      { Company_CMFT__c: "ZB", Product_CMFT__c: "RibLoc" },
      "Company_CMFT__c",
      "Stryker"
    );
    expect(next.Product_CMFT__c).toBe("");
  });

  it("needs the stem of a hip, never a cup alone, and nothing for shoulders", () => {
    expect(isComplete("Hip", draftOf("Hip", { CompanyHipCups__c: "ZB" }))).toBe(
      false
    );
    const hip = draftOf("Hip", {
      CompanyHipStems__c: "ZB",
      ProductHipStems__c: "Taperloc",
      Hip_Stem_Type__c: "Cementless",
      CasesPAHipStem__c: "60"
    });
    expect(isComplete("Hip", hip)).toBe(true);
    expect(isComplete("Shoulder", draftOf("Shoulder", {}))).toBe(true);
    expect(isComplete("CMF", draftOf("CMF", { Company_CMFT__c: "ZB" }))).toBe(
      false
    );
    expect(rowOff(GRID.Hip.rows[1], draftOf("Hip", {}))).toBe(true);
    expect(rowOff(GRID.Hip.rows[1], hip)).toBe(false);
  });

  it("sends every field of the layout, empty ones as null and chips as lists", () => {
    const d = toggleChip(
      draftOf("Knee", {
        CompanyTotalKnee__c: "Depuy",
        CasesPATotalKnee__c: "40",
        Procedure_Types__c: "Total"
      }),
      "Procedure_Types__c",
      "Partial"
    );
    const p = payloadOf("Knee", d);
    expect(p.CompanyTotalKnee__c).toBe("Depuy");
    expect(p.ProductTotalKnee__c).toBeNull();
    expect(p.CasesPATotalKnee__c).toBe(40);
    expect(p.Procedure_Types__c).toEqual(["Total", "Partial"]);
    expect(p.Supporting_Technologies__c).toEqual([]);
  });

  it("uses the same four columns for every portfolio, and the bearing type is in the Type column of the cup line", () => {
    expect(COLUMNS).toEqual(["Company", "Product", "Type", "Cases / year"]);
    Object.keys(GRID).forEach((k) => {
      GRID[k].rows.forEach((r) => expect(r.cells).toHaveLength(4));
    });
    expect(GRID.Hip.rows[0].cells[2]).toBe("Hip_Stem_Type__c");
    expect(GRID.Hip.rows[1].cells).toEqual([
      "CompanyHipCups__c",
      "ProductHipCups__c",
      "HipBearingType__c",
      null
    ]);
    expect(GRID.CMF.rows[0].cells[2]).toBe("SegmentCMFT__c");
    expect(GRID.Knee.rows[0].cells[2]).toBeNull();
  });

  it("builds a flat list of cells, a line per product line, and hides empty lines when viewing", () => {
    const view = buildTile(
      "Hip",
      draftOf("Hip", {
        CompanyHipStems__c: "ZB",
        ProductHipStems__c: "Taperloc",
        Hip_Stem_Type__c: "Cemented",
        CasesPAHipStem__c: "20"
      }),
      false,
      {},
      "t"
    );
    // portfolio, line, then company, product, type, cases: six cells, one line, no cup to show
    expect(view.lines).toBe(1);
    expect(view.cells.map((c) => c.text)).toEqual([
      "Hip",
      "Stem",
      "ZB",
      "Taperloc",
      "Cemented",
      "20"
    ]);
    expect(view.cells.some((c) => c.star)).toBe(false); // viewing a usage shows no mandatory stars
    expect(view.showSide).toBe(true);
    expect(view.sideStyle).toBe("grid-row: 1 / span 1");
    expect(view.hasChips).toBe(false);
    expect(view.showEditChips).toBe(false);
    const keys = view.cells.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("puts the bearing type on the cup line, greys the cup until the stem is filled, and spans the chips over the lines", () => {
    const cup = buildTile(
      "Hip",
      draftOf("Hip", {
        CompanyHipStems__c: "ZB",
        ProductHipStems__c: "Taperloc",
        CompanyHipCups__c: "ZB",
        ProductHipCups__c: "G7",
        HipBearingType__c: "Ceramic on Poly",
        Procedure_Types__c: "Total"
      }),
      false,
      {},
      "t"
    );
    expect(cup.lines).toBe(2);
    // the second line: no portfolio name, "Cup", company, product, bearing type, nothing for cases
    expect(cup.cells.slice(6).map((c) => c.text)).toEqual([
      "",
      "Cup",
      "ZB",
      "G7",
      "Ceramic on Poly",
      ""
    ]);
    expect(cup.sideStyle).toBe("grid-row: 1 / span 2");
    expect(cup.hasChips).toBe(true);
    const edit = buildTile("Hip", draftOf("Hip", {}), true, {}, "t");
    expect(edit.lines).toBe(2);
    expect(edit.showSide).toBe(false);
    expect(edit.showEditChips).toBe(false); // no chip choices from Salesforce here
    const cupLine = edit.cells.slice(6);
    expect(cupLine.map((c) => c.cls)).toContain("lc off");
    const hint = cupLine.find((c) => c.cls === "hn");
    expect(hint.text).toBe("Fill the stem company and product first.");
    const bearing = cupLine.find((c) => c.field === "HipBearingType__c");
    expect(bearing.options[0].label).toBe("Bearing type…");
    expect(bearing.disabled).toBe(true);
    const product = edit.cells.find((c) => c.field === "ProductHipStems__c");
    expect(product.options[0].label).toBe("Product (company first)");
    const cases = edit.cells.find((c) => c.field === "CasesPAHipStem__c");
    expect(cases.placeholder).toBe("Cases per year");
  });

  it("shows no mandatory star on any portfolio while viewing, and the stars while editing or adding", () => {
    const values = {
      CompanyTotalKnee__c: "ZB",
      ProductTotalKnee__c: "Persona",
      CasesPATotalKnee__c: "40"
    };
    const viewing = buildTile("Knee", draftOf("Knee", values), false, {}, "t");
    expect(viewing.cells.some((c) => c.star)).toBe(false);
    const editing = buildTile("Knee", draftOf("Knee", values), true, {}, "t");
    expect(editing.cells.some((c) => c.star)).toBe(true);
    const hipValues = {
      CompanyHipStems__c: "ZB",
      ProductHipStems__c: "Taperloc",
      Hip_Stem_Type__c: "Cemented",
      CasesPAHipStem__c: "20"
    };
    expect(
      buildTile("Hip", draftOf("Hip", hipValues), false, {}, "t").cells.some(
        (c) => c.star
      )
    ).toBe(false);
    expect(
      buildTile(
        "CMF",
        draftOf("CMF", { SegmentCMFT__c: "Thoracic" }),
        false,
        {},
        "t"
      ).cells.some((c) => c.star)
    ).toBe(false);
  });

  it("marks a single-line portfolio's mandatory fields on the portfolio name, and shoulders have no star", () => {
    const knee = buildTile("Knee", draftOf("Knee", {}), true, {}, "t");
    expect(knee.cells[0]).toMatchObject({ text: "Knee", star: true });
    expect(knee.cells[1]).toMatchObject({ text: "", star: false });
    const cmft = buildTile("CMF", draftOf("CMF", {}), true, {}, "t");
    expect(cmft.cells[0]).toMatchObject({ text: "CMFT", star: true });
    const shoulders = buildTile(
      "Shoulder",
      draftOf("Shoulder", {}),
      true,
      {},
      "t"
    );
    expect(
      shoulders.cells.filter((c) => c.cls.startsWith("lc")).map((c) => c.text)
    ).toEqual(["Anatomical", "Reverse"]);
    expect(shoulders.cells.some((c) => c.star)).toBe(false);
    expect(shoulders.cells[0].text).toBe("Shoulders");
  });

  it("offers the chips as their own line while editing, with every choice Salesforce gives", () => {
    const picks2 = {
      Procedure_Types__c: {
        values: [{ value: "Total" }, { value: "Revision" }]
      },
      Supporting_Technologies__c: { values: [{ value: "ROSA" }] }
    };
    const edit = buildTile(
      "Knee",
      draftOf("Knee", { Procedure_Types__c: "Total" }),
      true,
      picks2,
      "t"
    );
    expect(edit.showEditChips).toBe(true);
    expect(edit.proc.map((c) => [c.label, c.on])).toEqual([
      ["Total", true],
      ["Revision", false]
    ]);
    expect(edit.chipGap).toBe(true);
    expect(edit.showSide).toBe(false);
  });
});

describe("the Last updated date", () => {
  it("is DD/MM/YY with two digits each, and empty when there is none", () => {
    expect(shortDate(new Date(2026, 10, 5, 12).toISOString())).toBe("05/11/26");
    expect(shortDate(new Date(2024, 11, 31, 12).toISOString())).toBe(
      "31/12/24"
    );
    expect(shortDate("")).toBe("");
    expect(shortDate(null)).toBe("");
    expect(shortDate("not a date")).toBe("");
  });
  it("is old only when more than a year before today (never old with no date)", () => {
    const now = new Date(2026, 10, 20, 12);
    expect(isOverAYear(new Date(2025, 10, 21, 12).toISOString(), now)).toBe(
      false
    );
    expect(isOverAYear(new Date(2025, 10, 19, 12).toISOString(), now)).toBe(
      true
    );
    expect(isOverAYear(new Date(2024, 11, 31, 12).toISOString(), now)).toBe(
      true
    );
    expect(isOverAYear("", now)).toBe(false);
    expect(isOverAYear(null, now)).toBe(false);
  });
});
