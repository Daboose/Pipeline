/**
 * Pipeline shared rules and formatting. Pure functions with no screen, so they can be tested on their own.
 *
 * The rules come from Robert's decisions (docs/Pipeline_Requirements.md): the Chatter band is current up to 30 days,
 * needs an update from 30 to 90 and is very old over 90; a stage that has not moved for over 90 days is a warning;
 * deals On Hold are exempt; the age of a deal counts from its created date; money is shown per currency and never mixed.
 */

const SYMBOLS = {
  AUD: "A$",
  NZD: "NZ$",
  SGD: "S$",
  MYR: "RM",
  THB: "฿",
  HKD: "HK$",
  CNY: "¥",
  TWD: "NT$",
  KRW: "₩",
  INR: "₹",
  USD: "US$"
};

const DAY_MS = 86400000;

/** The colour of each stage chip, in the order of the stages. */
export const STAGE_COLOURS = [
  "#2f80ed",
  "#0ea5e9",
  "#7c3aed",
  "#a855f7",
  "#14b8a6"
];

/** The two closing stages of each kind of deal: won (the end of the stage path) and lost. Used by the deal panel's stage slider and the Status column. */
export const STAGE_ENDS = {
  opp: { won: "Conversion", lost: "Unsuccessful Conversion" },
  risk: { won: "Closed Retained", lost: "Lost Business" },
  rosa: { won: "Closed Won", lost: "Deal Lost" }
};

/**
 * A deal's status for the Status column (Robert, 2026-11-07): closed (won or lost, told by its closing stage, as the stage
 * slider does), on hold, or open. Returns { key, label }: key is "won", "lost", "closed" (a closed stage that is neither end),
 * "hold" or "open". A closed deal is never "on hold". The labels sort in a sensible order: Closed Lost, Closed Won, On Hold, Open.
 */
export function dealStatus(deal) {
  const ends = STAGE_ENDS[deal.kind] || STAGE_ENDS.opp;
  if (deal.isClosed) {
    if (deal.stage === ends.won) return { key: "won", label: "Closed Won" };
    if (deal.stage === ends.lost) return { key: "lost", label: "Closed Lost" };
    return { key: "closed", label: "Closed" };
  }
  if (deal.onHold) return { key: "hold", label: "On Hold" };
  return { key: "open", label: "Open" };
}

/** 649000 in AUD is "A$649k"; 1,250,000 is "A$1.25m". Smaller amounts are shown whole. */
export function formatMoney(value, currencyCode) {
  const v = Number(value) || 0;
  const symbol =
    SYMBOLS[currencyCode] ?? (currencyCode ? currencyCode + " " : "");
  if (Math.abs(v) >= 1e6) return symbol + (v / 1e6).toFixed(2) + "m";
  if (Math.abs(v) >= 1e3) return symbol + Math.round(v / 1e3) + "k";
  return symbol + Math.round(v);
}

/** Totals per currency, never added across currencies: "A$1.20m · NZ$300k". An empty list is "–". */
export function totalsByCurrency(deals) {
  const sums = new Map();
  deals.forEach((d) => {
    const c = d.currencyCode || "";
    sums.set(c, (sums.get(c) || 0) + (Number(d.value) || 0));
  });
  if (!sums.size) return "–";
  return [...sums.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([c, v]) => formatMoney(v, c))
    .join(" · ");
}

/** Whole days from a date or date-time (ISO text) to now. Null when there is no date. */
export function daysSince(iso, now = Date.now()) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now - t) / DAY_MS));
}

/**
 * Days since the last original Chatter post. A deal nobody has posted on yet counts from the day it was created
 * (the age rule); the screen says so in the tooltip.
 */
export function chatterDays(deal, now = Date.now()) {
  return daysSince(deal.lastPosted, now) ?? daysSince(deal.createdDate, now);
}

/** Days since the stage last changed; a deal whose stage never changed counts from its created date. */
export function stageDays(deal, now = Date.now()) {
  return (
    daysSince(deal.lastStageChange, now) ?? daysSince(deal.createdDate, now)
  );
}

export function ageDays(deal, now = Date.now()) {
  return daysSince(deal.createdDate, now);
}

/** ok up to 30 days, warn 31 to 90, bad over 90. */
export function chatterBand(days) {
  if (days === null || days === undefined) return "hold";
  if (days <= 30) return "ok";
  if (days <= 90) return "warn";
  return "bad";
}

/** A stage that has not moved for over 90 days is a warning. */
export function stageBand(days) {
  if (days === null || days === undefined) return "hold";
  return days > 90 ? "bad" : "ok";
}

/** True when an open deal that is not on hold needs attention: stage stuck over 90 days or no post for over 30. */
export function needsAttention(deal, now = Date.now()) {
  if (deal.isClosed || deal.onHold) return false;
  return stageDays(deal, now) > 90 || chatterDays(deal, now) > 30;
}

/** "12 Mar 2026" from an ISO date or date-time; blank when there is none. */
export function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

/**
 * The year a quarter is most likely meant for: this year if the quarter is the current one or still to come, otherwise
 * next year (today's Q4 2026: Q4 is 2026, Q1 to Q3 are 2027). This is the same rule the year was filled in by, and the
 * year the flyout suggests when a quarter is picked.
 */
export function suggestYear(quarter, now = new Date()) {
  const m = /^Q([1-4])/.exec(quarter || "");
  const year = now.getFullYear();
  if (!m) return year;
  const current = Math.floor(now.getMonth() / 3) + 1;
  return Number(m[1]) >= current ? year : year + 1;
}

/** Whether a quarter of a year ("Q3", "2026") is before the current quarter (the same test the validation rule makes). */
export function quarterIsPast(quarter, year, now = new Date()) {
  const m = /^Q([1-4])/.exec(quarter || "");
  if (!m || !year) return false;
  const current = Math.floor(now.getMonth() / 3) + 1;
  return Number(year) * 4 + Number(m[1]) < now.getFullYear() * 4 + current;
}

/** "Q4" becomes "Q4 2026" (by suggestYear); a quarter that already has its year, or anything else, is left alone. */
export function qualifyQuarter(q, now = new Date()) {
  return /^Q[1-4]$/.test(q || "") ? `${q} ${suggestYear(q, now)}` : q;
}

/**
 * The order quarters sort in: by year, then Q1 to Q4, then anything else, then none. A quarter with no year is placed
 * by suggestYear, so an old "Q4" sits among the current ones.
 */
export function quarterRank(q, now = new Date()) {
  if (!q) return 1e7;
  const m = /^Q([1-4])(?:\s+(\d{4}))?$/.exec(q);
  if (!m) return 9e6;
  const year = m[2] ? Number(m[2]) : suggestYear(q, now);
  return year * 10 + Number(m[1]);
}

/**
 * The quarter-and-year a saved range bound means. A bound saved before years existed ("Q1" to "Q4") has no year: the
 * start is read in this calendar year and the end by suggestYear, so an old Q1 to Q4 still means the year in play.
 */
export function boundText(q, edge, now = new Date()) {
  if (!/^Q[1-4]$/.test(q || "")) return q;
  return `${q} ${edge === "from" ? now.getFullYear() : suggestYear(q, now)}`;
}
export function boundRank(q, edge, now = new Date()) {
  return quarterRank(boundText(q, edge, now), now);
}

export function plural(n, one, many) {
  return n === 1 ? one : many || one + "s";
}

/** "today", "yesterday" or "114 days ago" for a date-time, then the date: "114 days ago · 3 Jul 2026". */
export function agoText(iso, now = Date.now()) {
  const n = daysSince(iso, now);
  if (n === null) return "";
  const word = n === 0 ? "today" : n === 1 ? "yesterday" : `${n} days ago`;
  return `${word} · ${formatDate(iso)}`;
}

/**
 * Chatter text as plain text. A post or reply written in Salesforce's own Chatter box is stored as rich text
 * ("<p>Testing</p>", links, lists, entities such as &amp;); this turns it into plain lines of text, with a person's
 * mention left as "@Name" (so it can be coloured). Nothing from the markup is ever put on the page as markup.
 */
export function chatterText(raw) {
  const entities = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " "
  };
  let t = String(raw === null || raw === undefined ? "" : raw);
  t = t
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|h[1-6]|ul|ol|blockquote|pre)\s*>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "• ")
    .replace(/<\/\s*li\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "");
  t = t.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const code =
        e[1].toLowerCase() === "x"
          ? parseInt(e.slice(2), 16)
          : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    const known = entities[e.toLowerCase()];
    return known === undefined ? m : known;
  });
  return t.replace(/\n{3,}/g, "\n\n").trim();
}

/** Cuts a post into plain pieces and @Name mentions (two capitalised words at most) so the mentions can be coloured. */
export function mentionParts(text) {
  const out = [];
  const re = /@\p{Lu}[\p{L}'.-]*(?: \p{Lu}[\p{L}'.-]*)?/gu;
  let at = 0;
  let m = re.exec(text || "");
  while (m) {
    if (m.index > at)
      out.push({ text: text.slice(at, m.index), mention: false });
    out.push({ text: m[0], mention: true });
    at = m.index + m[0].length;
    m = re.exec(text);
  }
  if (at < (text || "").length)
    out.push({ text: text.slice(at), mention: false });
  return out.map((p, i) => ({ ...p, key: i }));
}
