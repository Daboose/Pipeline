import {
  monthLabels,
  nextMonthLabel,
  chartModel,
  viewOf,
  hospitalList,
  ALL
} from "c/pipelineBookingsModel";

const zeros = () => Array(12).fill(0);
const row = (id, name, primary, revision) => ({
  id,
  name,
  primary,
  revision: revision || zeros(),
  partial: [0, 0]
});
const type = (rows, over) => {
  const sumAll = (k) =>
    zeros().map((_, i) => rows.reduce((a, r) => a + r[k][i], 0));
  return {
    name: "Knee",
    split: true,
    primary: sumAll("primary"),
    revision: sumAll("revision"),
    partial: [1, 0],
    rows,
    ...over
  };
};
const a = row(
  "h1",
  "Hospital A",
  [2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]
);
const b = row("h2", "Hospital B", [0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

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
    expect(nextMonthLabel("2025-11-01")).toBe("Nov");
  });

  it("draws 13 stacked columns, primary under revision, the last one lighter", () => {
    const t = type([a, b]);
    const m = chartModel(viewOf(t, ALL).graph, "2025-11-01");
    expect(m.bars).toHaveLength(13);
    const last = m.bars[11];
    expect(last.segments.map((s) => s.key)).toEqual([
      "primary11",
      "revision11"
    ]);
    expect(last.total).toBe(2);
    expect(m.bars[12].opacity).toBeLessThan(1);
    expect(m.bars[12].label).toBe("Nov*");
    expect(m.bars[4].total).toBe("");
  });

  it("draws CMFT in one colour with no revision segments", () => {
    const t = type([a], { name: "CMFT", split: false });
    const m = chartModel(viewOf(t, ALL).graph, "2025-11-01");
    const keys = m.bars.flatMap((x) => x.segments.map((s) => s.key));
    expect(keys.every((k) => k.startsWith("cmft"))).toBe(true);
  });

  it("chooses a readable gridline step for large totals", () => {
    const big = row("h1", "Big", [60, ...Array(11).fill(0)]);
    const m = chartModel(viewOf(type([big]), ALL).graph, "2025-11-01");
    expect(m.grid.length).toBeLessThanOrEqual(7);
  });
});

describe("pipelineBookingsModel: which hospital a graph shows", () => {
  it("with one hospital shows its graph with no list and names it", () => {
    const v = viewOf(type([a]), "anything");
    expect(v.many).toBe(false);
    expect(v.where).toBe("all at Hospital A");
    expect(v.booked).toBe(5);
    expect(v.graph.primary).toEqual(a.primary);
  });

  it("says so when the only entry is surgeries with no hospital recorded", () => {
    const none = row(null, "No hospital recorded", [1, ...Array(11).fill(0)]);
    expect(viewOf(type([none]), ALL).where).toMatch(/not recorded/);
  });

  it("with several hospitals shows all of them, or one when chosen", () => {
    const t = type([a, b]);
    const all = viewOf(t, ALL);
    expect(all.many).toBe(true);
    expect(all.where).toBe("");
    expect(all.booked).toBe(8);
    expect(all.primaryTotal).toBe(7);
    expect(all.revisionTotal).toBe(1);
    const one = viewOf(t, "h2");
    expect(one.selectedKey).toBe("h2");
    expect(one.where).toBe("Hospital B only");
    expect(one.booked).toBe(3);
    expect(one.graph.primary).toEqual(b.primary);
  });

  it("falls back to all hospitals when the chosen one is gone", () => {
    const v = viewOf(type([a, b]), "gone");
    expect(v.selectedKey).toBe(ALL);
    expect(v.booked).toBe(8);
  });

  it("lists All hospitals first, then each hospital with its cases", () => {
    const list = hospitalList(type([a, b]), "h1");
    expect(list.map((x) => x.name)).toEqual([
      "All hospitals",
      "Hospital A",
      "Hospital B"
    ]);
    expect(list[0].text).toBe("8 cases · 7 primary, 1 revision");
    expect(list[1].cls).toBe("hrow on");
    expect(list[2].cls).toBe("hrow");
    const cmft = hospitalList(type([a], { split: false }), ALL);
    expect(cmft[0].text).toBe("4 cases");
  });
});
