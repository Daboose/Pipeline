/**
 * Pipeline: the pure logic of the hospital's MyCase bookings chart on a ROSA deal (Robert, 2026-11-19; mockup
 * docs/mockups/pipeline_rosa_hospital_bookings_v1.html and pipeline_deal_screens_v1.html): the type labels and colours, the month
 * labels and window text, the totals, and the geometry of the stacked bar chart (one bar per month for the last 12 whole months,
 * Hip, Knee, Shoulder and CMFT stacked) measured to the box it is given. No screen here, so it can be tested on its own.
 *
 * Who calls it: the pipelineHospitalBookings component and its tests. It reads the shape
 * PipelineBookingsController.getHospitalBookings returns (types: [{ name, months[12], booked }], windowStart, windowEnd).
 */

/** The word shown for the third type. Robert has not yet chosen Shoulder or Extremities: this is the one place to change it. */
export const SHOULDER_LABEL = "Shoulder";

/**
 * The four types in stacking order (Hip at the bottom). `name` is what Apex sends, `label` what is shown, `colour` the colour
 * variable (the app's own bar colours where it has them, with the mockup's light values as the fallback).
 */
export const TYPES = [
  { name: "Hip", label: "Hip", colour: "var(--bar-primary, #2563eb)" },
  { name: "Knee", label: "Knee", colour: "var(--bar-cmft, #0d9488)" },
  {
    name: "Shoulder",
    label: SHOULDER_LABEL,
    colour: "var(--state, #7c3aed)"
  },
  { name: "CMFT", label: "CMFT", colour: "var(--bar-revision, #ea580c)" }
];

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];
const sum = (list) => (list || []).reduce((a, b) => a + b, 0);

/** The year and month (1 to 12) of an ISO date string, without any time zone. */
function ym(iso) {
  const s = String(iso || "");
  return { y: Number(s.slice(0, 4)) || 0, m: Number(s.slice(5, 7)) || 1 };
}

/** "2025-11-01" and "2026-10-31" give "November 2025 to October 2026". */
export function windowText(startIso, endIso) {
  const a = ym(startIso);
  const b = ym(endIso);
  return `${MONTH_NAMES[a.m - 1]} ${a.y} to ${MONTH_NAMES[b.m - 1]} ${b.y}`;
}

/** The 12 month labels: short month names, with the two-digit year on the first and on every January ("Nov 25", Dec, "Jan 26"). */
export function monthLabels(startIso) {
  const a = ym(startIso);
  return Array.from({ length: 12 }, (_, i) => {
    const idx = (a.m - 1 + i) % 12;
    const year = a.y + Math.floor((a.m - 1 + i) / 12);
    const short = MONTH_NAMES[idx].slice(0, 3);
    return i === 0 || idx === 0 ? `${short} ${String(year).slice(2)}` : short;
  });
}

/** The long form used in the tooltip: "November 2025". */
export function monthTitles(startIso) {
  const a = ym(startIso);
  return Array.from({ length: 12 }, (_, i) => {
    const idx = (a.m - 1 + i) % 12;
    const year = a.y + Math.floor((a.m - 1 + i) / 12);
    return `${MONTH_NAMES[idx]} ${year}`;
  });
}

/** The four types from what Apex sent (missing ones are zeros), in stacking order. */
export function typesOf(data) {
  const sent = (data && data.types) || [];
  return TYPES.map((t) => {
    const found = sent.find((s) => s.name === t.name);
    const sentMonths = (found && found.months) || [];
    const months = Array.from({ length: 12 }, (_, i) => sentMonths[i] || 0);
    return { ...t, months, booked: sum(months) };
  });
}

/** The cases of each month across the four types, and the grand total. */
export function totalsOf(types) {
  const months = Array.from({ length: 12 }, (_, i) =>
    sum(types.map((t) => t.months[i]))
  );
  return { months, grand: sum(months) };
}

/** The legend: each type's colour, label and 12-month total. */
export function legendOf(types) {
  return types.map((t) => ({
    key: t.name,
    label: t.label,
    booked: t.booked,
    style: "background:" + t.colour
  }));
}

/** A tidy step for the scale lines so there are about five of them. */
export function niceStep(max) {
  return [1, 2, 5, 10, 20, 50, 100, 200, 500].find((s) => max / s <= 5) || 1000;
}

/**
 * The size and place of every part of the chart, for a box of `size` ({ w, h } in pixels). Bars are 62% of their slot and never
 * wider than 90 px. Every segment carries the words of its tooltip.
 */
export function chartModel(types, startIso, size) {
  const W = (size && size.w) || 640;
  const H = (size && size.h) || 300;
  const L = 46;
  const R = 12;
  const T = 30;
  const B = 34;
  const labels = monthLabels(startIso);
  const titles = monthTitles(startIso);
  const totals = totalsOf(types).months;
  const max = Math.max(...totals, 0);
  const step = niceStep(max);
  const top = Math.max(step, Math.ceil(max / step) * step);
  const ph = Math.max(H - T - B, 10);
  const slot = (W - L - R) / 12;
  const bw = Math.min(slot * 0.62, 90);
  const y = (v) => T + ph - (v / top) * ph;
  const grid = [];
  for (let g = 0; g <= top; g += step) {
    grid.push({
      key: "g" + g,
      y: y(g),
      ty: y(g) + 5,
      tx: L - 8,
      x1: L,
      x2: W - R,
      label: g
    });
  }
  const bars = labels.map((label, i) => {
    const x = L + slot * i + (slot - bw) / 2;
    let acc = 0;
    const segments = [];
    types.forEach((t) => {
      const v = t.months[i];
      if (!v) return;
      const yTop = y(acc + v);
      segments.push({
        key: t.name + i,
        x,
        y: yTop,
        w: bw,
        h: y(acc) - yTop,
        fill: t.colour,
        m: i,
        t: t.name
      });
      acc += v;
    });
    return {
      key: "b" + i,
      segments,
      tx: x + bw / 2,
      ty: y(totals[i]) - 8,
      total: totals[i],
      lx: x + bw / 2,
      ly: T + ph + 24,
      label,
      title: titles[i]
    };
  });
  return { viewBox: `0 0 ${W} ${H}`, grid, bars };
}

/** The tooltip's lines for one segment: the month, the type with its cases, the month's total. */
export function tipFor(types, startIso, monthIndex, typeName) {
  const t = types.find((x) => x.name === typeName);
  const total = totalsOf(types).months[monthIndex];
  const v = t ? t.months[monthIndex] : 0;
  return {
    month: monthTitles(startIso)[monthIndex],
    line: `${t ? t.label : typeName}: ${v} ${v === 1 ? "case" : "cases"}`,
    total: `Month total: ${total}`
  };
}
