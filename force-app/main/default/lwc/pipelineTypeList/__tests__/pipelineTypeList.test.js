import { createElement } from "lwc";
import PipelineTypeList from "c/pipelineTypeList";

const NOW = Date.now();
const daysAgo = (n) => new Date(NOW - n * 86400000).toISOString();
const deal = (id, owner, extra = {}) => ({
  id,
  kind: "opp",
  ownerId: owner,
  ownerName: owner,
  hcp: "Dr " + id,
  stage: "Plan",
  value: 1000,
  currencyCode: "AUD",
  isClosed: false,
  onHold: false,
  lastPosted: daysAgo(5),
  lastStageChange: daysAgo(5),
  createdDate: daysAgo(100),
  ...extra
});

function make(props) {
  const el = createElement("c-pipeline-type-list", { is: PipelineTypeList });
  Object.assign(el, props);
  document.body.appendChild(el);
  return el;
}
const rows = (el) => el.shadowRoot.querySelectorAll("tbody tr");

describe("c-pipeline-type-list", () => {
  afterEach(() => {
    while (document.body.firstChild)
      document.body.removeChild(document.body.firstChild);
  });

  it("puts the team member's name after the heading when filtered down to one person", async () => {
    const el = make({ kind: "opp", deals: [deal("1", "Ann")] });
    await Promise.resolve();
    expect(el.shadowRoot.querySelector(".lhead h3").textContent).toBe(
      "1 opportunity"
    );
    el.ownerName = "Michael Hewitt";
    await Promise.resolve();
    expect(el.shadowRoot.querySelector(".lhead h3").textContent).toBe(
      "1 opportunity for Michael Hewitt"
    );
    el.deals = [];
    el.kind = "rosa";
    await Promise.resolve();
    expect(el.shadowRoot.querySelector(".lhead h3").textContent).toBe(
      "0 ROSA deals for Michael Hewitt"
    );
  });

  it("groups by sales rep when there is more than one rep", async () => {
    const el = make({
      kind: "opp",
      deals: [deal("1", "Ann"), deal("2", "Bob")]
    });
    await Promise.resolve();
    expect(el.shadowRoot.querySelectorAll("td.repcell").length).toBe(2);
    expect(el.shadowRoot.querySelectorAll("tr.gfirst").length).toBe(2);
  });

  it("does not group a list that holds a single rep, but still shows the rep's name first on every row", async () => {
    const el = make({
      kind: "opp",
      deals: [deal("1", "Ann"), deal("2", "Ann")]
    });
    await Promise.resolve();
    expect(el.shadowRoot.querySelectorAll("td.repcell").length).toBe(0);
    expect(rows(el).length).toBe(2);
    expect(el.shadowRoot.querySelector("th").dataset.id).toBe("__rep");
    const names = [...el.shadowRoot.querySelectorAll("td.repplain")].map(
      (td) => td.textContent
    );
    expect(names).toEqual(["Ann", "Ann"]);
  });

  it("offers Sales rep first in the Columns picker, on by default, and switching it off removes the column and the grouping", async () => {
    const el = make({
      kind: "opp",
      deals: [deal("1", "Ann"), deal("2", "Bob")]
    });
    const handler = jest.fn();
    el.addEventListener("columnschange", handler);
    await Promise.resolve();
    el.shadowRoot.querySelector(".colwrap .btn").click();
    await Promise.resolve();
    const first = el.shadowRoot.querySelector(".picker input");
    expect(first.dataset.id).toBe("__rep");
    expect(first.checked).toBe(true);
    first.checked = false;
    first.dispatchEvent(new CustomEvent("change"));
    const cols = handler.mock.calls[0][0].detail.columns;
    expect(cols).toContain("norep");
    expect(cols).toContain("segment");
    // the screen hands the saved choice back: no rep column, no grouping
    el.columns = cols;
    await Promise.resolve();
    expect(el.shadowRoot.querySelector('th[data-id="__rep"]')).toBeNull();
    expect(el.shadowRoot.querySelectorAll("td.repcell").length).toBe(0);
    expect(el.shadowRoot.querySelectorAll("td.repplain").length).toBe(0);
    expect(rows(el).length).toBe(2);
    // a layout saved before the Sales rep column existed shows it
    el.columns = ["segment", "stage"];
    await Promise.resolve();
    expect(el.shadowRoot.querySelectorAll("td.repcell").length).toBe(2);
  });

  it("marks a deal that is in a campaign with a gold star beside the surgeon, never in a ROSA list", async () => {
    const el = make({
      kind: "opp",
      deals: [
        deal("1", "Ann", { campaignCount: 1 }),
        deal("2", "Ann", { campaignCount: 0 }),
        deal("3", "Ann", { campaignCount: 2, repPriority: true })
      ]
    });
    await Promise.resolve();
    expect(el.shadowRoot.querySelectorAll("span.cstar").length).toBe(2);
    el.kind = "rosa";
    el.deals = [deal("4", "Ann", { kind: "rosa", campaignCount: 1 })];
    await Promise.resolve();
    expect(el.shadowRoot.querySelectorAll("span.cstar").length).toBe(0);
  });

  it("marks a rep priority deal with a star, which the style sheet colours amber", async () => {
    const el = make({
      kind: "opp",
      deals: [
        deal("1", "Ann", { repPriority: true }),
        deal("2", "Ann", { repPriority: false })
      ]
    });
    await Promise.resolve();
    const stars = el.shadowRoot.querySelectorAll("span.star");
    expect(stars.length).toBe(1);
    expect(stars[0].textContent).toContain("★");
  });

  it("marks a state priority deal with a violet star beside the surgeon, after the rep star, in an opportunity list and in a ROSA list on its own column", async () => {
    const el = make({
      kind: "opp",
      deals: [
        deal("1", "Ann", { statePriority: true }),
        deal("2", "Ann", { statePriority: true, repPriority: true }),
        deal("3", "Ann", {})
      ]
    });
    await Promise.resolve();
    expect(el.shadowRoot.querySelectorAll("span.sstar").length).toBe(2);
    const both = el.shadowRoot.querySelectorAll("tbody tr")[1];
    const order = Array.from(
      both.querySelectorAll("span.star, span.sstar")
    ).map((s) => s.className);
    expect(order).toEqual(["star", "sstar"]);
    el.kind = "rosa";
    el.deals = [deal("4", "Ann", { kind: "rosa", statePriority: true })];
    await Promise.resolve();
    expect(el.shadowRoot.querySelectorAll("span.sstar").length).toBe(1);
  });

  it("shows only 25 rows and offers more", async () => {
    const many = Array.from({ length: 30 }, (_, i) => deal("d" + i, "Ann"));
    const el = make({ kind: "opp", deals: many });
    await Promise.resolve();
    expect(rows(el).length).toBe(25);
    expect(el.shadowRoot.querySelector(".more button").textContent).toContain(
      "5 left"
    );
  });

  it("adds 50 at a time, and Show All shows every deal", async () => {
    const many = Array.from({ length: 120 }, (_, i) => deal("d" + i, "Ann"));
    const el = make({ kind: "opp", deals: many });
    await Promise.resolve();
    const buttons = () => el.shadowRoot.querySelectorAll(".more button");
    expect(buttons()[0].textContent).toContain("Show 50 more");
    buttons()[0].click();
    await Promise.resolve();
    expect(rows(el).length).toBe(75);
    buttons()[1].click();
    await Promise.resolve();
    expect(rows(el).length).toBe(120);
    expect(el.shadowRoot.querySelector(".more")).toBeNull();
  });

  it("says so when nothing matches", async () => {
    const el = make({ kind: "opp", deals: [] });
    await Promise.resolve();
    expect(el.shadowRoot.querySelector(".empty")).not.toBeNull();
  });

  it("tells the app when columns are chosen", async () => {
    const el = make({ kind: "opp", deals: [deal("1", "Ann")] });
    const handler = jest.fn();
    el.addEventListener("columnschange", handler);
    el.shadowRoot.querySelector(".colwrap .btn").click();
    await Promise.resolve();
    const box = el.shadowRoot.querySelector('.picker input[data-id="age"]');
    box.checked = true;
    box.dispatchEvent(new CustomEvent("change"));
    expect(handler).toHaveBeenCalled();
    expect(handler.mock.calls[0][0].detail.columns).toContain("age");
  });

  it("lifts its heading bar above the other lists' bars while the Columns picker is open, and puts it back when closed", async () => {
    const el = make({ kind: "opp", deals: [deal("1", "Ann")] });
    const card = () => el.shadowRoot.querySelector("section.card");
    expect(card().classList.contains("picking")).toBe(false);
    el.shadowRoot.querySelector(".colwrap .btn").click();
    await Promise.resolve();
    expect(card().classList.contains("picking")).toBe(true);
    el.shadowRoot.querySelector(".backdrop").click();
    await Promise.resolve();
    expect(card().classList.contains("picking")).toBe(false);
  });

  it("shows the surgeon's rating as a metal plate between Portfolio and Brand, and Not rated when there is none", async () => {
    const el = make({
      kind: "opp",
      deals: [
        deal("1", "Ann", { rating: "GOLD" }),
        deal("2", "Ann", { rating: null })
      ]
    });
    await Promise.resolve();
    const heads = [...el.shadowRoot.querySelectorAll("th .lab")].map((l) =>
      l.textContent.trim()
    );
    expect(heads.indexOf("Rating")).toBe(heads.indexOf("Portfolio") + 1);
    expect(heads.indexOf("Brand")).toBe(heads.indexOf("Rating") + 1);
    const plates = [...el.shadowRoot.querySelectorAll("span.rate")];
    expect(plates.map((p) => p.textContent)).toContain("Gold");
    expect(
      plates.find((p) => p.textContent === "Gold").classList.contains("Gold")
    ).toBe(true);
    expect(el.shadowRoot.querySelector("span.norate").textContent).toBe(
      "Not rated"
    );
  });

  it("has a Rating column for opportunities and risks but not for ROSA", async () => {
    const kinds = ["opp", "risk", "rosa"];
    const els = kinds.map((kind) => make({ kind, deals: [deal("1", "Ann")] }));
    await Promise.resolve();
    els.forEach((el) => el.shadowRoot.querySelector(".colwrap .btn").click());
    await Promise.resolve();
    els.forEach((el, i) => {
      const labels = [...el.shadowRoot.querySelectorAll(".picker label")].map(
        (l) => l.textContent.trim()
      );
      expect(labels.includes("Rating")).toBe(kinds[i] !== "rosa");
    });
  });

  it("shows Rating on a layout saved before it existed, and remembers when it is switched off", async () => {
    const el = make({
      kind: "opp",
      deals: [deal("1", "Ann")],
      columns: ["hcp", "stage"]
    });
    const handler = jest.fn();
    el.addEventListener("columnschange", handler);
    await Promise.resolve();
    expect(
      [...el.shadowRoot.querySelectorAll("th .lab")].map((l) =>
        l.textContent.trim()
      )
    ).toContain("Rating");
    el.shadowRoot.querySelector(".colwrap .btn").click();
    await Promise.resolve();
    const box = el.shadowRoot.querySelector('.picker input[data-id="rating"]');
    box.checked = false;
    box.dispatchEvent(new CustomEvent("change"));
    const cols = handler.mock.calls[0][0].detail.columns;
    expect(cols).toContain("norating");
    expect(cols).not.toContain("rating");
    el.columns = cols;
    await Promise.resolve();
    expect(
      [...el.shadowRoot.querySelectorAll("th .lab")].map((l) =>
        l.textContent.trim()
      )
    ).not.toContain("Rating");
  });

  it("never makes the Status column narrower than its pill needs, whatever widths are saved", async () => {
    const el = make({
      kind: "opp",
      deals: [deal("1", "Ann")],
      columns: ["hcp", "stage", "status"],
      widths: { __rep: 100, hcp: 200, stage: 100, status: 90 }
    });
    await Promise.resolve();
    const cols = [...el.shadowRoot.querySelectorAll("col")];
    const heads = [...el.shadowRoot.querySelectorAll("th")].map(
      (th) => th.dataset.id
    );
    expect(cols.length).toBe(heads.length);
    // a saved 90 px is raised to 150 px, and the others share the rest of the table
    expect(cols[heads.indexOf("status")].getAttribute("style")).toContain(
      "width:150px"
    );
    expect(cols[heads.indexOf("hcp")].getAttribute("style")).toContain(
      "calc((100% - 150px)"
    );
    expect(
      el.shadowRoot.querySelector("table").getAttribute("style")
    ).toContain("min(");
  });

  it("shows each rep's deal count and total, and collapses a rep to one line", async () => {
    const el = make({
      kind: "opp",
      deals: [
        deal("1", "Ann"),
        deal("2", "Ann"),
        deal("3", "Ann"),
        deal("4", "Bob")
      ]
    });
    await Promise.resolve();
    const cells = [...el.shadowRoot.querySelectorAll("td.repcell")];
    expect(cells[0].textContent).toContain("3 deals · A$3k");
    expect(cells[0].getAttribute("rowspan")).toBe("3");
    expect(rows(el).length).toBe(4);
    cells[0].click();
    await Promise.resolve();
    expect(rows(el).length).toBe(2); // Ann's three rows became one summary row
    expect(el.shadowRoot.querySelector("td.repcell").textContent).toContain(
      "Ann"
    );
    expect(rows(el)[0].textContent).toContain("A$3k");
  });

  it("collapses and expands every rep that has several deals with one button", async () => {
    const el = make({
      kind: "opp",
      deals: [
        deal("1", "Ann"),
        deal("2", "Ann"),
        deal("3", "Bob"),
        deal("4", "Bob"),
        deal("5", "Cy")
      ]
    });
    await Promise.resolve();
    const button = () =>
      [...el.shadowRoot.querySelectorAll("button")].find((b) =>
        /all$/.test(b.textContent.trim())
      );
    expect(button().textContent.trim()).toBe("Collapse all");
    button().click();
    await Promise.resolve();
    expect(rows(el).length).toBe(3); // Ann and Bob collapsed, Cy has one deal
    expect(button().textContent.trim()).toBe("Expand all");
    button().click();
    await Promise.resolve();
    expect(rows(el).length).toBe(5);
  });

  it("has no collapse button when no rep has more than one deal", async () => {
    const el = make({
      kind: "opp",
      deals: [deal("1", "Ann"), deal("2", "Bob")]
    });
    await Promise.resolve();
    expect(
      [...el.shadowRoot.querySelectorAll("button")].some((b) =>
        /all$/.test(b.textContent.trim())
      )
    ).toBe(false);
  });

  it("tells the app when it is closed, and can start closed", async () => {
    const closed = make({
      kind: "opp",
      deals: [deal("1", "Ann")],
      initialOpen: false
    });
    await Promise.resolve();
    expect(closed.shadowRoot.querySelector("table")).toBeNull();
    const el = make({ kind: "opp", deals: [deal("1", "Ann")] });
    const handler = jest.fn();
    el.addEventListener("listtoggle", handler);
    [...el.shadowRoot.querySelectorAll("button.rbtn")].pop().click();
    expect(handler.mock.calls[0][0].detail).toEqual({
      kind: "opp",
      open: false
    });
  });
  const heads = (el) =>
    [...el.shadowRoot.querySelectorAll("thead th")].map((t) =>
      t.textContent.trim()
    );

  it("leaves the Country column out when every deal is from one country", async () => {
    const el = make({
      kind: "opp",
      deals: [
        deal("1", "Ann", { ownerCountry: "AU" }),
        deal("2", "Bob", { ownerCountry: "AU" })
      ]
    });
    await Promise.resolve();
    expect(heads(el).join("|")).not.toContain("Country");
  });

  it("shows the Country column by itself when the deals come from more than one country", async () => {
    const el = make({
      kind: "opp",
      deals: [
        deal("1", "Ann", { ownerCountry: "AU" }),
        deal("2", "Bob", { ownerCountry: "NZ" })
      ]
    });
    await Promise.resolve();
    expect(heads(el).join("|")).toContain("Country");
    // a layout saved before Country existed gets it too
    el.columns = ["hcp", "stage"];
    await Promise.resolve();
    expect(heads(el).join("|")).toContain("Country");
  });

  it("lets the person switch Country off, and remembers that", async () => {
    const el = make({
      kind: "opp",
      deals: [
        deal("1", "Ann", { ownerCountry: "AU" }),
        deal("2", "Bob", { ownerCountry: "NZ" })
      ]
    });
    await Promise.resolve();
    const saved = [];
    el.addEventListener("columnschange", (e) => saved.push(e.detail));
    el.shadowRoot.querySelector(".colwrap button").click();
    await Promise.resolve();
    const box = el.shadowRoot.querySelector('input[data-id="country"]');
    expect(box).not.toBeNull();
    box.checked = false;
    box.dispatchEvent(new CustomEvent("change", { bubbles: true }));
    expect(saved.length).toBe(1);
    expect(saved[0].columns).not.toContain("country");
    expect(saved[0].columns).toContain("nocountry");
    el.columns = saved[0].columns;
    await Promise.resolve();
    expect(heads(el).join("|")).not.toContain("Country");
  });
  it("shows each deal's status as a pill: Open, On Hold, Closed Won or Closed Lost", async () => {
    const el = make({
      kind: "opp",
      deals: [
        deal("1", "Ann"),
        deal("2", "Ann", { onHold: true }),
        deal("3", "Ann", { isClosed: true, stage: "Conversion" }),
        deal("4", "Ann", { isClosed: true, stage: "Unsuccessful Conversion" })
      ]
    });
    await Promise.resolve();
    const pills = [...el.shadowRoot.querySelectorAll("tbody .stp")];
    const by = (cls) => pills.filter((p) => p.classList.contains(cls));
    expect(pills.length).toBe(4);
    expect(by("st-open")[0].textContent).toBe("Open");
    expect(by("st-hold")[0].textContent).toBe("On Hold");
    expect(by("st-won")[0].textContent).toBe("Closed Won");
    expect(by("st-lost")[0].textContent).toBe("Closed Lost");
    // On Hold is said once, in the Status column: Last Posted shows a dash for an on-hold deal
    const headTexts = [...el.shadowRoot.querySelectorAll("thead th")].map((h) =>
      h.textContent.trim()
    );
    const col = headTexts.findIndex((h) => h.startsWith("Last posted"));
    const held = by("st-hold")[0].closest("tr");
    expect(held.querySelectorAll("td")[col].textContent.trim()).toBe("–");
  });
  it("by default cuts a long hospital name and keeps the Status column wide, and leaves a width the person has dragged alone", async () => {
    const el = make({
      kind: "opp",
      deals: [
        deal("1", "Ann", { facility: "Bathurst Base Hospital (Northern)" })
      ]
    });
    await Promise.resolve();
    const hospital = () => el.shadowRoot.querySelector("td .clip");
    expect(hospital()).not.toBeNull();
    expect(hospital().textContent).toBe("Bathurst Base Hospital (Northern)");
    expect(el.shadowRoot.querySelector("th.c-status")).not.toBeNull();
    expect(el.shadowRoot.querySelector("td.c-status")).not.toBeNull();
    el.widths = { hcp: 160, facility: 300, status: 160 };
    await Promise.resolve();
    expect(el.shadowRoot.querySelector("td .clip")).toBeNull();
  });
});
