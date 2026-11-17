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

  it("shows the headings once and the chosen values when not editing", () => {
    const el = mount(base(false));
    expect(el.shadowRoot.textContent).toContain("Attune");
    expect(el.shadowRoot.querySelectorAll(".gh")).toHaveLength(3);
    expect(q(el, "select")).toBeNull();
  });
});
