/**
 * Pipeline: the rules for what a person has chosen to look at. Pure functions with no screen, so they can be tested.
 *
 * A "filter" is: kinds (opp, risk, rosa), stages (every stage chosen, open and closed, across the kinds), closedMonths
 * (how far back closed deals go; 999 is all), teamId ("MINE", a team's Id, or blank for no team), below (include the teams
 * below), countries, states, segments (portfolios), brands, ownerId and ownerName, qFrom and qTo (a range of expected
 * close quarters), prio, sprio, onHold, stale (only deals that need attention), and campId and campName (one sales campaign:
 * only the deals in that campaign are shown; blank means no campaign; ROSA deals are never in a campaign). This replaces the old
 * Link to APAC Event choice (Robert, 2026-11-07); an old saved event choice is simply ignored.
 *
 * Open, Closed, Both and Custom are not stored: they are worked out from the stages chosen, exactly as in mockup v37.
 */
import { quarterRank, boundRank, needsAttention } from "c/pipelineFormat";

export const KINDS = ["opp", "risk", "rosa"];
export const MINE = "MINE";
export const NAMES = { opp: "Opportunities", risk: "Risks", rosa: "ROSA" };
/** The two closing stages of each kind: won (the end of the path) and lost. */
export const ENDS = {
  opp: { won: "Conversion", lost: "Unsuccessful Conversion" },
  risk: { won: "Closed Retained", lost: "Lost Business" },
  rosa: { won: "Closed Won", lost: "Deal Lost" }
};
/** Owners' states are stored as full names; the Teams list and the panel use the short codes. */
export const AU_STATE_NAMES = {
  NSW: "New South Wales",
  VIC: "Victoria",
  QLD: "Queensland",
  WA: "Western Australia",
  SA: "South Australia",
  TAS: "Tasmania",
  ACT: "Australian Capital Territory",
  NT: "Northern Territory"
};
/** The keys that make the server read the deals again; every other choice is applied to the deals already loaded. */
export const SERVER_KEYS = [
  "kinds",
  "stages",
  "closedMonths",
  "teamId",
  "below"
];

const uniq = (list) => [...new Set(list)];
const sameSet = (a, b) =>
  a.length === b.length && a.every((x) => b.includes(x));

/** An ordered list of a record type's stage values, split into the open stages and the closing ones. */
export function splitStages(kind, values) {
  const e = ENDS[kind];
  return {
    open: values.filter((v) => v !== e.won && v !== e.lost),
    closed: [e.won, e.lost].filter((v) => values.includes(v))
  };
}

/** choices = { opp: {open, closed}, risk: {...}, rosa: {...} }; the stages of the given kinds. */
export function stagesOf(kinds, choices, which) {
  const out = [];
  kinds.forEach((k) => {
    const c = choices[k] || { open: [], closed: [] };
    if (which !== "closed") out.push(...c.open);
    if (which !== "open") out.push(...c.closed);
  });
  return uniq(out);
}

/** "open", "closed", "both" or "custom", from the stages chosen. */
export function derivedStatus(filter, choices) {
  const s = filter.stages;
  if (sameSet(s, stagesOf(filter.kinds, choices, "open"))) return "open";
  if (sameSet(s, stagesOf(filter.kinds, choices, "closed"))) return "closed";
  if (sameSet(s, stagesOf(filter.kinds, choices, "all"))) return "both";
  return "custom";
}

export function withStatus(filter, status, choices) {
  if (!["open", "closed", "both"].includes(status)) return filter;
  const which = status === "both" ? "all" : status;
  return { ...filter, stages: stagesOf(filter.kinds, choices, which) };
}

/** Turns a kind on or off. At least one stays on. The stages follow the Open / Closed / Both the person had. */
export function toggleKind(filter, kind, choices) {
  const on = filter.kinds.includes(kind);
  if (on && filter.kinds.length === 1) return filter;
  const was = derivedStatus(filter, choices);
  const kinds = KINDS.filter((k) => {
    if (k === kind) return !on;
    return filter.kinds.includes(k);
  });
  const next = { ...filter, kinds };
  if (was === "custom") {
    const all = stagesOf(kinds, choices, "all");
    next.stages = filter.stages.filter((s) => all.includes(s));
  } else {
    next.stages = stagesOf(kinds, choices, was === "both" ? "all" : was);
  }
  if (!kinds.includes("opp")) next.onHold = false;
  return next;
}

/** startTeam: MINE for a person who manages a team, otherwise blank (no team). */
export function defaultFilter(kinds, choices, startTeam) {
  return {
    kinds,
    stages: stagesOf(kinds, choices, "open"),
    closedMonths: 12,
    teamId: startTeam || "",
    below: true,
    countries: [],
    states: [],
    segments: [],
    brands: [],
    ownerId: "",
    ownerName: "",
    qFrom: "",
    qTo: "",
    prio: false,
    sprio: false,
    onHold: false,
    stale: false,
    campId: "",
    campName: ""
  };
}

/** A saved filter (older ones hold open / closed / both, newer ones hold the stages) read into a full filter. */
export function fromSaved(saved, choices, isManager, startTeam) {
  const kinds =
    Array.isArray(saved.kinds) && saved.kinds.length
      ? KINDS.filter((k) => saved.kinds.includes(k))
      : ["opp"];
  const base = defaultFilter(
    kinds.length ? kinds : ["opp"],
    choices,
    startTeam
  );
  const next = { ...base };
  Object.keys(base).forEach((k) => {
    const v = saved[k];
    if (k === "kinds" || k === "stages") return;
    if (
      v !== undefined &&
      v !== null &&
      Array.isArray(v) === Array.isArray(base[k]) &&
      typeof v === typeof base[k]
    )
      next[k] = v;
  });
  if (Array.isArray(saved.stages) && saved.stages.length) {
    next.stages = saved.stages;
  } else if (["open", "closed", "both"].includes(saved.status)) {
    next.stages = stagesOf(
      next.kinds,
      choices,
      saved.status === "both" ? "all" : saved.status
    );
  }
  if (!isManager) next.teamId = "";
  return next;
}

/** What the server needs to read the deals. */
export function serverFilter(f) {
  return {
    kinds: f.kinds,
    stages: f.stages,
    closedMonths: f.closedMonths,
    teamId: f.teamId,
    below: f.below
  };
}

/** True when any of the keys that make the server read again differ between two filters. */
export function serverChanged(a, b) {
  const pick = (f) =>
    JSON.stringify([
      f.kinds,
      [...f.stages].sort(),
      f.closedMonths,
      f.teamId,
      f.below
    ]);
  return pick(a) !== pick(b);
}

/** True when a deal passes every choice that is applied on the screen (country, state, portfolio, brand, owner and so on). */
export function clientMatch(d, f, now = Date.now()) {
  if (f.countries.length && !f.countries.includes(d.ownerCountry)) return false;
  if (
    f.states.length &&
    !f.states.some(
      (x) => x === d.ownerState || AU_STATE_NAMES[x] === d.ownerState
    )
  )
    return false;
  if (f.ownerId && d.ownerId !== f.ownerId) return false;
  if (d.kind !== "rosa") {
    if (f.segments.length) {
      const mine = (d.segment || "").split(";").map((x) => x.trim());
      if (!f.segments.some((x) => mine.includes(x))) return false;
    }
    if (f.brands.length) {
      const mine = (d.brands || "").split(";").map((b) => b.trim());
      if (!f.brands.some((b) => mine.includes(b))) return false;
    }
  }
  if ((f.qFrom || f.qTo) && !d.quarter) return false; // a deal with no quarter is left out of any range
  const today = new Date(now);
  if (
    f.qFrom &&
    quarterRank(d.quarter, today) < boundRank(f.qFrom, "from", today)
  )
    return false;
  if (f.qTo && quarterRank(d.quarter, today) > boundRank(f.qTo, "to", today))
    return false;
  if (f.campId && !(d.campaignIds || []).includes(f.campId)) return false;
  if (f.prio && !d.repPriority) return false;
  if (f.sprio && !d.statePriority) return false;
  if (f.onHold && !d.onHold) return false;
  if (f.stale && !needsAttention(d, now)) return false;
  return true;
}

/** The chips that say, in words, what is being looked at. teams: the person's teams ({id, name}); isRep: a member. */
export function chipList(f, choices, teams, isRep) {
  const out = [];
  const add = (label, text) => out.push({ key: out.length, label, text });
  if (isRep) add("", "My pipeline");
  if (f.teamId === MINE) add("", "My team" + (f.below ? " + below" : ""));
  else if (f.teamId) {
    const t = (teams || []).find((x) => x.id === f.teamId);
    if (t) add("Team", t.name + (f.below ? " + below" : ""));
  }
  if (f.countries.length) add("Country", f.countries.join(", "));
  if (f.states.length) add("State", f.states.join(", "));
  if (f.segments.length) add("Portfolio", f.segments.join(", "));
  if (f.brands.length) add("Brand", f.brands.join(", "));
  if (f.ownerId && !isRep) add("Owner", f.ownerName || "chosen");
  if (derivedStatus(f, choices) === "custom")
    add("Stage", f.stages.join(", ") || "none");
  if (f.qFrom || f.qTo)
    add("Close", `${f.qFrom || "any"} to ${f.qTo || "any"}`);
  const only = [
    f.prio ? "rep priority" : "",
    f.sprio ? "state priority" : "",
    f.onHold ? "on hold" : ""
  ].filter(Boolean);
  if (only.length) add("Only", only.join(", "));
  if (f.stale) add("Needs attention", "only");
  if (stagesOf(f.kinds, choices, "closed").some((s) => f.stages.includes(s))) {
    add(
      "Closed range",
      f.closedMonths >= 999 ? "all" : `last ${f.closedMonths} months`
    );
  }
  if (!out.length) add("Everything you can see", "");
  return out;
}

/** The teams as an indented tree, as rows: { id, name, depth, hasKids }, only the opened branches, or a flat search. */
export function teamRows(teams, opened, query) {
  const q = (query || "").trim().toLowerCase();
  const byId = new Map((teams || []).map((t) => [t.id, t]));
  const path = (t) => {
    const parts = [];
    const seen = new Set();
    let p = t;
    while (p && !seen.has(p.id)) {
      seen.add(p.id);
      parts.unshift(p.name);
      p = byId.get(p.parentId);
    }
    return parts.join(" › ");
  };
  if (q) {
    /* a team whose own name (or manager) matches comes first; teams that only sit under a matching team come after */
    const own = (t) => (t.name + " " + (t.managerName || "")).toLowerCase();
    return (teams || [])
      .map((t, i) => ({ t, i, rank: own(t).includes(q) ? 0 : 1 }))
      .filter(({ t, rank }) => rank === 0 || path(t).toLowerCase().includes(q))
      .sort((a, b) => a.rank - b.rank || a.i - b.i)
      .map(({ t }) => ({
        id: t.id,
        name: t.name,
        sub: path(t),
        depth: 0,
        hasKids: false
      }));
  }
  const kids = new Map();
  (teams || []).forEach((t) => {
    const key = t.parentId && byId.has(t.parentId) ? t.parentId : "";
    if (!kids.has(key)) kids.set(key, []);
    kids.get(key).push(t);
  });
  const out = [];
  const walk = (parent, depth, seen) => {
    (kids.get(parent) || []).forEach((t) => {
      if (seen.has(t.id)) return;
      seen.add(t.id);
      const has = (kids.get(t.id) || []).length > 0;
      out.push({
        id: t.id,
        name: t.name,
        sub: "",
        depth,
        hasKids: has,
        open: !!opened[t.id]
      });
      if (has && opened[t.id]) walk(t.id, depth + 1, seen);
    });
  };
  walk("", 0, new Set());
  return out;
}
