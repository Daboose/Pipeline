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
