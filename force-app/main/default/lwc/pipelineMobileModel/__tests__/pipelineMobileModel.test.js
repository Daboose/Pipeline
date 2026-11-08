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
  segmentsFrom,
  dealArea,
  ratingPlates,
  usageFreshness,
  groupUsages,
  changedLines,
  companyOptions,
  newDealTypes,
  newDealChoices,
  recordTypesFor,
  missingRequired,
  createFields,
  cardType,
  formSections,
  withSavingScreen,
  SAVING_TIMING,
  SAVING_WORDS
} from "c/pipelineMobileModel";

// the saving screen shows no delay in these tests
SAVING_TIMING.min = 0;
SAVING_TIMING.done = 0;

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
    ).toBe("Won");
    expect(
      cardOf(
        d("a", { isClosed: true, stage: "Unsuccessful Conversion" }),
        "both"
      ).pill.label
    ).toBe("Lost");
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

    it("puts the year beside the quarter, the currency beside the money, and the three Yes / No fields in one block", () => {
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
        "MyMobility"
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
      expect(brand.options.map((o) => o.on)).toEqual([true, true, false]);
      const q = rows.find((r) => r.api === "Expected_Closure_Quarter__c");
      expect(q.options.find((o) => o.selected).value).toBe("Q1");
    });

    it("lists the brands A to Z whatever order Salesforce sends them in, and leaves other multi-choices in Salesforce's order", () => {
      const jumbled = ["Triathlon", "Arcos", "persona", "NexGen"];
      const rows = make(
        "risk",
        {},
        {
          choices: (api) => {
            if (!["Brand__c", "Portfolio__c"].includes(api)) return null;
            return jumbled.map((v) => ({ value: v, label: v }));
          }
        }
      );
      expect(
        rows.find((r) => r.api === "Brand__c").options.map((o) => o.label)
      ).toEqual(["Arcos", "NexGen", "persona", "Triathlon"]);
      expect(
        rows.find((r) => r.api === "Portfolio__c").options.map((o) => o.label)
      ).toEqual(jumbled);
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

    it("gives a risk and a ROSA deal their own fields (no On hold or MyMobility on a risk, and no State priority on the phone)", () => {
      const risk = make("risk");
      expect(risk.find((r) => r.isFlags).flags.map((f) => f.label)).toEqual([
        "Rep priority"
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

  describe("the usage rating tile", () => {
    it("takes the Portfolio tile's place when a rating is given, and leaves it alone otherwise", () => {
      const keys = (rating) =>
        summaryTiles(d("a"), Date.now(), rating).map((x) => x.key);
      expect(keys(undefined)).toContain("portfolio");
      expect(keys(undefined)).not.toContain("rating");
      expect(keys("Gold")).toContain("rating");
      expect(keys("Gold")).not.toContain("portfolio");
      expect(keys("Gold").length).toBe(8); // a replacement, not an extra tile
      const tile = summaryTiles(d("a"), Date.now(), "Gold")[1];
      expect(tile).toMatchObject({
        label: "Usage rating",
        value: "Gold",
        isPlate: true,
        stars: "\u2605\u2605\u2605",
        tileCls: "plate tilep m-GOLD"
      });
      expect(summaryTiles(d("a"), Date.now(), "Platinum")[1].stars).toBe(
        "\u2605\u2605\u2605\u2605"
      );
      expect(summaryTiles(d("a"), Date.now(), "No rating")[1]).toMatchObject({
        value: "No rating",
        stars: "",
        tileCls: "plate tilep m-NONE"
      });
      expect(summaryTiles(d("a"), Date.now(), "")[1]).toMatchObject({
        value: "No rating",
        tileCls: "plate tilep m-NONE"
      }); // not read yet
    });
  });

  describe("Surgeon Usages", () => {
    const now = Date.parse("2026-11-08T10:00:00Z");
    it("finds the deal's own area from its portfolio", () => {
      expect(dealArea({ segment: "Hip" })).toBe("Hip");
      expect(dealArea({ segment: "Extremities" })).toBe("Shoulder");
      expect(dealArea({ segment: "CMFT" })).toBe("CMF");
      expect(dealArea({ segment: "Hip;Knee" })).toBe("Hip");
      expect(dealArea({})).toBe("");
    });
    it("makes the rating plates: the word, the stars, the metal, the deal's own area, and a grey plate for no rating", () => {
      const plates = ratingPlates(
        [
          { area: "Hip", rating: "GOLD" },
          { area: "Knee", rating: "PLATINUM" },
          { area: "Shoulder", rating: "silver" },
          { area: "CMF", rating: "" }
        ],
        "Hip"
      );
      expect(plates.map((p) => p.rank)).toEqual([
        "Gold",
        "Platinum",
        "Silver",
        "No rating"
      ]);
      expect(plates.map((p) => p.stars)).toEqual(["★★★", "★★★★", "★★", ""]);
      expect(plates[0].cls).toBe("plate m-GOLD mine");
      expect(plates[3].cls).toBe("plate m-NONE");
      expect(plates[3].area).toBe("CMFT");
    });
    it("says how fresh the usages are, and warns at two years or more", () => {
      expect(usageFreshness("", "Hip", now).row).toBe("none recorded");
      const recent = usageFreshness("2026-08-12T00:00:00Z", "Hip", now);
      expect(recent.old).toBe(false);
      expect(recent.row).toBe("updated 3 months ago");
      expect(usageFreshness("2026-11-05T00:00:00Z", "Hip", now).row).toBe(
        "updated 3 days ago"
      );
      const old = usageFreshness("2023-11-14T00:00:00Z", "Hip", now);
      expect(old.old).toBe(true);
      expect(old.row).toBe("last updated 2 years ago");
      expect(old.line).toContain("The Hip rating may be out of date.");
      expect(old.note).toContain("next time you see this surgeon");
    });
    const LINES = [
      {
        usageId: "u1",
        hospital: "Mater",
        hospitalId: "h1",
        portfolio: "Hip",
        key: "stems",
        label: "Stems",
        company: "ZB",
        cases: 24,
        recordTypeId: "rt1"
      },
      {
        usageId: "u1",
        hospital: "Mater",
        hospitalId: "h1",
        portfolio: "Hip",
        key: "cups",
        label: "Cups",
        company: "",
        cases: null,
        empty: true,
        recordTypeId: "rt1"
      },
      {
        usageId: "u2",
        hospital: "Mater",
        hospitalId: "h1",
        portfolio: "Knee",
        key: "knee",
        label: "Knee",
        company: "ZB",
        cases: 30,
        recordTypeId: "rt2"
      },
      {
        usageId: "u3",
        hospital: "Epworth",
        hospitalId: "h2",
        portfolio: "Shoulder",
        key: "anatomical",
        label: "Anatomical",
        company: "",
        cases: null,
        empty: true,
        recordTypeId: "rt3"
      }
    ];
    it("groups the usages by hospital, one entry for each usage, leaving out a usage with nothing in it", () => {
      const g = groupUsages(LINES);
      expect(g.map((x) => x.hospital)).toEqual(["Mater"]); // Epworth's only usage is empty
      expect(g[0].usages.map((u) => u.name)).toEqual(["Hip", "Knee"]);
      expect(g[0].usages[0].lines.length).toBe(2); // the empty cups line is kept so it can be filled in
    });
    it("works out which lines were changed, and nothing for a change put back", () => {
      const u = groupUsages(LINES)[0].usages[0];
      expect(changedLines(u, {})).toEqual([]);
      expect(changedLines(u, { stems: { cases: 30 } })).toEqual([
        { key: "stems", company: "ZB", cases: 30 }
      ]);
      expect(
        changedLines(u, { stems: { cases: 24 }, cups: { company: "Stryker" } })
      ).toEqual([{ key: "cups", company: "Stryker", cases: null }]);
    });
    it("lists the companies with a dash for none and the current one even if the record type no longer offers it", () => {
      expect(
        companyOptions(["ZB", "Other"], "Old Co").map((o) => o.value)
      ).toEqual(["", "Old Co", "ZB", "Other"]);
      expect(companyOptions(["ZB"], "ZB").find((o) => o.selected).value).toBe(
        "ZB"
      );
    });
  });

  describe("a new deal", () => {
    const infos = {
      m: { recordTypeId: "rtM", name: "Master", available: true, master: true },
      a: { recordTypeId: "rtHip", name: "AU HIP Opportunity", available: true },
      b: {
        recordTypeId: "rtKnee",
        name: "AU KNEE Opportunity",
        available: true
      },
      c: { recordTypeId: "rtRisk", name: "AU RISK", available: true },
      d: {
        recordTypeId: "rtRosa",
        name: "AU ROSA Opportunity",
        available: true
      },
      e: { recordTypeId: "rtNz", name: "NZ KNEE Opportunity", available: true },
      f: {
        recordTypeId: "rtEdge",
        name: "AU ZBEDGE Opportunity",
        available: true
      },
      g: {
        recordTypeId: "rtReg",
        name: "REGIONAL ROSA Opportunity",
        available: true
      },
      h: { recordTypeId: "rtNo", name: "AU CMFT Opportunity", available: false }
    };
    it("offers only the record types the person may use, as a kind and a portfolio, leaving out the special ones", () => {
      const types = newDealTypes(infos);
      expect(types.map((t) => t.name).sort()).toEqual([
        "AU HIP Opportunity",
        "AU KNEE Opportunity",
        "AU RISK",
        "AU ROSA Opportunity",
        "NZ KNEE Opportunity"
      ]);
      expect(newDealChoices(types)).toEqual({
        kinds: ["opp", "risk", "rosa"],
        portfolios: ["Hip", "Knee"]
      });
    });
    it("finds the record type for a kind and portfolio, and more than one for a person in two countries", () => {
      const types = newDealTypes(infos);
      expect(recordTypesFor(types, "opp", "Hip").map((t) => t.id)).toEqual([
        "rtHip"
      ]);
      expect(
        recordTypesFor(types, "opp", "Knee")
          .map((t) => t.country)
          .sort()
      ).toEqual(["AU", "NZ"]);
      // the person's own default first
      const withDefault = newDealTypes({
        ...infos,
        e: { ...infos.e, defaultRecordTypeMapping: true }
      });
      expect(recordTypesFor(withDefault, "opp", "Knee")[0].country).toBe("NZ");
      expect(recordTypesFor(types, "risk", "").map((t) => t.id)).toEqual([
        "rtRisk"
      ]);
      expect(recordTypesFor(types, "rosa", "").map((t) => t.id)).toEqual([
        "rtRosa"
      ]);
    });
    it("lists what is missing: the surgeon, the quarter and the value, or the hospital for a ROSA deal", () => {
      const has = (o) => (api) => o[api];
      expect(missingRequired("opp", has({}))).toEqual([
        "Primary HCP: required",
        "Expected closing quarter: required",
        "Expected annual value: required"
      ]);
      expect(
        missingRequired(
          "risk",
          has({ Account__c: "001", Expected_Closure_Quarter__c: "Q2" })
        )
      ).toEqual(["Annual value at risk: required"]);
      expect(missingRequired("rosa", has({}))).toEqual([
        "Healthcare facility: required"
      ]);
      expect(
        missingRequired(
          "opp",
          has({
            Account__c: "001",
            Expected_Closure_Quarter__c: "Q2",
            AmountPerYear__c: 0
          })
        )
      ).toEqual([]);
    });
    it("builds the fields to create with, leaving blanks out", () => {
      expect(
        createFields(
          {
            Account__c: "001",
            Objective__c: "",
            Priority__c: false,
            AmountPerYear__c: 250000
          },
          "rtKnee"
        )
      ).toEqual({
        RecordTypeId: "rtKnee",
        Account__c: "001",
        Priority__c: false,
        AmountPerYear__c: 250000
      });
    });
    it("stars the extra required fields in the form rows", () => {
      const rows = formRows("opp", {
        draft: {},
        valueOf: () => null,
        choices: (api) => {
          if (api !== "Expected_Closure_Quarter__c") return null;
          return [{ value: "Q1", label: "Q1" }];
        },
        updateable: () => true,
        lookupName: () => "",
        required: ["AmountPerYear__c", "Expected_Closure_Quarter__c"]
      });
      expect(rows.find((r) => r.api === "AmountPerYear__c").req).toBe(true);
      expect(
        rows.find((r) => r.api === "Expected_Closure_Quarter__c").req
      ).toBe(true);
      expect(rows.find((r) => r.api === "Healthcare_Facility__c").req).toBe(
        false
      );
    });
  });

  describe("the form's sections (0.38)", () => {
    const r = (api, extra = {}) => ({ key: api, api, ...extra });
    it("puts the opening boxes between sections, never inside one", () => {
      const out = formSections([
        r("a"),
        r("b"),
        r("Brand__c", { isMulti: true }),
        r("c"),
        r("d")
      ]);
      expect(out.map((s) => (s.isBox ? "box" : "card"))).toEqual([
        "card",
        "box",
        "card"
      ]);
      expect(out[0].rows.map((x) => x.api)).toEqual(["a", "b"]);
      expect(out[1].row.api).toBe("Brand__c");
      expect(out[2].rows.map((x) => x.api)).toEqual(["c", "d"]);
      expect(out.map((s) => !!s.first)).toEqual([true, false, false]);
    });
    it("handles a risk (two boxes in a row) and a form with no box or no rows", () => {
      const risk = formSections([
        r("a"),
        r("Portfolio__c", { isMulti: true }),
        r("Brand__c", { isMulti: true }),
        r("c")
      ]);
      expect(risk.map((s) => (s.isBox ? "box" : "card"))).toEqual([
        "card",
        "box",
        "box",
        "card"
      ]);
      expect(formSections([r("a")]).length).toBe(1);
      expect(formSections([])).toEqual([
        {
          key: "card-0",
          isCard: true,
          first: true,
          cardCls: "card plain",
          rows: []
        }
      ]);
    });
  });

  describe("the card's type line and the saving screen (0.31)", () => {
    it("puts the portfolio first on the card's line: Knee · Commit · Q1", () => {
      const knee = cardOf(
        d("a", { segment: "Knee", stage: "Commit", quarter: "Q1" }),
        "open"
      );
      expect(knee.typeWord).toBe("Knee");
      expect(knee.typeWord + knee.stageRest).toBe("Knee · Commit · Q1");
      expect(cardType(d("a", { segment: "Hip;Knee" }))).toBe("Hip, Knee");
      // a ROSA deal keeps its own line, with no type word
      const rosa = cardOf(
        d("a", { kind: "rosa", segment: "Hip", stage: "Plan", quarter: "Q2" }),
        "open"
      );
      expect(rosa.typeWord).toBe("");
      expect(rosa.stageRest).toBe("Plan · Q2");
      // nothing known: no stray separator
      expect(
        cardOf(d("a", { segment: "", stage: "", quarter: "" }), "open")
          .stageRest
      ).toBe("");
    });

    it("runs a change under the saving screen: working, then done, then gone; the result comes through", async () => {
      const seen = [];
      const result = await withSavingScreen(
        (s) => seen.push(`${s.phase}:${s.word}`),
        SAVING_WORDS.create,
        () => Promise.resolve(42)
      );
      expect(result).toBe(42);
      expect(seen).toEqual(["working:Creating…", "done:Created", ":Created"]);
    });

    it("brings the screen back at once when Salesforce refuses, and passes the error on", async () => {
      const seen = [];
      await expect(
        withSavingScreen(
          (s) => seen.push(s.phase),
          SAVING_WORDS.save,
          () => Promise.reject(new Error("Close quarter is in the past"))
        )
      ).rejects.toThrow("Close quarter is in the past");
      expect(seen).toEqual(["working", ""]);
    });

    it("keeps the screen up for at least the minimum time", async () => {
      const saved = { ...SAVING_TIMING };
      SAVING_TIMING.min = 60;
      SAVING_TIMING.done = 0;
      const t0 = Date.now();
      await withSavingScreen(
        () => {},
        SAVING_WORDS.delete,
        () => Promise.resolve()
      );
      expect(Date.now() - t0).toBeGreaterThanOrEqual(55);
      Object.assign(SAVING_TIMING, saved);
    });
  });
});
