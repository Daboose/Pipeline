import { createElement } from "lwc";
import PipelineDealCampaigns from "c/pipelineDealCampaigns";
import getDealCampaigns from "@salesforce/apex/PipelineDealCampaignController.getDealCampaigns";
import setLink from "@salesforce/apex/PipelineDealCampaignController.setLink";

jest.mock(
  "@salesforce/apex/PipelineDealCampaignController.getDealCampaigns",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/PipelineDealCampaignController.setLink",
  () => ({ default: jest.fn() }),
  { virtual: true }
);

// eslint-disable-next-line @lwc/lwc/no-async-operation
const flush = () => new Promise((r) => setTimeout(r, 0));
const DATA = {
  dealName: "OPP-1",
  hasHcp: true,
  hcpName: "Dr Tan",
  ownerCountry: "SG",
  portfolios: "Hip",
  offered: [
    {
      id: "a1",
      name: "Hip Roadshow SG",
      managerName: "Mei",
      portfolios: "Hip",
      linked: false
    },
    {
      id: "a2",
      name: "Old Course SG",
      managerName: "Mei",
      portfolios: "Hip",
      linked: true,
      note: "Not active"
    }
  ]
};
const make = async (data = DATA) => {
  getDealCampaigns.mockResolvedValue(data);
  const el = createElement("c-pipeline-deal-campaigns", {
    is: PipelineDealCampaigns
  });
  el.recordId = "d1";
  document.body.appendChild(el);
  await flush();
  return el;
};
const text = (el) => el.shadowRoot.textContent.replace(/\s+/g, " ");

describe("c-pipeline-deal-campaigns", () => {
  afterEach(() => {
    while (document.body.firstChild)
      document.body.removeChild(document.body.firstChild);
    jest.clearAllMocks();
  });

  it("shows the facts and the offered campaigns, and nothing about the others", async () => {
    const el = await make();
    const t = text(el);
    expect(t).toContain(
      "Primary HCP Dr Tan · owner's country SG · portfolio Hip"
    );
    expect(t).toContain("Hip Roadshow SG");
    expect(t).toContain("Campaign Manager Mei");
    expect(t).toContain(
      "No longer fits: Not active. You can still take it out."
    );
    expect(t).not.toContain("Not offered");
    expect(el.shadowRoot.querySelectorAll("c-pipeline-segmented").length).toBe(
      2
    );
  });

  it("turns Yes solid green only where asked (the phone), and leaves the other screens as they were", async () => {
    const el = await make();
    const slider = () => el.shadowRoot.querySelector("c-pipeline-segmented");
    expect(slider().options[1].tone).toBeUndefined();
    el.yesTone = "good";
    await flush();
    expect(slider().options[1].tone).toBe("good");
    expect(slider().options[0].tone).toBeUndefined(); // No stays in the ordinary blue
  });

  it("puts the deal in a campaign when the slider says Yes, and saves at once", async () => {
    setLink.mockResolvedValue(undefined);
    const el = await make();
    const changed = [];
    el.addEventListener("campaignschanged", (e) =>
      changed.push(e.detail.linkedCount)
    );
    el.shadowRoot
      .querySelector('c-pipeline-segmented[data-id="a1"]')
      .dispatchEvent(new CustomEvent("change", { detail: { value: "yes" } }));
    await flush();
    expect(setLink).toHaveBeenCalledWith({
      dealId: "d1",
      campaignId: "a1",
      linked: true
    });
    expect(changed).toEqual([2]);
  });

  it("says plainly when the deal has no Primary HCP", async () => {
    const el = await make({
      hasHcp: false,
      offered: []
    });
    expect(text(el)).toContain("no Primary HCP yet");
  });

  it("shows the problem and reads again when saving fails", async () => {
    setLink.mockRejectedValue({
      body: {
        message: "You cannot change the campaigns of a deal you cannot edit."
      }
    });
    const el = await make();
    el.shadowRoot
      .querySelector('c-pipeline-segmented[data-id="a1"]')
      .dispatchEvent(new CustomEvent("change", { detail: { value: "yes" } }));
    await flush();
    await flush();
    expect(text(el)).toContain("cannot edit");
    expect(getDealCampaigns).toHaveBeenCalledTimes(2);
  });
});
