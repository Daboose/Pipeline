/**
 * Pipeline: the rules of the Campaign Management form, with no screen, so they can be tested. The name a campaign will get
 * (friendly name plus country codes in the order Salesforce lists the countries, the same order PipelineCampaignRules uses),
 * what is wrong with a form before it is saved, and the blank form.
 */
export const NAME_LIMIT = 40;

/** The campaign name as the system will write it, for the live preview on the form. */
export function previewName(friendly, countries, countryOptions) {
  const base = (friendly || "").trim() || "…";
  const order = (countryOptions || []).map((o) => o.value);
  const chosen = new Set(countries || []);
  const codes = order.filter((c) => chosen.has(c));
  [...chosen]
    .filter((c) => !order.includes(c))
    .sort()
    .forEach((c) => codes.push(c));
  return codes.length ? base + " " + codes.join("-") : base;
}

export function emptyForm(managerId, managerName) {
  return {
    id: "",
    friendlyName: "",
    countries: [],
    portfolios: [],
    active: true,
    managerId: managerId || "",
    managerName: managerName || "",
    startDate: "",
    endDate: "",
    description: ""
  };
}

export function formFromCampaign(c) {
  return {
    id: c.id,
    friendlyName: c.friendlyName || "",
    countries: [...(c.countries || [])],
    portfolios: [...(c.portfolios || [])],
    active: c.active !== false,
    managerId: c.managerId || "",
    managerName: c.managerName || "",
    startDate: c.startDate || "",
    endDate: c.endDate || "",
    description: c.description || ""
  };
}

/** What stops the form being saved yet, in plain words (an empty list means it can be saved). */
export function formProblems(f) {
  const out = [];
  const name = (f.friendlyName || "").trim();
  if (!name) out.push("Give the campaign a name.");
  if (name.length > NAME_LIMIT)
    out.push(`The name can be up to ${NAME_LIMIT} characters.`);
  if (!f.countries.length) out.push("Pick at least one country.");
  if (!f.portfolios.length) out.push("Pick at least one portfolio.");
  if (!f.managerId) out.push("Choose a campaign manager.");
  if (f.startDate && f.endDate && f.endDate < f.startDate)
    out.push("The end date cannot be before the start date.");
  return out;
}

/** Adds the value if it is missing, takes it out if it is there. */
export function toggled(list, value) {
  return list.includes(value)
    ? list.filter((x) => x !== value)
    : [...list, value];
}

/** How many members have a linked deal and how many do not (members: rows with dealCount). */
export function memberCounts(members) {
  const withDeal = members.filter((m) => m.dealCount > 0).length;
  return {
    total: members.length,
    withDeal,
    none: members.length - withDeal
  };
}

/**
 * A copy of the rows in the order of one column. valueOf(row) gives the value to sort by: numbers sort as numbers, text without
 * regard to capitals; dir is 1 for A to Z or low to high and -1 for the other way. Blank values go last either way.
 */
export function sortRows(rows, valueOf, dir) {
  const d = dir === -1 ? -1 : 1;
  return [...rows].sort((a, b) => {
    const x = valueOf(a);
    const y = valueOf(b);
    const xe = x === null || x === undefined || x === "";
    const ye = y === null || y === undefined || y === "";
    if (xe || ye) return xe === ye ? 0 : xe ? 1 : -1;
    if (typeof x === "number" && typeof y === "number") return (x - y) * d;
    return (
      String(x).localeCompare(String(y), undefined, { sensitivity: "base" }) * d
    );
  });
}

export const MAX_IMPORT_LINES = 300;

/**
 * One pasted line with its symbols removed (Robert, 2026-11-07): letters of any language, digits, spaces, tabs, the hyphen,
 * comma, full stop, apostrophe and brackets stay; stars, other symbols, emoji and invisible characters go. Names then match
 * as if the symbols had never been typed. The server cleans the same way (PipelineCampaignImport.clean).
 */
export function cleanLine(line) {
  return String(line || "")
    .replace(/[\u200B-\u200D\uFEFF\u2060]/g, "")
    .replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, " ")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^\p{L}\p{M}\p{N}\t ,.\-'()]/gu, " ")
    .replace(/ {2,}/g, " ")
    .replace(/^[ ]+|[ ]+$/g, "");
}

/** How many pasted lines held symbols that cleaning removes, and which symbols (a few, for the notice). */
export function cleaningReport(text) {
  const raw = (text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const symbols = [];
  let lines = 0;
  raw.forEach((l) => {
    const found = l
      .replace(/[\u200B-\u200D\uFEFF\u2060\u00A0]/g, "")
      .match(/[^\p{L}\p{M}\p{N}\t ,.\-'()\u2010-\u2015\u2212\u2018\u2019]/gu);
    if (found) {
      lines += 1;
      found.forEach((c) => {
        if (!symbols.includes(c) && symbols.length < 6) symbols.push(c);
      });
    }
  });
  return { lines, symbols };
}

/** The names in a pasted list or file: one per non-empty line, symbols removed, a header row such as "Name,Hospital" skipped, repeats dropped. */
export function parseLines(text) {
  const lines = (text || "")
    .split(/\r?\n/)
    .map((l) => cleanLine(l))
    .filter(Boolean);
  if (
    lines.length &&
    lines[0].length < 60 &&
    /[,\t]/.test(lines[0]) &&
    /^(name|surgeon|hcp|doctor|full name)\b/i.test(lines[0])
  ) {
    lines.shift();
  }
  const seen = new Set();
  return lines.filter((l) => {
    const k = l.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** A row of the check screen is settled when it is deleted, already a member, or has a surgeon the person has confirmed. */
export function rowDone(r) {
  return !!r.del || r.status === "dup" || (!!r.pick && !!r.ok);
}

/** Counts for the check screen. need = rows still waiting for a decision; toAdd = confirmed surgeons that will be added. */
export function importCounts(rows) {
  const live = rows.filter((r) => !r.del);
  return {
    exact: live.filter((r) => r.status === "exact").length,
    choose: live.filter((r) => r.status === "many" || r.status === "suggest")
      .length,
    none: live.filter((r) => r.status === "none").length,
    dup: live.filter((r) => r.status === "dup").length,
    need: live.filter((r) => !rowDone(r)).length,
    toAdd: live.filter((r) => r.status !== "dup" && r.pick && r.ok).length
  };
}
