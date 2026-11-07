import { createElement } from "lwc";
import PipelineDealCampaignAction from "c/pipelineDealCampaignAction";

jest.mock(
  "@salesforce/apex/PipelineDealCampaignController.getDealCampaigns",
  () => ({ default: jest.fn().mockResolvedValue({ hasHcp: false }) }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/PipelineDealCampaignController.setLink",
  () => ({ default: jest.fn() }),
  { virtual: true }
);

jest.mock(
  "lightning/actions",
  () => ({
    CloseActionScreenEvent: class extends CustomEvent {
      constructor() {
        super("lightning__actionsclosescreen");
      }
    }
  }),
  { virtual: true }
);

const make = (embedded) => {
  const el = createElement("c-pipeline-deal-campaign-action", {
    is: PipelineDealCampaignAction
  });
  el.recordId = "d1";
  el.isEmbedded = embedded;
  document.body.appendChild(el);
  return el;
};

describe("c-pipeline-deal-campaign-action", () => {
  afterEach(() => {
    while (document.body.firstChild)
      document.body.removeChild(document.body.firstChild);
  });

  it("on the phone fills its own shell and Done tells the Aura wrapper", () => {
    const el = make(true);
    const done = jest.fn();
    el.addEventListener("done", done);
    expect(el.shadowRoot.querySelector(".shell")).not.toBeNull();
    expect(
      el.shadowRoot.querySelector("c-pipeline-deal-campaigns")
    ).not.toBeNull();
    el.shadowRoot.querySelector("button.done").click();
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("on desktop uses the quick action panel and Done closes the action", () => {
    const el = make(false);
    expect(el.shadowRoot.querySelector(".shell")).toBeNull();
    expect(
      el.shadowRoot.querySelector("lightning-quick-action-panel")
    ).not.toBeNull();
    const closed = jest.fn();
    el.addEventListener("lightning__actionsclosescreen", closed);
    el.shadowRoot.querySelector("button.btn").click();
    expect(closed).toHaveBeenCalledTimes(1);
  });
});
