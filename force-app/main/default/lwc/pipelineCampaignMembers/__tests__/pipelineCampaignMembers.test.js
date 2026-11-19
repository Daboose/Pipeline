import { createElement } from "lwc";
import PipelineCampaignMembers from "c/pipelineCampaignMembers";
import currencyRates from "@salesforce/apex/PipelineCampaignController.currencyRates";

jest.mock(
  "@salesforce/apex/PipelineCampaignController.currencyRates",
  () => ({ default: jest.fn() }),
  { virtual: true }
);

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
    expect(el.shadowRoot.querySelector(".rplate.Gold").textContent).toBe(
      "Gold"
    );
    expect(el.shadowRoot.querySelector(".rplate.none").textContent).toBe(
      "Not rated"
    );
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

  it("has no Mode switch where Maintain is not offered (Campaign Management)", async () => {
    const el = make();
    await flush();
    expect(el.shadowRoot.querySelector(".modeseg")).toBeNull();
    expect(el.shadowRoot.querySelector(".tychips")).toBeNull();
  });

  it("offers Report and Maintain in Pipeline; Maintain hands the surgeons to the maintain list, with Opportunities ticked and Risks not, and takes the Show filter and the columns cog away", async () => {
    const el = make({ maintainable: true });
    await flush();
    const mode = el.shadowRoot.querySelector("c-pipeline-segmented.modeseg");
    expect(mode.options.map((o) => o.value)).toEqual(["report", "maintain"]);
    expect(mode.value).toBe("report");
    expect(el.shadowRoot.querySelector(".tychips")).toBeNull();
    expect(
      el.shadowRoot.querySelector("c-pipeline-campaign-maintain")
    ).toBeNull();
    expect(
      el.shadowRoot.querySelector("c-pipeline-segmented.showseg")
    ).not.toBeNull();
    mode.dispatchEvent(
      new CustomEvent("change", { detail: { value: "maintain" } })
    );
    await flush();
    const kids = el.shadowRoot.querySelectorAll(".kchip");
    expect([...kids].map((k) => k.textContent.trim())).toEqual([
      "Opportunities",
      "Risks",
      "Include Closed"
    ]);
    expect(kids[2].classList.contains("on")).toBe(false);
    expect(kids[0].classList.contains("on")).toBe(true);
    expect(kids[1].classList.contains("on")).toBe(false);
    const maintain = el.shadowRoot.querySelector(
      "c-pipeline-campaign-maintain"
    );
    expect(maintain).not.toBeNull();
    expect(maintain.types).toEqual({ opp: true, risk: false });
    expect(maintain.members.map((m) => m.name)).toEqual([
      "Dr Mei Tan",
      "Dr Priya Nair"
    ]);
    expect(
      el.shadowRoot.querySelector("c-pipeline-segmented.showseg")
    ).toBeNull();
    expect(el.shadowRoot.querySelector("button.cog")).toBeNull();
    // ticking Risks passes it on; a change made in the list is announced to the screen
    kids[1].click();
    await flush();
    expect(
      el.shadowRoot.querySelector("c-pipeline-campaign-maintain").types
    ).toEqual({
      opp: true,
      risk: true
    });
    // ticking Include Closed passes that on too
    expect(
      el.shadowRoot.querySelector("c-pipeline-campaign-maintain").includeClosed
    ).toBe(false);
    kids[2].click();
    await flush();
    expect(
      el.shadowRoot.querySelector("c-pipeline-campaign-maintain").includeClosed
    ).toBe(true);
    // the three chips follow every press, however many times they are pressed
    for (let i = 0; i < 4; i++) {
      kids[2].click();
      kids[0].click();
      kids[1].click();
      // eslint-disable-next-line no-await-in-loop
      await flush();
      const now = [...el.shadowRoot.querySelectorAll(".kchip")].map((k) =>
        k.classList.contains("on")
      );
      const ticks = [...el.shadowRoot.querySelectorAll(".kchip > span")].map(
        (t) => t.classList.contains("ktick")
      );
      expect(ticks).toEqual(now);
    }
    const handler = jest.fn();
    el.addEventListener("campaigndealchange", handler);
    maintain.dispatchEvent(
      new CustomEvent("dealchange", { detail: { dealId: "d1", linked: true } })
    );
    expect(handler).toHaveBeenCalledTimes(1);
    // back to Report: the list as it was
    mode.dispatchEvent(
      new CustomEvent("change", { detail: { value: "report" } })
    );
    await flush();
    expect(
      el.shadowRoot.querySelector("c-pipeline-campaign-maintain")
    ).toBeNull();
    expect(heads(el)).toContain("Current Hospitals");
  });

  it("keeps the fifth Value / year tile in Campaign Management and gives Pipeline a value row of its own", async () => {
    let el = make();
    await flush();
    expect(el.shadowRoot.querySelectorAll(".tile").length).toBe(5);
    expect(el.shadowRoot.querySelector(".vrow")).toBeNull();
    document.body.removeChild(el);
    el = make({ valueRow: true });
    await flush();
    expect(el.shadowRoot.querySelectorAll(".tile").length).toBe(4);
    expect(el.shadowRoot.querySelector(".vrow")).not.toBeNull();
  });

  it("splits the value by the surgeon's rating, per currency, and the five rating chips add up to the total", async () => {
    const el = make({ valueRow: true });
    await flush();
    const chips = [...el.shadowRoot.querySelectorAll(".vchip")].map((c) =>
      c.textContent.replace(/\s+/g, " ").trim()
    );
    expect(chips.length).toBe(6);
    expect(chips[0]).toContain("Value / year");
    expect(chips[0]).toContain("S$190k");
    // Dr Mei Tan has a Hip deal (95,000 SGD) and a Knee deal (no Knee rating): Hip is Gold, Knee is not rated
    expect(chips[2]).toContain("Gold");
    expect(chips[2]).toContain("S$95k");
    expect(chips[5]).toContain("Not rated");
    expect(chips[5]).toContain("S$95k");
    // the five rating chips use the same small plates as the lists, Not rated as the flat black one
    const plates = [...el.shadowRoot.querySelectorAll(".vl .rplate")].map(
      (p) => p.className
    );
    expect(plates).toEqual([
      "rplate Platinum",
      "rplate Gold",
      "rplate Silver",
      "rplate Bronze",
      "rplate none"
    ]);
  });

  it("starts in local currencies, reads the Salesforce rates the first time USD is chosen, and shows one dollar amount", async () => {
    currencyRates.mockReset();
    currencyRates.mockResolvedValue({
      rates: { USD: 1, SGD: 2 },
      corporate: "USD",
      changed: "2026-11-17T01:00:00.000Z"
    });
    const el = make({ valueRow: true });
    await flush();
    const seg = el.shadowRoot.querySelector("c-pipeline-segmented.currencyseg");
    expect(seg.value).toBe("local");
    expect(seg.options.map((o) => o.label)).toEqual(["LOCAL", "USD"]);
    expect(currencyRates).not.toHaveBeenCalled();
    expect(el.shadowRoot.querySelector(".vnote")).toBeNull();
    seg.dispatchEvent(new CustomEvent("change", { detail: { value: "usd" } }));
    await flush();
    expect(currencyRates).toHaveBeenCalledTimes(1);
    const total = el.shadowRoot.querySelector(".vchip.tot .vv").textContent;
    expect(total).toContain("US$");
    // no explanatory line is added under the chips (Robert, 2026-11-17)
    expect(el.shadowRoot.querySelector(".vnote")).toBeNull();
    // back to local, and USD again does not read the rates a second time
    seg.dispatchEvent(
      new CustomEvent("change", { detail: { value: "local" } })
    );
    await flush();
    expect(
      el.shadowRoot.querySelector(".vchip.tot .vv").textContent
    ).not.toContain("US$");
    seg.dispatchEvent(new CustomEvent("change", { detail: { value: "usd" } }));
    await flush();
    expect(currencyRates).toHaveBeenCalledTimes(1);
  });

  it("stays in local currencies and says so when the rates cannot be read", async () => {
    currencyRates.mockReset();
    currencyRates.mockRejectedValue(new Error("no"));
    const el = make({ valueRow: true });
    await flush();
    el.shadowRoot
      .querySelector("c-pipeline-segmented.currencyseg")
      .dispatchEvent(new CustomEvent("change", { detail: { value: "usd" } }));
    await flush();
    expect(el.shadowRoot.querySelector(".vnote.bad").textContent).toContain(
      "could not be read"
    );
    expect(
      el.shadowRoot.querySelector(".vchip.tot .vv").textContent
    ).not.toContain("US$");
  });

  it("shows the Revenue / year column in US dollars when USD is chosen, and back in each deal's own currency on LOCAL", async () => {
    currencyRates.mockReset();
    currencyRates.mockResolvedValue({
      rates: { USD: 1, SGD: 2 },
      corporate: "USD",
      changed: "2026-11-17T01:00:00.000Z"
    });
    const el = make({ valueRow: true });
    await flush();
    const values = () =>
      [...el.shadowRoot.querySelectorAll("tbody td.num")].map((c) =>
        c.textContent.trim()
      );
    expect(values()).toEqual(["S$95k", "S$95k"]);
    const seg = el.shadowRoot.querySelector("c-pipeline-segmented.currencyseg");
    seg.dispatchEvent(new CustomEvent("change", { detail: { value: "usd" } }));
    await flush();
    expect(values()).toEqual(["US$48k", "US$48k"]); // SGD 95,000 at a rate of 2 is 47,500
    seg.dispatchEvent(
      new CustomEvent("change", { detail: { value: "local" } })
    );
    await flush();
    expect(values()).toEqual(["S$95k", "S$95k"]);
  });

  it("hands the USD choice and the rates to the Maintain list", async () => {
    currencyRates.mockReset();
    currencyRates.mockResolvedValue({
      rates: { USD: 1, SGD: 2 },
      corporate: "USD"
    });
    const el = make({ valueRow: true, maintainable: true });
    await flush();
    el.shadowRoot
      .querySelector("c-pipeline-segmented.modeseg")
      .dispatchEvent(
        new CustomEvent("change", { detail: { value: "maintain" } })
      );
    await flush();
    let list = el.shadowRoot.querySelector("c-pipeline-campaign-maintain");
    expect(list.usd).toBe(false);
    el.shadowRoot
      .querySelector("c-pipeline-segmented.currencyseg")
      .dispatchEvent(new CustomEvent("change", { detail: { value: "usd" } }));
    await flush();
    list = el.shadowRoot.querySelector("c-pipeline-campaign-maintain");
    expect(list.usd).toBe(true);
    expect(list.rates.rates.SGD).toBe(2);
  });

  it("opens in the currency the person last chose (US dollars), reading the rates itself, and announces a flick of the switch so it can be remembered", async () => {
    currencyRates.mockReset();
    currencyRates.mockResolvedValue({
      rates: { USD: 1, SGD: 2 },
      corporate: "USD"
    });
    const el = make({ valueRow: true, currency: "usd" });
    const handler = jest.fn();
    el.addEventListener("currencychange", handler);
    await flush();
    expect(currencyRates).toHaveBeenCalledTimes(1);
    expect(
      el.shadowRoot.querySelector("c-pipeline-segmented.currencyseg").value
    ).toBe("usd");
    expect(el.shadowRoot.querySelector(".vchip.tot .vv").textContent).toContain(
      "US$"
    );
    expect(handler).not.toHaveBeenCalled(); // opening in USD is not a flick
    el.shadowRoot
      .querySelector("c-pipeline-segmented.currencyseg")
      .dispatchEvent(new CustomEvent("change", { detail: { value: "local" } }));
    await flush();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].detail.value).toBe("local");
    expect(el.currency).toBe("local");
  });

  it("does not announce USD when the rates could not be read", async () => {
    currencyRates.mockReset();
    currencyRates.mockRejectedValue(new Error("no"));
    const el = make({ valueRow: true });
    const handler = jest.fn();
    el.addEventListener("currencychange", handler);
    await flush();
    el.shadowRoot
      .querySelector("c-pipeline-segmented.currencyseg")
      .dispatchEvent(new CustomEvent("change", { detail: { value: "usd" } }));
    await flush();
    expect(handler).not.toHaveBeenCalled();
  });
  it("opens a deal from its own line when the list is openable: each deal line is highlighted, the click names the deal and every deal listed, in the order listed", async () => {
    const el = make({ dealsOpenable: true });
    await flush();
    const lines = el.shadowRoot.querySelectorAll("tr.dealrow");
    expect(lines.length).toBe(2); // Mei Tan's two deals; Priya Nair has no deal yet
    expect(
      [...el.shadowRoot.querySelectorAll("tbody tr")].filter(
        (r) => !r.classList.contains("dealrow")
      ).length
    ).toBe(1); // the surgeon with no deal yet is not clickable
    const handler = jest.fn();
    el.addEventListener("dealopen", handler);
    lines[1].click(); // the second line: the older deal
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].detail).toEqual({
      id: "d1",
      ids: ["d2", "d1"]
    });
    lines[0].click();
    expect(handler.mock.calls[1][0].detail.id).toBe("d2");
    el.shadowRoot.querySelectorAll("tbody tr")[2].click(); // no deal yet
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("opens the deal on its Surgeon Usages screen when a surgeon's rating plate is pressed, and the surgeon alone when there is no deal yet (Pipeline only)", async () => {
    const el = make({ dealsOpenable: true });
    await flush();
    const dealHandler = jest.fn();
    const surgeonHandler = jest.fn();
    el.addEventListener("dealopen", dealHandler);
    el.addEventListener("surgeonopen", surgeonHandler);
    const plates = [...el.shadowRoot.querySelectorAll("button.rplate")];
    // Mei Tan has deals: her Hip plate (Gold) opens her newest deal on usages, the line's own click does not fire as well
    plates.find((p) => p.textContent.trim() === "Gold").click();
    expect(dealHandler).toHaveBeenCalledTimes(1);
    expect(dealHandler.mock.calls[0][0].detail).toEqual({
      id: "d2",
      ids: ["d2", "d1"],
      screen: "usages"
    });
    // Mei Tan's unrated Knee plate does the same
    plates.find((p) => p.textContent.trim() === "Not rated").click();
    expect(dealHandler).toHaveBeenCalledTimes(2);
    // Priya Nair has no deal yet: the plate names the surgeon instead
    plates.find((p) => p.textContent.trim() === "Silver").click();
    expect(dealHandler).toHaveBeenCalledTimes(2);
    expect(surgeonHandler).toHaveBeenCalledTimes(1);
    expect(surgeonHandler.mock.calls[0][0].detail).toEqual({
      accountId: "a2",
      name: "Dr Priya Nair",
      screen: "usages"
    });
  });

  it("opens the surgeon's New Deal screen when No deal yet is pressed (Pipeline only), and leaves it as plain words otherwise", async () => {
    const el = make({ dealsOpenable: true });
    await flush();
    const handler = jest.fn();
    el.addEventListener("surgeonopen", handler);
    const press = el.shadowRoot.querySelector("button.nodeal");
    expect(press.textContent.trim()).toBe("No deal yet");
    press.click();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].detail).toEqual({
      accountId: "a2",
      name: "Dr Priya Nair",
      screen: "new"
    });
    const plain = make();
    await flush();
    expect(plain.shadowRoot.querySelector("button.nodeal")).toBeNull();
    expect(plain.shadowRoot.querySelector("span.nodeal")).not.toBeNull();
  });

  it("draws the plates as plain plates, not buttons, when the list is not openable (Campaign Management)", async () => {
    const el = make();
    await flush();
    expect(el.shadowRoot.querySelectorAll("button.rplate").length).toBe(0);
    expect(
      el.shadowRoot.querySelectorAll("span.rplate").length
    ).toBeGreaterThan(0);
  });

  it("takes the columns turned off from the host and reports every change, so Pipeline can keep them in the person's settings", async () => {
    const el = make({ hiddenColumns: ["hospitals"] });
    await flush();
    const headText = () =>
      [...el.shadowRoot.querySelectorAll("th")].map((h) => h.textContent);
    expect(headText().join(" ")).not.toContain("Current Hospitals");
    expect(headText().join(" ")).toContain("Country");
    const handler = jest.fn();
    el.addEventListener("columnschange", handler);
    // turn Country off through the Columns picker (the cog in the table's corner)
    el.shadowRoot.querySelector("button.cog").click();
    await flush();
    const box = [...el.shadowRoot.querySelectorAll(".picker input")].find(
      (i) => i.dataset.id === "place"
    );
    box.checked = false;
    box.dispatchEvent(new CustomEvent("change"));
    await flush();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].detail.hidden).toEqual([
      "hospitals",
      "place"
    ]);
  });

  it("makes each surgeon's name a link to their Account record that opens in a new tab, without opening the deal", async () => {
    const el = make({ dealsOpenable: true });
    await flush();
    const links = [...el.shadowRoot.querySelectorAll("a.slink")];
    expect(links.map((a) => a.textContent.trim())).toEqual([
      "Dr Mei Tan",
      "Dr Priya Nair"
    ]);
    expect(links[0].getAttribute("href")).toBe("/lightning/r/Account/a1/view");
    expect(links[0].getAttribute("target")).toBe("_blank");
    expect(links[0].getAttribute("rel")).toContain("noopener");
    // pressing the link does not also open the deal on the line
    const handler = jest.fn();
    el.addEventListener("dealopen", handler);
    links[0].addEventListener("click", (e) => e.preventDefault());
    links[0].click();
    expect(handler).not.toHaveBeenCalled();
  });

  it("steps through only what is listed: a search narrows the ids", async () => {
    const el = make({ dealsOpenable: true });
    await flush();
    const handler = jest.fn();
    el.addEventListener("dealopen", handler);
    const box = el.shadowRoot.querySelector("input.fin");
    box.value = "Priya";
    box.dispatchEvent(new CustomEvent("input"));
    await flush();
    expect(el.shadowRoot.querySelectorAll("tr.dealrow").length).toBe(0);
    box.value = "Mei";
    box.dispatchEvent(new CustomEvent("input"));
    await flush();
    el.shadowRoot.querySelector("tr.dealrow").click();
    expect(handler.mock.calls[0][0].detail.ids).toEqual(["d2", "d1"]);
  });

  it("does nothing on a click when the list is not openable (Campaign Management)", async () => {
    const el = make();
    await flush();
    expect(el.shadowRoot.querySelectorAll("tr.dealrow").length).toBe(0);
    const handler = jest.fn();
    el.addEventListener("dealopen", handler);
    el.shadowRoot.querySelectorAll("tbody tr")[0].click();
    expect(handler).not.toHaveBeenCalled();
  });
});
