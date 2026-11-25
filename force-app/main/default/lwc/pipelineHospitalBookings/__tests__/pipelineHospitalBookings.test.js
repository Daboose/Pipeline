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
const HIP = months([9, 7, 6, 10, 11, 9, 12, 10, 11, 9, 12, 13]);
const KNEE = months([7, 6, 5, 8, 9, 7, 8, 9, 10, 8, 9, 10]);
const SHOULDER = months([3, 2, 3, 4, 4, 5, 3, 4, 5, 6, 4, 5]);
const CMFT = months([1, 0, 1, 1, 2, 1, 1, 2, 1, 1, 2, 1]);
const line = (surgeonId, surgeon, brand, anatomy, procedure, m) => ({
  surgeonId,
  surgeon,
  brand,
  anatomy,
  procedure,
  months: m
});
const data = (over) => ({
  hospitalId: "001H",
  hospitalName: "Harbourview Health Campus",
  windowStart: "2025-11-01",
  windowEnd: "2026-10-31",
  hasBookings: true,
  booked: 277,
  types: [
    { name: "Hip", months: HIP },
    { name: "Knee", months: KNEE },
    { name: "Shoulder", months: SHOULDER },
    { name: "CMFT", months: CMFT }
  ],
  lines: [
    line("001A", "Dr Ada Field", "AVENIR COMPLETE", "Hip", "Primary", HIP),
    line("001A", "Dr Ada Field", "PERSONA", "Knee", "Primary", KNEE),
    line(
      "001B",
      "Dr Ben Moss",
      "COMPREHENSIVE",
      "Shoulder",
      "Primary",
      SHOULDER
    ),
    line("001B", "Dr Ben Moss", "RIBFIX", "CMFT", "Primary", CMFT)
  ],
  ...over
});
/** A small hospital for the views and chips: two surgeons, three brands, one revision and one demo. */
const small = () =>
  data({
    lines: [
      line(
        "001A",
        "Dr Ada Field",
        "PERSONA",
        "Knee",
        "Primary",
        months([3, 2])
      ),
      line(
        "001A",
        "Dr Ada Field",
        "CABLE PRODUCTS",
        "Knee",
        "Primary",
        months([1])
      ),
      line(
        "001A",
        "Dr Ada Field",
        "PERSONA",
        "Knee",
        "Revision",
        months([0, 1])
      ),
      line(
        "001B",
        "Dr Ben Moss",
        "AVENIR COMPLETE",
        "Hip",
        "Primary",
        months([2])
      ),
      line(
        "001B",
        "Dr Ben Moss",
        "CABLE PRODUCTS",
        "Hip",
        "Demo",
        months([0, 0, 1])
      )
    ]
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
    ).toEqual([
      "Hip 119",
      "Knee 96",
      "Shoulder 48",
      "CMFT 14",
      "Primary 277",
      "Revision 0",
      "Demo 0"
    ]);
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
      data({ hasBookings: false, booked: 0, types: [], lines: [] })
    );
    const el = make();
    await flush();
    expect(q(el, ".none").textContent).toBe(
      "No MyCase bookings at Harbourview Health Campus in the last 12 months."
    );
    expect(q(el, "svg[role=img]")).toBeNull();
  });

  it("says so when the deal has no hospital", async () => {
    getHospitalBookings.mockResolvedValue(
      data({ hospitalId: null, hospitalName: null, hasBookings: false })
    );
    const el = make();
    await flush();
    expect(q(el, ".none").textContent).toBe("This deal has no hospital.");
    expect(q(el, "svg[role=img]")).toBeNull();
  });

  it("shows the error when the bookings cannot be read", async () => {
    getHospitalBookings.mockRejectedValue({ body: { message: "No access" } });
    const el = make();
    await flush();
    expect(q(el, ".none").textContent).toBe("No access");
    expect(q(el, "svg[role=img]")).toBeNull();
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

  const chip = (el, key) => q(el, `.lg[data-key="${key}"]`);
  const chipText = (el) =>
    qa(el, ".lg").map((l) => l.textContent.replace(/\s+/g, " ").trim());
  const slide = async (el, value) => {
    q(el, "c-pipeline-segmented").dispatchEvent(
      new CustomEvent("change", { detail: { value } })
    );
    await flush();
  };

  it("switches a type or a case Type off and on: the bars, the other row's numbers and the big number follow", async () => {
    getHospitalBookings.mockResolvedValue(small());
    const el = make();
    await flush();
    expect(chipText(el)).toEqual([
      "Hip 3",
      "Knee 7",
      "Shoulder 0",
      "CMFT 0",
      "Primary 8",
      "Revision 1",
      "Demo 1"
    ]);
    expect(q(el, ".big").textContent).toBe("10");
    chip(el, "Knee").click();
    await flush();
    expect(chip(el, "Knee").className).toContain("off");
    expect(chip(el, "Knee").getAttribute("aria-pressed")).toBe("false");
    expect(q(el, ".big").textContent).toBe("3");
    expect(chipText(el).slice(4)).toEqual([
      "Primary 2",
      "Revision 0",
      "Demo 1"
    ]);
    chip(el, "Demo").click();
    await flush();
    expect(q(el, ".big").textContent).toBe("2");
    expect(chipText(el)[0]).toBe("Hip 2");
    chip(el, "Knee").click();
    await flush();
    expect(q(el, ".big").textContent).toBe("9");
  });

  it("slides to Surgeon Total: a row per surgeon, busiest first, a number per month and a Hospital total row", async () => {
    getHospitalBookings.mockResolvedValue(small());
    const el = make();
    await flush();
    await slide(el, "surgeon");
    expect(q(el, "svg[role=img]")).toBeNull();
    const rows = qa(el, "tbody tr");
    expect(rows).toHaveLength(3);
    expect(rows[0].querySelector("b").textContent).toBe("Dr Ada Field");
    expect(rows[0].querySelector(".sub").textContent).toBe("Knee 7");
    expect(rows[0].querySelector(".t").textContent).toBe("7");
    expect(
      [...rows[0].querySelectorAll(".num")]
        .slice(0, 3)
        .map((n) => n.textContent)
    ).toEqual(["4", "3", "0"]);
    expect(rows[2].textContent).toContain("Hospital total");
    expect(rows[2].querySelector(".t").textContent).toBe("10");
    const cell = rows[0].querySelector(".num");
    cell.dispatchEvent(
      new MouseEvent("mousemove", { clientX: 30, clientY: 30 })
    );
    await flush();
    expect(q(el, ".tip").textContent).toContain("November 2025");
    expect(q(el, ".tip").textContent).toContain("Knee: 4");
  });

  it("slides to Surgeon / Brand: a row per brand under each surgeon, the name once, a brand used for two types on two rows", async () => {
    getHospitalBookings.mockResolvedValue(small());
    const el = make();
    await flush();
    await slide(el, "brand");
    const rows = qa(el, "tbody tr");
    expect(rows).toHaveLength(5);
    expect(qa(el, "td.sg")).toHaveLength(2);
    expect(qa(el, "td.sg")[0].getAttribute("rowspan")).toBe("2");
    expect(qa(el, "td.br").map((t) => t.textContent)).toEqual([
      "PERSONA",
      "CABLE PRODUCTS",
      "AVENIR COMPLETE",
      "CABLE PRODUCTS"
    ]);
    expect(rows[0].querySelector(".t").textContent).toBe("6");
    expect(rows[4].querySelector(".t").textContent).toBe("10");
  });

  it("filters brands and surgeons in Surgeon / Brand: totals follow, the button fills, and the filter stays through the chips and the views", async () => {
    getHospitalBookings.mockResolvedValue(small());
    const el = make();
    await flush();
    await slide(el, "brand");
    const brandBtn = () => q(el, '.fbtn[data-kind="brand"]');
    expect(brandBtn().className).not.toContain("act");
    brandBtn().click();
    await flush();
    expect(q(el, ".fpop")).not.toBeNull();
    expect(qa(el, ".fi:not(.all) .lbl").map((x) => x.textContent)).toEqual([
      "AVENIR COMPLETE",
      "CABLE PRODUCTS",
      "PERSONA"
    ]);
    q(el, '.fi[data-value="CABLE PRODUCTS"]').click();
    await flush();
    expect(q(el, '.fi[data-value="CABLE PRODUCTS"]').className).toContain(
      "off"
    );
    expect(q(el, ".fi.all").className).toContain("part");
    expect(brandBtn().className).toContain("act");
    expect(q(el, ".big").textContent).toBe("8");
    expect(qa(el, "td.br").map((t) => t.textContent)).toEqual([
      "PERSONA",
      "AVENIR COMPLETE"
    ]);
    // the search narrows the list, the round cross empties it
    const input = q(el, ".fin input");
    input.value = "pers";
    input.dispatchEvent(new CustomEvent("input"));
    await flush();
    expect(qa(el, ".fi:not(.all)")).toHaveLength(1);
    q(el, ".sclear").click();
    await flush();
    expect(qa(el, ".fi:not(.all)")).toHaveLength(3);
    // a surgeon too
    q(el, '.fbtn[data-kind="surgeon"]').click();
    await flush();
    q(el, '.fi[data-value="001B"]').click();
    await flush();
    expect(q(el, ".big").textContent).toBe("6");
    // the other views do not use these filters; coming back keeps them
    await slide(el, "hospital");
    expect(q(el, ".big").textContent).toBe("10");
    expect(q(el, ".fpop.on")).toBeNull(); // folding away
    await slide(el, "brand");
    expect(q(el, ".big").textContent).toBe("6");
    expect(q(el, '.fbtn[data-kind="surgeon"]').className).toContain("act");
  });

  it("Select all switches every listed item back on when some are off, and all off when none are", async () => {
    getHospitalBookings.mockResolvedValue(small());
    const el = make();
    await flush();
    await slide(el, "brand");
    q(el, '.fbtn[data-kind="brand"]').click();
    await flush();
    q(el, ".fi.all").click();
    await flush();
    expect(q(el, ".fi.all").className).toContain("off");
    expect(q(el, ".big").textContent).toBe("0");
    q(el, ".fi.all").click();
    await flush();
    expect(q(el, ".fi.all").className).not.toContain("off");
    expect(q(el, ".big").textContent).toBe("10");
  });

  it("the filter panel unfolds a moment after it is put on the page and folds before it is taken off", async () => {
    jest.useFakeTimers();
    getHospitalBookings.mockResolvedValue(small());
    const el = make();
    await Promise.resolve();
    await Promise.resolve();
    jest.runOnlyPendingTimers();
    await Promise.resolve();
    q(el, "c-pipeline-segmented").dispatchEvent(
      new CustomEvent("change", { detail: { value: "brand" } })
    );
    await Promise.resolve();
    q(el, '.fbtn[data-kind="brand"]').click();
    await Promise.resolve();
    expect(q(el, ".fpop").className).toBe("fpop");
    jest.advanceTimersByTime(40);
    await Promise.resolve();
    expect(q(el, ".fpop").className).toBe("fpop on");
    q(el, ".fcatch").click();
    await Promise.resolve();
    expect(q(el, ".fpop").className).toBe("fpop");
    jest.advanceTimersByTime(460);
    await Promise.resolve();
    expect(q(el, ".fpop")).toBeNull();
    jest.useRealTimers();
  });

  it("opens on the person's saved view and chips, and sends every change of view or chip up to be saved (never the surgeon or brand filters)", async () => {
    getHospitalBookings.mockResolvedValue(small());
    const el = createElement("c-pipeline-hospital-bookings", {
      is: PipelineHospitalBookings
    });
    el.saved = { view: "surgeon", types: ["Hip"], procs: ["Demo"] };
    el.recordId = "a1";
    const sent = [];
    el.addEventListener("prefschange", (e) => sent.push(e.detail));
    document.body.appendChild(el);
    await flush();
    expect(qa(el, "tbody tr")).toHaveLength(2); // Surgeon Total: one surgeon (knees only) and the total row
    expect(chip(el, "Hip").className).toContain("off");
    expect(chip(el, "Demo").className).toContain("off");
    expect(q(el, ".big").textContent).toBe("7");
    chip(el, "Revision").click();
    await flush();
    expect(sent[sent.length - 1]).toEqual({
      view: "surgeon",
      types: ["Hip"],
      procs: ["Demo", "Revision"]
    });
    await slide(el, "brand");
    expect(sent[sent.length - 1].view).toBe("brand");
    q(el, '.fbtn[data-kind="brand"]').click();
    await flush();
    const before = sent.length;
    q(el, '.fi[data-value="PERSONA"]').click();
    await flush();
    expect(sent).toHaveLength(before);
  });
});
