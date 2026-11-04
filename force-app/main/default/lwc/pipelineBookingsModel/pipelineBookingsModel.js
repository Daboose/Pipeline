/**
 * Pipeline: the pure logic of the My Case Bookings panel, with no screen so it can be tested on its own: the month labels,
 * the geometry of each stacked bar graph (primary under revision, 13 columns: the 12 whole months and this month so far), and
 * which hospital's cases a graph shows.
 *
 * Graphs only (Robert, 2026-11-04, mockup pipeline_case_bookings_simple_v2): the comparison with the surgeon's usages, the
 * suggestions and the saving that used to be here were taken out and are kept in git (tag usage-reconciliation-v0.54) for a
 * future Usage Management component.
 *
 * Who calls it: the pipelineBookings component and its tests. It reads the shape PipelineBookingsController.getBookings returns.
 */
export const ALL = "all";
const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec"
];

/** The 12 month labels from the first day of the first month ("2025-11-01" gives Nov, Dec, Jan ...). */
export function monthLabels(startIso) {
  const m = Number(String(startIso || "").slice(5, 7)) || 1;
  return Array.from({ length: 12 }, (_, i) => MONTH_NAMES[(m - 1 + i) % 12]);
}
/** The label of the month so far, which is the month after the 12 whole months. */
export function nextMonthLabel(startIso) {
  const m = Number(String(startIso || "").slice(5, 7)) || 1;
  return MONTH_NAMES[(m - 1 + 12) % 12];
}

const sum = (list) => (list || []).reduce((a, b) => a + b, 0);
export const rowKey = (row) => (row && row.id) || "none";

/**
 * What one graph shows for a type of surgery. With one hospital there is no list and the graph is that hospital's; with more
 * than one, "all" is the whole type and any other key is that hospital. A key that is no longer there falls back to all.
 * Returns the numbers to draw and the words for the heading line.
 */
export function viewOf(type, selected) {
  const rows = type.rows || [];
  const many = rows.length > 1;
  const row = many ? rows.find((r) => rowKey(r) === selected) : rows[0];
  const shown = row || type;
  const primary = sum(shown.primary);
  const revision = type.split ? sum(shown.revision) : 0;
  let where = "";
  if (!many && row) {
    where = row.id
      ? `all at ${row.name}`
      : "the hospital is not recorded on these surgeries";
  } else if (row) {
    where = `${row.name} only`;
  }
  return {
    many,
    selectedKey: many && row ? rowKey(row) : ALL,
    graph: {
      split: type.split,
      primary: shown.primary,
      revision: shown.revision,
      partial: shown.partial
    },
    booked: primary + revision,
    primaryTotal: primary,
    revisionTotal: revision,
    where
  };
}

/** The lines of the hospital list: All hospitals first, then each hospital, with what they booked. */
export function hospitalList(type, selected) {
  const rows = type.rows || [];
  const text = (o) => {
    const p = sum(o.primary);
    const r = type.split ? sum(o.revision) : 0;
    return type.split
      ? `${p + r} cases · ${p} primary, ${r} revision`
      : `${p} cases`;
  };
  const line = (key, name, o) => ({
    key,
    name,
    text: text(o),
    cls: "hrow" + (key === selected ? " on" : "")
  });
  return [line(ALL, "All hospitals", type)].concat(
    rows.map((r) => line(rowKey(r), r.name, r))
  );
}

function niceStep(max) {
  return [1, 2, 5, 10, 20, 50, 100, 200, 500].find((s) => max / s <= 5) || 1000;
}

/** The size and place of every part of one stacked bar graph (13 columns: 12 whole months and this month so far). */
export function chartModel(graph, startIso, size) {
  const W = (size && size.w) || 580;
  const H = (size && size.h) || 250;
  const L = 34;
  const T = 26;
  const B = 34;
  const R = 12;
  const labels = monthLabels(startIso).concat([nextMonthLabel(startIso) + "*"]);
  const prim = graph.primary.concat([graph.partial[0] || 0]);
  const rev = graph.split
    ? graph.revision.concat([graph.partial[1] || 0])
    : null;
  const totals = prim.map((p, i) => p + (rev ? rev[i] : 0));
  const max = Math.max(...totals);
  const step = niceStep(max);
  const top = Math.max(4, (Math.floor(max / step) + 1) * step);
  const ph = H - T - B;
  const bw = (W - L - R) / 13;
  const y = (v) => T + ph - (v / top) * ph;
  const grid = [];
  for (let g = 0; g <= top; g += step)
    grid.push({
      key: "g" + g,
      y: y(g),
      ty: y(g) + 4,
      tx: L - 8,
      x1: L,
      x2: W - R,
      label: g
    });
  const bars = labels.map((label, i) => {
    const x = L + bw * i + (bw - bw * 0.66) / 2;
    const w = bw * 0.66;
    const partial = i === 12;
    let at = y(0);
    const segments = [];
    const add = (count, kind, what) => {
      if (count <= 0) return;
      const h = (count / top) * ph;
      at -= h;
      segments.push({
        key: kind + i,
        x,
        y: at,
        w,
        h,
        fill: `var(--bar-${kind})`,
        title: `${label.replace("*", "")}: ${count} ${what}`.trim()
      });
    };
    add(
      prim[i],
      graph.split ? "primary" : "cmft",
      graph.split ? "primary" : ""
    );
    if (rev) add(rev[i], "revision", "revision");
    return {
      key: "b" + i,
      label,
      lx: x + w / 2,
      ly: H - 12,
      tx: x + w / 2,
      ty: at - 6,
      total: totals[i] > 0 ? totals[i] : "",
      opacity: partial ? 0.45 : 1,
      segments
    };
  });
  return { viewBox: `0 0 ${W} ${H}`, grid, bars };
}
