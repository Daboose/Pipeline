import { createElement } from "lwc";
import PipelineMobileCampaigns from "c/pipelineMobileCampaigns";

// the Campaigns list has its own tests; here it is an empty stand-in
jest.mock(
  "c/pipelineDealCampaigns",
  () => {
    const { LightningElement } = require("lwc");
    return { __esModule: true, default: class extends LightningElement {} };
  },
  { virtual: true }
);

const make = (props = {}) => {
  const el = createElement("c-pipeline-mobile-campaigns", {
    is: PipelineMobileCampaigns
  });
  Object.assign(el, {
    recordId: "a01X",
    dealLabel: "Dr Chris Lee · Opportunity",
    ...props
  });
  document.body.appendChild(el);
  return el;
};
const root = (el) => el.shadowRoot;

describe("c-pipeline-mobile-campaigns", () => {
  afterEach(() => {
    while (document.body.firstChild)
      document.body.removeChild(document.body.firstChild);
  });

  it("holds the Campaigns list for the deal under a heading and the deal's name", () => {
    const el = make();
    expect(root(el).querySelector(".dname").textContent).toBe("Campaigns");
    expect(root(el).querySelector(".dsub").textContent).toBe(
      "Dr Chris Lee · Opportunity"
    );
    expect(root(el).querySelector("c-pipeline-deal-campaigns").recordId).toBe(
      "a01X"
    );
  });

  it("slides in when it is opened", async () => {
    const el = make();
    expect(
      root(el).querySelector(".campaignspage").classList.contains("on")
    ).toBe(false);
    el.open = true;
    await Promise.resolve();
    expect(
      root(el).querySelector(".campaignspage").classList.contains("on")
    ).toBe(true);
  });

  it("asks the screen to slide it off, and says how many campaigns the deal is now in", () => {
    const el = make();
    let closed = false;
    let count = null;
    el.addEventListener("close", () => (closed = true));
    el.addEventListener("changed", (e) => (count = e.detail));
    root(el).querySelector(".backbtn").click();
    expect(closed).toBe(true);
    root(el)
      .querySelector("c-pipeline-deal-campaigns")
      .dispatchEvent(
        new CustomEvent("campaignschanged", { detail: { linkedCount: 2 } })
      );
    expect(count).toBe(2);
  });
});
