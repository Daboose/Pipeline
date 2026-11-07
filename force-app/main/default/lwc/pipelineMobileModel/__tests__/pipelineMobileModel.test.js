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
  liveDeal,
  formRows,
  formFieldNames,
  agoShort,
  chatterSummary,
  mentionQuery,
  insertMention,
  segmentsFrom
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

  it("shows the deal as it would be with the unsaved changes made", () => {
    const deal = d("a");
    expect(liveDeal(deal, {})).toEqual(deal);
    const held = liveDeal(deal, { OnHold__c: true });
    expect(headerOf(held).onHold).toBe(true);
    expect(deal.onHold).toBe(false); // the saved deal is left alone
    const won = liveDeal(deal, { Stage__c: "Conversion" });
    expect(won.isClosed).toBe(true);
    expect(stageTone(won)).toBe("good");
    expect(
      stageTone(liveDeal(deal, { Stage__c: "Unsuccessful Conversion" }))
    ).toBe("bad");
    expect(stageTone(liveDeal(deal, { Stage__c: "Action" }))).toBe("");
  });

  it("names the fields to read, with the name behind each lookup", () => {
    const names = formFieldNames("opp");
    expect(names).toContain("SalesRisks__c.Stage__c");
    expect(names).toContain("SalesRisks__c.Account__r.Name");
    expect(names).toContain("SalesRisks__c.myMo__c");
    expect(formFieldNames("risk")).not.toContain("SalesRisks__c.myMo__c");
  });

  describe("the form rows", () => {
    const record = {
      Account__c: "001A",
      Healthcare_Facility__c: "001B",
      Expected_Closure_Quarter__c: "Q1",
      Expected_Closing_Year__c: "2027",
      AmountPerYear__c: 48000,
      CurrencyIsoCode: "AUD",
      Brand__c: "Persona;Taperloc",
      OnHold__c: false,
      Priority__c: true,
      myMo__c: false,
      Objective__c: "Background"
    };
    const lists = {
      Expected_Closure_Quarter__c: ["Q1", "Q2"],
      Expected_Closing_Year__c: ["2026", "2027"],
      CurrencyIsoCode: ["AUD", "NZD"],
      Brand__c: ["Persona", "Taperloc", "Vanguard"],
      myMo_Stage__c: ["Awareness", "Trial"]
    };
    const make = (kind, draft = {}, over = {}) =>
      formRows(kind, {
        draft,
        valueOf: (api) => (api in draft ? draft[api] : (record[api] ?? null)),
        choices: (api) => {
          if (!lists[api]) return null;
          return lists[api].map((v) => ({ value: v, label: v }));
        },
        updateable: () => true,
        lookupName: (api) => (api === "Account__c" ? "Dr Chris Lee" : ""),
        ...over
      });

    it("puts the year beside the quarter, the currency beside the money, and the four Yes / No fields in one block", () => {
      const rows = make("opp");
      expect(rows.map((r) => r.api)).toEqual([
        "Account__c",
        "Healthcare_Facility__c",
        "Expected_Closure_Quarter__c",
        "AmountPerYear__c",
        "UnitsCasesPerYear__c",
        "Brand__c",
        "__flags",
        "myMo_Stage__c",
        "Link_To_ROSA_Deal__c",
        "Objective__c"
      ]);
      const quarter = rows.find((r) => r.api === "Expected_Closure_Quarter__c");
      expect(quarter.label).toBe("Expected closing quarter and year");
      expect(quarter.pair.api).toBe("Expected_Closing_Year__c");
      expect(rows.find((r) => r.api === "AmountPerYear__c").pair.api).toBe(
        "CurrencyIsoCode"
      );
      const flags = rows.find((r) => r.isFlags).flags;
      expect(flags.map((f) => f.label)).toEqual([
        "On hold",
        "Rep priority",
        "State priority",
        "MyMo"
      ]);
      expect(flags[0].options[1].tone).toBe("warn");
      expect(flags[1].options[1].tone).toBe("good");
      expect(flags[1].value).toBe("yes");
    });

    it("shows the lookup's name, the brand pills and the picklists with the saved choice picked", () => {
      const rows = make("opp");
      expect(rows[0].isLookup).toBe(true);
      expect(rows[0].lookupName).toBe("Dr Chris Lee");
      expect(rows[0].req).toBe(true);
      expect(rows[0].canClear).toBe(false); // required: swapped, never cleared
      expect(rows[1].canClear).toBe(true); // the facility is optional and has one
      const brand = rows.find((r) => r.api === "Brand__c");
      expect(brand.options.map((o) => o.cls)).toEqual(["pl on", "pl on", "pl"]);
      const q = rows.find((r) => r.api === "Expected_Closure_Quarter__c");
      expect(q.options.find((o) => o.selected).value).toBe("Q1");
    });

    it("folds the MyMo stage open only while MyMo is Yes", () => {
      expect(make("opp").find((r) => r.api === "myMo_Stage__c").wrapCls).toBe(
        "mm"
      );
      expect(
        make("opp", { myMo__c: true }).find((r) => r.api === "myMo_Stage__c")
          .wrapCls
      ).toBe("mm open");
    });

    it("marks what has been changed, the pair together", () => {
      const rows = make("opp", {
        Expected_Closing_Year__c: "2026",
        OnHold__c: true
      });
      expect(
        rows.find((r) => r.api === "Expected_Closure_Quarter__c").cls
      ).toBe("f changed");
      expect(rows.find((r) => r.api === "Healthcare_Facility__c").cls).toBe(
        "f"
      );
      expect(rows.find((r) => r.isFlags).flags[0].changed).toBe(true);
    });

    it("shows a field the person may not change as plain text, and keeps a Yes / No slider greyed", () => {
      const rows = make(
        "opp",
        {},
        {
          updateable: (api) => api !== "AmountPerYear__c" && api !== "OnHold__c"
        }
      );
      const money = rows.find((r) => r.api === "AmountPerYear__c");
      expect(money.isReadOnly).toBe(true);
      expect(money.text).toBe("A$48k");
      expect(rows.find((r) => r.api === "CurrencyIsoCode").isSelect).toBe(true); // not paired when the money cannot be changed
      expect(rows.find((r) => r.isFlags).flags[0].locked).toBe(true);
    });

    it("gives a risk and a ROSA deal their own fields (no On hold or MyMo on a risk)", () => {
      const risk = make("risk");
      expect(risk.find((r) => r.isFlags).flags.map((f) => f.label)).toEqual([
        "Rep priority",
        "State priority"
      ]);
      expect(make("rosa")[0].api).toBe("Healthcare_Facility__c");
    });
  });

  describe("Chatter", () => {
    const now = Date.parse("2026-11-07T10:00:00Z");
    it("says how long ago, short", () => {
      expect(agoShort("2026-11-07T01:00:00Z", now)).toBe("today");
      expect(agoShort("2026-11-06T01:00:00Z", now)).toBe("yesterday");
      expect(agoShort("2026-11-02T01:00:00Z", now)).toBe("5 d ago");
      expect(agoShort("", now)).toBe("");
    });
    it("sums up the posts for the deal screen's row, counting the newest reply as the last word", () => {
      expect(chatterSummary([], now)).toBe("No posts yet");
      expect(
        chatterSummary([{ posted: "2026-10-20T00:00:00Z", replies: [] }], now)
      ).toBe("1 post · last 18 d ago");
      expect(
        chatterSummary(
          [
            {
              posted: "2026-10-20T00:00:00Z",
              replies: [{ posted: "2026-11-05T09:00:00Z" }]
            },
            { posted: "2026-10-01T00:00:00Z", replies: [] }
          ],
          now
        )
      ).toBe("2 posts · last 2 d ago");
    });
    it("finds the @ being typed, only at the start of a word", () => {
      expect(mentionQuery("Thanks @pri", 11)).toEqual({
        start: 7,
        end: 11,
        q: "pri"
      });
      expect(mentionQuery("@Priya N", 8)).toEqual({
        start: 0,
        end: 8,
        q: "Priya N"
      });
      expect(mentionQuery("mail me@home", 12)).toBeNull();
      expect(mentionQuery("no mention", 10)).toBeNull();
    });
    it("puts the picked name in place of what was typed", () => {
      const q = mentionQuery("Thanks @pri for", 11);
      expect(insertMention("Thanks @pri for", q, "Priya Nair")).toEqual({
        text: "Thanks @Priya Nair  for",
        caret: 19
      });
    });
    it("turns the text and the people picked into pieces, a name never picked staying plain text", () => {
      const people = [{ id: "005A", name: "Priya Nair" }];
      expect(
        segmentsFrom(
          "  Thanks @Priya Nair can you check? cc @Sam Patel ",
          people
        )
      ).toEqual([
        { t: "Thanks " },
        { u: "005A", n: "Priya Nair" },
        { t: " can you check? cc @Sam Patel" }
      ]);
      expect(segmentsFrom("   ", people)).toEqual([]);
      // a name changed after it was picked is no longer a mention
      expect(segmentsFrom("hi @Priya Nairn", people)).toEqual([
        { t: "hi @Priya Nairn" }
      ]);
    });
  });
});
