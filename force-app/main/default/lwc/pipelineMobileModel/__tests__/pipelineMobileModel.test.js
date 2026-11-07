import {
  inStatus,
  cardName,
  matchesSearch,
  dealsOf,
  cardOf,
  currencyGroups,
  chartFigures,
  headerOf,
  summaryTiles,
  stageSteps,
  stageTone,
  detailRows
} from "c/pipelineMobileModel";

const d = (id, o = {}) => ({
  id,
  kind: "opp",
  hcp: "Dr " + id,
  facility: "Mater Hospital",
  stage: "Plan",
  quarter: "Q1 2027",
  value: 1000,
  currencyCode: "AUD",
  isClosed: false,
  onHold: false,
  repPriority: false,
  campaignCount: 0,
  ...o
});

describe("pipelineMobileModel", () => {
  it("lets through open, closed or both", () => {
    expect(inStatus(d("a"), "open")).toBe(true);
    expect(inStatus(d("a"), "closed")).toBe(false);
    expect(inStatus(d("a", { isClosed: true }), "closed")).toBe(true);
    expect(inStatus(d("a", { isClosed: true }), "open")).toBe(false);
    expect(inStatus(d("a", { isClosed: true }), "both")).toBe(true);
  });

  it("names a card after the surgeon, or the hospital for a ROSA deal, and searches name and hospital", () => {
    expect(cardName(d("Chen"))).toBe("Dr Chen");
    expect(
      cardName(d("x", { kind: "rosa", facility: "Wesley Hospital" }))
    ).toBe("Wesley Hospital");
    expect(matchesSearch(d("Chen"), "chen")).toBe(true);
    expect(matchesSearch(d("Chen"), "mater")).toBe(true);
    expect(matchesSearch(d("Chen"), "zzz")).toBe(false);
    expect(matchesSearch(d("Chen"), "  ")).toBe(true);
  });

  it("gives one kind's deals, biggest value first", () => {
    const rows = dealsOf(
      [
        d("a", { value: 100 }),
        d("b", { value: 900 }),
        d("c", { kind: "risk" }),
        d("e", { isClosed: true })
      ],
      "opp",
      "open",
      ""
    );
    expect(rows.map((x) => x.id)).toEqual(["b", "a"]);
  });

  it("shows a status pill only when it says something", () => {
    expect(cardOf(d("a"), "open").pill).toBeNull();
    expect(cardOf(d("a", { onHold: true }), "open").pill.label).toBe("On Hold");
    expect(
      cardOf(d("a", { isClosed: true, stage: "Conversion" }), "closed").pill
        .label
    ).toBe("Closed Won");
    expect(cardOf(d("a"), "both").pill.label).toBe("Open");
    expect(cardOf(d("a", { campaignCount: 2 }), "open").campaignStar).toBe(
      true
    );
    expect(
      cardOf(d("a", { kind: "rosa", campaignCount: 2 }), "open").campaignStar
    ).toBe(false);
  });

  it("never adds values across currencies", () => {
    const g = currencyGroups([
      d("a", { value: 100 }),
      d("b", { value: 300, currencyCode: "SGD" }),
      d("c", { value: 50 })
    ]);
    expect(g.map((x) => [x.code, x.total])).toEqual([
      ["SGD", 300],
      ["AUD", 150]
    ]);
  });

  it("works out the chart figures: stages in order with their colours, quarters in order", () => {
    const f = chartFigures(
      [
        d("a", { stage: "Commit", quarter: "Q2 2027", value: 400 }),
        d("b", { stage: "Plan", quarter: "Q4 2026", value: 100 }),
        d("c", { stage: "Plan", quarter: "Q4 2026", value: 100 }),
        d("e", {
          stage: "Conversion",
          quarter: "Q4 2026",
          value: 800,
          isClosed: true
        })
      ],
      "opp",
      ["Plan", "Action", "Commit", "Conversion"],
      "both"
    );
    expect(f.count).toBe(4);
    expect(f.total).toBe(1400);
    expect(f.stages.map((s) => s.name)).toEqual([
      "Plan",
      "Commit",
      "Conversion"
    ]);
    expect(f.stages[2].colour).toBe("#16a34a");
    expect(f.stages[2].pct).toBe(100);
    expect(f.quarters.map((q) => q.quarter)).toEqual(["Q4 2026", "Q2 2027"]);
    expect(f.countLabel).toBe("Deals shown");
  });
  it("heads the deal screen with the name, the kind under it, and the On Hold pill only on an open deal", () => {
    expect(headerOf(d("Chen", { segment: "Hip" }))).toEqual({
      name: "Dr Chen",
      sub: "Opportunity · Hip",
      onHold: false
    });
    expect(headerOf(d("a", { onHold: true })).onHold).toBe(true);
    expect(headerOf(d("a", { onHold: true, isClosed: true })).onHold).toBe(
      false
    );
    expect(
      headerOf(
        d("x", { kind: "rosa", facility: "Wesley", rosaDealType: "ROSA sales" })
      ).sub
    ).toBe("ROSA opportunity · ROSA sales");
  });

  it("makes the summary tiles, colouring last posted and last stage move by age, and leaving them blank on a closed deal", () => {
    const now = Date.parse("2026-11-07T00:00:00Z");
    const ago = (n) => new Date(now - n * 86400000).toISOString();
    const t = (deal) =>
      Object.fromEntries(summaryTiles(deal, now).map((x) => [x.key, x]));
    const open = t(
      d("a", {
        lastPosted: ago(12),
        lastStageChange: ago(95),
        createdDate: ago(120),
        ownerName: "Lewis"
      })
    );
    expect(open.owner.value).toBe("Lewis");
    expect(open.posted).toMatchObject({ value: "12 d", cls: "tg ok" });
    expect(open.moved).toMatchObject({ value: "95 d", cls: "tg bad" });
    expect(open.age.value).toBe("120 d");
    expect(open.status.cls).toBe("stp st-open");
    const held = t(d("a", { onHold: true, createdDate: ago(10) }));
    expect(held.posted.value).toBe("–");
    expect(held.status.value).toBe("On Hold");
  });

  it("lists the stages with the won and lost stage last, and colours the stage row", () => {
    expect(
      stageSteps(
        ["Plan", "Conversion", "Action", "Unsuccessful Conversion"],
        "opp",
        "Plan"
      )
    ).toEqual(["Plan", "Action", "Conversion", "Unsuccessful Conversion"]);
    expect(stageSteps([], "opp", "Plan")).toEqual(["Plan"]);
    expect(stageTone(d("a"))).toBe("");
    expect(stageTone(d("a", { isClosed: true, stage: "Conversion" }))).toBe(
      "good"
    );
    expect(
      stageTone(d("a", { isClosed: true, stage: "Unsuccessful Conversion" }))
    ).toBe("bad");
  });

  it("lists the deal's details, with the Yes / No fields only where the kind has them", () => {
    const opp = detailRows(
      d("a", { brands: "Persona;Taperloc", repPriority: true }),
      {
        units: 24,
        mymo: true
      }
    );
    expect(opp.map((r) => r.label)).toEqual([
      "Primary HCP",
      "Healthcare facility",
      "Expected closing quarter and year",
      "Expected annual value",
      "Expected annual units / cases",
      "Brand",
      "On hold",
      "Rep priority",
      "State priority",
      "MyMo"
    ]);
    expect(opp.find((r) => r.key === "rep")).toMatchObject({
      text: "Yes",
      yes: true
    });
    expect(opp.find((r) => r.key === "brands").text).toBe("Persona, Taperloc");
    const risk = detailRows(d("a", { kind: "risk" }));
    expect(risk.map((r) => r.key)).not.toContain("hold");
    expect(risk.map((r) => r.key)).not.toContain("mymo");
    const rosa = detailRows(d("a", { kind: "rosa" }));
    expect(rosa.map((r) => r.key)).not.toContain("hcp");
  });
});
