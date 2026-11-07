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

  it("does not group a list that holds a single rep", async () => {
    const el = make({
      kind: "opp",
      deals: [deal("1", "Ann"), deal("2", "Ann")]
    });
    await Promise.resolve();
    expect(el.shadowRoot.querySelectorAll("td.repcell").length).toBe(0);
    expect(rows(el).length).toBe(2);
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

  it("shows only 25 rows and offers more", async () => {
    const many = Array.from({ length: 30 }, (_, i) => deal("d" + i, "Ann"));
    const el = make({ kind: "opp", deals: many });
    await Promise.resolve();
    expect(rows(el).length).toBe(25);
    expect(el.shadowRoot.querySelector(".more button").textContent).toContain(
      "5 left"
    );
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
});
