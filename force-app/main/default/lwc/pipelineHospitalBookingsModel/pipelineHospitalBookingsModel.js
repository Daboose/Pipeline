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

/** The 12 month labels: short month names, each with its two-digit year ("Nov 25", "Dec 25", "Jan 26"; Robert, 2026-11-28). */
export function monthLabels(startIso) {
  const a = ym(startIso);
  return Array.from({ length: 12 }, (_, i) => {
    const idx = (a.m - 1 + i) % 12;
    const year = a.y + Math.floor((a.m - 1 + i) / 12);
    const short = MONTH_NAMES[idx].slice(0, 3);
    return `${short} ${String(year).slice(2)}`;
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

/* ---------- The views, chips and filters (Robert, 2026-11-25; mockup docs/mockups/pipeline_bookings_surgeon_view_v4.html) ----------
 * Apex also sends `lines`: the cases of one surgeon, brand, type of surgery and case Type (Primary, Revision, Demo) by month. Every view
 * is worked out from them here. A filter `f` says what is switched off: { types: [], procs: [], surgeons: [], brands: [] } (type names,
 * case Types, surgeon keys, brand names). The surgeon and brand filters apply only to the Surgeon / Brand view. */

/** The slider's three views. */
export const VIEWS = [
  { value: "hospital", label: "Hospital Total" },
  { value: "surgeon", label: "Surgeon Total" },
  { value: "brand", label: "Surgeon / Brand" }
];

/** The case Types, in the order of their chips (Case__c.Procedure__c: A00, A01, Z02). */
export const PROCS = ["Primary", "Revision", "Demo"];

/** An empty filter: everything switched on. */
export function emptyFilter() {
  return { types: [], procs: [], surgeons: [], brands: [] };
}

/** A surgeon's key: their id, or the name when the case has no surgeon recorded. */
const surgeonKey = (l) => l.surgeonId || "none:" + l.surgeon;
const pad12 = (a) => Array.from({ length: 12 }, (_, i) => (a && a[i]) || 0);
const typeIndex = (name) => TYPES.findIndex((t) => t.name === name);

/** The lines from what Apex sent, with 12 months each, their key and total. */
export function linesOf(data) {
  return ((data && data.lines) || []).map((l) => {
    const months = pad12(l.months);
    return {
      ...l,
      months,
      skey: surgeonKey(l),
      brand: l.brand || "",
      total: sum(months)
    };
  });
}

const typeOn = (f, name) => !(f.types || []).includes(name);
const procOn = (f, name) => !(f.procs || []).includes(name);
/** Does a line pass the chips (and, when `named` is true, the surgeon and brand filters too)? */
export function passes(l, f, named) {
  if (!typeOn(f, l.anatomy) || !procOn(f, l.procedure)) return false;
  if (!named) return true;
  return (
    !(f.surgeons || []).includes(l.skey) && !(f.brands || []).includes(l.brand)
  );
}

/**
 * The two rows of chips. A type's number counts its cases of the case Types switched on; a case Type's number counts its cases of the
 * types switched on (each row is counted through the other row's chips).
 */
export function chipsOf(lines, f) {
  const typeChips = TYPES.map((t) => {
    const booked = sum(
      lines
        .filter((l) => l.anatomy === t.name && procOn(f, l.procedure))
        .map((l) => l.total)
    );
    const on = typeOn(f, t.name);
    return {
      key: t.name,
      label: t.label,
      booked,
      on,
      pressed: on ? "true" : "false",
      cls: on ? "lg" : "lg off",
      style: "--c:" + t.colour
    };
  });
  const procChips = PROCS.map((p) => {
    const booked = sum(
      lines
        .filter((l) => l.procedure === p && typeOn(f, l.anatomy))
        .map((l) => l.total)
    );
    const on = procOn(f, p);
    return {
      key: p,
      label: p,
      booked,
      on,
      pressed: on ? "true" : "false",
      cls: on ? "lg" : "lg off",
      style: "--c:var(--indigo)"
    };
  });
  return { types: typeChips, procs: procChips };
}

/** The four types for the hospital chart from the lines that pass the chips (a type switched off is all zeros). */
export function chartTypes(lines, f) {
  return TYPES.map((t) => {
    const months = Array.from({ length: 12 }, () => 0);
    lines
      .filter((l) => l.anatomy === t.name && passes(l, f, false))
      .forEach((l) =>
        l.months.forEach((v, i) => {
          months[i] += v;
        })
      );
    return { ...t, months, booked: sum(months) };
  });
}

/** The big number: the cases shown in the view (the Surgeon / Brand view also follows its surgeon and brand filters). */
export function grandTotal(lines, f, view) {
  return sum(
    lines.filter((l) => passes(l, f, view === "brand")).map((l) => l.total)
  );
}

/** The shading of a number in the tables: stronger for bigger numbers, in the theme's indigo. */
function shade(v, max) {
  if (!v) return "";
  const p = Math.round(12 + (60 * v) / Math.max(max, 1));
  return `background:color-mix(in srgb, var(--indigo) ${p}%, transparent)`;
}
const casesWord = (n) => `${n} ${n === 1 ? "case" : "cases"}`;

/** The types a list of lines covers, as "Hip 30 · Knee 103" (in the type order, only the types with cases). */
function typesText(lines) {
  return TYPES.map((t) => {
    const n = sum(
      lines.filter((l) => l.anatomy === t.name).map((l) => l.total)
    );
    return n ? `${t.label} ${n}` : "";
  })
    .filter(Boolean)
    .join(" · ");
}

/** The foot row: each month's cases and the grand total of the rows shown. */
function footOf(shown) {
  const months = Array.from({ length: 12 }, (_, i) =>
    sum(shown.map((l) => l.months[i]))
  );
  return {
    cells: months.map((v, i) => ({ key: "t" + i, v })),
    total: sum(months)
  };
}

/**
 * Surgeon Total: the grid of numbers (Robert chose option C). A row per surgeon (busiest first) with the types they did, a number per
 * month shaded by size, and their total; a Hospital total row at the foot. Each number carries the words of its tooltip.
 */
export function surgeonGrid(lines, f, startIso) {
  const titles = monthTitles(startIso);
  const shown = lines.filter((l) => passes(l, f, false));
  const bySurgeon = new Map();
  shown.forEach((l) => {
    if (!bySurgeon.has(l.skey))
      bySurgeon.set(l.skey, { key: l.skey, name: l.surgeon, lines: [] });
    bySurgeon.get(l.skey).lines.push(l);
  });
  const groups = [...bySurgeon.values()].map((g) => ({
    ...g,
    months: Array.from({ length: 12 }, (_, i) =>
      sum(g.lines.map((l) => l.months[i]))
    )
  }));
  const max = Math.max(0, ...groups.flatMap((g) => g.months));
  const rows = groups
    .map((g) => ({
      key: g.key,
      name: g.name,
      sub: typesText(g.lines),
      total: sum(g.months),
      cells: g.months.map((v, i) => ({
        key: g.key + i,
        v,
        cls: v ? "num" : "num zero",
        style: shade(v, max),
        tip: v
          ? [g.name, titles[i]].concat(
              TYPES.map((t) => {
                const n = sum(
                  g.lines
                    .filter((l) => l.anatomy === t.name)
                    .map((l) => l.months[i])
                );
                return n ? `${t.label}: ${n}` : "";
              }).filter(Boolean)
            )
          : null
      }))
    }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  return { rows, foot: footOf(shown) };
}

/**
 * Surgeon / Brand: a table with a row per brand under each surgeon (the case's Brand, with the colour of its type; a brand used for two
 * types is two rows), a number per month and a total; the surgeon's name only on their first row; a Hospital total row at the foot.
 * Follows the chips and the surgeon and brand filters.
 */
export function brandTable(lines, f, startIso) {
  const titles = monthTitles(startIso);
  const shown = lines.filter((l) => passes(l, f, true));
  const bySurgeon = new Map();
  shown.forEach((l) => {
    if (!bySurgeon.has(l.skey))
      bySurgeon.set(l.skey, {
        key: l.skey,
        name: l.surgeon,
        rows: new Map()
      });
    const g = bySurgeon.get(l.skey);
    const k = l.brand + "|" + l.anatomy;
    if (!g.rows.has(k))
      g.rows.set(k, {
        brand: l.brand,
        anatomy: l.anatomy,
        months: Array.from({ length: 12 }, () => 0)
      });
    l.months.forEach((v, i) => {
      g.rows.get(k).months[i] += v;
    });
  });
  const groups = [...bySurgeon.values()]
    .map((g) => {
      const rows = [...g.rows.values()]
        .map((r) => ({ ...r, total: sum(r.months) }))
        .sort((a, b) => b.total - a.total || a.brand.localeCompare(b.brand));
      return { ...g, rows, total: sum(rows.map((r) => r.total)) };
    })
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  const max = Math.max(
    0,
    ...groups.flatMap((g) => g.rows.flatMap((r) => r.months))
  );
  const rows = [];
  groups.forEach((g) => {
    g.rows.forEach((r, j) => {
      const t = TYPES[typeIndex(r.anatomy)] || TYPES[0];
      rows.push({
        key: g.key + "|" + r.brand + "|" + r.anatomy,
        first: j === 0,
        cls: j === 0 ? "first" : "",
        span: g.rows.length,
        name: g.name,
        sub: casesWord(g.total),
        brand: r.brand,
        swatch: "background:" + t.colour,
        total: r.total,
        cells: r.months.map((v, i) => ({
          key: g.key + r.brand + r.anatomy + i,
          v,
          cls: v ? "num" : "num zero",
          style: shade(v, max),
          tip: v
            ? [g.name, `${r.brand} (${t.label})`, `${titles[i]}: ${v}`]
            : null
        }))
      });
    });
  });
  return { rows, foot: footOf(shown) };
}

/**
 * The list in a column's filter: every surgeon (busiest first) or every brand (A to Z, with the colours of the types it was used for) at
 * this hospital, whatever the chips say, narrowed by the search words. `off` is the list of what is switched off.
 */
export function filterItems(lines, kind, off, query) {
  const q = String(query || "")
    .trim()
    .toLowerCase();
  let items;
  if (kind === "surgeon") {
    const m = new Map();
    lines.forEach((l) => {
      if (!m.has(l.skey))
        m.set(l.skey, { value: l.skey, label: l.surgeon, n: 0 });
      m.get(l.skey).n += l.total;
    });
    items = [...m.values()]
      .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label))
      .map((x) => ({ value: x.value, label: x.label, swatches: [] }));
  } else {
    const m = new Map();
    lines.forEach((l) => {
      if (!m.has(l.brand)) m.set(l.brand, new Set());
      m.get(l.brand).add(l.anatomy);
    });
    items = [...m.keys()]
      .sort((a, b) => a.localeCompare(b))
      .map((b) => ({
        value: b,
        label: b,
        swatches: TYPES.filter((t) => m.get(b).has(t.name)).map((t) => ({
          key: t.name,
          style: "background:" + t.colour
        }))
      }));
  }
  return items
    .filter((x) => !q || x.label.toLowerCase().includes(q))
    .map((x) => {
      const on = !(off || []).includes(x.value);
      return {
        ...x,
        on,
        cls: on ? "fi" : "fi off",
        pressed: on ? "true" : "false"
      };
    });
}

/** How many of the switched-off values are at this hospital (so a filter left over from another hospital does not show as on). */
export function activeCount(lines, kind, off) {
  const here = new Set(
    lines.map((l) => (kind === "surgeon" ? l.skey : l.brand))
  );
  return (off || []).filter((v) => here.has(v)).length;
}

/** Ticking "Select all": when any of the listed items is off, all of them go on; otherwise all of them go off. */
export function toggleAll(off, items) {
  const values = items.map((x) => x.value);
  const anyOff = items.some((x) => !x.on);
  return anyOff
    ? (off || []).filter((v) => !values.includes(v))
    : [...new Set([...(off || []), ...values])];
}

/** Adds the value if it is missing, takes it out if it is there. */
export function flip(list, value) {
  return (list || []).includes(value)
    ? list.filter((x) => x !== value)
    : [...(list || []), value];
}
