import { createElement } from "lwc";
import PipelineTeamTable from "c/pipelineTeamTable";

const NOW = Date.now();
const daysAgo = (n) => new Date(NOW - n * 86400000).toISOString();
const deal = (id, owner, lastPosted) => ({
  id,
  kind: "opp",
  ownerId: owner,
  ownerName: owner,
  value: 1000,
  currencyCode: "AUD",
  isClosed: false,
  onHold: false,
  lastPosted: daysAgo(lastPosted),
  lastStageChange: daysAgo(5),
  createdDate: daysAgo(200)
});

function make(props) {
  const el = createElement("c-pipeline-team-table", { is: PipelineTeamTable });
  Object.assign(el, props);
  document.body.appendChild(el);
  return el;
}

describe("c-pipeline-team-table", () => {
  afterEach(() => {
    while (document.body.firstChild)
      document.body.removeChild(document.body.firstChild);
  });

  it("starts closed and opens with its chevron", async () => {
    const el = make({
      deals: [deal("1", "Ann", 5)],
      kinds: ["opp"],
      teamNames: { Ann: "North" }
    });
    await Promise.resolve();
    expect(el.shadowRoot.querySelector("table")).toBeNull();
    el.shadowRoot.querySelector("button.rbtn").click();
    await Promise.resolve();
    expect(el.shadowRoot.querySelectorAll("tbody tr").length).toBe(1);
    expect(el.shadowRoot.querySelector("tbody").textContent).toContain("North");
  });

  it("counts late deals per person and never adds across people", async () => {
    const el = make({
      deals: [deal("1", "Ann", 45), deal("2", "Ann", 120), deal("3", "Bob", 5)],
      kinds: ["opp"],
      teamNames: {}
    });
    el.shadowRoot.querySelector("button.rbtn").click();
    await Promise.resolve();
    const [ann, bob] = el.shadowRoot.querySelectorAll("tbody tr");
    expect(ann.textContent).toContain("Ann");
    expect(ann.querySelectorAll(".tag.warn").length).toBe(1);
    expect(ann.querySelectorAll(".tag.bad").length).toBeGreaterThanOrEqual(1);
    expect(bob.querySelectorAll(".tag").length).toBe(0);
  });

  it("announces the person clicked, and clears when clicked again", async () => {
    const el = make({
      deals: [deal("1", "Ann", 5)],
      kinds: ["opp"],
      teamNames: {},
      selectedOwner: ""
    });
    const handler = jest.fn();
    el.addEventListener("pickrep", handler);
    el.shadowRoot.querySelector("button.rbtn").click();
    await Promise.resolve();
    el.shadowRoot.querySelector("tbody tr").click();
    expect(handler.mock.calls[0][0].detail.ownerId).toBe("Ann");
    el.selectedOwner = "Ann";
    await Promise.resolve();
    el.shadowRoot.querySelector("tbody tr").click();
    expect(handler.mock.calls[1][0].detail.ownerId).toBe("");
  });

  it("tells the app when it is opened or closed, and can start open", async () => {
    const el = make({
      deals: [deal("1", "Ann", 5)],
      kinds: ["opp"],
      teamNames: {},
      initialOpen: true
    });
    await Promise.resolve();
    expect(el.shadowRoot.querySelector("table")).not.toBeNull();
    const handler = jest.fn();
    el.addEventListener("teamtoggle", handler);
    el.shadowRoot.querySelector("button.rbtn").click();
    expect(handler.mock.calls[0][0].detail.open).toBe(false);
  });
});

describe("c-pipeline-team-table column widths", () => {
  afterEach(() => {
    while (document.body.firstChild)
      document.body.removeChild(document.body.firstChild);
  });

  const open = async (props) => {
    const el = make({
      deals: [deal("1", "Ann", 5)],
      kinds: ["opp"],
      teamNames: { Ann: "North" },
      initialOpen: true,
      ...props
    });
    await Promise.resolve();
    return el;
  };

  it("uses automatic widths until some are saved, then holds the saved ones", async () => {
    let el = await open({});
    expect(el.shadowRoot.querySelector("colgroup")).toBeNull();
    document.body.removeChild(el);
    el = await open({ widths: { name: 200, team: 120 } });
    const cols = [...el.shadowRoot.querySelectorAll("col")];
    expect(cols.length).toBe(el.shadowRoot.querySelectorAll("th").length);
    expect(cols[0].style.width).toBe("200px");
    expect(cols[1].style.width).toBe("120px");
  });

  it("asks for the widths to be cleared on a double-click of a handle", async () => {
    const el = await open({});
    const handler = jest.fn();
    el.addEventListener("widthschange", handler);
    el.shadowRoot
      .querySelector(".rz")
      .dispatchEvent(new CustomEvent("dblclick"));
    expect(handler.mock.calls[0][0].detail).toEqual({
      kind: "team",
      widths: null
    });
  });
});
