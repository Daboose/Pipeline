/**
 * Pipeline: the layout of a usage, as PROD's ANZ usage layouts (Robert, 2026-11-17, used for every country), and the pure logic around
 * it for the usage tiles of the Usage card: which fields each portfolio has, in which rows and columns, which are mandatory, how a
 * product list follows its company, and what is sent to Salesforce. No screen here. Used by pipelineUsageCard.
 *
 * The compact layout (Robert, 2026-11-19; mockup docs/mockups/pipeline_deal_screens_v1.html): every portfolio uses the SAME four field
 * columns, Company, Product, Type (stem type, bearing type or segment) and Cases per year, with a row per product line. A hip's
 * bearing type therefore sits on the Cup line in the Type column. The column headings are drawn once by the card (COLUMNS).
 *
 * Portfolios use the names of the Apex side: Hip, Knee, Shoulder and CMF (shown as CMFT).
 */

export const PROC = "Procedure_Types__c";
export const TECH = "Supporting_Technologies__c";

/** Every field a tile shows or edits: its label, its kind and, for a product, the company that drives its choices. */
export const FIELD = {
  CompanyHipStems__c: { label: "Company", kind: "co" },
  ProductHipStems__c: {
    label: "Product",
    kind: "pr",
    dep: "CompanyHipStems__c"
  },
  Hip_Stem_Type__c: { label: "Stem type", kind: "sel" },
  CasesPAHipStem__c: { label: "Cases per year", kind: "num" },
  CompanyHipCups__c: { label: "Company", kind: "co" },
  ProductHipCups__c: {
    label: "Product",
    kind: "pr",
    dep: "CompanyHipCups__c"
  },
  HipBearingType__c: { label: "Bearing type", kind: "sel" },
  CompanyTotalKnee__c: { label: "Company", kind: "co" },
  ProductTotalKnee__c: {
    label: "Product",
    kind: "pr",
    dep: "CompanyTotalKnee__c"
  },
  CasesPATotalKnee__c: { label: "Cases per year", kind: "num" },
  CompanyAnatomical__c: { label: "Company", kind: "co" },
  ProductAnatomical__c: {
    label: "Product",
    kind: "pr",
    dep: "CompanyAnatomical__c"
  },
  CasesPAAnatomical__c: { label: "Cases per year", kind: "num" },
  CompanyReverse__c: { label: "Company", kind: "co" },
  ProductReverse__c: {
    label: "Product",
    kind: "pr",
    dep: "CompanyReverse__c"
  },
  CasesPAReverse__c: { label: "Cases per year", kind: "num" },
  SegmentCMFT__c: { label: "Segment", kind: "sel" },
  Company_CMFT__c: { label: "Company", kind: "co" },
  Product_CMFT__c: {
    label: "Product",
    kind: "pr",
    dep: "Company_CMFT__c"
  },
  Cases_PA_CMFT__c: { label: "Cases per year", kind: "num" }
};

/** The four field columns every usage row uses, in order. The Usage card draws them once as the heading row of the whole list. */
export const COLUMNS = ["Company", "Product", "Type", "Cases / year"];

/**
 * A row per product line; each row's `cells` are the field names for the four columns (Company, Product, Type, Cases per year), null for
 * a cell the line does not have. A row's `needs` greys it until those fields are filled (a cup needs its stem). `chips` says whether
 * procedure types and supporting technologies apply.
 */
export const GRID = {
  Hip: {
    title: "Hip",
    rows: [
      {
        label: "Stem",
        cells: [
          "CompanyHipStems__c",
          "ProductHipStems__c",
          "Hip_Stem_Type__c",
          "CasesPAHipStem__c"
        ]
      },
      {
        label: "Cup",
        cells: [
          "CompanyHipCups__c",
          "ProductHipCups__c",
          "HipBearingType__c",
          null
        ],
        needs: ["CompanyHipStems__c", "ProductHipStems__c"]
      }
    ],
    chips: true
  },
  Knee: {
    title: "Knee",
    rows: [
      {
        label: "",
        cells: [
          "CompanyTotalKnee__c",
          "ProductTotalKnee__c",
          null,
          "CasesPATotalKnee__c"
        ]
      }
    ],
    chips: true
  },
  Shoulder: {
    title: "Shoulders",
    rows: [
      {
        label: "Anatomical",
        cells: [
          "CompanyAnatomical__c",
          "ProductAnatomical__c",
          null,
          "CasesPAAnatomical__c"
        ]
      },
      {
        label: "Reverse",
        cells: [
          "CompanyReverse__c",
          "ProductReverse__c",
          null,
          "CasesPAReverse__c"
        ]
      }
    ],
    chips: true
  },
  CMF: {
    title: "CMFT",
    rows: [
      {
        label: "",
        cells: [
          "Company_CMFT__c",
          "Product_CMFT__c",
          "SegmentCMFT__c",
          "Cases_PA_CMFT__c"
        ]
      }
    ],
    chips: false
  }
};

/** The fields that must be filled (the stem of a hip; a knee; a CMFT). Shoulders need nothing. */
export const REQUIRED = {
  Hip: [
    "CompanyHipStems__c",
    "ProductHipStems__c",
    "Hip_Stem_Type__c",
    "CasesPAHipStem__c"
  ],
  Knee: ["CompanyTotalKnee__c", "ProductTotalKnee__c", "CasesPATotalKnee__c"],
  Shoulder: [],
  CMF: [
    "SegmentCMFT__c",
    "Company_CMFT__c",
    "Product_CMFT__c",
    "Cases_PA_CMFT__c"
  ]
};

/** Company choices left out of the list (Robert, 2026-11-17: "Other" is not offered as a company for CMFT, or for a hip's stem or cup;
 *  the products "Other" belong to that company only, so they go with it). A record that already holds "Other" still shows it. */
const LEFT_OUT = {
  Company_CMFT__c: ["Other"],
  CompanyHipStems__c: ["Other"],
  CompanyHipCups__c: ["Other"]
};

/** The Usage__c fields of a portfolio: its grid cells and the two chip fields when they apply. */
export function fieldsOf(portfolio) {
  const g = GRID[portfolio];
  if (!g) return [];
  const out = [];
  g.rows.forEach((r) => r.cells.forEach((c) => c && out.push(c)));
  if (g.chips) out.push(PROC, TECH);
  return out;
}

/** The fields of a portfolio's grid that a person must choose from lists (everything but cases per year and chips). */
export function listFields(portfolio) {
  return fieldsOf(portfolio).filter(
    (f) => f !== PROC && f !== TECH && FIELD[f].kind !== "num"
  );
}

/** A usage's values (text by field name) as an editable draft: cases as text, chips as arrays. */
export function draftOf(portfolio, values) {
  const d = {};
  fieldsOf(portfolio).forEach((f) => {
    const v = (values || {})[f];
    d[f] = f === PROC || f === TECH ? (v ? String(v).split(";") : []) : v || "";
  });
  return d;
}

const filled = (v) => (Array.isArray(v) ? v.length > 0 : !!v);

export function isMissing(portfolio, draft, field) {
  return REQUIRED[portfolio].includes(field) && !filled((draft || {})[field]);
}

/** True when every mandatory field of the portfolio is filled. */
export function isComplete(portfolio, draft) {
  return REQUIRED[portfolio].every((f) => filled((draft || {})[f]));
}

/** A row is greyed (and its fields cannot be changed) until the fields it needs are filled. */
export function rowOff(row, draft) {
  return !!row.needs && !row.needs.every((f) => filled((draft || {})[f]));
}

/**
 * What the person may choose for a field, as [{ value, label }], from the picklists Salesforce gave for the usage's record type
 * (`picks[field] = { values: [{ value, validFor }], controllerValues }`). A product shows only the products of the chosen company.
 * The current value is kept in the list even if it is no longer offered, so an old usage still shows.
 */
export function choicesFor(field, picks, draft) {
  const p = (picks || {})[field];
  const def = FIELD[field];
  let list = p ? p.values.slice() : [];
  if (def && def.dep) {
    const company = (draft || {})[def.dep];
    const idx =
      p && p.controllerValues ? p.controllerValues[company] : undefined;
    list =
      company && idx !== undefined
        ? list.filter((v) => (v.validFor || []).includes(idx))
        : [];
  }
  const out = (LEFT_OUT[field] || []).length
    ? list.filter((v) => !LEFT_OUT[field].includes(v.value))
    : list;
  const names = out.map((v) => ({ value: v.value, label: v.label || v.value }));
  const current = (draft || {})[field];
  if (
    current &&
    !Array.isArray(current) &&
    !names.some((n) => n.value === current)
  ) {
    names.unshift({ value: current, label: current });
  }
  return names;
}

/** The two chip fields' choices, in Salesforce's order. */
export function chipChoices(field, picks) {
  const p = (picks || {})[field];
  return p
    ? p.values.map((v) => ({ value: v.value, label: v.label || v.value }))
    : [];
}

/** When a company changes its product is cleared (the product list follows the company). */
export function setField(portfolio, draft, field, value) {
  const next = { ...draft, [field]: value };
  Object.keys(FIELD).forEach((f) => {
    if (FIELD[f].dep === field && f in next) next[f] = "";
  });
  return next;
}

/** Switches a chip on or off. */
export function toggleChip(draft, field, value) {
  const have = draft[field] || [];
  return {
    ...draft,
    [field]: have.includes(value)
      ? have.filter((v) => v !== value)
      : [...have, value]
  };
}

/** What is sent to Salesforce: every field of the portfolio's layout (empty ones as null so clearing a field is saved). */
export function payloadOf(portfolio, draft) {
  const out = {};
  fieldsOf(portfolio).forEach((f) => {
    const v = draft[f];
    if (f === PROC || f === TECH) out[f] = v || [];
    else if (FIELD[f].kind === "num")
      out[f] = v === "" || v === undefined ? null : Number(v);
    else out[f] = v || null;
  });
  return out;
}

/** The name shown for a portfolio (CMF is shown as CMFT, Shoulder as Shoulders). */
export function portfolioTitle(portfolio) {
  return GRID[portfolio] ? GRID[portfolio].title : portfolio;
}

/** True when the field is mandatory for the portfolio. */
export function isRequired(portfolio, field) {
  return REQUIRED[portfolio].includes(field);
}

function cellOf(portfolio, field, draft, edit, off, picks, scope, ci) {
  const def = FIELD[field];
  const base = {
    key: scope + "-" + field,
    field,
    isCell: true,
    cls: "cc" + (ci === 3 ? " num" : "") + (off ? " off" : ""),
    style: "",
    star: false,
    isText: !edit,
    isSelect: edit && def.kind !== "num",
    isNumber: edit && def.kind === "num",
    text: draft[field] || "",
    value: draft[field] || "",
    placeholder: def.label,
    disabled: off,
    bad: edit && isMissing(portfolio, draft, field)
  };
  if (!base.isSelect) {
    base.inputCls = base.bad ? "inp n bad" : "inp n";
    return base;
  }
  const list = choicesFor(field, picks, draft);
  const needCompany = def.kind === "pr" && !draft[def.dep];
  base.disabled = off || needCompany;
  base.selCls = base.bad ? "sel bad" : "sel";
  base.options = [
    {
      value: "",
      label: needCompany ? "Product (company first)" : def.label + "…",
      selected: !draft[field]
    }
  ].concat(
    list.map((v) => ({
      value: v.value,
      label: v.label,
      selected: v.value === draft[field]
    }))
  );
  return base;
}

/**
 * Everything the tile component draws for one usage (or for one being added), as ONE flat list of grid cells (compact layout): for each
 * product line the portfolio name (first line only), the line name, then the four field cells (or, on a greyed cup line, a hint in
 * place of the cases cell). `edit` false shows values only, hiding empty lines; the chip lists sit beside the lines when viewing and
 * on their own line when editing. `picks` are the lists Salesforce gave for the record type. `scope` makes the keys unique.
 */
export function buildTile(portfolio, draft, edit, picks, scope) {
  const g = GRID[portfolio];
  const cells = [];
  let lines = 0;
  const text = (key, cls, value, star) => ({
    key,
    cls,
    style: "",
    isText: true,
    isSelect: false,
    isNumber: false,
    text: value,
    star: !!star
  });
  g.rows.forEach((r, ri) => {
    if (!edit && !r.cells.some((f) => f && draft[f])) return;
    const off = edit && rowOff(r, draft);
    // the red star marks a line with mandatory boxes, so it is only drawn while a usage is being edited or added; a saved usage already
    // has them filled in, so viewing shows no stars (Robert, 2026-11-20)
    const hasStar = edit && r.cells.some((f) => f && isRequired(portfolio, f));
    cells.push(
      text(
        scope + "-p" + ri,
        "pc",
        lines === 0 ? portfolioTitle(portfolio) : "",
        lines === 0 && !r.label && hasStar
      )
    );
    cells.push(
      text(
        scope + "-l" + ri,
        "lc" + (off ? " off" : ""),
        r.label,
        !!r.label && hasStar
      )
    );
    r.cells.forEach((f, ci) => {
      if (off && ci === 3) {
        cells.push(
          text(
            scope + "-h" + ri,
            "hn",
            "Fill the stem company and product first."
          )
        );
      } else if (f) {
        cells.push(cellOf(portfolio, f, draft, edit, off, picks, scope, ci));
      } else {
        cells.push(text(scope + "-e" + ri + "-" + ci, "cc", ""));
      }
    });
    lines++;
  });
  /** While editing every choice Salesforce offers (and any chosen value it no longer offers); otherwise only what is chosen. */
  const chip = (field) => {
    const chosen = draft[field] || [];
    const all = edit
      ? chipChoices(field, picks)
          .map((c) => c.value)
          .concat(
            chosen.filter(
              (v) => !chipChoices(field, picks).some((c) => c.value === v)
            )
          )
      : chosen;
    return all.map((v) => ({
      key: scope + "-" + field + "-" + v,
      field,
      value: v,
      label: v,
      on: chosen.includes(v),
      cls:
        (field === PROC ? "chip p" : "chip t") +
        (chosen.includes(v) ? " on" : "")
    }));
  };
  const proc = g.chips ? chip(PROC) : [];
  const tech = g.chips ? chip(TECH) : [];
  const hasChips = proc.length + tech.length > 0;
  return {
    cells,
    hasGrid: cells.length > 0,
    lines,
    /** the chips and the pencil span the usage's lines when viewing */
    sideStyle: "grid-row: 1 / span " + Math.max(lines, 1),
    showSide: !edit && cells.length > 0,
    proc,
    tech,
    hasChips,
    showEditChips: edit && hasChips,
    chipGap: proc.length > 0 && tech.length > 0
  };
}

/**
 * The "Last updated" date of a usage as DD/MM/YY (two digits each, in the person's own time zone), or "" when there is none. Robert,
 * 2026-11-20: the card shows when each usage was last updated instead of one general sentence under the plates.
 */
export function shortDate(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  const two = (n) => String(n).padStart(2, "0");
  return `${two(d.getDate())}/${two(d.getMonth() + 1)}/${two(d.getFullYear() % 100)}`;
}

/** True when the date is more than a year before `now`: such a date is drawn in amber. No date is never old. */
export function isOverAYear(iso, now = new Date()) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return false;
  const cut = new Date(now.getTime());
  cut.setFullYear(cut.getFullYear() - 1);
  return d.getTime() < cut.getTime();
}
