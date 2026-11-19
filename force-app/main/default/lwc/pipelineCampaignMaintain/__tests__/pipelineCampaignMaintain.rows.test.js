import { createElement } from "lwc";
import PipelineCampaignMaintain from "c/pipelineCampaignMaintain";
import maintainDeals from "@salesforce/apex/PipelineCampaignController.maintainDeals";

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
const MEMBERS = Array.from({ length: 40 }, (_, i) => ({
  memberId: "m" + i,
  accountId: "a" + i,
  name: "Surgeon " + i,
  ratings: [
    {
      portfolio: "Extremities",
      area: "Extremities",
      rating: i % 2 ? "GOLD" : null
    }
  ]
}));
const deal = (id, a, x = {}) => ({
  id,
  accountId: a,
  name: "D" + id,
  kind: "opp",
  brand: "B",
  stage: "Plan",
  value: 1,
  currencyCode: "AUD",
  ownerName: "O",
  inCampaign: false,
  canEdit: true,
  ...x
});
const OPEN = [
  deal("o1", "a3"),
  deal("o2", "a10"),
  deal("o3", "a11", { inCampaign: true }),
  deal("o4", "a30")
];
const ALL = [
  ...OPEN,
  deal("c1", "a3", { stage: "Closed Won" }),
  deal("c2", "a5", { stage: "Closed Lost" }),
  deal("c3", "a20", { stage: "Closed Won" }),
  deal("c4", "a39", { stage: "Closed Won" })
];

function check(el, withClosed) {
  const rows = [...el.shadowRoot.querySelectorAll("tbody > tr")];
  const bad = [];
  let cur = null;
  const groups = [];
  rows.forEach((r) => {
    if (r.classList.contains("sg")) {
      cur = { head: r.textContent.replace(/\s+/g, " "), dl: 0 };
      groups.push(cur);
    } else if (r.classList.contains("dl")) cur.dl++;
    else bad.push("unexpected row: " + r.className);
  });
  groups.forEach((g) => {
    if (g.dl === 0 && !/no (open )?Extremities deals/.test(g.head))
      bad.push("no count: " + g.head);
    const hasOpen = / open /.test(g.head) || /no open/.test(g.head);
    if (withClosed && hasOpen) bad.push("stale 'open': " + g.head);
    if (!withClosed && !hasOpen) bad.push("stale closed wording: " + g.head);
  });
  return { n: groups.length, bad };
}

/* Regression (Robert, 2026-11-19): switching Include Closed off and on left lines missing under many surgeons and the
   wording stale, because rows came and went inside groups. The table is now one flat keyed list; this keeps it that way. */
describe("c-pipeline-campaign-maintain rows", () => {
  it("keeps every surgeon's lines right when Include Closed is switched on and off, slowly and fast", async () => {
    maintainDeals.mockImplementation(({ includeClosed }) =>
      Promise.resolve(includeClosed ? ALL : OPEN)
    );
    const el = createElement("c-pipeline-campaign-maintain", {
      is: PipelineCampaignMaintain
    });
    Object.assign(el, {
      campaign: { id: "c1", active: true, portfolios: ["Extremities"] },
      members: MEMBERS,
      types: { opp: true, risk: false }
    });
    document.body.appendChild(el);
    await flush();
    let r = check(el, false);
    expect(r.bad).toEqual([]);
    for (let i = 0; i < 6; i++) {
      el.includeClosed = i % 2 === 0;
      // eslint-disable-next-line no-await-in-loop
      await flush();
      r = check(el, i % 2 === 0);
      expect({ i, bad: r.bad }).toEqual({ i, bad: [] });
    }
    // rapid toggles without waiting
    el.includeClosed = true;
    el.includeClosed = false;
    el.includeClosed = true;
    await flush(20);
    expect(check(el, true).bad).toEqual([]);
  });
});
