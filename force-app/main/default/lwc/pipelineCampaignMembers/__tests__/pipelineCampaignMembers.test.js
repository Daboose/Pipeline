import { createElement } from "lwc";
import PipelineCampaignMembers from "c/pipelineCampaignMembers";

// eslint-disable-next-line @lwc/lwc/no-async-operation
const flush = () => new Promise((r) => setTimeout(r, 0));
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
const deal = (extra = {}) => ({
  id: "d1",
  name: "000101",
  kind: "opp",
  portfolio: "Hip",
  stage: "Action",
  value: 95000,
  currencyCode: "SGD",
  quarter: "Q4 2026",
  ownerName: "Sam Okafor",
  lastPosted: daysAgo(5),
  lastStageChange: daysAgo(40),
  createdDate: daysAgo(100),
  isClosed: false,
  onHold: false,
  ...extra
});
const MEMBERS = [
  {
    memberId: "m1",
    accountId: "a1",
    name: "Dr Mei Tan",
    country: "SG",
    city: "Singapore",
    type: "Physician",
    hospitals: "Mount Elizabeth",
    y1Rep: "Pat Recon",
    y6Rep: "Sam Upper",
    ratings: [
      { portfolio: "Hip", rating: "GOLD" },
      { portfolio: "Knee", rating: null }
    ],
    deals: [
      deal(),
      deal({
        id: "d2",
        name: "000102",
        portfolio: "Knee",
        createdDate: daysAgo(10)
      })
    ]
  },
  {
    memberId: "m2",
    accountId: "a2",
    name: "Dr Priya Nair",
    country: "NZ",
    city: "Auckland",
    type: "Emerging Consultant",
    hospitals: "Mercy",
    ratings: [
      { portfolio: "Hip", rating: "SILVER" },
      { portfolio: "Knee", rating: "BRONZE" }
    ],
    deals: []
  }
];
const make = (props) => {
  const el = createElement("c-pipeline-campaign-members", {
    is: PipelineCampaignMembers
  });
  Object.assign(
    el,
    { campaign: { id: "c1", portfolios: ["Hip", "Knee"] }, members: MEMBERS },
    props
  );
  document.body.appendChild(el);
  return el;
};
const text = (el) => el.shadowRoot.textContent.replace(/\s+/g, " ");
const heads = (el) =>
  [...el.shadowRoot.querySelectorAll("th .lab2")].map((h) =>
    h.textContent.replace(/[▲▼]/g, "").trim()
  );

describe("c-pipeline-campaign-members", () => {
  afterEach(() => {
    while (document.body.firstChild)
      document.body.removeChild(document.body.firstChild);
    jest.clearAllMocks();
  });

  it("gives one rating column per portfolio, and a Portfolio column when the campaign covers several", async () => {
    const multi = make();
    await flush();
    expect(heads(multi)).toEqual([
      "Surgeon",
      "Current Hospitals",
      "Country · City",
      "Type",
      "Hip Rating",
      "Knee Rating",
      "Portfolio",
      "Stage",
      "Revenue / Year",
      "Close Quarter",
      "Last Posted",
      "Last Stage Move",
      "Sales Rep",
      "Y1 Recon Rep",
      "Y6 Extremities Rep"
    ]);
    const one = make({ campaign: { id: "c1", portfolios: ["Extremities"] } });
    await flush();
    expect(heads(one)).toContain("Rating");
    expect(heads(one)).not.toContain("Portfolio");
  });

  it("shows the tiles, the ratings as chips, and a second line for a second deal", async () => {
    const el = make();
    await flush();
    const t = text(el);
    expect(t).toContain("Surgeons");
    expect(el.shadowRoot.querySelectorAll(".tile")[0].textContent).toContain(
      "2"
    );
    expect(el.shadowRoot.querySelector(".rate.Gold").textContent).toBe("Gold");
    expect(t).toContain("Not rated");
    expect(el.shadowRoot.querySelectorAll("tr.deal2").length).toBe(1);
    expect(t).toContain("No deal yet");
  });

  it("shows the surgeon's Y1 Recon Rep and Y6 Extremities Rep as the last two columns", async () => {
    const el = make();
    await flush();
    const h = heads(el);
    expect(h.slice(-2)).toEqual(["Y1 Recon Rep", "Y6 Extremities Rep"]);
    const first = el.shadowRoot.querySelector("tbody tr");
    const cells = [...first.querySelectorAll("td")].map((c) =>
      c.textContent.trim()
    );
    expect(cells.slice(-2)).toEqual(["Pat Recon", "Sam Upper"]);
  });

  it("filters to surgeons with or without a deal and searches by name", async () => {
    const el = make();
    await flush();
    const seg = el.shadowRoot.querySelector("c-pipeline-segmented.showseg");
    seg.dispatchEvent(new CustomEvent("change", { detail: { value: "none" } }));
    await flush();
    expect(text(el)).toContain("Dr Priya Nair");
    expect(text(el)).not.toContain("Dr Mei Tan");
    seg.dispatchEvent(new CustomEvent("change", { detail: { value: "all" } }));
    const box = el.shadowRoot.querySelector("input.fin");
    box.value = "mei";
    box.dispatchEvent(new CustomEvent("input"));
    await flush();
    expect(text(el)).toContain("Dr Mei Tan");
    expect(text(el)).not.toContain("Dr Priya Nair");
  });

  it("shows tick boxes only for Campaign Management, and tells the screen what is ticked", async () => {
    const plain = make();
    await flush();
    expect(plain.shadowRoot.querySelector("input[type=checkbox]")).toBeNull();
    const el = make({ manage: true });
    const seen = [];
    el.addEventListener("selectionchange", (e) => seen.push(e.detail.ids));
    await flush();
    const all = el.shadowRoot.querySelector("th.tick input.selall");
    all.checked = true;
    all.dispatchEvent(new CustomEvent("change"));
    await flush();
    expect(el.selectedIds).toEqual(["m1", "m2"]);
    el.clearSelection();
    await flush();
    expect(el.selectedIds).toEqual([]);
    expect(seen[0]).toEqual(["m1", "m2"]);
  });

  it("lets the person turn columns off and on again with the Columns button, everything on to start with", async () => {
    window.localStorage.removeItem("pipelineCampaignMembersHidden");
    const el = make();
    await flush();
    expect(heads(el)).toContain("Current Hospitals");
    el.shadowRoot.querySelector("button.cog").click(); // the cog in the table's corner
    await flush();
    const labels = [...el.shadowRoot.querySelectorAll(".picker .pk")].map((l) =>
      l.textContent.trim()
    );
    expect(labels).not.toContain("Surgeon"); // the name always stays
    expect(labels).toContain("Current Hospitals");
    expect(labels).toContain("Knee Rating");
    const box = (label) =>
      [...el.shadowRoot.querySelectorAll(".picker .pk")]
        .find((l) => l.textContent.trim() === label)
        .querySelector("input");
    ["Current Hospitals", "Type", "Knee Rating", "Sales Rep"].forEach((l) => {
      const b = box(l);
      b.checked = false;
      b.dispatchEvent(new CustomEvent("change"));
    });
    await flush();
    expect(heads(el)).toEqual([
      "Surgeon",
      "Country · City",
      "Hip Rating",
      "Portfolio",
      "Stage",
      "Revenue / Year",
      "Close Quarter",
      "Last Posted",
      "Last Stage Move",
      "Y1 Recon Rep",
      "Y6 Extremities Rep"
    ]);
    // the rows follow: no hospital, no sales rep
    expect(text(el)).not.toContain("Mount Elizabeth");
    expect(text(el)).not.toContain("Sam Okafor");
    expect(
      window.localStorage.getItem("pipelineCampaignMembersHidden")
    ).toContain("type");
    [...el.shadowRoot.querySelectorAll(".picker .btn")]
      .find((b) => b.textContent.trim() === "Reset columns")
      .click();
    await flush();
    expect(heads(el)).toContain("Current Hospitals");
    expect(text(el)).toContain("Sam Okafor");
    window.localStorage.removeItem("pipelineCampaignMembersHidden");
  });
});
