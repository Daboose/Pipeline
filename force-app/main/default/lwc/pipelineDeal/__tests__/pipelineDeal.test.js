import { createElement } from "lwc";
import PipelineDeal from "c/pipelineDeal";

// the cards inside the flyout read their own data from Salesforce; here they are empty stand-ins
jest.mock(
  "c/pipelineChatter",
  () => {
    const { LightningElement } = require("lwc");
    return { __esModule: true, default: class extends LightningElement {} };
  },
  { virtual: true }
);
jest.mock(
  "c/pipelineUsages",
  () => {
    const { LightningElement } = require("lwc");
    return { __esModule: true, default: class extends LightningElement {} };
  },
  { virtual: true }
);
jest.mock(
  "c/pipelineSurgeries",
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

// Guards the screen-to-flyout hand-over: the screen gives the flyout its deal and says when to slide it in.
describe("c-pipeline-deal", () => {
  afterEach(() => {
    while (document.body.firstChild)
      document.body.removeChild(document.body.firstChild);
  });

  const deal = {
    id: "a01000000000001",
    name: "Test deal",
    kind: "opp",
    segment: "Hip",
    stage: "Plan",
    ownerName: "Pat Owner",
    value: 1000,
    currencyCode: "AUD"
  };

  it("takes the deal from the screen and shows its owner and value", async () => {
    const el = createElement("c-pipeline-deal", { is: PipelineDeal });
    el.deal = deal;
    el.index = 0;
    el.total = 1;
    document.body.appendChild(el);
    await Promise.resolve();
    expect(el.deal.id).toBe(deal.id);
    expect(el.shadowRoot.textContent).toContain("Pat Owner");
  });

  it("slides in only when told to open", async () => {
    const el = createElement("c-pipeline-deal", { is: PipelineDeal });
    el.deal = deal;
    document.body.appendChild(el);
    await Promise.resolve();
    expect(el.shadowRoot.querySelector(".fly.on")).toBeNull();
    el.open = true;
    await Promise.resolve();
    expect(el.shadowRoot.querySelector(".fly.on")).not.toBeNull();
    expect(el.shadowRoot.querySelector(".scrim.on")).not.toBeNull();
  });
});
