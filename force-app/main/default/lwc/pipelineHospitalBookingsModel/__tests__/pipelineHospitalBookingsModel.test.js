import {
  SHOULDER_LABEL,
  TYPES,
  windowText,
  monthLabels,
  monthTitles,
  typesOf,
  totalsOf,
  legendOf,
  niceStep,
  chartModel,
  tipFor
} from "../pipelineHospitalBookingsModel";

const months = (a) => a.concat(Array(12 - a.length).fill(0));
const data = {
  windowStart: "2025-11-01",
  windowEnd: "2026-10-31",
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
  ]
};

describe("pipelineHospitalBookingsModel", () => {
  it("keeps the third label in one constant", () => {
    expect(SHOULDER_LABEL).toBe("Shoulder");
    expect(TYPES.map((t) => t.label)).toEqual([
      "Hip",
      "Knee",
      SHOULDER_LABEL,
      "CMFT"
    ]);
  });

  it("words the window from the first and last day", () => {
    expect(windowText("2025-11-01", "2026-10-31")).toBe(
      "November 2025 to October 2026"
    );
  });

  it("labels the 12 months with the year on the first and on every January", () => {
    expect(monthLabels("2025-11-01")).toEqual([
      "Nov 25",
      "Dec",
      "Jan 26",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct"
    ]);
    expect(monthTitles("2025-11-01")[0]).toBe("November 2025");
    expect(monthTitles("2025-11-01")[2]).toBe("January 2026");
  });

  it("always gives the four types in order, with zeros for one Apex did not send", () => {
    const t = typesOf({ types: [{ name: "Knee", months: [1, 2] }] });
    expect(t.map((x) => x.name)).toEqual(["Hip", "Knee", "Shoulder", "CMFT"]);
    expect(t[0].booked).toBe(0);
    expect(t[1].months).toHaveLength(12);
    expect(t[1].booked).toBe(3);
    expect(typesOf(undefined)).toHaveLength(4);
  });

  it("totals each month and the whole window", () => {
    const totals = totalsOf(typesOf(data));
    expect(totals.months).toEqual([
      20, 15, 15, 23, 26, 22, 24, 25, 27, 24, 27, 29
    ]);
    expect(totals.grand).toBe(277);
  });

  it("builds the legend with each type's 12-month total", () => {
    const legend = legendOf(typesOf(data));
    expect(legend.map((l) => l.booked)).toEqual([119, 96, 48, 14]);
    expect(legend[0].style).toContain("var(--bar-primary");
  });

  it("picks about five scale lines", () => {
    expect(niceStep(3)).toBe(1);
    expect(niceStep(29)).toBe(10);
    expect(niceStep(60)).toBe(20);
  });

  it("draws 12 stacked bars to the size it is given", () => {
    const c = chartModel(typesOf(data), "2025-11-01", { w: 1000, h: 400 });
    expect(c.viewBox).toBe("0 0 1000 400");
    expect(c.bars).toHaveLength(12);
    expect(c.bars[0].total).toBe(20);
    expect(c.bars[0].segments).toHaveLength(4);
    // stacked: Hip at the bottom, each next one higher, and together as tall as the month's total
    const s = c.bars[0].segments;
    expect(s[0].y).toBeGreaterThan(s[1].y);
    const bottom = s[0].y + s[0].h;
    expect(s[3].y).toBeLessThan(s[0].y);
    const bar0 = s.reduce((a, x) => a + x.h, 0);
    const bar1 = c.bars[1].segments.reduce((a, x) => a + x.h, 0);
    expect(bar0 / bar1).toBeCloseTo(20 / 15, 5);
    expect(bottom).toBeLessThan(400);
    // the scale reaches the busiest month
    expect(Math.max(...c.grid.map((g) => g.label))).toBeGreaterThanOrEqual(29);
    // narrower box, narrower bars
    const narrow = chartModel(typesOf(data), "2025-11-01", { w: 500, h: 400 });
    expect(narrow.bars[0].segments[0].w).toBeLessThan(c.bars[0].segments[0].w);
  });

  it("leaves out a type with no cases that month and copes with no size and no cases", () => {
    const c = chartModel(typesOf(data), "2025-11-01");
    expect(c.bars[1].segments.map((s) => s.t)).toEqual([
      "Hip",
      "Knee",
      "Shoulder"
    ]);
    const empty = chartModel(typesOf({ types: [] }), "2025-11-01", {
      w: 600,
      h: 300
    });
    expect(empty.bars.every((b) => b.segments.length === 0)).toBe(true);
    expect(empty.grid.length).toBeGreaterThan(1);
  });

  it("words the tooltip: month, type with cases, month total", () => {
    const t = tipFor(typesOf(data), "2025-11-01", 11, "Hip");
    expect(t.month).toBe("October 2026");
    expect(t.line).toBe("Hip: 13 cases");
    expect(t.total).toBe("Month total: 29");
    expect(tipFor(typesOf(data), "2025-11-01", 1, "CMFT").line).toBe(
      "CMFT: 0 cases"
    );
    expect(
      tipFor(
        typesOf({ types: [{ name: "Hip", months: [1] }] }),
        "2025-11-01",
        0,
        "Hip"
      ).line
    ).toBe("Hip: 1 case");
  });
});
