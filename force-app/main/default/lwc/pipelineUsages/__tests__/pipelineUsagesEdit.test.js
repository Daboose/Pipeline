import { createElement } from "lwc";
import PipelineUsages from "c/pipelineUsages";
import getUsages from "@salesforce/apex/PipelineSurgeonController.getUsages";
import saveUsage from "@salesforce/apex/PipelineUsageController.saveUsage";
import deleteUsage from "@salesforce/apex/PipelineUsageController.deleteUsage";
import addUsage from "@salesforce/apex/PipelineUsageController.addUsage";

jest.mock(
  "@salesforce/apex/PipelineSurgeonController.getUsages",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/PipelineUsageController.saveUsage",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/PipelineUsageController.deleteUsage",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/PipelineUsageController.addUsage",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
// the two child components read from Salesforce; here they are empty stand-ins that the tests drive by events
jest.mock(
  "c/pipelineUsageChoices",
  () => {
    const { LightningElement } = require("lwc");
    return { __esModule: true, default: class extends LightningElement {} };
  },
  { virtual: true }
);
jest.mock(
  "c/pipelineLookup",
  () => {
    const { LightningElement } = require("lwc");
    return { __esModule: true, default: class extends LightningElement {} };
  },
  { virtual: true }
);

// eslint-disable-next-line @lwc/lwc/no-async-operation
const flush = () => new Promise((r) => setTimeout(r, 0));

const line = (over) => ({
  hospital: "North",
  portfolio: "Hip",
  usageId: "u1",
  hospitalId: "h1",
  recordType: "ANZ HIP",
  recordTypeId: "rt1",
  empty: false,
  ...over
});
const data = (over) => ({
  surgeonId: "001",
  surgeonName: "Dr Test",
  newest: new Date().toISOString(),
  oldest: new Date().toISOString(),
  ratings: [],
  canEdit: true,
  canCreate: true,
  canDelete: true,
  addable: [
    { portfolio: "Hip", recordType: "ANZ HIP", recordTypeId: "rt1" },
    { portfolio: "Knee", recordType: "ANZ KNEE", recordTypeId: "rt2" }
  ],
  lines: [
    line({ label: "Stems", key: "stems", company: "ZB", cases: 20 }),
    line({
      label: "Cups",
      key: "cups",
      company: null,
      cases: null,
      empty: true
    })
  ],
  ...over
});

function make() {
  const el = createElement("c-pipeline-usages", { is: PipelineUsages });
  el.recordId = "a1";
  document.body.appendChild(el);
  return el;
}
const buttonText = (el, text) =>
  [...el.shadowRoot.querySelectorAll("button")].find(
    (b) => b.textContent.trim() === text
  );
const giveChoices = (el) => {
  el.shadowRoot.querySelector("c-pipeline-usage-choices").dispatchEvent(
    new CustomEvent("choices", {
      detail: {
        recordTypeId: "rt1",
        byKey: { stems: ["ZB", "Lima"], cups: ["ZB", "Corin Global"] }
      }
    })
  );
};

describe("c-pipeline-usages: edit, delete and add", () => {
  afterEach(() => {
    while (document.body.firstChild)
      document.body.removeChild(document.body.firstChild);
    jest.clearAllMocks();
  });

  it("offers Edit and Add only to someone who may change usages", async () => {
    getUsages.mockResolvedValue(
      data({ canEdit: false, canCreate: false, canDelete: false, addable: [] })
    );
    const el = make();
    await flush();
    expect(buttonText(el, "Edit usages")).toBeUndefined();
    expect(buttonText(el, "Add usage")).toBeUndefined();
  });

  it("hides the empty cups line until editing, then lists the record type's own companies", async () => {
    getUsages.mockResolvedValue(data());
    const el = make();
    await flush();
    expect(el.shadowRoot.querySelectorAll("td.sub").length).toBe(1);
    buttonText(el, "Edit usages").click();
    await flush();
    expect(el.shadowRoot.querySelectorAll("td.sub").length).toBe(2);
    giveChoices(el);
    await flush();
    const stems = el.shadowRoot.querySelector("select.cell[data-key=stems]");
    expect([...stems.options].map((o) => o.value)).toEqual(["", "ZB", "Lima"]);
    expect(stems.value).toBe("ZB");
  });

  it("saves only the usage record that changed, with the lines it was given", async () => {
    getUsages.mockResolvedValue(data());
    saveUsage.mockResolvedValue();
    const el = make();
    await flush();
    buttonText(el, "Edit usages").click();
    await flush();
    giveChoices(el);
    await flush();
    const cups = el.shadowRoot.querySelector("select.cell[data-key=cups]");
    cups.value = "Corin Global";
    cups.dispatchEvent(new CustomEvent("change"));
    const n = el.shadowRoot.querySelector("input.cell[data-key=cups]");
    n.value = "12";
    n.dispatchEvent(new CustomEvent("change"));
    await flush();
    buttonText(el, "Save changes").click();
    await flush();
    expect(saveUsage).toHaveBeenCalledTimes(1);
    const arg = saveUsage.mock.calls[0][0];
    expect(arg.usageId).toBe("u1");
    expect(JSON.parse(arg.linesJson)).toEqual([
      { key: "cups", company: "Corin Global", cases: 12 }
    ]);
    expect(el.shadowRoot.querySelector(".okmsg").textContent).toBe("Saved.");
  });

  it("shows the reason when a save is refused", async () => {
    getUsages.mockResolvedValue(data());
    saveUsage.mockRejectedValue({ body: { message: "bad value" } });
    const el = make();
    await flush();
    buttonText(el, "Edit usages").click();
    await flush();
    const n = el.shadowRoot.querySelector("input.cell[data-key=stems]");
    n.value = "30";
    n.dispatchEvent(new CustomEvent("change"));
    await flush();
    buttonText(el, "Save changes").click();
    await flush();
    expect(el.shadowRoot.querySelector(".errs").textContent).toContain(
      "bad value"
    );
  });

  it("asks before deleting a usage, and deletes the whole record", async () => {
    getUsages.mockResolvedValue(data());
    deleteUsage.mockResolvedValue();
    const el = make();
    await flush();
    buttonText(el, "Edit usages").click();
    await flush();
    el.shadowRoot.querySelector("button.xbtn").click();
    await flush();
    expect(el.shadowRoot.querySelector(".delbar").textContent).toContain(
      "the Hip usage at North"
    );
    buttonText(el, "Keep").click();
    await flush();
    expect(el.shadowRoot.querySelector(".delbar")).toBeNull();
    el.shadowRoot.querySelector("button.xbtn").click();
    await flush();
    buttonText(el, "Delete").click();
    await flush();
    expect(deleteUsage).toHaveBeenCalledWith({ usageId: "u1" });
  });

  it("adds a usage for a hospital found by search, with the record type shown", async () => {
    getUsages.mockResolvedValue(data());
    addUsage.mockResolvedValue({ usageId: "u2", existing: false });
    const el = make();
    await flush();
    buttonText(el, "Add usage").click();
    await flush();
    expect(el.shadowRoot.querySelector(".addform .note").textContent).toContain(
      "ANZ HIP"
    );
    expect(buttonText(el, "Add").disabled).toBe(true);
    el.shadowRoot.querySelector("c-pipeline-lookup").dispatchEvent(
      new CustomEvent("change", {
        detail: { id: "h9", name: "New Hospital" }
      })
    );
    await flush();
    expect(buttonText(el, "Add").disabled).toBe(false);
    buttonText(el, "Add").click();
    await flush();
    const arg = addUsage.mock.calls[0][0];
    expect(arg.dealId).toBe("a1");
    expect(arg.hospitalId).toBe("h9");
    expect(arg.portfolio).toBe("Hip");
    expect(el.shadowRoot.querySelector(".okmsg").textContent).toBe("Added.");
  });

  it("opens the existing usage for editing when the surgeon already has one", async () => {
    getUsages.mockResolvedValue(data());
    addUsage.mockResolvedValue({ usageId: "u1", existing: true });
    const el = make();
    await flush();
    buttonText(el, "Add usage").click();
    await flush();
    el.shadowRoot
      .querySelector("c-pipeline-lookup")
      .dispatchEvent(
        new CustomEvent("change", { detail: { id: "h1", name: "North" } })
      );
    await flush();
    buttonText(el, "Add").click();
    await flush();
    expect(el.shadowRoot.querySelector(".okmsg").textContent).toContain(
      "already has a Hip usage at North"
    );
    expect(buttonText(el, "Save changes")).toBeDefined();
    expect(el.shadowRoot.querySelectorAll("select.cell").length).toBe(2);
  });
});

describe("c-pipeline-usages: inside the deal flyout (bare)", () => {
  afterEach(() => {
    while (document.body.firstChild)
      document.body.removeChild(document.body.firstChild);
    jest.clearAllMocks();
  });

  function makeBare() {
    const el = createElement("c-pipeline-usages", { is: PipelineUsages });
    el.bare = true;
    el.recordId = "a1";
    const states = [];
    el.addEventListener("actionstate", (e) => states.push(e.detail));
    document.body.appendChild(el);
    return { el, states };
  }
  const change = (el, key, value) => {
    const n = el.shadowRoot.querySelector(`input.cell[data-key=${key}]`);
    n.value = value;
    n.dispatchEvent(new CustomEvent("change"));
  };

  it("has no Save, Cancel or Add buttons of its own while editing or adding", async () => {
    getUsages.mockResolvedValue(data());
    const { el } = makeBare();
    await flush();
    buttonText(el, "Edit usages").click();
    await flush();
    expect(buttonText(el, "Save changes")).toBeUndefined();
    expect(buttonText(el, "Cancel")).toBeUndefined();
    el.cancel();
    await flush();
    buttonText(el, "Add usage").click();
    await flush();
    expect(buttonText(el, "Add")).toBeUndefined();
    expect(buttonText(el, "Cancel")).toBeUndefined();
  });

  it("tells the flyout what its bottom row should show, and saves and cancels when asked", async () => {
    getUsages.mockResolvedValue(data());
    saveUsage.mockResolvedValue();
    const { el, states } = makeBare();
    await flush();
    expect(states[states.length - 1].kind).toBe("");
    buttonText(el, "Edit usages").click();
    await flush();
    expect(states[states.length - 1]).toEqual({
      kind: "edit",
      canSubmit: false,
      saving: false
    });
    el.submit(); // nothing changed yet: nothing is saved
    await flush();
    expect(saveUsage).not.toHaveBeenCalled();
    change(el, "stems", "30");
    await flush();
    expect(states[states.length - 1].canSubmit).toBe(true);
    el.submit();
    await flush();
    expect(saveUsage).toHaveBeenCalledTimes(1);
    expect(states[states.length - 1].kind).toBe("");
    buttonText(el, "Edit usages").click();
    await flush();
    change(el, "stems", "31");
    await flush();
    el.cancel();
    await flush();
    expect(states[states.length - 1].kind).toBe("");
    expect(saveUsage).toHaveBeenCalledTimes(1);
  });

  it("reports adding, and cannot add until a hospital is chosen", async () => {
    getUsages.mockResolvedValue(data());
    const { el, states } = makeBare();
    await flush();
    buttonText(el, "Add usage").click();
    await flush();
    expect(states[states.length - 1]).toEqual({
      kind: "add",
      canSubmit: false,
      saving: false
    });
    el.submit();
    await flush();
    expect(addUsage).not.toHaveBeenCalled();
  });
});
