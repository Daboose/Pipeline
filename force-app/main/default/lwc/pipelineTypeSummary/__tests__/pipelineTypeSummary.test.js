import { createElement } from "lwc";
import PipelineTypeSummary from "c/pipelineTypeSummary";

const make = (props) => {
  const el = createElement("c-pipeline-type-summary", {
    is: PipelineTypeSummary
  });
  Object.assign(el, { kind: "opp", deals: [], stageOrder: [], ...props });
  document.body.appendChild(el);
  return el;
};
// eslint-disable-next-line @lwc/lwc/no-async-operation
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

describe("c-pipeline-type-summary folding", () => {
  afterEach(() => {
    while (document.body.firstChild)
      document.body.removeChild(document.body.firstChild);
  });

  it("starts closed, with no stage part on the page", async () => {
    const el = make({ summaryOpen: false });
    await Promise.resolve();
    expect(el.shadowRoot.querySelector(".fold")).toBeNull();
  });

  it("starts already open, unfolded, when it is saved as open", async () => {
    const el = make({ summaryOpen: true });
    await Promise.resolve();
    expect(el.shadowRoot.querySelector(".fold.on")).not.toBeNull();
  });

  it("unfolds a moment after it is put on the page, then folds and is taken off", async () => {
    const el = make({ summaryOpen: false });
    await Promise.resolve();
    el.summaryOpen = true;
    await Promise.resolve();
    expect(el.shadowRoot.querySelector(".fold")).not.toBeNull();
    await wait(80);
    expect(el.shadowRoot.querySelector(".fold.on")).not.toBeNull();
    el.summaryOpen = false;
    await Promise.resolve();
    expect(el.shadowRoot.querySelector(".fold")).not.toBeNull();
    expect(el.shadowRoot.querySelector(".fold.on")).toBeNull();
    await wait(500);
    expect(el.shadowRoot.querySelector(".fold")).toBeNull();
  });
});
