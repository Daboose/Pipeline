import { createElement } from "lwc";
import PipelineHospitalBookings from "c/pipelineHospitalBookings";
import getHospitalBookings from "@salesforce/apex/PipelineBookingsController.getHospitalBookings";

jest.mock(
  "@salesforce/apex/PipelineBookingsController.getHospitalBookings",
  () => ({ default: jest.fn() }),
  { virtual: true }
);

// eslint-disable-next-line @lwc/lwc/no-async-operation
const flush = () => new Promise((r) => setTimeout(r, 0));

const months = (a) => a.concat(Array(12 - a.length).fill(0));
const data = (over) => ({
  hospitalId: "001H",
  hospitalName: "Harbourview Health Campus",
  windowStart: "2025-11-01",
  windowEnd: "2026-10-31",
  hasBookings: true,
  booked: 277,
  types: [
    {
      name: "Hip",
      months: months([9, 7, 6, 10, 11, 9, 12, 10, 11, 9, 12, 13])
    },
    { name: "Knee", months: months([7, 6, 5, 8, 9, 7, 8, 9, 10, 8, 9, 10]) },
    {
      name: "Shoulder",
      months: months([3, 2, 3, 4, 4, 5, 3, 4, 5, 6, 4, 5])
    },
    { name: "CMFT", months: months([1, 0, 1, 1, 2, 1, 1, 2, 1, 1, 2, 1]) }
  ],
  ...over
});
function make() {
  const el = createElement("c-pipeline-hospital-bookings", {
    is: PipelineHospitalBookings
  });
  el.recordId = "a1";
  document.body.appendChild(el);
  return el;
}
const q = (el, sel) => el.shadowRoot.querySelector(sel);
const qa = (el, sel) => [...el.shadowRoot.querySelectorAll(sel)];

describe("c-pipeline-hospital-bookings", () => {
  afterEach(() => {
    while (document.body.firstChild)
      document.body.removeChild(document.body.firstChild);
    jest.clearAllMocks();
  });

  it("reads the bookings for the deal and draws 12 bars, the legend totals, the grand total and the window", async () => {
    getHospitalBookings.mockResolvedValue(data());
    const el = make();
    expect(getHospitalBookings).toHaveBeenCalledWith({ dealId: "a1" });
    await flush();
    expect(qa(el, "g.bar")).toHaveLength(12);
    expect(
      qa(el, ".lg").map((l) => l.textContent.replace(/\s+/g, " ").trim())
    ).toEqual(["Hip 119", "Knee 96", "Shoulder 48", "CMFT 14"]);
    expect(q(el, ".big").textContent).toBe("277");
    expect(q(el, ".win").textContent).toContain("at Harbourview Health Campus");
    expect(q(el, ".win").textContent).toContain(
      "November 2025 to October 2026"
    );
    expect(qa(el, "text.tot").map((t) => t.textContent.trim())[0]).toBe("20");
  });

  it("shows the month, type, cases and month total when the mouse is over a part of a bar, and hides it again", async () => {
    getHospitalBookings.mockResolvedValue(data());
    const el = make();
    await flush();
    expect(q(el, ".tip")).toBeNull();
    const seg = q(el, 'rect.seg[data-m="11"][data-t="Hip"]');
    seg.dispatchEvent(
      new MouseEvent("mousemove", { clientX: 40, clientY: 40 })
    );
    await flush();
    const tip = q(el, ".tip");
    expect(tip.textContent).toContain("October 2026");
    expect(tip.textContent).toContain("Hip: 13 cases");
    expect(tip.textContent).toContain("Month total: 29");
    seg.dispatchEvent(new MouseEvent("mouseleave"));
    await flush();
    expect(q(el, ".tip")).toBeNull();
  });

  it("says so plainly when the hospital has no bookings, and draws no chart", async () => {
    getHospitalBookings.mockResolvedValue(
      data({ hasBookings: false, booked: 0, types: [] })
    );
    const el = make();
    await flush();
    expect(q(el, ".none").textContent).toBe(
      "No MyCase bookings at Harbourview Health Campus in the last 12 months."
    );
    expect(q(el, "svg")).toBeNull();
  });

  it("says so when the deal has no hospital", async () => {
    getHospitalBookings.mockResolvedValue(
      data({ hospitalId: null, hospitalName: null, hasBookings: false })
    );
    const el = make();
    await flush();
    expect(q(el, ".none").textContent).toBe("This deal has no hospital.");
    expect(q(el, "svg")).toBeNull();
  });

  it("shows the error when the bookings cannot be read", async () => {
    getHospitalBookings.mockRejectedValue({ body: { message: "No access" } });
    const el = make();
    await flush();
    expect(q(el, ".none").textContent).toBe("No access");
    expect(q(el, "svg")).toBeNull();
  });

  it("says it is reading while it waits, and reads again when the refresh key changes", async () => {
    getHospitalBookings.mockResolvedValue(data());
    const el = make();
    expect(q(el, ".none").textContent).toBe("Reading the bookings…");
    await flush();
    el.refreshKey = 1;
    expect(getHospitalBookings).toHaveBeenCalledTimes(2);
    await flush();
    expect(qa(el, "g.bar")).toHaveLength(12);
  });
});
