/**
 * Pipeline: the pure logic of the My Case Bookings panel, with no screen so it can be tested on its own: the month labels,
 * the 10% rule that says whether the surgeon's ZB usages match the bookings, and the geometry of each stacked bar graph.
 *
 * The rule (Robert, 2026-11-02): the ZB cases a year in the usages are compared with the surgeries booked in the last 12
 * whole months; within 10% either way is accurate, further out should be adjusted. Only ZB is compared, because the
 * competitors' numbers are not known.
 *
 * The hospital panel (Robert, 2026-11-03, mockup pipeline_usage_conflict_v7): for each hospital the screen says what was
 * found (no usage, only a competitor's usage, or a ZB usage that is out from the bookings) and offers up to three choices.
 * A surgeon has one usage per hospital, portfolio and company, so ZB and a competitor sit side by side as separate usages.
 * The functions below work out the state of a hospital, the choices, what the usages would look like afterwards, the wording
 * of the confirmation, why a choice cannot be reviewed yet, and the changes to send to PipelineBookingsController.saveHospital.
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
export function chartModel(type, startIso, size) {
  const W = (size && size.w) || 580;
  const H = (size && size.h) || 250;
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

/* ----- the hospital panel ----- */
export const ZB = "ZB";

const PORTFOLIO_KEY = { Hip: "stems", Knee: "knee", CMF: "cmft" };
/** The company field (as the usage choices helper names it) that decides which companies a portfolio's usages may hold. */
export function companyKey(portfolio) {
  return PORTFOLIO_KEY[portfolio] || "knee";
}

const one = (l) => `${l.company || "No company"}, ${l.cases} a year`;
export const lineText = one;
/** "Competitor A, 60 a year  +  ZB, 22 a year", or "No usage". */
export function linesText(lines) {
  return lines && lines.length ? lines.map(one).join("  +  ") : "No usage";
}
/** The short form for the hospital list: "Competitor A 60 · ZB 22". */
export function listText(lines) {
  return lines && lines.length
    ? lines.map((l) => `${l.company || "No company"} ${l.cases}`).join(" · ")
    : "No usage";
}

const zbLinesOf = (row) => (row.lines || []).filter((l) => l.company === ZB);
const compsOf = (row) => (row.lines || []).filter((l) => l.company !== ZB);
export const zbCasesOf = (row) =>
  zbLinesOf(row).reduce((a, l) => a + (Number(l.cases) || 0), 0);

/**
 * What a hospital's usages look like against its bookings: none (no usage), comp (competitors' usages only), good (a ZB
 * usage within 10% of the bookings) or zbdiff (a ZB usage further out).
 */
export function hospitalState(row) {
  const lines = row.lines || [];
  if (!lines.length) return "none";
  if (!zbLinesOf(row).length) return "comp";
  const zb = zbCasesOf(row);
  const booked = row.booked || 0;
  if (zb <= 0) return booked > 0 ? "zbdiff" : "good";
  return Math.abs((booked - zb) / zb) <= TOLERANCE ? "good" : "zbdiff";
}
/** True when the hospital still needs the person's attention. */
export const needsAttention = (state) => state !== "good";
/** The set of choices a state uses: comp, none or zbdiff (good uses the same choices as zbdiff). */
export const kindOf = (state) => (state === "good" ? "zbdiff" : state);

/**
 * Each choice: key, title, description and which boxes it shows: zb (ZB cases a year; zbToggle lets it be left out),
 * comp (what to do with the competitor's usage) and addComp (also add a competitor's usage).
 */
export function choicesFor(state, canDelete) {
  const del = (list) => {
    if (canDelete) return list;
    return list.filter((s) => s[0] !== "delete");
  };
  const kind = kindOf(state);
  if (kind === "comp")
    return [
      {
        key: "zbplus",
        title: "Add the ZB usage, and change or delete the competitor",
        desc: "ZB at your number; the competitor stays unless you change it",
        zb: true,
        comp: del([
          ["keep", "Keep"],
          ["change", "Change cases"],
          ["delete", "Delete"]
        ])
      },
      {
        key: "componly",
        title: "Change or delete the competitor only",
        desc: "No ZB usage is added",
        comp: del([
          ["change", "Change cases"],
          ["delete", "Delete"]
        ])
      },
      {
        key: "leave",
        title: "Leave as it is",
        desc: "Make no change at this hospital"
      }
    ];
  if (kind === "none")
    return [
      {
        key: "create",
        title: "Add a ZB usage and / or a competitor usage",
        desc: "Record what this surgeon does at this hospital",
        zb: true,
        zbToggle: true,
        addComp: true
      },
      {
        key: "leave",
        title: "Leave as it is",
        desc: "Make no change at this hospital"
      }
    ];
  const out = [
    {
      key: "adjust",
      title: "Adjust the ZB usage, and / or add a competitor usage",
      desc: "Change the ZB cases a year; record a competitor too",
      zb: true,
      addComp: true
    }
  ];
  if (canDelete)
    out.push({
      key: "remove",
      title: "Delete the ZB usage",
      desc: "Remove the ZB usage from this hospital"
    });
  out.push({
    key: "leave",
    title: "Leave as it is",
    desc: "Make no change at this hospital"
  });
  return out;
}

/** The companies a competitor's usage may still be added for: the portfolio's choices, minus ZB and those already here. */
export function freeCompanies(all, row) {
  const taken = new Set((row.lines || []).map((l) => l.company));
  return (all || []).filter((c) => c !== ZB && !taken.has(c));
}

/** A fresh set of the person's choices for a hospital, starting at the suggestion from the bookings. */
export function newDraft(row) {
  const state = hospitalState(row);
  const comps = compsOf(row);
  const d = {
    choice: "adjust",
    sub: "keep",
    zb: row.booked || 0,
    cases: comps.length ? comps[0].cases : 0,
    compIndex: 0,
    addZb: true,
    addComp: false,
    compName: "",
    compCases: 5,
    mode: "edit"
  };
  if (state === "comp") d.choice = "zbplus";
  else if (state === "none") d.choice = "create";
  else if (state === "good") d.zb = zbCasesOf(row);
  return d;
}

/** What happens to the sub choices when a choice is picked. */
export function pickChoice(d, key) {
  d.choice = key;
  if (key === "zbplus") d.sub = "keep";
  if (key === "componly") d.sub = "change";
  d.mode = "edit";
}

function target(row, d) {
  const comps = compsOf(row);
  return comps[d.compIndex] || comps[0];
}
const zbValue = (d) => (d.zb === "" ? "?" : d.zb);
const added = (d) => ({
  company: d.compName,
  cases: d.compCases === "" ? "?" : d.compCases
});

/** The hospital's usage lines as they would be after the choice is saved. */
export function afterLines(row, d) {
  const lines = (row.lines || []).map((l) => ({ ...l }));
  const tgt = target(row, d);
  const zb = { company: ZB, cases: zbValue(d) };
  const compPart = () => {
    if (!tgt) return lines;
    if (d.sub === "delete")
      return lines.filter((l) => l.usageId !== tgt.usageId);
    if (d.sub === "change")
      return lines.map((l) => {
        if (l.usageId !== tgt.usageId) return l;
        return { ...l, cases: d.cases === "" ? "?" : d.cases };
      });
    return lines;
  };
  switch (d.choice) {
    case "zbplus":
      return [...compPart(), zb];
    case "componly":
      return compPart();
    case "create":
      return [...(d.addZb ? [zb] : []), ...(d.addComp ? [added(d)] : [])];
    case "adjust":
      return [
        zb,
        ...lines.filter((l) => l.company !== ZB),
        ...(d.addComp ? [added(d)] : [])
      ];
    case "remove":
      return lines.filter((l) => l.company !== ZB);
    default:
      return lines;
  }
}

/** The sentence the confirmation asks about, or null when the choice changes nothing. */
export function changeText(row, d) {
  const tgt = target(row, d);
  const plusComp = d.addComp
    ? `add a ${d.compName} usage, ${d.compCases} a year`
    : "";
  switch (d.choice) {
    case "zbplus":
      return (
        `Add a ZB usage, ${zbValue(d)} a year` +
        (d.sub === "keep"
          ? ` (${one(tgt)} stays)`
          : d.sub === "change"
            ? `, and change ${tgt.company} from ${tgt.cases} to ${d.cases} a year`
            : `, and delete the ${tgt.company} usage`)
      );
    case "componly":
      return d.sub === "change"
        ? `Change ${tgt.company} from ${tgt.cases} to ${d.cases} a year`
        : `Delete the ${tgt.company} usage`;
    case "create": {
      const parts = [];
      if (d.addZb) parts.push(`create a ZB usage, ${zbValue(d)} a year`);
      if (d.addComp) parts.push(plusComp);
      const s = parts.join(", and ");
      return s.charAt(0).toUpperCase() + s.slice(1);
    }
    case "adjust": {
      const cur = zbCasesOf(row);
      const base =
        d.zb !== cur
          ? `Change the ZB usage from ${cur} to ${zbValue(d)} a year`
          : "";
      return [
        base,
        plusComp
          ? base
            ? `and ${plusComp}`
            : `Add a ${d.compName} usage, ${d.compCases} a year`
          : ""
      ]
        .filter(Boolean)
        .join(", ");
    }
    case "remove":
      return "Delete the ZB usage";
    default:
      return null;
  }
}

/** Why the choice cannot be reviewed yet, or an empty string when it can. */
export function blocker(row, d) {
  const cfg =
    choicesFor(hospitalState(row), true).find((c) => c.key === d.choice) || {};
  const tgt = target(row, d);
  if (d.choice === "create" && !d.addZb && !d.addComp)
    return "Choose a ZB or a competitor usage to add.";
  if (cfg.zb && (!cfg.zbToggle || d.addZb) && d.zb === "")
    return "Enter the ZB cases a year.";
  if (cfg.addComp && d.addComp && (d.compCases === "" || !d.compName))
    return "Choose the competitor and enter its cases a year.";
  if (cfg.comp && d.sub === "change" && d.cases === "")
    return "Enter the competitor's cases a year.";
  if (
    d.choice === "componly" &&
    d.sub === "change" &&
    tgt &&
    d.cases === tgt.cases
  )
    return "Change the number to continue.";
  if (d.choice === "adjust" && d.zb === zbCasesOf(row) && !d.addComp)
    return "Change the number or add a competitor to continue.";
  return "";
}

/** The changes to send to saveHospital for the choice (zb, comp, add, del). */
export function opsFor(row, d) {
  const ops = [];
  const tgt = target(row, d);
  const cur = zbCasesOf(row);
  switch (d.choice) {
    case "zbplus":
      ops.push({ op: "zb", cases: Number(d.zb) });
      if (d.sub === "change")
        ops.push({ op: "comp", usageId: tgt.usageId, cases: Number(d.cases) });
      if (d.sub === "delete") ops.push({ op: "del", usageId: tgt.usageId });
      break;
    case "componly":
      if (d.sub === "change")
        ops.push({ op: "comp", usageId: tgt.usageId, cases: Number(d.cases) });
      else ops.push({ op: "del", usageId: tgt.usageId });
      break;
    case "create":
      if (d.addZb) ops.push({ op: "zb", cases: Number(d.zb) });
      if (d.addComp)
        ops.push({
          op: "add",
          company: d.compName,
          cases: Number(d.compCases)
        });
      break;
    case "adjust":
      if (d.zb !== cur) ops.push({ op: "zb", cases: Number(d.zb) });
      if (d.addComp)
        ops.push({
          op: "add",
          company: d.compName,
          cases: Number(d.compCases)
        });
      break;
    case "remove":
      zbLinesOf(row).forEach((l) =>
        ops.push({ op: "del", usageId: l.usageId })
      );
      break;
    default:
      break;
  }
  return ops;
}

/** What was found at a hospital, as parts of a sentence ({ t: text, b: true } is bold). */
export function foundParts(row, portfolioName) {
  const low = String(portfolioName || "").toLowerCase();
  const state = hospitalState(row);
  const comps = compsOf(row);
  const booked = row.booked || 0;
  const alsoComps = comps.length
    ? [{ t: " Also here: " }, { t: linesText(comps), b: true }, { t: "." }]
    : [];
  if (state === "none")
    return [
      { t: `No ${low} usage`, b: true },
      { t: " is entered, although " },
      { t: String(booked), b: true },
      { t: ` ZB ${low} cases were booked.` }
    ];
  if (state === "comp")
    return [
      { t: "A usage is already entered, but for a " },
      { t: comps.length > 1 ? "competitor" : "competitor", b: true },
      { t: ": " },
      { t: linesText(comps), b: true },
      { t: ". There is no ZB usage, although " },
      { t: String(booked), b: true },
      { t: " ZB cases were booked." }
    ];
  const zb = zbCasesOf(row);
  if (state === "good")
    return [
      { t: "The ZB usage says " },
      { t: `${zb} a year`, b: true },
      { t: ` and ${booked} were booked: within 10%, so it looks accurate.` },
      ...alsoComps
    ];
  const pct = zb > 0 ? Math.round((Math.abs(zb - booked) / zb) * 100) : null;
  return [
    { t: "The ZB usage says " },
    { t: `${zb} a year`, b: true },
    { t: ", but " },
    { t: String(booked), b: true },
    { t: " were booked" },
    ...(pct === null
      ? [{ t: "." }]
      : [
          { t: ": " },
          { t: `${pct}% ${booked < zb ? "fewer" : "more"}`, b: true },
          { t: ". More than 10% out should be adjusted." }
        ]),
    ...alsoComps
  ];
}
