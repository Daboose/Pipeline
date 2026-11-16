import { createElement } from "lwc";
import PipelineCampaignMaintain from "c/pipelineCampaignMaintain";
import maintainDeals from "@salesforce/apex/PipelineCampaignController.maintainDeals";
import setLink from "@salesforce/apex/PipelineDealCampaignController.setLink";

jest.mock(
  "@salesforce/apex/PipelineCampaignController.maintainDeals",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/PipelineDealCampaignController.setLink",
  () => ({ default: jest.fn() }),
  { virtual: true }
);

// eslint-disable-next-line @lwc/lwc/no-async-operation
const flush = (ms = 0) => new Promise((r) => setTimeout(r, ms));

const MEMBERS = [
  {
    memberId: "m1",
    accountId: "a1",
    name: "Andrew McBride",
    hospitals: "PRINCESS ALEXANDRA",
    ratings: [{ portfolio: "Knee", area: "Knee", rating: "GOLD" }]
  },
  {
    memberId: "m2",
    accountId: "a2",
    name: "Carla Mendes",
    hospitals: "ST VINCENT'S",
    ratings: [{ portfolio: "Knee", area: "Knee", rating: null }]
  }
];
const deal = (id, accountId, extra = {}) => ({
  id,
  accountId,
  name: "Deal " + id,
  kind: "opp",
  brand: "Persona",
  stage: "Plan",
  value: 120000,
  currencyCode: "AUD",
  ownerName: "Alex Morgan",
  inCampaign: false,
  canEdit: true,
  ...extra
});
const CAMPAIGN = { id: "c1", active: true, portfolios: ["Knee"] };

function make(props) {
  const el = createElement("c-pipeline-campaign-maintain", {
    is: PipelineCampaignMaintain
  });
  Object.assign(
    el,
    { campaign: CAMPAIGN, members: MEMBERS, types: { opp: true, risk: false } },
    props
  );
  document.body.appendChild(el);
  return el;
}
const q = (el, sel) => el.shadowRoot.querySelector(sel);
const qa = (el, sel) => [...el.shadowRoot.querySelectorAll(sel)];

describe("c-pipeline-campaign-maintain", () => {
  beforeEach(() => {
    maintainDeals.mockReset();
    setLink.mockReset();
    setLink.mockResolvedValue();
    maintainDeals.mockResolvedValue([
      deal("d1", "a1"),
      deal("d2", "a1", { inCampaign: true, ownerName: "Kim Nguyen" }),
      deal("d3", "a1", { kind: "risk", name: "Risk d3" })
    ]);
  });
  afterEach(() => {
    while (document.body.firstChild)
      document.body.removeChild(document.body.firstChild);
  });

  it("lists each surgeon with their open Knee deals and a count, opportunities only to begin with", async () => {
    const el = make();
    await flush();
    const heads = qa(el, "tr.sg").map((r) =>
      r.textContent.replace(/\s+/g, " ")
    );
    expect(heads[0]).toContain("Andrew McBride");
    expect(heads[0]).toContain("Gold");
    expect(heads[0]).toContain("2 open Knee deals · 1 in the campaign");
    expect(heads[1]).toContain("no open Knee deals");
    expect(qa(el, "tr.dl").length).toBe(2); // the risk is not listed
    expect(q(el, "tr.none").textContent).toContain("Nothing to add");
    expect(q(el, "tr.dl.in .inpill")).not.toBeNull();
    expect(q(el, "tr.dl.in .rb.rem")).not.toBeNull();
    expect(q(el, "tr.dl:not(.in) .rb.add")).not.toBeNull();
  });

  it("lists risks when they are ticked, tagged RISK, and only risks when opportunities are not", async () => {
    const el = make({ types: { opp: true, risk: true } });
    await flush();
    expect(qa(el, "tr.dl").length).toBe(3);
    expect(q(el, ".kind").textContent).toBe("RISK");
    el.types = { opp: false, risk: true };
    await flush();
    expect(qa(el, "tr.dl").length).toBe(1);
    expect(qa(el, "tr.sg")[0].textContent).toContain("1 open Knee risk ");
    el.types = { opp: false, risk: false };
    await flush();
    expect(q(el, ".empty").textContent).toContain(
      "Tick Opportunities or Risks"
    );
  });

  it("puts a deal in the campaign with a +, saves at once and tells the screen", async () => {
    const el = make();
    const handler = jest.fn();
    el.addEventListener("dealchange", handler);
    await flush();
    q(el, "tr.dl:not(.in) .rb.add").click();
    await flush();
    expect(setLink).toHaveBeenCalledWith({
      dealId: "d1",
      campaignId: "c1",
      linked: true
    });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].detail).toEqual({
      dealId: "d1",
      linked: true
    });
    expect(qa(el, "tr.dl.in").length).toBe(2);
    expect(q(el, ".toast").textContent).toContain("Added to the campaign");
  });

  it("takes a deal out with a minus", async () => {
    const el = make();
    await flush();
    q(el, "tr.dl.in .rb.rem").click();
    await flush();
    expect(setLink).toHaveBeenCalledWith({
      dealId: "d2",
      campaignId: "c1",
      linked: false
    });
    expect(qa(el, "tr.dl.in").length).toBe(0);
  });

  it("greys the button of a deal the person cannot edit, and cannot add to an inactive campaign", async () => {
    maintainDeals.mockResolvedValue([
      deal("d1", "a1", { canEdit: false }),
      deal("d2", "a1"),
      deal("d3", "a1", { inCampaign: true })
    ]);
    const el = make({ campaign: { ...CAMPAIGN, active: false } });
    await flush();
    const buttons = qa(el, "tr.dl .rb");
    expect(buttons[0].disabled).toBe(true); // cannot edit
    expect(qa(el, "tr.dl.lock .lockn")[0].textContent).toBe("cannot edit");
    expect(buttons[1].disabled).toBe(true); // inactive: cannot be put in
    expect(buttons[2].disabled).toBe(false); // but can be taken out
    expect(q(el, ".note").textContent).toContain("not active");
  });

  it("shows the reason when a change is refused, and reads the deals again", async () => {
    setLink.mockRejectedValue({
      body: {
        message: "You cannot change the campaigns of a deal you cannot edit."
      }
    });
    const el = make();
    await flush();
    maintainDeals.mockClear();
    q(el, "tr.dl:not(.in) .rb.add").click();
    await flush();
    expect(q(el, ".err").textContent).toContain("cannot edit");
    expect(maintainDeals).toHaveBeenCalledTimes(1);
    expect(qa(el, "tr.dl.in").length).toBe(1);
  });
});
