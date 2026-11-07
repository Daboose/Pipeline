import {
  formatMoney,
  quarterRank,
  needsAttention,
  dealStatus,
  chatterDays,
  stageDays,
  ageDays,
  chatterBand,
  stageBand,
  STAGE_COLOURS,
  STAGE_ENDS
} from "c/pipelineFormat";

/**
 * pipelineMobileModel: the logic behind the phone screens (Robert, 2026-11-07), kept apart from the screen so it can be tested.
 * The kinds, which deals a Status choice lets through, the search, how a card reads, and the figures for the Charts section.
 * Nothing here touches Salesforce; it only reads the deals it is handed.
 */
export const KINDS = [
  { kind: "opp", label: "Opportunities", short: "Opps" },
  { kind: "risk", label: "Risks", short: "Risks" },
  { kind: "rosa", label: "ROSA", short: "ROSA" }
];

export const STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
  { value: "both", label: "Both" }
];

const VALUE_WORD = {
  opp: "Revenue / year",
  risk: "Value at risk / year",
  rosa: "ROSA value / year"
};
export const valueWord = (kind) => VALUE_WORD[kind] || "Value / year";

/** True when a deal is let through by the Status slider: open deals, closed deals, or both. */
export function inStatus(deal, status) {
  if (status === "open") return !deal.isClosed;
  if (status === "closed") return !!deal.isClosed;
  return true;
}

/** The name on a card: the surgeon, or the hospital for a ROSA deal (which has no surgeon column). */
export function cardName(deal) {
  return (deal.kind === "rosa" ? deal.facility : deal.hcp) || deal.name || "";
}
/** The second line: the hospital, or for a ROSA deal the kind of deal. */
export function cardSub(deal) {
  return (deal.kind === "rosa" ? deal.rosaDealType : deal.facility) || "";
}

/** True when the search words are found in the deal's name, hospital or deal type. */
export function matchesSearch(deal, q) {
  const text = (q || "").trim().toLowerCase();
  if (!text) return true;
  return `${cardName(deal)} ${cardSub(deal)} ${deal.facility || ""}`
    .toLowerCase()
    .includes(text);
}

/** One kind's deals under a Status choice and a search, the biggest value first. */
export function dealsOf(deals, kind, status, q) {
  return (deals || [])
    .filter(
      (d) => d.kind === kind && inStatus(d, status) && matchesSearch(d, q)
    )
    .sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0));
}

/**
 * A card for the list: what to show and whether to show the status pill. A pill shows only when it says something: never "Open"
 * on an Open list; On Hold on an Open list; Closed Won or Closed Lost on a Closed list; all of them on Both.
 */
export function cardOf(deal, status) {
  const st = dealStatus(deal);
  const showPill = status === "both" || st.key !== "open";
  return {
    id: deal.id,
    name: cardName(deal),
    sub: cardSub(deal),
    stageLine: [deal.stage, deal.quarter].filter(Boolean).join(" · "),
    value: formatMoney(deal.value, deal.currencyCode),
    repStar: !!deal.repPriority,
    campaignStar: deal.kind !== "rosa" && deal.campaignCount > 0,
    pill: showPill ? { label: st.label, cls: `stp st-${st.key}` } : null
  };
}

/** The deals of one kind split by currency (values are never added across currencies), the biggest total first. */
export function currencyGroups(rows) {
  const by = new Map();
  rows.forEach((d) => {
    const c = d.currencyCode || "";
    if (!by.has(c)) by.set(c, []);
    by.get(c).push(d);
  });
  return [...by.entries()]
    .map(([code, list]) => ({
      code,
      rows: list,
      total: list.reduce((a, d) => a + (Number(d.value) || 0), 0)
    }))
    .sort((a, b) => b.total - a.total);
}

/**
 * The figures behind one chart block (one kind, one currency): the three tiles, the deals by stage (a bar each) and by expected
 * close quarter (a column each). stageOrder is the whole Stage list in its order; the working stages get the blue to teal colours
 * in turn, the won stage green and the lost stage red. Percentages are of the biggest bar, for drawing.
 */
export function chartFigures(rows, kind, stageOrder, status, now = Date.now()) {
  const ends = STAGE_ENDS[kind] || STAGE_ENDS.opp;
  const order = stageOrder || [];
  const rank = (s) => {
    const i = order.indexOf(s);
    return i < 0 ? 999 : i;
  };
  const byStage = new Map();
  const byQuarter = new Map();
  rows.forEach((d) => {
    const v = Number(d.value) || 0;
    const s = byStage.get(d.stage) || { count: 0, value: 0 };
    s.count++;
    s.value += v;
    byStage.set(d.stage, s);
    const q = d.quarter || "";
    const x = byQuarter.get(q) || { count: 0, value: 0 };
    x.count++;
    x.value += v;
    byQuarter.set(q, x);
  });
  const working = [...byStage.keys()]
    .filter((s) => s !== ends.won && s !== ends.lost)
    .sort((a, b) => rank(a) - rank(b));
  const stageNames = [
    ...working,
    ...[ends.won, ends.lost].filter((s) => byStage.has(s))
  ];
  const maxStage = Math.max(1, ...[...byStage.values()].map((s) => s.value));
  const stages = stageNames.map((name) => ({
    name,
    count: byStage.get(name).count,
    value: byStage.get(name).value,
    colour:
      name === ends.won
        ? "#16a34a"
        : name === ends.lost
          ? "#dc2626"
          : STAGE_COLOURS[working.indexOf(name) % STAGE_COLOURS.length],
    pct: Math.max(3, Math.round((byStage.get(name).value / maxStage) * 100))
  }));
  const maxQuarter = Math.max(
    1,
    ...[...byQuarter.values()].map((q) => q.value)
  );
  const quarters = [...byQuarter.keys()]
    .sort((a, b) => quarterRank(a) - quarterRank(b))
    .map((quarter) => ({
      quarter,
      count: byQuarter.get(quarter).count,
      value: byQuarter.get(quarter).value,
      pct: Math.max(
        4,
        Math.round((byQuarter.get(quarter).value / maxQuarter) * 100)
      )
    }));
  return {
    count: rows.length,
    total: rows.reduce((a, d) => a + (Number(d.value) || 0), 0),
    attention: rows.filter((d) => needsAttention(d, now)).length,
    stages,
    quarters,
    countLabel: status === "open" ? "Open deals" : "Deals shown"
  };
}

/* ----- the deal screen ----- */

const KIND_WORD = {
  opp: "Opportunity",
  risk: "Risk",
  rosa: "ROSA opportunity"
};

/** The top of the deal screen: the name, the kind of deal under it, and whether the amber On Hold pill shows (never on a closed deal). */
export function headerOf(deal) {
  const kind = KIND_WORD[deal.kind] || "Opportunity";
  const more =
    deal.kind === "rosa"
      ? deal.rosaDealType
      : (deal.segment || "").split(";").join(", ");
  return {
    name: cardName(deal),
    sub: [kind, more].filter(Boolean).join(" · "),
    onHold: !!deal.onHold && !deal.isClosed
  };
}

/** The summary line as tiles: Owner, Portfolio, value, close quarter, last posted and last stage move (coloured by age), age, status. */
export function summaryTiles(deal, now = Date.now()) {
  const days = (n, band) => ({
    value: n === null || n === undefined ? "–" : `${n} d`,
    cls: n === null || n === undefined ? "" : `tg ${band(n)}`
  });
  const quiet = deal.isClosed || deal.onHold; // nothing to watch on a closed or an on-hold deal
  const posted = quiet
    ? { value: "–", cls: "" }
    : days(chatterDays(deal, now), chatterBand);
  const moved = quiet
    ? { value: "–", cls: "" }
    : days(stageDays(deal, now), stageBand);
  const age = ageDays(deal, now);
  const st = dealStatus(deal);
  return [
    { key: "owner", label: "Owner", value: deal.ownerName || "–", cls: "" },
    {
      key: "portfolio",
      label: "Portfolio",
      value: (deal.segment || "").split(";").join(", ") || "–",
      cls: ""
    },
    {
      key: "value",
      label: valueWord(deal.kind).replace("Revenue", "Value"),
      value: formatMoney(deal.value, deal.currencyCode),
      cls: ""
    },
    {
      key: "quarter",
      label: "Close quarter",
      value: deal.quarter || "–",
      cls: ""
    },
    { key: "posted", label: "Last posted", ...posted },
    { key: "moved", label: "Last stage move", ...moved },
    {
      key: "age",
      label: "Deal age",
      value: age === null ? "–" : `${age} d`,
      cls: ""
    },
    { key: "status", label: "Status", value: st.label, cls: `stp st-${st.key}` }
  ];
}

/**
 * The stages to list for a deal's kind: the open stages in their order, then the won and the lost stage at the end (as the desktop
 * stage slider does). values: the stage picklist for the deal's record type; if it is not known yet, just the stage the deal is at.
 */
export function stageSteps(values, kind, current) {
  const ends = STAGE_ENDS[kind] || STAGE_ENDS.opp;
  const all = values || [];
  const open = all.filter((v) => v !== ends.won && v !== ends.lost);
  if (!all.length && current) open.push(current);
  const closing = all.length
    ? [ends.won, ends.lost].filter((v) => all.includes(v) || v === current)
    : [];
  return [...open, ...closing];
}

/** "good" (green) at the won stage, "bad" (red) at the lost stage, otherwise blue: the colour of the stage row. */
export function stageTone(deal) {
  const key = dealStatus(deal).key;
  return key === "won" ? "good" : key === "lost" ? "bad" : "";
}

/**
 * The deal's details as rows of label and words. rec: what the screen read from the record itself ({ units, mymo }); the rest is in
 * the deal. The Yes / No fields carry yes: true or false (the screen colours the word); a risk and a ROSA deal have no On hold or MyMo.
 */
export function detailRows(deal, rec = {}) {
  const rows = [];
  const add = (key, label, text, yes) =>
    rows.push({ key, label, text, yes: yes === undefined ? null : yes });
  if (deal.kind !== "rosa") add("hcp", "Primary HCP", deal.hcp || "–");
  add("facility", "Healthcare facility", deal.facility || "–");
  add("quarter", "Expected closing quarter and year", deal.quarter || "–");
  add(
    "value",
    "Expected annual value",
    formatMoney(deal.value, deal.currencyCode)
  );
  if (deal.kind === "opp" && rec.units !== null && rec.units !== undefined)
    add("units", "Expected annual units / cases", String(rec.units));
  if (deal.kind !== "rosa" && deal.brands)
    add("brands", "Brand", deal.brands.split(";").join(", "));
  if (deal.kind === "opp")
    add("hold", "On hold", deal.onHold ? "Yes" : "No", !!deal.onHold);
  add(
    "rep",
    "Rep priority",
    deal.repPriority ? "Yes" : "No",
    !!deal.repPriority
  );
  add(
    "state",
    "State priority",
    deal.statePriority ? "Yes" : "No",
    !!deal.statePriority
  );
  if (deal.kind === "opp")
    add("mymo", "MyMo", rec.mymo ? "Yes" : "No", !!rec.mymo);
  return rows;
}
