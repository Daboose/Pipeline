import { createElement } from "lwc";
import PipelineFilters from "c/pipelineFilters";
import saveFilter from "@salesforce/apex/PipelineFilterController.saveFilter";
import renameFilter from "@salesforce/apex/PipelineFilterController.renameFilter";
import setDefault from "@salesforce/apex/PipelineFilterController.setDefault";
import deleteFilter from "@salesforce/apex/PipelineFilterController.deleteFilter";
import shareWithTeam from "@salesforce/apex/PipelineFilterController.shareWithTeam";

jest.mock(
  "@salesforce/apex/PipelineFilterController.saveFilter",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/PipelineFilterController.renameFilter",
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
jest.mock(
  "c/pipelinePipe",
  () => {
    const { LightningElement } = require("lwc");
    return { __esModule: true, default: class extends LightningElement {} };
  },
  { virtual: true }
);

// eslint-disable-next-line @lwc/lwc/no-async-operation
const flush = () => new Promise((r) => setTimeout(r, 0));
const FILTERS = [
  {
    id: "f1",
    name: "My hips",
    isDefault: true,
    summary: "Opportunities · Open"
  },
  { id: "f2", name: "NSW risks", isDefault: false, summary: "Risks · Open" }
];

function make(props) {
  const el = createElement("c-pipeline-filters", { is: PipelineFilters });
  Object.assign(el, {
    filters: FILTERS,
    snapshot: '{"kinds":["opp"]}',
    activeId: "f1",
    changed: false,
    screenSummary: "Opportunities · Open",
    isManager: false,
    open: true,
    ...props
  });
  document.body.appendChild(el);
  return el;
}
const button = (el, text) =>
  [...el.shadowRoot.querySelectorAll("button")].find(
    (b) => b.textContent.trim() === text
  );
const byTitle = (el, title, n = 0) =>
  el.shadowRoot.querySelectorAll(`button[title="${title}"]`)[n];

describe("c-pipeline-filters (the My filters panel)", () => {
  beforeEach(() => {
    saveFilter.mockResolvedValue({ id: "f1", name: "My hips" });
    renameFilter.mockResolvedValue({ id: "f2", name: "Renamed" });
    setDefault.mockResolvedValue();
    deleteFilter.mockResolvedValue();
    shareWithTeam.mockResolvedValue(3);
  });
  afterEach(() => {
    while (document.body.firstChild)
      document.body.removeChild(document.body.firstChild);
    jest.clearAllMocks();
  });

  it("lists each filter with its summary, and marks the one that is showing", async () => {
    const el = make();
    await Promise.resolve();
    const rows = el.shadowRoot.querySelectorAll(".frow");
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain("Opportunities · Open");
    expect(rows[0].textContent).toContain("Showing now");
    expect(rows[0].textContent).not.toContain("Changed");
    expect(rows[1].textContent).not.toContain("Showing now");
  });

  it("slides in only while it is told to be open", async () => {
    const el = make({ open: false });
    await Promise.resolve();
    expect(el.shadowRoot.querySelector(".panel.on")).toBeNull();
    el.open = true;
    await Promise.resolve();
    expect(el.shadowRoot.querySelector(".panel.on")).not.toBeNull();
    expect(el.shadowRoot.querySelector(".scrim.on")).not.toBeNull();
  });

  it("asks the screen to run a filter when its name is clicked", async () => {
    const el = make();
    const run = jest.fn();
    el.addEventListener("openfilter", run);
    await Promise.resolve();
    el.shadowRoot.querySelectorAll(".fname")[1].click();
    expect(run.mock.calls[0][0].detail.id).toBe("f2");
  });

  it("makes one filter the default with the star, and clears it when the default is clicked again", async () => {
    const el = make();
    await Promise.resolve();
    byTitle(el, "Make this my default").click();
    await flush();
    expect(setDefault).toHaveBeenLastCalledWith({ filterId: "f2" });
    byTitle(el, "Your default: click to have no default").click();
    await flush();
    expect(setDefault).toHaveBeenLastCalledWith({ filterId: null });
  });

  it("renames in place, and only the name is sent", async () => {
    const el = make();
    const changed = jest.fn();
    el.addEventListener("filterschanged", changed);
    await Promise.resolve();
    byTitle(el, "Rename", 1).click();
    await Promise.resolve();
    const input = el.shadowRoot.querySelector(".fedit .in");
    input.value = "Renamed";
    input.dispatchEvent(new CustomEvent("input"));
    await Promise.resolve();
    el.shadowRoot.querySelector(".tick").click();
    await flush();
    expect(renameFilter).toHaveBeenCalledWith({
      filterId: "f2",
      name: "Renamed"
    });
    expect(changed).toHaveBeenCalled();
  });

  it("asks before deleting, in the row", async () => {
    const el = make();
    await Promise.resolve();
    byTitle(el, "Delete", 1).click();
    await Promise.resolve();
    expect(el.shadowRoot.textContent).toContain("Delete “NSW risks”?");
    expect(deleteFilter).not.toHaveBeenCalled();
    button(el, "Delete").click();
    await flush();
    expect(deleteFilter).toHaveBeenCalledWith({ filterId: "f2" });
  });

  it("offers Save over only while the screen differs from the open filter, and sends the screen's choices", async () => {
    const el = make();
    await Promise.resolve();
    expect(button(el, "Save over “My hips”").disabled).toBe(true);
    el.changed = true;
    await Promise.resolve();
    expect(el.shadowRoot.querySelector(".frow").textContent).toContain(
      "Changed"
    );
    const over = button(el, "Save over “My hips”");
    expect(over.disabled).toBe(false);
    over.click();
    await flush();
    expect(saveFilter).toHaveBeenCalledWith({
      existingId: "f1",
      name: "My hips",
      filterJson: '{"kinds":["opp"]}'
    });
  });

  it("has no Save over when no filter is open", async () => {
    const el = make({ activeId: "" });
    await Promise.resolve();
    expect(button(el, "Save over “My hips”")).toBeUndefined();
    expect(button(el, "Save as new filter…")).toBeDefined();
  });

  it("saves the screen as a new filter under the name typed", async () => {
    const el = make();
    await Promise.resolve();
    button(el, "Save as new filter…").click();
    await Promise.resolve();
    const input = el.shadowRoot.querySelector(".ffoot .name");
    input.value = "Fresh one";
    input.dispatchEvent(new CustomEvent("input"));
    await Promise.resolve();
    button(el, "Save").click();
    await flush();
    expect(saveFilter).toHaveBeenCalledWith({
      existingId: null,
      name: "Fresh one",
      filterJson: '{"kinds":["opp"]}'
    });
  });

  it("offers sharing with the whole team only to a team manager", async () => {
    const el = make({ isManager: false });
    await Promise.resolve();
    byTitle(el, "Share").click();
    await Promise.resolve();
    expect(button(el, "Share with my whole team")).toBeUndefined();
    document.body.removeChild(el);
    const mgr = make({ isManager: true });
    await Promise.resolve();
    byTitle(mgr, "Share").click();
    await Promise.resolve();
    button(mgr, "Share with my whole team").click();
    await flush();
    expect(shareWithTeam).toHaveBeenCalledWith({ filterId: "f1" });
  });

  it("closes on the cross, the blurred page and Escape", async () => {
    const el = make();
    const close = jest.fn();
    el.addEventListener("close", close);
    await Promise.resolve();
    el.shadowRoot.querySelector(".xbig").click();
    el.shadowRoot.querySelector(".scrim").click();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(close).toHaveBeenCalledTimes(3);
  });
});
