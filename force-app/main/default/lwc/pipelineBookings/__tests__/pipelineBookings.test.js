import { createElement } from "lwc";
import PipelineBookings from "c/pipelineBookings";
import getBookings from "@salesforce/apex/PipelineBookingsController.getBookings";
import createFromBookings from "@salesforce/apex/PipelineBookingsController.createFromBookings";
import adjustToBookings from "@salesforce/apex/PipelineBookingsController.adjustToBookings";

jest.mock(
  "@salesforce/apex/PipelineBookingsController.getBookings",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/PipelineBookingsController.createFromBookings",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/PipelineBookingsController.adjustToBookings",
  () => ({ default: jest.fn() }),
  { virtual: true }
);

// eslint-disable-next-line @lwc/lwc/no-async-operation
const flush = () => new Promise((r) => setTimeout(r, 0));

const type = (over) => ({
  name: "Knee",
  portfolio: "Knee",
  split: true,
  primary: [6, 7, 5, 8, 7, 6, 8, 7, 6, 7, 8, 6],
  revision: [0, 1, 0, 1, 0, 1, 0, 0, 1, 0, 0, 0],
  partial: [1, 0],
  booked: 85,
  usage: "zb",
  zb: 85,
  canAuto: true,
  hospitals: [
    { id: "h1", name: "Westside", count: 55 },
    { id: "h2", name: "Harbourview", count: 30 }
  ],
  ...over
});
const data = (types, over) => ({
  surgeonId: "001",
  surgeonName: "Dr Test",
  windowStart: "2025-11-01",
  today: "2026-11-02",
  noUsagesAtAll: false,
  canCreate: true,
  canEdit: true,
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
const button = (el, text) =>
  [...el.shadowRoot.querySelectorAll("button")].find(
    (b) => b.textContent.trim() === text
  );

describe("c-pipeline-bookings", () => {
  afterEach(() => {
    while (document.body.firstChild)
      document.body.removeChild(document.body.firstChild);
    jest.clearAllMocks();
  });

  it("draws a graph and the 12-month total per type, side by side, with primary and revision", async () => {
    getBookings.mockResolvedValue(
      data([
        type(),
        type({ name: "Hip", portfolio: "Hip", booked: 38, zb: 38 })
      ])
    );
    const el = make();
    await flush();
    expect(el.shadowRoot.querySelectorAll(".card").length).toBe(2);
    expect(q(el, ".card .big").textContent).toContain("85");
    expect(q(el, ".card .split").textContent).toContain("Revision");
    expect(
      el.shadowRoot.querySelectorAll(".card")[0].querySelectorAll("rect").length
    ).toBeGreaterThan(12);
    expect(q(el, ".window").textContent).toContain("1 Nov 2025 to 31 Oct 2026");
  });

  it("says accurate within 10% and asks for an adjustment beyond it, with the average per month", async () => {
    getBookings.mockResolvedValue(data([type({ booked: 64, zb: 100 })]));
    const el = make();
    await flush();
    expect(q(el, ".cue .mark").textContent).toBe(
      "Usages look high: adjust them"
    );
    expect(q(el, ".sugg").textContent).toContain("5.3 cases a month");
    getBookings.mockResolvedValue(data([type({ booked: 85, zb: 85 })]));
    const el2 = make();
    await flush();
    expect(el2.shadowRoot.querySelector(".cue .mark").textContent).toBe(
      "Usages look accurate"
    );
    expect(el2.shadowRoot.querySelector(".sugg")).toBeNull();
  });

  it("warns in red when usages are missing, and creates them from the bookings", async () => {
    getBookings.mockResolvedValue(
      data([type({ usage: "none", zb: 0 })], { noUsagesAtAll: true })
    );
    createFromBookings.mockResolvedValue({
      created: 2,
      updated: 0,
      skipped: 0,
      total: 85
    });
    const el = make();
    await flush();
    expect(q(el, ".topchip .pill").textContent).toContain(
      "Usages are missing for this surgeon"
    );
    expect(q(el, ".card .pill").textContent).toContain(
      "Usages are missing for knee"
    );
    const changed = jest.fn();
    el.addEventListener("usageschanged", changed);
    getBookings.mockResolvedValue(data([type()]));
    button(el, "Create usages from these bookings").click();
    await flush();
    expect(createFromBookings).toHaveBeenCalledWith({
      dealId: "a1",
      portfolio: "Knee"
    });
    expect(q(el, ".flash").textContent).toContain(
      "Created 2 knee usages, 85 ZB cases a year"
    );
    expect(changed).toHaveBeenCalled();
    expect(getBookings).toHaveBeenCalledTimes(2); // read again, so the check and the line are current
    expect(q(el, ".topchip")).toBeNull();
  });

  it("adjusts usages that are out, and says what was left alone", async () => {
    getBookings.mockResolvedValue(data([type({ booked: 85, zb: 40 })]));
    adjustToBookings.mockResolvedValue({
      created: 0,
      updated: 1,
      skipped: 1,
      total: 85
    });
    const el = make();
    await flush();
    button(el, "Adjust usages to these bookings").click();
    await flush();
    expect(adjustToBookings).toHaveBeenCalledWith({
      dealId: "a1",
      portfolio: "Knee"
    });
    expect(q(el, ".flash").textContent).toContain(
      "Adjusted the knee usages to 85 ZB cases a year"
    );
    expect(q(el, ".flash").textContent).toContain(
      "1 line listing a competitor was left alone"
    );
  });

  it("never offers to create or adjust shoulder, or when the person may not change usages", async () => {
    getBookings.mockResolvedValue(
      data([
        type({
          name: "Shoulder",
          portfolio: "Shoulder",
          usage: "none",
          zb: 0,
          canAuto: false
        })
      ])
    );
    const el = make();
    await flush();
    expect(button(el, "Create usages from these bookings")).toBeUndefined();
    expect(q(el, ".sugg").textContent).toContain("anatomical and reverse");
    expect(button(el, "Open Surgeon Usages")).toBeDefined();
    getBookings.mockResolvedValue(
      data([type({ booked: 85, zb: 40 })], { canEdit: false, canCreate: false })
    );
    const el2 = make();
    await flush();
    expect(button(el2, "Adjust usages to these bookings")).toBeUndefined();
  });

  it("asks the flyout to open the Usages panel, and shows the reason when a change is refused", async () => {
    getBookings.mockResolvedValue(data([type({ usage: "competitor", zb: 0 })]));
    createFromBookings.mockRejectedValue({ body: { message: "bad value" } });
    const el = make();
    await flush();
    const open = jest.fn();
    el.addEventListener("openusages", open);
    button(el, "Open Surgeon Usages").click();
    expect(open).toHaveBeenCalled();
    expect(q(el, ".cue .mark").textContent).toBe("Usages list no ZB knee");
  });

  it("draws CMFT in one colour with no split", async () => {
    getBookings.mockResolvedValue(
      data([
        type({ name: "CMFT", portfolio: "CMF", split: false, revision: null })
      ])
    );
    const el = make();
    await flush();
    expect(q(el, ".split").textContent).toContain(
      "no primary or revision split"
    );
  });
});
