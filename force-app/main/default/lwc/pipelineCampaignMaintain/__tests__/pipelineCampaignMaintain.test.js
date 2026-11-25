import { createElement } from "lwc";
import PipelineCampaignMaintain from "c/pipelineCampaignMaintain";
import maintainDeals from "@salesforce/apex/PipelineCampaignController.maintainDeals";
import setLink from "@salesforce/apex/PipelineDealCampaignController.setLink";
import removeMemberAndDeals from "@salesforce/apex/PipelineCampaignController.removeMemberAndDeals";

jest.mock(
  "@salesforce/apex/PipelineCampaignController.maintainDeals",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/PipelineCampaignController.removeMemberAndDeals",
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
    {
      campaign: CAMPAIGN,
      members: MEMBERS,
      types: { opp: true, risk: false, rosa: true }
    },
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
    removeMemberAndDeals.mockReset();
    removeMemberAndDeals.mockResolvedValue(1);
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
    expect(heads[0]).not.toContain("PRINCESS ALEXANDRA"); // the hospitals are not shown beside the name
    expect(heads[0]).toContain("2 open Knee deals · 1 in the campaign");
    expect(heads[1]).toContain("no open Knee deals");
    expect(qa(el, "tr.dl").length).toBe(2); // the risk is not listed
    expect(q(el, "tr.none")).toBeNull(); // no second line for a surgeon with nothing to add; the count at the right says so
    expect(q(el, "tr.dl.in .inpill")).not.toBeNull();
    expect(q(el, "tr.dl.in .rb.rem")).not.toBeNull();
    expect(q(el, "tr.dl:not(.in) .rb.add")).not.toBeNull();
  });

  it("lists risks when they are ticked, each deal's Type in plain words, and only risks when opportunities are not", async () => {
    const el = make({ types: { opp: true, risk: true, rosa: true } });
    await flush();
    expect(qa(el, "tr.dl").length).toBe(3);
    expect(q(el, ".kind")).toBeNull(); // the small RISK tag is gone: the Type column says it
    const types = () =>
      qa(el, "tr.dl").map(
        (r) => r.querySelector("td:nth-child(2)").textContent
      );
    expect(types()).toEqual(["Opportunity", "Opportunity", "Risk"]);
    el.types = { opp: false, risk: true, rosa: true };
    await flush();
    expect(qa(el, "tr.dl").length).toBe(1);
    expect(qa(el, "tr.sg")[0].textContent).toContain("1 open Knee risk ");
    el.types = { opp: false, risk: false, rosa: false };
    await flush();
    expect(q(el, ".empty").textContent).toContain(
      "Tick Opportunities, Risks or ROSA"
    );
  });

  it("asks for open deals only to begin with, and for closed ones too when Include Closed is on, which reads the deals again", async () => {
    const el = make();
    await flush();
    expect(maintainDeals).toHaveBeenLastCalledWith({
      campaignId: "c1",
      includeClosed: false
    });
    expect(qa(el, "tr.sg")[0].textContent).toContain("open Knee deals");
    maintainDeals.mockResolvedValue([
      deal("d1", "a1"),
      deal("d4", "a1", { stage: "Closed Won" })
    ]);
    el.includeClosed = true;
    await flush();
    expect(maintainDeals).toHaveBeenLastCalledWith({
      campaignId: "c1",
      includeClosed: true
    });
    expect(qa(el, "tr.dl").length).toBe(2);
    const head = qa(el, "tr.sg")[0].textContent.replace(/\s+/g, " ");
    expect(head).toContain("2 Knee deals");
    expect(head).not.toContain("open");
    expect(qa(el, "tr.dl")[1].textContent).toContain("Closed Won");
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

  it("shows each deal's value in US dollars when USD is on and the rates are given, and in its own currency otherwise", async () => {
    const el = make({ types: { opp: true, risk: false, rosa: true } });
    await flush();
    const first = () => q(el, "tr.dl td:nth-child(4)").textContent.trim();
    expect(first()).toBe("A$120k");
    el.rates = { rates: { USD: 1, AUD: 1.5 } };
    el.usd = true;
    await flush();
    expect(first()).toBe("US$80k"); // 120,000 AUD at 1.5 is 80,000 USD
    el.usd = false;
    await flush();
    expect(first()).toBe("A$120k");
  });

  it("puts a round minus before each surgeon's name; it asks 'Are you sure?', Cancel changes nothing, Proceed takes the surgeon out and tells the screen", async () => {
    const el = make();
    await flush();
    const minuses = qa(el, "tr.sg button.rb.rem");
    expect(minuses).toHaveLength(2);
    // the minus comes before the name on the surgeon's line
    const cell = q(el, "tr.sg .sgcell");
    expect(cell.firstElementChild.classList.contains("rb")).toBe(true);
    const seen = jest.fn();
    el.addEventListener("memberchange", seen);

    minuses[0].click();
    await flush(60);
    expect(q(el, ".ask p").textContent).toBe(
      "Are you sure you want to remove this surgeon from the campaign?"
    );
    expect(qa(el, ".ask .btn").map((b) => b.textContent.trim())).toEqual([
      "Cancel",
      "Proceed"
    ]);
    expect(q(el, ".scrim").classList.contains("on")).toBe(true);
    qa(el, ".ask .btn")[0].click();
    await flush(500);
    expect(q(el, ".ask")).toBeNull();
    expect(removeMemberAndDeals).not.toHaveBeenCalled();

    minuses[1].click();
    await flush(60);
    qa(el, ".ask .btn")[1].click();
    await flush(500);
    expect(removeMemberAndDeals).toHaveBeenCalledWith({ memberId: "m2" });
    expect(seen).toHaveBeenCalledTimes(1);
    expect(seen.mock.calls[0][0].detail.memberId).toBe("m2");
    expect(q(el, ".toast").textContent).toContain("Carla Mendes");
  });

  it("shows the reason when a surgeon cannot be taken out", async () => {
    removeMemberAndDeals.mockRejectedValue({ body: { message: "No access" } });
    const el = make();
    await flush();
    qa(el, "tr.sg button.rb.rem")[0].click();
    await flush(60);
    qa(el, ".ask .btn")[1].click();
    await flush(500);
    expect(q(el, ".err").textContent).toBe("No access");
  });

  it("gives the surgeon's line and a deal's line the same height", () => {
    const css = require("fs").readFileSync(
      require("path").join(__dirname, "../pipelineCampaignMaintain.css"),
      "utf8"
    );
    expect(css).toMatch(/tr\.dl td,\s*tr\.sg td\s*\{\s*height: 54px;/);
  });

  it("reads the deals again when a surgeon is added to or taken out of the list, so a surgeon added just now shows their deals at once", async () => {
    const el = make();
    await flush();
    expect(maintainDeals).toHaveBeenCalledTimes(1);
    // the same surgeons (a re-read of the campaign): no new read
    el.members = MEMBERS.map((m) => ({ ...m }));
    await flush();
    expect(maintainDeals).toHaveBeenCalledTimes(1);
    // a surgeon added
    el.members = [
      ...MEMBERS,
      { memberId: "m3", accountId: "a3", name: "Astrid A", ratings: [] }
    ];
    await flush();
    expect(maintainDeals).toHaveBeenCalledTimes(2);
    // a surgeon taken out
    el.members = MEMBERS;
    await flush();
    expect(maintainDeals).toHaveBeenCalledTimes(3);
  });

  it("lists a healthcare facility with a FACILITY chip and its ROSA deals (brand is the ROSA deal type, the physician a small line), always, and asks about a facility in its own words", async () => {
    maintainDeals.mockResolvedValue([
      deal("d1", "a1"),
      deal("r1", "f1", {
        kind: "rosa",
        name: "Royal Southern ROSA",
        brand: "ROSA Knee",
        physician: "Dr Elena Voss",
        value: 690000
      })
    ]);
    const members = [
      ...MEMBERS,
      {
        memberId: "m3",
        accountId: "f1",
        name: "Royal Southern Hospital",
        isFacility: true,
        ratings: []
      }
    ];
    const el = make({ members });
    await flush();
    const heads = qa(el, "tr.sg");
    expect(heads).toHaveLength(3);
    expect(heads[2].textContent).toContain("Royal Southern Hospital");
    expect(heads[2].textContent).toContain("Facility");
    expect(heads[2].textContent).toContain(
      "1 open ROSA deal · 0 in the campaign"
    );
    expect(heads[0].querySelector(".fac")).toBeNull(); // a surgeon has no chip
    const rows = qa(el, "tr.dl");
    const rosa = rows[rows.length - 1];
    expect(rosa.textContent).toContain("Royal Southern ROSA");
    expect(rosa.textContent).toContain("ROSA Knee");
    expect(rosa.textContent).toContain("Physician: Dr Elena Voss");
    // the facility's minus asks about a facility
    heads[2].querySelector("button.rb.rem").click();
    await flush(40);
    expect(q(el, ".ask p").textContent).toContain("remove this facility");
  });

  it("with only ROSA ticked lists just the facilities and their ROSA deals; with ROSA unticked a facility is not listed", async () => {
    maintainDeals.mockResolvedValue([deal("r1", "f1", { kind: "rosa" })]);
    const members = [
      { memberId: "m1", accountId: "a1", name: "Dr A", ratings: [] },
      {
        memberId: "m3",
        accountId: "f1",
        name: "Royal Southern Hospital",
        isFacility: true,
        ratings: []
      }
    ];
    const el = make({
      members,
      types: { opp: false, risk: false, rosa: true }
    });
    await flush();
    expect(qa(el, "tr.sg")).toHaveLength(1);
    expect(qa(el, "tr.sg")[0].textContent).toContain("Royal Southern Hospital");
    expect(qa(el, "tr.dl")).toHaveLength(1);
    expect(qa(el, "tr.dl")[0].textContent).toContain("ROSA");
    el.types = { opp: true, risk: false, rosa: false };
    await flush();
    expect(qa(el, "tr.sg")).toHaveLength(1);
    expect(qa(el, "tr.sg")[0].textContent).toContain("Dr A");
  });
});
