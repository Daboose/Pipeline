import {
  splitStages,
  stagesOf,
  derivedStatus,
  withStatus,
  toggleKind,
  defaultFilter,
  fromSaved,
  serverFilter,
  serverChanged,
  clientMatch,
  chipList,
  withoutEvent,
  teamRows,
  MINE
} from "c/pipelineFilterModel";

const CHOICES = {
  opp: splitStages("opp", [
    "Plan",
    "Action",
    "Commit",
    "1st Case",
    "5th Case",
    "Conversion",
    "Unsuccessful Conversion"
  ]),
  risk: splitStages("risk", [
    "Unhappy",
    "Meeting With Competitors",
    "Closed Retained",
    "Lost Business"
  ]),
  rosa: splitStages("rosa", [
    "Sales Pipeline",
    "Negotiation",
    "Closed Won",
    "Deal Lost"
  ])
};
const NOW = Date.now();
const daysAgo = (n) => new Date(NOW - n * 86400000).toISOString();

describe("c-pipeline-filter-model", () => {
  it("splits a record type's stages into open and closing ones, in order", () => {
    expect(CHOICES.opp.open).toEqual([
      "Plan",
      "Action",
      "Commit",
      "1st Case",
      "5th Case"
    ]);
    expect(CHOICES.opp.closed).toEqual([
      "Conversion",
      "Unsuccessful Conversion"
    ]);
    expect(CHOICES.risk.closed).toEqual(["Closed Retained", "Lost Business"]);
  });

  it("opens on the open stages of the chosen kinds, and a manager on My team", () => {
    const f = defaultFilter(["opp", "risk"], CHOICES, MINE);
    expect(f.stages).toEqual([...CHOICES.opp.open, ...CHOICES.risk.open]);
    expect(f.teamId).toBe(MINE);
    expect(defaultFilter(["opp"], CHOICES, "").teamId).toBe("");
    expect(f.closedMonths).toBe(12);
  });

  it("works Open, Closed, Both and Custom out from the stages chosen", () => {
    let f = defaultFilter(["opp"], CHOICES, "");
    expect(derivedStatus(f, CHOICES)).toBe("open");
    expect(derivedStatus(withStatus(f, "closed", CHOICES), CHOICES)).toBe(
      "closed"
    );
    expect(derivedStatus(withStatus(f, "both", CHOICES), CHOICES)).toBe("both");
    f = { ...f, stages: ["Plan"] };
    expect(derivedStatus(f, CHOICES)).toBe("custom");
    expect(withStatus(f, "custom", CHOICES)).toBe(f);
  });

  it("turns a kind on and off, the stages following Open / Closed / Both, and keeps one on", () => {
    let f = defaultFilter(["opp"], CHOICES, "");
    f = toggleKind(f, "risk", CHOICES);
    expect(f.kinds).toEqual(["opp", "risk"]);
    expect(derivedStatus(f, CHOICES)).toBe("open");
    expect(f.stages).toContain("Unhappy");
    f = toggleKind(f, "opp", CHOICES);
    expect(f.kinds).toEqual(["risk"]);
    expect(toggleKind(f, "risk", CHOICES)).toBe(f);
    const closed = withStatus(
      defaultFilter(["opp"], CHOICES, ""),
      "closed",
      CHOICES
    );
    expect(toggleKind(closed, "rosa", CHOICES).stages).toEqual([
      "Conversion",
      "Unsuccessful Conversion",
      "Closed Won",
      "Deal Lost"
    ]);
    const custom = {
      ...defaultFilter(["opp", "risk"], CHOICES, ""),
      stages: ["Plan", "Unhappy"]
    };
    expect(toggleKind(custom, "risk", CHOICES).stages).toEqual(["Plan"]);
  });

  it("reads an older saved filter that held open / closed / both", () => {
    const f = fromSaved(
      { kinds: ["opp"], status: "closed", countries: ["AU"], teamId: "x" },
      CHOICES,
      false
    );
    expect(derivedStatus(f, CHOICES)).toBe("closed");
    expect(f.countries).toEqual(["AU"]);
    expect(f.teamId).toBe("");
    const g = fromSaved(
      { kinds: ["opp", "bogus"], stages: ["Plan"], teamId: "t1" },
      CHOICES,
      true
    );
    expect(g.kinds).toEqual(["opp"]);
    expect(g.stages).toEqual(["Plan"]);
    expect(g.teamId).toBe("t1");
  });

  it("tells when the server must read again, and only then", () => {
    const f = defaultFilter(["opp"], CHOICES, MINE);
    expect(
      serverChanged(f, { ...f, countries: ["AU"], brands: ["X"], prio: true })
    ).toBe(false);
    expect(serverChanged(f, { ...f, teamId: "t2" })).toBe(true);
    expect(serverChanged(f, withStatus(f, "both", CHOICES))).toBe(true);
    expect(serverFilter(f)).toEqual({
      kinds: ["opp"],
      stages: f.stages,
      closedMonths: 12,
      teamId: MINE,
      below: true
    });
  });

  it("applies the choices made on the screen", () => {
    const f = defaultFilter(["opp"], CHOICES, "");
    const d = {
      kind: "opp",
      ownerCountry: "AU",
      ownerState: "Victoria",
      ownerId: "u1",
      segment: "Knee",
      brands: "A;B",
      quarter: "Q2 2027",
      repPriority: true,
      statePriority: false,
      onHold: false,
      isClosed: false,
      lastPosted: daysAgo(5),
      lastStageChange: daysAgo(5),
      createdDate: daysAgo(50)
    };
    expect(clientMatch(d, f, NOW)).toBe(true);
    expect(clientMatch(d, { ...f, countries: ["NZ"] }, NOW)).toBe(false);
    expect(clientMatch(d, { ...f, segments: ["Hip"] }, NOW)).toBe(false);
    expect(clientMatch(d, { ...f, states: ["VIC"] }, NOW)).toBe(true); // a short code matches the full name stored
    expect(clientMatch(d, { ...f, states: ["Victoria"] }, NOW)).toBe(true);
    expect(clientMatch(d, { ...f, states: ["NSW", "QLD"] }, NOW)).toBe(false);
    expect(clientMatch(d, { ...f, brands: ["B"] }, NOW)).toBe(true);
    expect(clientMatch(d, { ...f, qFrom: "Q3 2027" }, NOW)).toBe(false);
    expect(
      clientMatch(d, { ...f, qFrom: "Q1 2027", qTo: "Q2 2027" }, NOW)
    ).toBe(true);
    expect(clientMatch(d, { ...f, qTo: "Q1 2027" }, NOW)).toBe(false); // the year counts, not just the quarter
    // a range saved before years existed ("Q1" to "Q4") still means the year in play (NOW is in Q4 2026)
    expect(
      clientMatch(
        { ...d, quarter: "Q2 2026" },
        { ...f, qFrom: "Q1", qTo: "Q4" },
        NOW
      )
    ).toBe(true);
    expect(clientMatch(d, { ...f, qFrom: "Q1", qTo: "Q4" }, NOW)).toBe(false);
    expect(
      clientMatch({ ...d, quarter: null }, { ...f, qFrom: "Q1" }, NOW)
    ).toBe(false);
    expect(clientMatch(d, { ...f, prio: true }, NOW)).toBe(true);
    expect(clientMatch(d, { ...f, sprio: true }, NOW)).toBe(false);
    expect(clientMatch(d, { ...f, stale: true }, NOW)).toBe(false);
    expect(
      clientMatch({ ...d, lastPosted: daysAgo(60) }, { ...f, stale: true }, NOW)
    ).toBe(true);
    expect(
      clientMatch({ ...d, kind: "rosa" }, { ...f, segments: ["Hip"] }, NOW)
    ).toBe(true);
  });

  it("says in chips what is being looked at", () => {
    const teams = [{ id: "t1", name: "Team Harbour" }];
    const f = defaultFilter(["opp"], CHOICES, MINE);
    expect(chipList(f, CHOICES, teams, false).map((c) => c.text)).toEqual([
      "My team + below"
    ]);
    expect(
      chipList(defaultFilter(["opp"], CHOICES, ""), CHOICES, teams, false)[0]
        .label
    ).toBe("Everything you can see");
    expect(
      chipList(defaultFilter(["opp"], CHOICES, ""), CHOICES, teams, true)[0]
        .text
    ).toBe("My pipeline");
    const busy = {
      ...f,
      teamId: "t1",
      countries: ["AU"],
      stages: ["Plan"],
      prio: true,
      stale: true
    };
    const labels = chipList(busy, CHOICES, teams, false).map((c) => c.label);
    expect(labels).toEqual([
      "Team",
      "Country",
      "Stage",
      "Only",
      "Needs attention"
    ]);
    expect(
      chipList(withStatus(f, "both", CHOICES), CHOICES, teams, false).pop().text
    ).toBe("last 12 months");
  });

  it("lists teams as a tree, opening a branch at a time, or as a search", () => {
    const teams = [
      { id: "a", name: "Director", parentId: null },
      { id: "b", name: "State Manager", parentId: "a", managerName: "Sam" },
      { id: "c", name: "Area", parentId: "b" }
    ];
    expect(teamRows(teams, {}, "").map((r) => r.name)).toEqual(["Director"]);
    expect(
      teamRows(teams, { a: true }, "").map((r) => `${r.depth}${r.name}`)
    ).toEqual(["0Director", "1State Manager"]);
    expect(teamRows(teams, { a: true, b: true }, "").length).toBe(3);
    expect(teamRows(teams, {}, "sam").map((r) => r.name)).toEqual([
      "State Manager"
    ]);
    expect(teamRows(teams, {}, "area")[0].sub).toBe(
      "Director › State Manager › Area"
    );
    const nested = [
      { id: "a", name: "Greg Marshall", parentId: "s" },
      { id: "s", name: "Shaun Whittal ASM", parentId: null },
      { id: "b", name: "Jack Maher", parentId: "s" }
    ];
    expect(teamRows(nested, {}, "shaun").map((r) => r.name)).toEqual([
      "Shaun Whittal ASM",
      "Greg Marshall",
      "Jack Maher"
    ]);
    expect(stagesOf(["opp", "risk"], CHOICES, "closed")).toEqual([
      ...CHOICES.opp.closed,
      ...CHOICES.risk.closed
    ]);
  });

  describe("Link to APAC Event", () => {
    const f = defaultFilter(["opp", "risk", "rosa"], CHOICES, "");
    const linked = {
      id: "x",
      kind: "opp",
      eventId: "e1",
      eventName: "Masterclass"
    };
    const other = { id: "y", kind: "rosa", eventId: "e2", eventName: "Summit" };
    const bare = { id: "z", kind: "opp", eventId: null };
    const risk = { id: "r", kind: "risk", eventId: null };

    it("starts as any event and shows every deal", () => {
      expect(f.evMode).toBe("any");
      [linked, other, bare, risk].forEach((d) =>
        expect(clientMatch(d, f, NOW)).toBe(true)
      );
    });
    it("'has an event' keeps deals with any event, or with the one chosen", () => {
      const has = { ...f, evMode: "has" };
      expect(clientMatch(linked, has, NOW)).toBe(true);
      expect(clientMatch(bare, has, NOW)).toBe(false);
      const one = { ...has, evId: "e1", evName: "Masterclass" };
      expect(clientMatch(linked, one, NOW)).toBe(true);
      expect(clientMatch(other, one, NOW)).toBe(false);
    });
    it("'no event' keeps only deals with none", () => {
      const none = { ...f, evMode: "none" };
      expect(clientMatch(bare, none, NOW)).toBe(true);
      expect(clientMatch(linked, none, NOW)).toBe(false);
    });
    it("leaves risks alone, because a risk can never be linked", () => {
      expect(clientMatch(risk, { ...f, evMode: "has" }, NOW)).toBe(true);
      expect(clientMatch(risk, { ...f, evMode: "none" }, NOW)).toBe(true);
    });
    it("says it in a chip, and is read back from a saved filter", () => {
      const one = { ...f, evMode: "has", evId: "e1", evName: "Masterclass" };
      expect(chipList(one, CHOICES, [], false).map((c) => c.text)).toContain(
        "Masterclass"
      );
      const back = fromSaved(
        JSON.parse(JSON.stringify(one)),
        CHOICES,
        true,
        ""
      );
      expect(back.evMode).toBe("has");
      expect(back.evId).toBe("e1");
    });
    it("is put back to any for a person who cannot see the field", () => {
      const one = { ...f, evMode: "has", evId: "e1", evName: "Masterclass" };
      expect(withoutEvent(one)).toMatchObject({
        evMode: "any",
        evId: "",
        evName: ""
      });
    });
    it("is not part of what makes the server read again", () => {
      expect(serverChanged(f, { ...f, evMode: "has" })).toBe(false);
    });
  });
});
