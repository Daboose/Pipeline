import { createElement } from "lwc";
import PipelineMobileSaving from "c/pipelineMobileSaving";

// the logo has its own tests; here it is an empty stand-in
jest.mock(
  "c/pipelinePipe",
  () => {
    const { LightningElement } = require("lwc");
    return { __esModule: true, default: class extends LightningElement {} };
  },
  { virtual: true }
);

const make = (props = {}) => {
  const el = createElement("c-pipeline-mobile-saving", {
    is: PipelineMobileSaving
  });
  Object.assign(el, props);
  document.body.appendChild(el);
  return el;
};
const root = (el) => el.shadowRoot;
const flush = () => Promise.resolve();

describe("c-pipeline-mobile-saving", () => {
  afterEach(() => {
    while (document.body.firstChild)
      document.body.removeChild(document.body.firstChild);
  });

  it("is out of sight until it is told to work", () => {
    const el = make();
    expect(root(el).querySelector(".over").classList.contains("show")).toBe(
      false
    );
  });

  it("shows the logo, a spinner and the word while working, then a tick and the past tense", async () => {
    const el = make({ phase: "working", word: "Saving…" });
    await flush();
    expect(root(el).querySelector(".over").classList.contains("show")).toBe(
      true
    );
    expect(root(el).querySelector("c-pipeline-pipe")).not.toBeNull();
    expect(root(el).querySelector(".spin")).not.toBeNull();
    expect(root(el).querySelector(".tick")).toBeNull();
    expect(root(el).querySelector(".t").textContent).toBe("Saving…");
    el.phase = "done";
    el.word = "Saved";
    await flush();
    expect(root(el).querySelector(".tick")).not.toBeNull();
    expect(root(el).querySelector(".spin")).toBeNull();
    expect(root(el).querySelector(".over").classList.contains("done")).toBe(
      true
    );
    expect(root(el).querySelector(".t").textContent).toBe("Saved");
  });
});
