import { createElement } from "lwc";
import PipelineMobileBookings from "c/pipelineMobileBookings";
import getBookings from "@salesforce/apex/PipelineBookingsController.getBookings";

jest.mock(
  "@salesforce/apex/PipelineBookingsController.getBookings",
  () => ({ default: jest.fn() }),
  { virtual: true }
);

// eslint-disable-next-line @lwc/lwc/no-async-operation
const wait = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const DATA = {
  surgeonId: "001S",
  windowStart: "2025-11-01",
  today: "2026-11-07",
  types: [
    {
      name: "Hip",
      split: true,
      booked: 7,
      primary: [1, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1],
      revision: [0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0],
      partial: [1, 0],
      rows: [
        {
          id: "001A",
          name: "Mater Hospital",
          booked: 4,
          primary: [1, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
          revision: [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          partial: [1, 0]
        },
        {
          id: "001B",
          name: "Epworth Richmond",
          booked: 3,
          primary: [0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1],
          revision: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0],
          partial: [0, 0]
        }
      ]
    },
    {
      name: "CMFT",
      split: false,
      booked: 2,
      primary: [0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0],
      revision: [],
      partial: [0, 0],
      rows: [
        {
          id: "001A",
          name: "Mater Hospital",
          booked: 2,
          primary: [0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0],
          revision: [],
          partial: [0, 0]
        }
      ]
    }
  ]
};

const make = async (data = DATA) => {
  getBookings.mockResolvedValue(data);
  const heard = [];
  const el = createElement("c-pipeline-mobile-bookings", {
    is: PipelineMobileBookings
  });
  el.addEventListener("summary", (e) => heard.push(e.detail));
  el.recordId = "a01X";
  el.dealLabel = "Dr Chris Lee · Opportunity";
  document.body.appendChild(el);
  await wait();
  return { el, heard };
};
const root = (el) => el.shadowRoot;

describe("c-pipeline-mobile-bookings", () => {
  afterEach(() => {
    while (document.body.firstChild)
      document.body.removeChild(document.body.firstChild);
    jest.clearAllMocks();
  });

  it("draws a card for each type with the cases in 12 months, primary and revision, and 13 bars", async () => {
    const { el, heard } = await make();
    expect(getBookings).toHaveBeenCalledWith({ dealId: "a01X" });
    const cards = [...root(el).querySelectorAll(".type")];
    expect(cards.map((c) => c.querySelector("h3").textContent)).toEqual([
      "Hip",
      "CMFT"
    ]);
    expect(cards[0].querySelector(".big1 b").textContent).toBe("7");
    const split = cards[0]
      .querySelector(".split")
      .textContent.replace(/\u00a0/g, " ");
    expect(split).toContain("Primary 5");
    expect(split).toContain("Revision 2");
    expect(cards[1].querySelector(".split").textContent).toContain(
      "no primary or revision split"
    );
    expect(cards[0].querySelectorAll("text.mon").length).toBe(13);
    expect(root(el).querySelector(".window").textContent).toContain(
      "12 whole months"
    );
    expect(heard).toEqual(["9 cases in 12 months"]);
  });

  it("gives a type with several hospitals a dropdown that redraws it, and a type with one hospital none", async () => {
    const { el } = await make();
    const cards = () => [...root(el).querySelectorAll(".type")];
    const select = cards()[0].querySelector("select.hosp");
    expect([...select.options].map((o) => o.textContent.trim())).toEqual([
      "All hospitals · 7 cases",
      "Mater Hospital · 4 cases",
      "Epworth Richmond · 3 cases"
    ]);
    expect(cards()[1].querySelector("select")).toBeNull();
    expect(cards()[1].querySelector(".big1").textContent).toContain(
      "all at Mater Hospital"
    );
    select.value = "001B";
    select.dispatchEvent(new CustomEvent("change"));
    await wait();
    expect(cards()[0].querySelector(".big1 b").textContent).toBe("3");
    expect(cards()[0].querySelector(".big1").textContent).toContain(
      "Epworth Richmond only"
    );
    expect(cards()[0].querySelector("select.hosp").value).toBe("001B");
  });

  it("says plainly when there is no Primary HCP, or no surgeries", async () => {
    let r = await make({ surgeonId: null, types: [] });
    expect(root(r.el).querySelector(".nomsg").textContent).toContain(
      "no Primary HCP"
    );
    expect(r.heard).toEqual(["No Primary HCP"]);
    document.body.removeChild(r.el);
    r = await make({
      surgeonId: "001S",
      windowStart: "2025-11-01",
      today: "2026-11-07",
      types: []
    });
    expect(root(r.el).querySelector(".nomsg").textContent).toContain(
      "no surgeries with usage items"
    );
    expect(r.heard).toEqual(["No cases in 12 months"]);
  });

  it("slides in when it is opened, and the Back bar asks the screen to slide it off", async () => {
    const { el } = await make();
    expect(
      root(el).querySelector(".bookingspage").classList.contains("on")
    ).toBe(false);
    el.open = true;
    await wait();
    expect(
      root(el).querySelector(".bookingspage").classList.contains("on")
    ).toBe(true);
    let closed = false;
    el.addEventListener("close", () => (closed = true));
    root(el).querySelector(".backbtn").click();
    expect(closed).toBe(true);
  });

  it("reads the bookings again, quietly, when the refresh key goes up", async () => {
    const { el } = await make();
    el.refreshKey = 1;
    await wait();
    expect(getBookings.mock.calls.length).toBe(2);
    expect(root(el).querySelectorAll(".type").length).toBe(2); // what was on screen stayed
  });
});
