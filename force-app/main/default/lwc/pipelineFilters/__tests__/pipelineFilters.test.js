import { createElement } from "lwc";
import PipelineFilters from "c/pipelineFilters";
import saveFilter from "@salesforce/apex/PipelineFilterController.saveFilter";
import setDefault from "@salesforce/apex/PipelineFilterController.setDefault";
import deleteFilter from "@salesforce/apex/PipelineFilterController.deleteFilter";
import shareWithTeam from "@salesforce/apex/PipelineFilterController.shareWithTeam";

jest.mock(
  "@salesforce/apex/PipelineFilterController.saveFilter",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/PipelineFilterController.deleteFilter",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/PipelineFilterController.setDefault",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/PipelineFilterController.searchPeople",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/PipelineFilterController.shareWithPeople",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/PipelineFilterController.shareWithTeam",
  () => ({ default: jest.fn() }),
  { virtual: true }
);

// eslint-disable-next-line @lwc/lwc/no-async-operation
const flush = () => new Promise((r) => setTimeout(r, 0));
const FILTERS = [
  { id: "f1", name: "My hips", json: "{}", isDefault: true },
  { id: "f2", name: "NSW risks", json: "{}", isDefault: false }
];

function make(props) {
  const el = createElement("c-pipeline-filters", { is: PipelineFilters });
  Object.assign(el, {
    filters: FILTERS,
    snapshot: '{"kinds":["opp"]}',
    activeId: "",
    isManager: false,
    ...props
  });
  document.body.appendChild(el);
  return el;
}
const button = (el, text) =>
  [...el.shadowRoot.querySelectorAll("button")].find(
    (b) => b.textContent.trim() === text
  );

describe("c-pipeline-filters", () => {
  afterEach(() => {
    while (document.body.firstChild)
      document.body.removeChild(document.body.firstChild);
    jest.clearAllMocks();
  });

  it("lists the filters and marks the default", () => {
    const el = make();
    const rows = el.shadowRoot.querySelectorAll(".frow");
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain("Opens by default");
    expect(rows[0].querySelector(".star").classList.contains("on")).toBe(true);
  });

  it("saves the screen's choices under the name typed", async () => {
    saveFilter.mockResolvedValue({ id: "f3", name: "New one" });
    const el = make();
    const handler = jest.fn();
    el.addEventListener("filterschanged", handler);
    const input = el.shadowRoot.querySelector("input.name");
    input.value = "New one";
    input.dispatchEvent(new CustomEvent("input"));
    await flush();
    button(el, "Save").click();
    await flush();
    expect(saveFilter).toHaveBeenCalledWith({
      existingId: null,
      name: "New one",
      filterJson: '{"kinds":["opp"]}'
    });
    expect(handler.mock.calls[0][0].detail.activeId).toBe("f3");
  });

  it("will not save without a name", () => {
    const el = make();
    expect(button(el, "Save").disabled).toBe(true);
  });

  it("clears the default when its star is clicked, and sets one when another is", async () => {
    setDefault.mockResolvedValue();
    const el = make();
    const stars = el.shadowRoot.querySelectorAll(".star");
    stars[0].click();
    await flush();
    expect(setDefault).toHaveBeenLastCalledWith({ filterId: null });
    stars[1].click();
    await flush();
    expect(setDefault).toHaveBeenLastCalledWith({ filterId: "f2" });
  });

  it("asks before deleting", async () => {
    deleteFilter.mockResolvedValue();
    const el = make();
    el.shadowRoot
      .querySelectorAll(".frow")[1]
      .querySelectorAll("button.mini")[2]
      .click();
    await flush();
    expect(deleteFilter).not.toHaveBeenCalled();
    expect(el.shadowRoot.querySelector(".confirm").textContent).toContain(
      "NSW risks"
    );
    el.shadowRoot.querySelector(".confirm .danger").click();
    await flush();
    expect(deleteFilter).toHaveBeenCalledWith({ filterId: "f2" });
  });

  it("offers sharing with a team only to a manager", async () => {
    shareWithTeam.mockResolvedValue(4);
    const notManager = make({ isManager: false });
    notManager.shadowRoot
      .querySelectorAll(".frow")[0]
      .querySelectorAll("button.mini")[1]
      .click();
    await flush();
    expect(button(notManager, "Share with my team")).toBeUndefined();

    const manager = make({ isManager: true });
    manager.shadowRoot
      .querySelectorAll(".frow")[0]
      .querySelectorAll("button.mini")[1]
      .click();
    await flush();
    button(manager, "Share with my team").click();
    await flush();
    expect(shareWithTeam).toHaveBeenCalledWith({ filterId: "f1" });
    expect(manager.shadowRoot.querySelector(".msg.ok").textContent).toContain(
      "4 people"
    );
  });
});
