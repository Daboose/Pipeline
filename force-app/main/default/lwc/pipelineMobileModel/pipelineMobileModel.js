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
  STAGE_ENDS,
  daysSince
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
 * The fields of a deal as the phone form shows them (Robert, 2026-11-07; mockup pipeline_mobile_edit_v1.html): the same fields, in the same order, as
 * the desktop deal panel, for each kind of deal: [API name, label, kind of control, required]. "lookup" opens a search page; the lists of
 * choices are read from Salesforce for the deal's record type, never typed in. What a person may change is Salesforce's decision (field
 * access); a field they cannot change is shown as plain text.
 */
export const FORM_FIELDS = {
  opp: [
    ["Account__c", "Primary HCP", "lookup", true],
    ["Healthcare_Facility__c", "Healthcare facility", "lookup"],
    ["Expected_Closure_Quarter__c", "Expected closing quarter", "picklist"],
    ["Expected_Closing_Year__c", "Expected closing year", "picklist"],
    ["AmountPerYear__c", "Expected annual value", "number"],
    ["CurrencyIsoCode", "Currency", "picklist"],
    // a number box (the number keyboard, no letters), though Salesforce holds it as text (255 characters): the screen sends it as text
    ["UnitsCasesPerYear__c", "Expected annual units / cases", "number"],
    ["Brand__c", "Brand", "multi"],
    ["OnHold__c", "On hold", "bool"],
    ["Priority__c", "Rep priority", "bool"],
    ["State_Priority__c", "State priority", "bool"],
    ["myMo__c", "MyMo", "bool"],
    ["myMo_Stage__c", "MyMo stage", "picklist"],
    ["Link_To_ROSA_Deal__c", "Link to ROSA deal", "lookup"],
    ["Objective__c", "Background information", "textarea"]
  ],
  risk: [
    ["Account__c", "Primary HCP", "lookup", true],
    ["Healthcare_Facility__c", "Healthcare facility", "lookup"],
    ["Expected_Closure_Quarter__c", "Expected closing quarter", "picklist"],
    ["Expected_Closing_Year__c", "Expected closing year", "picklist"],
    ["AmountPerYear__c", "Annual value at risk", "number"],
    ["CurrencyIsoCode", "Currency", "picklist"],
    ["Portfolio__c", "Portfolio", "multi"],
    ["Brand__c", "Brand", "multi"],
    ["Priority__c", "Rep priority", "bool"],
    ["State_Priority__c", "State priority", "bool"],
    ["Objective__c", "Background information", "textarea"]
  ],
  rosa: [
    ["Healthcare_Facility__c", "Healthcare facility", "lookup", true],
    ["Account__c", "Primary HCP", "lookup"],
    ["ROSA_Deal_Type__c", "ROSA deal type", "picklist"],
    ["ROSA_Sales_Type__c", "ROSA sales type", "multi"],
    ["ROSAGrowthDollar__c", "ROSA growth $", "number"],
    ["CurrencyIsoCode", "Currency", "picklist"],
    ["Expected_Closure_Quarter__c", "Expected closing quarter", "picklist"],
    ["Expected_Closing_Year__c", "Expected closing year", "picklist"],
    ["Install_Date__c", "Install date", "date"],
    ["Close_Date__c", "Close date", "date"],
    ["ROSA_Platform_Shoulder_Stage__c", "ROSA platform: shoulder", "picklist"],
    ["ROSA_Platform_Hip_Stage__c", "ROSA platform: hip", "picklist"],
    [
      "ROSA_Platform_Partial_Knee__c",
      "ROSA platform: partial knee",
      "picklist"
    ],
    ["Priority__c", "Rep priority", "bool"],
    ["State_Priority__c", "State priority", "bool"],
    ["Objective__c", "Background information", "textarea"]
  ]
};
export const QUARTER_FIELD = "Expected_Closure_Quarter__c";
export const YEAR_FIELD = "Expected_Closing_Year__c";
export const MYMO_FIELD = "myMo__c";
export const MYMO_STAGE_FIELD = "myMo_Stage__c";
const MONEY_FIELDS = ["AmountPerYear__c", "ROSAGrowthDollar__c"];
const CURRENCY_FIELD = "CurrencyIsoCode";
const ON_HOLD_FIELD = "OnHold__c";
/** Yes turns the whole slider solid green (the desktop's colours); for On hold, a warning rather than good news, solid amber. */
const YES_NO_GOOD = [
  { value: "no", label: "No" },
  { value: "yes", label: "Yes", tone: "good" }
];
const YES_NO_WARN = [
  { value: "no", label: "No" },
  { value: "yes", label: "Yes", tone: "warn" }
];

/** The record fields to read for a kind of deal (the stage, every form field, and the name behind each lookup). */
export function formFieldNames(kind) {
  const list = FORM_FIELDS[kind] || FORM_FIELDS.opp;
  const out = ["SalesRisks__c.Stage__c"];
  list.forEach((f) => out.push(`SalesRisks__c.${f[0]}`));
  list
    .filter((f) => f[2] === "lookup")
    .forEach((f) =>
      out.push(`SalesRisks__c.${f[0].replace(/__c$/, "__r")}.Name`)
    );
  return out;
}

/**
 * The deal as it would be with the unsaved changes made, for the parts of the screen that show it at once (the On Hold pill, the Status
 * tile, the colour of the stage row). A stage that is a closing stage closes the deal. The saved record is only changed by Save.
 */
export function liveDeal(deal, draft = {}) {
  const out = { ...deal };
  if ("Stage__c" in draft) {
    const ends = STAGE_ENDS[deal.kind] || STAGE_ENDS.opp;
    out.stage = draft.Stage__c;
    out.isClosed = out.stage === ends.won || out.stage === ends.lost;
  }
  if (ON_HOLD_FIELD in draft) out.onHold = !!draft[ON_HOLD_FIELD];
  return out;
}

const readText = (api, type, value, ctx) => {
  if (type === "lookup") return ctx.lookupName(api) || "–";
  if (value === null || value === undefined || value === "") return "–";
  if (type === "bool") return value ? "Yes" : "No";
  if (MONEY_FIELDS.includes(api))
    return formatMoney(value, ctx.valueOf(CURRENCY_FIELD));
  return String(value).split(";").join(", ");
};

/**
 * The rows of the phone form, in order. ctx: { valueOf(api) (the draft or else the record), draft, choices(api) (the list of
 * { value, label } for a picklist, or null), updateable(api), lookupName(api) }. The closing year sits beside its quarter and the currency
 * beside the money, when both can be changed; the four Yes / No fields come together as one block of sliders; the MyMo stage folds open
 * only while MyMo is Yes. Each row says which control to draw (isLookup, isSelect, isNumber, isDate, isMulti, isTextarea, isReadOnly, isFlags).
 */
export function formRows(kind, ctx) {
  const list = FORM_FIELDS[kind] || FORM_FIELDS.opp;
  const raw = list.map(([api, label, type, req]) => {
    const value = ctx.valueOf(api);
    const choices = ctx.choices(api);
    const editable = type !== "readonly" && ctx.updateable(api);
    const row = {
      key: api,
      api,
      label,
      req: !!req,
      changed: api in ctx.draft,
      value: value === null || value === undefined ? "" : value
    };
    let control = editable ? type : "readonly";
    if (type === "bool") control = "bool"; // a slider even when it cannot be changed (greyed)
    if ((control === "picklist" || control === "multi") && !choices)
      control = "readonly";
    if (control === "picklist") {
      const options = choices.map((c) => ({ value: c.value, label: c.label }));
      if (value && !options.some((c) => c.value === value))
        options.unshift({ value, label: value });
      if (!req) options.unshift({ value: "", label: "–" });
      row.options = options.map((o) => ({
        ...o,
        selected: o.value === (value || "")
      }));
      row.isSelect = true;
    } else if (control === "multi") {
      const on = value ? String(value).split(";") : [];
      row.options = choices.map((c) => ({
        value: c.value,
        label: c.label,
        cls: "pl" + (on.includes(c.value) ? " on" : "")
      }));
      row.isMulti = true;
    } else if (control === "lookup") {
      row.isLookup = true;
      row.lookupName = ctx.lookupName(api);
      // an optional lookup that has something chosen can be cleared with the round cross; a required one can only be swapped
      row.canClear = !req && !!value;
      row.lookupCls = "lk" + (row.canClear ? " hasx" : "");
    } else if (control === "number") {
      row.isNumber = true;
    } else if (control === "date") {
      row.isDate = true;
    } else if (control === "bool") {
      row.isBool = true;
      row.locked = !editable;
      row.on = !!value;
    } else if (control === "textarea") {
      row.isTextarea = true;
    } else {
      row.isReadOnly = true;
      row.text = readText(api, type, value, ctx);
    }
    return row;
  });

  // the pairs: quarter and year, money and currency
  const rows = [];
  raw.forEach((r) => {
    const prev = rows[rows.length - 1];
    if (
      r.api === YEAR_FIELD &&
      r.isSelect &&
      prev &&
      prev.api === QUARTER_FIELD &&
      prev.isSelect
    ) {
      prev.pair = r;
      prev.label = "Expected closing quarter and year";
      prev.changed = prev.changed || r.changed;
      return;
    }
    if (
      r.api === CURRENCY_FIELD &&
      r.isSelect &&
      prev &&
      MONEY_FIELDS.includes(prev.api) &&
      prev.isNumber
    ) {
      prev.pair = r;
      prev.changed = prev.changed || r.changed;
      return;
    }
    rows.push(r);
  });

  // the Yes / No block, where the first Yes / No field was
  const bools = rows.filter((r) => r.isBool);
  const out = [];
  rows.forEach((r) => {
    if (r.isBool) {
      if (r === bools[0])
        out.push({
          key: "__flags",
          api: "__flags",
          isFlags: true,
          wrapCls: "frm",
          cls: "flags",
          flags: bools.map((b) => ({
            api: b.api,
            label: b.label,
            value: b.on ? "yes" : "no",
            options: b.api === ON_HOLD_FIELD ? YES_NO_WARN : YES_NO_GOOD,
            locked: b.locked,
            changed: b.changed
          }))
        });
      return;
    }
    const fold = r.api === MYMO_STAGE_FIELD;
    out.push({
      ...r,
      pairCls: r.pair ? "two" : "one",
      wrapCls: fold ? "mm" + (ctx.valueOf(MYMO_FIELD) ? " open" : "") : "frm",
      cls: "f" + (r.changed ? " changed" : "")
    });
  });
  return out;
}

/* ----- Chatter on the phone (Robert, 2026-11-07; mockup pipeline_mobile_chatter_v1.html, option C) ----- */

/** How long ago a post was made, short for a phone: "today", "yesterday", "5 d ago". */
export function agoShort(iso, now = Date.now()) {
  const n = daysSince(iso, now);
  if (n === null) return "";
  if (n === 0) return "today";
  if (n === 1) return "yesterday";
  return `${n} d ago`;
}

/** The row on the deal screen: how many posts and how long since the last ("4 posts · last 2 d ago"). */
export function chatterSummary(posts, now = Date.now()) {
  const list = posts || [];
  if (!list.length) return "No posts yet";
  let newest = "";
  list.forEach((p) => {
    [p.posted, ...(p.replies || []).map((r) => r.posted)].forEach((d) => {
      if (d && (!newest || Date.parse(d) > Date.parse(newest))) newest = d;
    });
  });
  const last = agoShort(newest, now);
  return `${list.length} ${list.length === 1 ? "post" : "posts"}${last ? ` · last ${last}` : ""}`;
}

/**
 * The @ being typed just before the caret: { start, end, q } (the text after the @, with where the @ starts and where the caret is), or
 * null when the caret is not in a mention. An @ only counts at the start or after a space, so an email address does not open the list.
 */
export function mentionQuery(text, caret) {
  const before = String(text || "").slice(0, caret);
  const m = /(^|[\s\u00a0])@([\p{L}'.\- ]{0,40})$/u.exec(before);
  if (!m) return null;
  return { start: caret - m[2].length - 1, end: caret, q: m[2] };
}

/** The text with the typed @ part replaced by the picked person's name (and a space after), and where the caret goes next. */
export function insertMention(text, query, name) {
  const next = `${text.slice(0, query.start)}@${name} ${text.slice(query.end)}`;
  return { text: next, caret: query.start + name.length + 2 };
}

/**
 * The pieces to post: [{ t: "text" }, { u: "Id", n: "Name" }]. text is what was written; mentioned is the people picked from the list
 * ([{ id, name }]). A picked person's "@Name" in the text becomes a real mention; a name typed but never picked (or changed after it
 * was picked) stays plain text. Leading and trailing blanks are taken off.
 */
export function segmentsFrom(text, mentioned) {
  const names = [...(mentioned || [])].sort(
    (a, b) => b.name.length - a.name.length
  );
  const s = String(text || "");
  const out = [];
  let buf = "";
  let i = 0;
  // the person whose "@Name" starts at position `at`, if there is one (the name must end there, not run on into more letters)
  const mentionAt = (at) => {
    if (s[at] !== "@") return null;
    return names.find((p) => {
      const end = at + 1 + p.name.length;
      return s.startsWith(p.name, at + 1) && !/\p{L}/u.test(s[end] || "");
    });
  };
  while (i < s.length) {
    const hit = mentionAt(i);
    if (hit) {
      if (buf) out.push({ t: buf });
      buf = "";
      out.push({ u: hit.id, n: hit.name });
      i += 1 + hit.name.length;
    } else {
      buf += s[i];
      i += 1;
    }
  }
  if (buf) out.push({ t: buf });
  if (out.length && out[0].t) out[0].t = out[0].t.replace(/^\s+/, "");
  const last = out[out.length - 1];
  if (last && last.t) last.t = last.t.replace(/\s+$/, "");
  return out.filter((x) => x.u || x.t);
}
