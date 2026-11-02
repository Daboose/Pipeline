/**
 * Pipeline: the pure logic of the My Case Bookings panel, with no screen so it can be tested on its own: the month labels,
 * the 10% rule that says whether the surgeon's ZB usages match the bookings, and the geometry of each stacked bar graph.
 *
 * The rule (Robert, 2026-11-02): the ZB cases a year in the usages are compared with the surgeries booked in the last 12
 * whole months; within 10% either way is accurate, further out should be adjusted. Only ZB is compared, because the
 * competitors' numbers are not known.
 */
export const TOLERANCE = 0.1;
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

/** The 12 month labels from the first day of the first month ("2025-11-01" gives Nov, Dec, Jan ...), then the month so far. */
export function monthLabels(startIso) {
  const m = Number(String(startIso || "").slice(5, 7)) || 1;
  return Array.from({ length: 12 }, (_, i) => MONTH_NAMES[(m - 1 + i) % 12]);
}
export function nextMonthLabel(startIso) {
  const m = Number(String(startIso || "").slice(5, 7)) || 1;
  return MONTH_NAMES[(m - 1 + 12) % 12];
}

/** An average per month for display: 17, or 5.3 below ten. */
export function perMonth(total) {
  const v = (Number(total) || 0) / 12;
  return v >= 10 ? Math.round(v) : Math.round(v * 10) / 10;
}

/**
 * What the check says for one type of surgery.
 * kind: missing (no usage at all for this type), competitor (usages exist but list no ZB), good (within 10%) or adjust.
 */
export function usageCheck(type) {
  const booked = type.booked || 0;
  const per = perMonth(booked);
  if (type.usage === "none") return { kind: "missing", booked, per };
  if (type.usage === "competitor") return { kind: "competitor", booked, per };
  const zb = Number(type.zb) || 0;
  if (zb <= 0)
    return { kind: "adjust", direction: "low", pct: null, booked, per, zb };
  const diff = (booked - zb) / zb;
  if (Math.abs(diff) <= TOLERANCE) return { kind: "good", booked, per, zb };
  return {
    kind: "adjust",
    direction: diff > 0 ? "low" : "high",
    pct: Math.round(Math.abs(diff) * 100),
    booked,
    per,
    zb
  };
}

function niceStep(max) {
  return [1, 2, 5, 10, 20, 50, 100, 200, 500].find((s) => max / s <= 5) || 1000;
}

/** The size and place of every part of one type's stacked bar graph (13 columns: 12 whole months and this month so far). */
export function chartModel(type, startIso) {
  const W = 580;
  const H = 250;
  const L = 34;
  const T = 26;
  const B = 34;
  const zb = Number(type.zb) > 0 ? Number(type.zb) : 0;
  const R = zb ? 74 : 12;
  const labels = monthLabels(startIso).concat([nextMonthLabel(startIso) + "*"]);
  const prim = type.primary.concat([type.partial[0] || 0]);
  const rev = type.split ? type.revision.concat([type.partial[1] || 0]) : null;
  const totals = prim.map((p, i) => p + (rev ? rev[i] : 0));
  const usageMonthly = zb ? zb / 12 : null;
  const max = Math.max(...totals, usageMonthly || 0);
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
    add(prim[i], type.split ? "primary" : "cmft", type.split ? "primary" : "");
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
  const line = usageMonthly
    ? {
        y: y(usageMonthly),
        x1: L,
        x2: W - R,
        lx: W - R + 6,
        words: ["usages", "say " + perMonthUsage(usageMonthly), "a month"].map(
          (t, k) => ({ key: "w" + k, text: t, y: y(usageMonthly) - 6 + k * 15 })
        )
      }
    : null;
  return { viewBox: `0 0 ${W} ${H}`, grid, bars, line };
}

function perMonthUsage(v) {
  return v >= 10 ? Math.round(v) : Math.round(v * 10) / 10;
}
