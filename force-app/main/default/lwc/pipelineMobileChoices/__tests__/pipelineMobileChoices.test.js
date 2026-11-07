import { createElement } from "lwc";
import PipelineMobileChoices from "c/pipelineMobileChoices";

const make = (props = {}) => {
  const el = createElement("c-pipeline-mobile-choices", {
    is: PipelineMobileChoices
  });
  Object.assign(el, {
    label: "Brand",
    options: [
      { value: "Persona", label: "Persona", on: true },
      { value: "NexGen", label: "NexGen", on: true },
      { value: "Vivacit-E", label: "Vivacit-E", on: false }
    ],
    ...props
  });
  document.body.appendChild(el);
  return el;
};
const root = (el) => el.shadowRoot;
const flush = () => Promise.resolve();

describe("c-pipeline-mobile-choices", () => {
  afterEach(() => {
    while (document.body.firstChild)
      document.body.removeChild(document.body.firstChild);
  });

  it("starts closed and names the chosen words, separated by commas, with no chips in the row", () => {
    const el = make();
    expect(root(el).querySelector(".bc").classList.contains("shut")).toBe(true);
    expect(root(el).querySelector(".hd small").textContent).toBe("Brand");
    expect(root(el).querySelector(".chosen").textContent).toBe(
      "Persona, NexGen"
    );
    expect(root(el).querySelector(".hd .chip")).toBeNull();
  });

  it("says None selected when nothing is chosen", () => {
    const el = make({
      options: [{ value: "a", label: "A", on: false }]
    });
    expect(root(el).querySelector(".chosen").textContent).toBe("None selected");
    expect(root(el).querySelector(".chosen.none")).not.toBeNull();
  });

  it("stars a required field", () => {
    const el = make({ required: true });
    expect(root(el).querySelector(".hd small").textContent).toContain("*");
  });

  it("opens to the chips and folds shut again on the row", async () => {
    const el = make();
    root(el).querySelector(".hd").click();
    await flush();
    expect(root(el).querySelector(".bc").classList.contains("shut")).toBe(
      false
    );
    const on = [...root(el).querySelectorAll(".chip.on")].map((c) =>
      c.textContent.trim()
    );
    expect(on).toEqual(["Persona", "NexGen"]);
    root(el).querySelector(".hd").click();
    await flush();
    expect(root(el).querySelector(".bc").classList.contains("shut")).toBe(true);
  });

  it("reports a tapped chip as a toggle and does nothing when it cannot be changed", async () => {
    const el = make();
    const handler = jest.fn();
    el.addEventListener("toggle", handler);
    root(el).querySelector(".hd").click();
    await flush();
    root(el).querySelectorAll(".chip")[2].click();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].detail).toEqual({ value: "Vivacit-E" });
    el.disabled = true;
    await flush();
    root(el).querySelectorAll(".chip")[2].click();
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
