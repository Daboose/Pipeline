import {
  choicesFor,
  draftOf,
  fieldsOf,
  isComplete,
  payloadOf,
  rowOff,
  setField,
  toggleChip,
  GRID,
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

  it("builds one set of headings with the bearing under the Company column and hides empty rows when viewing", () => {
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
    expect(view.heads.map((h) => h.text)).toEqual([
      "Company",
      "Product",
      "Stem type",
      "Cases per year"
    ]);
    expect(view.rows).toHaveLength(1); // no cup, no bearing: nothing to show
    expect(view.hasChips).toBe(false);
    const edit = buildTile("Hip", draftOf("Hip", {}), true, {}, "t");
    expect(edit.rows).toHaveLength(4); // stem, cup, bearing heading, bearing choice
    const shoulders = buildTile(
      "Shoulder",
      draftOf("Shoulder", {}),
      true,
      {},
      "t"
    );
    expect(shoulders.heads).toHaveLength(3);
    expect(shoulders.rows.map((r) => r.label)).toEqual([
      "Anatomical",
      "Reverse"
    ]);
  });
});
