import { createElement } from "lwc";
import PipelineUsageTile from "c/pipelineUsageTile";
import { buildTile, draftOf } from "c/pipelineUsageModel";

function mount(tile) {
  const el = createElement("c-pipeline-usage-tile", { is: PipelineUsageTile });
  el.tile = tile;
  document.body.appendChild(el);
  return el;
}
const q = (el, sel) => el.shadowRoot.querySelector(sel);

afterEach(() => {
  while (document.body.firstChild)
    document.body.removeChild(document.body.firstChild);
});

const base = (edit) => ({
  ...buildTile(
    "Knee",
    draftOf("Knee", {
      CompanyTotalKnee__c: "Depuy",
      ProductTotalKnee__c: "Attune",
      CasesPATotalKnee__c: "40"
    }),
    edit,
    {},
    "u1"
  ),
  id: "u1",
  title: "Knee",
  cls: "us",
  showHead: true,
  showActions: !edit,
  canEdit: true,
  canDelete: true,
  editable: edit,
  showFoot: edit,
  saveDisabled: false
});

describe("c-pipeline-usage-tile", () => {
  it("tells the card which tile was edited or deleted", () => {
    const el = mount(base(false));
    const edit = jest.fn();
    const del = jest.fn();
    el.addEventListener("edit", edit);
    el.addEventListener("delete", del);
    q(el, ".ib").click();
    q(el, ".iconbtn.del").click();
    expect(edit.mock.calls[0][0].detail.id).toBe("u1");
    expect(del.mock.calls[0][0].detail.id).toBe("u1");
  });

  it("reports a changed field, keeping only digits in a number, and a chip", () => {
    const el = mount(base(true));
    const field = jest.fn();
    el.addEventListener("fieldchange", field);
    const cases = q(el, "input.inp");
    cases.value = "4x5";
    cases.dispatchEvent(new CustomEvent("input"));
    expect(cases.value).toBe("45");
    expect(field.mock.calls[0][0].detail).toEqual({
      id: "u1",
      field: "CasesPATotalKnee__c",
      value: "45"
    });
  });

  it("shows the chosen values in a row of cells, the pencil beside them, and no boxes when not editing", () => {
    const el = mount(base(false));
    expect(el.shadowRoot.textContent).toContain("Attune");
    expect(el.shadowRoot.querySelectorAll(".cg .cc")).toHaveLength(4);
    expect(el.shadowRoot.querySelectorAll(".gh")).toHaveLength(0); // the card draws the headings once
    expect(q(el, ".pe .ib")).not.toBeNull();
    expect(q(el, "select")).toBeNull();
  });

  it("draws a hip as two lines with the chips and the pencil spanning both, and the bearing on the cup line", () => {
    const tile = {
      ...buildTile(
        "Hip",
        draftOf("Hip", {
          CompanyHipStems__c: "ZB",
          ProductHipStems__c: "Taperloc",
          Hip_Stem_Type__c: "Cementless",
          CasesPAHipStem__c: "60",
          CompanyHipCups__c: "ZB",
          ProductHipCups__c: "G7",
          HipBearingType__c: "Ceramic on Poly",
          Procedure_Types__c: "Total;Revision",
          Supporting_Technologies__c: "ROSA"
        }),
        false,
        {},
        "h"
      ),
      id: "h",
      title: "Hip",
      cls: "us",
      showActions: true,
      canDelete: true
    };
    const el = mount(tile);
    expect(
      Array.from(el.shadowRoot.querySelectorAll(".lc")).map((l) =>
        l.textContent.replace("*", "").trim()
      )
    ).toEqual(["Stem", "Cup"]);
    expect(el.shadowRoot.textContent).toContain("Ceramic on Poly");
    expect(q(el, ".xc").getAttribute("style")).toContain("span 2");
    expect(q(el, ".pe").getAttribute("style")).toContain("span 2");
    expect(
      Array.from(el.shadowRoot.querySelectorAll(".xc .chip")).map((c) =>
        c.textContent.trim()
      )
    ).toEqual(["Total", "Revision", "ROSA"]);
    expect(q(el, ".pe .iconbtn.del")).not.toBeNull();
  });

  it("puts the chips on their own line when editing, under Company, with Save and Cancel below", () => {
    const tile = {
      ...base(true),
      ...buildTile(
        "Knee",
        draftOf("Knee", { Procedure_Types__c: "Total" }),
        true,
        {
          Procedure_Types__c: {
            values: [{ value: "Total" }, { value: "Revision" }]
          }
        },
        "u1"
      )
    };
    const el = mount(tile);
    expect(q(el, ".xc")).toBeNull();
    expect(q(el, ".pe")).toBeNull();
    const chips = el.shadowRoot.querySelectorAll(".cg .chips button.chip");
    expect(chips).toHaveLength(2);
    const chip = jest.fn();
    el.addEventListener("chip", chip);
    chips[1].click();
    expect(chip.mock.calls[0][0].detail.value).toBe("Revision");
    expect(q(el, ".tfoot")).not.toBeNull();
  });
});
