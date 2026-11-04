import { createElement } from "lwc";
import PipelineBookings from "c/pipelineBookings";
import getBookings from "@salesforce/apex/PipelineBookingsController.getBookings";

jest.mock(
  "@salesforce/apex/PipelineBookingsController.getBookings",
  () => ({ default: jest.fn() }),
  { virtual: true }
);

// eslint-disable-next-line @lwc/lwc/no-async-operation
const flush = () => new Promise((r) => setTimeout(r, 0));

const row = (over) => ({
  id: "h1",
  name: "Westside",
  booked: 22,
  primary: [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
  revision: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  partial: [0, 0],
  ...over
});
// a type's own months are always the sum of its hospitals' months
const type = (over) => {
  const rows = (over && over.rows) || [row()];
  const total = (k) =>
    Array.from({ length: 12 }, (_, i) =>
      rows.reduce((sum, r) => sum + r[k][i], 0)
    );
  return {
    name: "Knee",
    split: true,
    primary: total("primary"),
    revision: total("revision"),
    partial: [0, 0],
    rows,
    ...over
  };
};
const data = (types, over) => ({
  surgeonId: "001",
  surgeonName: "Dr Test",
  windowStart: "2025-11-01",
  today: "2026-11-02",
  types,
  ...over
});
function make() {
  const el = createElement("c-pipeline-bookings", { is: PipelineBookings });
  el.recordId = "a1";
  document.body.appendChild(el);
  return el;
}
const q = (el, sel) => el.shadowRoot.querySelector(sel);
const qa = (el, sel) => [...el.shadowRoot.querySelectorAll(sel)];

describe("c-pipeline-bookings", () => {
  afterEach(() => {
    while (document.body.firstChild)
      document.body.removeChild(document.body.firstChild);
    jest.clearAllMocks();
  });

  it("draws one section per type with its total, the primary and revision split and the window", async () => {
    getBookings.mockResolvedValue(data([type(), type({ name: "Hip" })]));
    const el = make();
    await flush();
    expect(qa(el, ".sect").length).toBe(2);
    expect(q(el, ".sect .big").textContent).toBe("25");
    expect(q(el, ".sect .sm").textContent).toContain("Revision");
    expect(q(el, ".sect svg")).not.toBeNull();
    expect(q(el, ".window").textContent).toContain("1 Nov 2025 to 31 Oct 2026");
  });

  it("has no usage suggestions, chips or buttons", async () => {
    getBookings.mockResolvedValue(data([type()]));
    const el = make();
    await flush();
    expect(qa(el, "button").length).toBe(0);
    expect(q(el, ".pill")).toBeNull();
    expect(q(el, ".detail")).toBeNull();
    expect(q(el, ".ul")).toBeNull();
  });

  it("with one hospital shows no list and names the hospital in the heading line", async () => {
    getBookings.mockResolvedValue(data([type()]));
    const el = make();
    await flush();
    expect(q(el, ".list")).toBeNull();
    expect(q(el, ".body.one")).not.toBeNull();
    expect(q(el, ".chead").textContent).toContain("all at Westside");
  });

  it("with several hospitals lists All hospitals first and redraws for the one clicked", async () => {
    getBookings.mockResolvedValue(
      data([
        type({
          rows: [
            row({ id: "h1", name: "Westside" }),
            row({
              id: "h2",
              name: "Harbour View",
              primary: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
              revision: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
            })
          ]
        })
      ])
    );
    const el = make();
    await flush();
    expect(q(el, ".body.two")).not.toBeNull();
    const rows = qa(el, ".hrow");
    expect(rows.map((r) => r.querySelector(".nm").textContent)).toEqual([
      "All hospitals",
      "Westside",
      "Harbour View"
    ]);
    expect(rows[0].classList.contains("on")).toBe(true);
    expect(q(el, ".chead").textContent).toContain("26");
    rows[2].click();
    await flush();
    expect(qa(el, ".hrow")[2].classList.contains("on")).toBe(true);
    expect(q(el, ".big").textContent).toBe("1");
    expect(q(el, ".chead").textContent).toContain("Harbour View only");
    qa(el, ".hrow")[0].click();
    await flush();
    expect(q(el, ".big").textContent).toBe("26");
  });

  it("draws CMFT with no primary and revision split and says so", async () => {
    getBookings.mockResolvedValue(
      data([type({ name: "CMFT", split: false, rows: [row()] })])
    );
    const el = make();
    await flush();
    expect(q(el, ".sm").textContent).toContain("no primary or revision split");
    expect(q(el, ".legend").textContent).toContain("CMFT");
  });

  it("says when the deal has no Primary HCP or the surgeon has no surgeries", async () => {
    getBookings.mockResolvedValue({ surgeonId: null, types: [] });
    let el = make();
    await flush();
    expect(q(el, ".none").textContent).toContain("no Primary HCP");
    document.body.removeChild(el);
    getBookings.mockResolvedValue(data([]));
    el = make();
    await flush();
    expect(el.shadowRoot.textContent).toContain("no surgeries");
  });

  it("shows the reading failure", async () => {
    getBookings.mockRejectedValue({ body: { message: "No access" } });
    const el = make();
    await flush();
    expect(el.shadowRoot.textContent).toContain("No access");
  });

  it("reads again when the refresh number goes up", async () => {
    getBookings.mockResolvedValue(data([type()]));
    const el = make();
    await flush();
    el.refreshKey = 1;
    await flush();
    expect(getBookings).toHaveBeenCalledTimes(2);
  });
});
