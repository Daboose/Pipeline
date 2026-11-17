/**
 * Pipeline: the layout of a usage, as PROD's ANZ usage layouts (Robert, 2026-11-17, used for every country), and the pure logic around
 * it for the usage tiles of the Usage card: which fields each portfolio has, in which rows and columns, which are mandatory, how a
 * product list follows its company, and what is sent to Salesforce. No screen here. Used by pipelineUsageCard.
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

/**
 * One set of column headings per portfolio and a row per product line (a row's cells are field names, null for a cell the line does not
 * have). A row's `needs` greys it until those fields are filled (a cup needs its stem). `extra` fields sit under the Company column.
 * `chips` says whether procedure types and supporting technologies apply.
 */
export const GRID = {
  Hip: {
    title: "Hip",
    cols: ["Company", "Product", "Stem type", "Cases per year"],
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
        cells: ["CompanyHipCups__c", "ProductHipCups__c", null, null],
        needs: ["CompanyHipStems__c", "ProductHipStems__c"]
      }
    ],
    extra: ["HipBearingType__c"],
    chips: true
  },
  Knee: {
    title: "Knee",
    cols: ["Company", "Product", "Cases per year"],
    rows: [
      {
        label: "",
        cells: [
          "CompanyTotalKnee__c",
          "ProductTotalKnee__c",
          "CasesPATotalKnee__c"
        ]
      }
    ],
    extra: [],
    chips: true
  },
  Shoulder: {
    title: "Shoulders",
    cols: ["Company", "Product", "Cases per year"],
    rows: [
      {
        label: "Anatomical",
        cells: [
          "CompanyAnatomical__c",
          "ProductAnatomical__c",
          "CasesPAAnatomical__c"
        ]
      },
      {
        label: "Reverse",
        cells: ["CompanyReverse__c", "ProductReverse__c", "CasesPAReverse__c"]
      }
    ],
    extra: [],
    chips: true
  },
  CMF: {
    title: "CMFT",
    cols: ["Segment", "Company", "Product", "Cases per year"],
    rows: [
      {
        label: "",
        cells: [
          "SegmentCMFT__c",
          "Company_CMFT__c",
          "Product_CMFT__c",
          "Cases_PA_CMFT__c"
        ]
      }
    ],
    extra: [],
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

/** Company choices left out of the list (Robert, 2026-11-17: "Other" is not offered for CMFT). */
const LEFT_OUT = { Company_CMFT__c: ["Other"] };

/** The Usage__c fields of a portfolio: its grid cells, its extra fields and the two chip fields when they apply. */
export function fieldsOf(portfolio) {
  const g = GRID[portfolio];
  if (!g) return [];
  const out = [];
  g.rows.forEach((r) => r.cells.forEach((c) => c && out.push(c)));
  g.extra.forEach((f) => out.push(f));
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

function cellOf(portfolio, field, draft, edit, off, picks, scope) {
  const def = FIELD[field];
  const base = {
    key: scope + "-" + field,
    field,
    isCell: true,
    isHead: false,
    isGap: false,
    cls: "gc" + (off ? " off" : ""),
    isText: !edit,
    isSelect: edit && def.kind !== "num",
    isNumber: edit && def.kind === "num",
    text: draft[field] || "",
    value: draft[field] || "",
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
      label: needCompany ? "Choose the company first" : "Choose…",
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
 * Everything the tile component draws for one usage (or for one being added): one set of column headings, a row per product line,
 * the extra field under the Company column, and the two chip lists. `edit` false shows values only, hiding empty rows and fields.
 * `picks` are the lists Salesforce gave for the record type. `scope` makes the keys unique.
 */
export function buildTile(portfolio, draft, edit, picks, scope) {
  const g = GRID[portfolio];
  const hasLabel = g.rows.some((r) => r.label);
  const n = g.cols.length;
  const heads = g.cols.map((text, i) => {
    const f = g.rows[0].cells[i];
    return {
      key: scope + "-h" + i,
      text,
      star: !hasLabel && !!f && isRequired(portfolio, f)
    };
  });
  const rows = [];
  const gap = (key, span, hint) => ({
    key,
    isGap: true,
    isCell: false,
    isHead: false,
    style: "grid-column: span " + span,
    hint: hint || ""
  });
  g.rows.forEach((r, ri) => {
    if (!edit && !r.cells.some((f) => f && draft[f])) return;
    const off = edit && rowOff(r, draft);
    const cells = [];
    let i = 0;
    while (i < n) {
      const f = r.cells[i];
      if (f) {
        cells.push(cellOf(portfolio, f, draft, edit, off, picks, scope));
        i++;
      } else {
        let j = i;
        while (j < n && !r.cells[j]) j++;
        cells.push(
          gap(
            scope + "-g" + ri + "-" + i,
            j - i,
            off ? "Fill the stem company and product first." : ""
          )
        );
        i = j;
      }
    }
    rows.push({
      key: scope + "-r" + ri,
      label: r.label,
      hasLabel,
      cls: off ? "rl off" : "rl",
      star: hasLabel && r.cells.some((f) => f && isRequired(portfolio, f)),
      cells
    });
  });
  // an extra field (the bearing type) sits on its own two lines under the Company column: its heading, then its choice
  g.extra.forEach((f, xi) => {
    if (!edit && !draft[f]) return;
    rows.push({
      key: scope + "-xh" + xi,
      label: "",
      hasLabel,
      cls: "rl",
      star: false,
      cells: [
        {
          key: scope + "-xht" + xi,
          isHead: true,
          isCell: false,
          isGap: false,
          text: FIELD[f].label
        },
        gap(scope + "-xhg" + xi, n - 1)
      ]
    });
    rows.push({
      key: scope + "-xc" + xi,
      label: "",
      hasLabel,
      cls: "rl",
      star: false,
      cells: [
        cellOf(portfolio, f, draft, edit, false, picks, scope),
        gap(scope + "-xcg" + xi, n - 1)
      ]
    });
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
  return {
    gridStyle:
      "grid-template-columns: " +
      (hasLabel ? "104px " : "") +
      "repeat(" +
      n +
      ", minmax(0, 1fr))",
    hasLabel,
    heads,
    rows,
    hasGrid: rows.length > 0,
    proc,
    tech,
    hasChips: proc.length + tech.length > 0,
    chipGap: proc.length > 0 && tech.length > 0
  };
}
