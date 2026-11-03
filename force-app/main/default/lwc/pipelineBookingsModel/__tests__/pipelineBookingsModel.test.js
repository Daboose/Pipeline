import {
  monthLabels,
  perMonth,
  usageCheck,
  chartModel,
  TOLERANCE
} from "c/pipelineBookingsModel";

const type = (over) => ({
  name: "Knee",
  split: true,
  primary: [6, 7, 5, 8, 7, 6, 8, 7, 6, 7, 8, 6],
  revision: [0, 1, 0, 1, 0, 1, 0, 0, 1, 0, 0, 0],
  partial: [1, 0],
  booked: 85,
  usage: "zb",
  zb: 85,
  ...over
});

describe("pipelineBookingsModel", () => {
  it("labels the 12 months from the first day of the window", () => {
    expect(monthLabels("2025-11-01")).toEqual([
      "Nov",
      "Dec",
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct"
    ]);
    expect(monthLabels("2026-01-01")[0]).toBe("Jan");
  });

  it("gives an average per month: whole above ten, one decimal below", () => {
    expect(perMonth(204)).toBe(17);
    expect(perMonth(64)).toBe(5.3);
    expect(perMonth(0)).toBe(0);
  });

  it("says accurate within 10% either way and adjust beyond it", () => {
    expect(TOLERANCE).toBe(0.1);
    expect(usageCheck(type({ booked: 85, zb: 85 })).kind).toBe("good");
    expect(usageCheck(type({ booked: 93, zb: 85 })).kind).toBe("good"); // +9.4%
    expect(usageCheck(type({ booked: 77, zb: 85 })).kind).toBe("good"); // -9.4%
    const low = usageCheck(type({ booked: 85, zb: 40 }));
    expect(low).toMatchObject({ kind: "adjust", direction: "low", pct: 113 });
    const high = usageCheck(type({ booked: 64, zb: 100 }));
    expect(high).toMatchObject({
      kind: "adjust",
      direction: "high",
      pct: 36,
      per: 5.3
    });
  });

  it("treats missing and competitor-only usages separately, and zero ZB as low", () => {
    expect(usageCheck(type({ usage: "none", zb: 0 })).kind).toBe("missing");
    expect(usageCheck(type({ usage: "competitor", zb: 0 })).kind).toBe(
      "competitor"
    );
    expect(usageCheck(type({ usage: "zb", zb: 0 }))).toMatchObject({
      kind: "adjust",
      direction: "low",
      pct: null
    });
  });

  it("draws 13 stacked columns, primary under revision, with the usage line when ZB usages exist", () => {
    const m = chartModel(type(), "2025-11-01");
    expect(m.bars.length).toBe(13);
    expect(m.bars[0].label).toBe("Nov");
    expect(m.bars[12].label).toBe("Nov*");
    expect(m.bars[12].opacity).toBe(0.45);
    expect(m.bars[1].segments.length).toBe(2); // Dec has primary 7 and revision 1
    const [primary, revision] = m.bars[1].segments;
    expect(primary.fill).toBe("var(--bar-primary)");
    expect(revision.fill).toBe("var(--bar-revision)");
    expect(revision.y).toBeLessThan(primary.y); // revision sits on top
    expect(m.bars[1].total).toBe(8);
    expect(m.line).not.toBeNull();
    expect(m.line.words[1].text).toBe("say 7.1");
    expect(
      chartModel(type({ usage: "none", zb: 0 }), "2025-11-01").line
    ).toBeNull();
  });

  it("draws CMFT in one colour and has no revision segments", () => {
    const m = chartModel(
      type({ name: "CMFT", split: false, revision: null, partial: [1, 0] }),
      "2025-11-01"
    );
    m.bars.forEach((b) =>
      b.segments.forEach((s) => expect(s.fill).toBe("var(--bar-cmft)"))
    );
  });

  it("chooses a readable gridline step for large totals", () => {
    const m = chartModel(
      type({
        primary: [60, 40, 50, 55, 62, 48, 45, 52, 71, 58, 61, 52],
        revision: new Array(12).fill(0)
      }),
      "2025-11-01"
    );
    expect(m.grid.length).toBeLessThanOrEqual(7);
  });
});

import {
  hospitalState,
  choicesFor,
  freeCompanies,
  newDraft,
  pickChoice,
  afterLines,
  changeText,
  blocker,
  opsFor,
  foundParts,
  companyKey
} from "c/pipelineBookingsModel";

const rowOf = (booked, lines) => ({ booked, lines });
const comp = (cases) => ({ usageId: "u1", company: "Stryker", cases });
const zb = (cases) => ({ usageId: "u2", company: "ZB", cases });

describe("pipelineBookingsModel: the hospital panel", () => {
  it("works out what a hospital's usages look like against its bookings", () => {
    expect(hospitalState(rowOf(10, []))).toBe("none");
    expect(hospitalState(rowOf(10, [comp(60)]))).toBe("comp");
    expect(hospitalState(rowOf(40, [zb(40)]))).toBe("good");
    expect(hospitalState(rowOf(43, [zb(40)]))).toBe("good"); // within 10%
    expect(hospitalState(rowOf(8, [zb(40)]))).toBe("zbdiff");
    expect(hospitalState(rowOf(8, [zb(0)]))).toBe("zbdiff");
    expect(hospitalState(rowOf(8, [comp(60), zb(8)]))).toBe("good");
  });

  it("offers at most three choices, and no delete to a person who may not delete", () => {
    expect(choicesFor("comp", true).map((c) => c.key)).toEqual([
      "zbplus",
      "componly",
      "leave"
    ]);
    expect(choicesFor("none", true).map((c) => c.key)).toEqual([
      "create",
      "leave"
    ]);
    expect(choicesFor("zbdiff", true).map((c) => c.key)).toEqual([
      "adjust",
      "remove",
      "leave"
    ]);
    expect(choicesFor("good", false).map((c) => c.key)).toEqual([
      "adjust",
      "leave"
    ]);
    expect(choicesFor("comp", false)[0].comp.map((s) => s[0])).toEqual([
      "keep",
      "change"
    ]);
  });

  it("lists only the companies still free to add at a hospital, never ZB", () => {
    expect(
      freeCompanies(["Depuy", "Stryker", "ZB"], rowOf(1, [comp(5)]))
    ).toEqual(["Depuy"]);
    expect(freeCompanies(null, rowOf(1, []))).toEqual([]);
    expect(companyKey("Hip")).toBe("stems");
    expect(companyKey("CMF")).toBe("cmft");
  });

  it("starts each state at the suggestion from the bookings", () => {
    expect(newDraft(rowOf(22, [comp(60)]))).toMatchObject({
      choice: "zbplus",
      sub: "keep",
      zb: 22,
      cases: 60
    });
    expect(newDraft(rowOf(10, []))).toMatchObject({
      choice: "create",
      zb: 10,
      addZb: true,
      addComp: false
    });
    expect(newDraft(rowOf(8, [zb(40)]))).toMatchObject({
      choice: "adjust",
      zb: 8
    });
    expect(newDraft(rowOf(40, [zb(40)])).zb).toBe(40);
  });

  it("shows the lines after a choice, and the sentence to confirm", () => {
    const r = rowOf(22, [comp(60)]);
    const d = newDraft(r);
    expect(afterLines(r, d).map((l) => l.company)).toEqual(["Stryker", "ZB"]);
    expect(changeText(r, d)).toBe(
      "Add a ZB usage, 22 a year (Stryker, 60 a year stays)"
    );
    d.sub = "change";
    d.cases = 45;
    d.zb = 25;
    expect(afterLines(r, d)).toEqual([
      { usageId: "u1", company: "Stryker", cases: 45 },
      { company: "ZB", cases: 25 }
    ]);
    expect(changeText(r, d)).toBe(
      "Add a ZB usage, 25 a year, and change Stryker from 60 to 45 a year"
    );
    d.sub = "delete";
    expect(afterLines(r, d)).toEqual([{ company: "ZB", cases: 25 }]);
    pickChoice(d, "componly");
    expect(d.sub).toBe("change");
    d.sub = "delete";
    expect(changeText(r, d)).toBe("Delete the Stryker usage");
    pickChoice(d, "leave");
    expect(changeText(r, d)).toBeNull();
  });

  it("holds a choice back until it is complete and changes something", () => {
    const r = rowOf(22, [comp(60)]);
    const d = newDraft(r);
    expect(blocker(r, d)).toBe("");
    d.zb = "";
    expect(blocker(r, d)).toBe("Enter the ZB cases a year.");
    pickChoice(d, "componly");
    d.cases = 60;
    expect(blocker(r, d)).toBe("Change the number to continue.");
    const r2 = rowOf(8, [zb(40)]);
    const d2 = newDraft(r2);
    d2.zb = 40;
    expect(blocker(r2, d2)).toBe(
      "Change the number or add a competitor to continue."
    );
    d2.addComp = true;
    d2.compName = "Depuy";
    expect(blocker(r2, d2)).toBe("");
    const r3 = rowOf(10, []);
    const d3 = newDraft(r3);
    d3.addZb = false;
    expect(blocker(r3, d3)).toBe("Choose a ZB or a competitor usage to add.");
  });

  it("turns a choice into the changes sent to Salesforce", () => {
    const r = rowOf(22, [comp(60)]);
    const d = newDraft(r);
    expect(opsFor(r, d)).toEqual([{ op: "zb", cases: 22 }]);
    d.sub = "delete";
    expect(opsFor(r, d)).toEqual([
      { op: "zb", cases: 22 },
      { op: "del", usageId: "u1" }
    ]);
    pickChoice(d, "componly");
    d.cases = 45;
    d.sub = "change";
    expect(opsFor(r, d)).toEqual([{ op: "comp", usageId: "u1", cases: 45 }]);
    const r2 = rowOf(8, [comp(60), zb(40)]);
    const d2 = newDraft(r2);
    d2.addComp = true;
    d2.compName = "Depuy";
    d2.compCases = 7;
    expect(opsFor(r2, d2)).toEqual([
      { op: "zb", cases: 8 },
      { op: "add", company: "Depuy", cases: 7 }
    ]);
    pickChoice(d2, "remove");
    expect(opsFor(r2, d2)).toEqual([{ op: "del", usageId: "u2" }]);
    pickChoice(d2, "leave");
    expect(opsFor(r2, d2)).toEqual([]);
  });

  it("says what was found in plain words", () => {
    const text = (parts) => parts.map((p) => p.t).join("");
    expect(text(foundParts(rowOf(10, []), "Knee"))).toBe(
      "No knee usage is entered, although 10 ZB knee cases were booked."
    );
    expect(text(foundParts(rowOf(22, [comp(60)]), "Knee"))).toContain(
      "Stryker, 60 a year. There is no ZB usage, although 22 ZB cases were booked."
    );
    expect(text(foundParts(rowOf(8, [zb(40)]), "Knee"))).toContain("80% fewer");
  });
});
