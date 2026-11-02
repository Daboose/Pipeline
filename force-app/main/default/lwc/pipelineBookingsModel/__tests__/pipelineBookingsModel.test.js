import {
  monthLabels,
  perMonth,
  usageCheck,
  chartModel,
  TOLERANCE
} from "c/pipelineBookingsModel";

const type = (over) => ({
  name: "Knee",
  split: true,
  primary: [6, 7, 5, 8, 7, 6, 8, 7, 6, 7, 8, 6],
  revision: [0, 1, 0, 1, 0, 1, 0, 0, 1, 0, 0, 0],
  partial: [1, 0],
  booked: 85,
  usage: "zb",
  zb: 85,
  ...over
});

describe("pipelineBookingsModel", () => {
  it("labels the 12 months from the first day of the window", () => {
    expect(monthLabels("2025-11-01")).toEqual([
      "Nov",
      "Dec",
      "Jan",
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
    expect(monthLabels("2026-01-01")[0]).toBe("Jan");
  });

  it("gives an average per month: whole above ten, one decimal below", () => {
    expect(perMonth(204)).toBe(17);
    expect(perMonth(64)).toBe(5.3);
    expect(perMonth(0)).toBe(0);
  });

  it("says accurate within 10% either way and adjust beyond it", () => {
    expect(TOLERANCE).toBe(0.1);
    expect(usageCheck(type({ booked: 85, zb: 85 })).kind).toBe("good");
    expect(usageCheck(type({ booked: 93, zb: 85 })).kind).toBe("good"); // +9.4%
    expect(usageCheck(type({ booked: 77, zb: 85 })).kind).toBe("good"); // -9.4%
    const low = usageCheck(type({ booked: 85, zb: 40 }));
    expect(low).toMatchObject({ kind: "adjust", direction: "low", pct: 113 });
    const high = usageCheck(type({ booked: 64, zb: 100 }));
    expect(high).toMatchObject({
      kind: "adjust",
      direction: "high",
      pct: 36,
      per: 5.3
    });
  });

  it("treats missing and competitor-only usages separately, and zero ZB as low", () => {
    expect(usageCheck(type({ usage: "none", zb: 0 })).kind).toBe("missing");
    expect(usageCheck(type({ usage: "competitor", zb: 0 })).kind).toBe(
      "competitor"
    );
    expect(usageCheck(type({ usage: "zb", zb: 0 }))).toMatchObject({
      kind: "adjust",
      direction: "low",
      pct: null
    });
  });

  it("draws 13 stacked columns, primary under revision, with the usage line when ZB usages exist", () => {
    const m = chartModel(type(), "2025-11-01");
    expect(m.bars.length).toBe(13);
    expect(m.bars[0].label).toBe("Nov");
    expect(m.bars[12].label).toBe("Nov*");
    expect(m.bars[12].opacity).toBe(0.45);
    expect(m.bars[1].segments.length).toBe(2); // Dec has primary 7 and revision 1
    const [primary, revision] = m.bars[1].segments;
    expect(primary.fill).toBe("var(--bar-primary)");
    expect(revision.fill).toBe("var(--bar-revision)");
    expect(revision.y).toBeLessThan(primary.y); // revision sits on top
    expect(m.bars[1].total).toBe(8);
    expect(m.line).not.toBeNull();
    expect(m.line.words[1].text).toBe("say 7.1");
    expect(
      chartModel(type({ usage: "none", zb: 0 }), "2025-11-01").line
    ).toBeNull();
  });

  it("draws CMFT in one colour and has no revision segments", () => {
    const m = chartModel(
      type({ name: "CMFT", split: false, revision: null, partial: [1, 0] }),
      "2025-11-01"
    );
    m.bars.forEach((b) =>
      b.segments.forEach((s) => expect(s.fill).toBe("var(--bar-cmft)"))
    );
  });

  it("chooses a readable gridline step for large totals", () => {
    const m = chartModel(
      type({
        primary: [60, 40, 50, 55, 62, 48, 45, 52, 71, 58, 61, 52],
        revision: new Array(12).fill(0)
      }),
      "2025-11-01"
    );
    expect(m.grid.length).toBeLessThanOrEqual(7);
  });
});
