import {
  formatMoney,
  totalsByCurrency,
  daysSince,
  chatterBand,
  stageBand,
  needsAttention,
  quarterRank,
  suggestYear,
  qualifyQuarter,
  quarterIsPast,
  boundRank,
  chatterDays,
  agoText,
  mentionParts,
  chatterText,
  dealStatus
} from "c/pipelineFormat";

const NOW = Date.parse("2026-11-01T00:00:00Z");
const daysAgo = (n) => new Date(NOW - n * 86400000).toISOString();

describe("c-pipeline-format", () => {
  it("shows money short, with the currency symbol", () => {
    expect(formatMoney(649000, "AUD")).toBe("A$649k");
    expect(formatMoney(1250000, "AUD")).toBe("A$1.25m");
    expect(formatMoney(800, "NZD")).toBe("NZ$800");
    expect(formatMoney(0, "AUD")).toBe("A$0");
  });

  it("totals each currency on its own and never adds across them", () => {
    const text = totalsByCurrency([
      { value: 1000000, currencyCode: "AUD" },
      { value: 200000, currencyCode: "AUD" },
      { value: 300000, currencyCode: "NZD" }
    ]);
    expect(text).toBe("A$1.20m · NZ$300k");
    expect(totalsByCurrency([])).toBe("–");
  });

  it("counts whole days and returns null with no date", () => {
    expect(daysSince(daysAgo(10), NOW)).toBe(10);
    expect(daysSince(null, NOW)).toBeNull();
  });

  it("bands the Chatter age at 30 and 90 days, and the stage age at 90", () => {
    expect(chatterBand(30)).toBe("ok");
    expect(chatterBand(31)).toBe("warn");
    expect(chatterBand(90)).toBe("warn");
    expect(chatterBand(91)).toBe("bad");
    expect(stageBand(90)).toBe("ok");
    expect(stageBand(91)).toBe("bad");
  });

  it("counts a deal with no post from its created date", () => {
    expect(chatterDays({ createdDate: daysAgo(40) }, NOW)).toBe(40);
  });

  it("flags an open deal that is stale, and never a closed one or one on hold", () => {
    const stale = {
      isClosed: false,
      onHold: false,
      lastPosted: daysAgo(45),
      lastStageChange: daysAgo(10),
      createdDate: daysAgo(200)
    };
    expect(needsAttention(stale, NOW)).toBe(true);
    expect(needsAttention({ ...stale, onHold: true }, NOW)).toBe(false);
    expect(needsAttention({ ...stale, isClosed: true }, NOW)).toBe(false);
    expect(needsAttention({ ...stale, lastPosted: daysAgo(5) }, NOW)).toBe(
      false
    );
  });

  it("sorts quarters by year, then Q1 to Q4, then none", () => {
    const now = new Date("2026-11-02T00:00:00");
    expect(quarterRank("Q1 2027", now)).toBeLessThan(
      quarterRank("Q2 2027", now)
    );
    expect(quarterRank("Q4 2026", now)).toBeLessThan(
      quarterRank("Q1 2027", now)
    );
    expect(quarterRank(null, now)).toBeGreaterThan(quarterRank("Q4 2030", now));
    // a quarter with no year is placed by the current-or-next rule
    expect(quarterRank("Q4", now)).toBe(quarterRank("Q4 2026", now));
    expect(quarterRank("Q1", now)).toBe(quarterRank("Q1 2027", now));
  });

  it("suggests the year a quarter most likely means (today is in Q4 2026)", () => {
    const now = new Date("2026-11-02T00:00:00");
    expect(suggestYear("Q4", now)).toBe(2026);
    expect(suggestYear("Q3", now)).toBe(2027);
    expect(suggestYear("Q1", now)).toBe(2027);
    expect(qualifyQuarter("Q3", now)).toBe("Q3 2027");
    expect(qualifyQuarter("Q3 2028", now)).toBe("Q3 2028");
    const early = new Date("2027-02-10T00:00:00"); // Q1 2027
    expect(suggestYear("Q1", early)).toBe(2027);
    expect(suggestYear("Q4", early)).toBe(2027);
  });

  it("knows when a quarter of a year is before the current quarter", () => {
    const now = new Date("2026-11-02T00:00:00");
    expect(quarterIsPast("Q3", "2026", now)).toBe(true);
    expect(quarterIsPast("Q4", "2026", now)).toBe(false);
    expect(quarterIsPast("Q1", "2027", now)).toBe(false);
    expect(quarterIsPast("Q4", "2025", now)).toBe(true);
    expect(quarterIsPast("Q1", "", now)).toBe(false);
  });

  it("reads a range bound saved before years existed in the year in play", () => {
    const now = new Date("2026-11-02T00:00:00");
    expect(boundRank("Q1", "from", now)).toBe(quarterRank("Q1 2026", now));
    expect(boundRank("Q4", "to", now)).toBe(quarterRank("Q4 2026", now));
    expect(boundRank("Q2 2028", "to", now)).toBe(quarterRank("Q2 2028", now));
  });

  it("says how long ago a post was", () => {
    expect(agoText(daysAgo(0), NOW)).toMatch(/^today/);
    expect(agoText(daysAgo(1), NOW)).toMatch(/^yesterday/);
    expect(agoText(daysAgo(114), NOW)).toMatch(/^114 days ago · /);
    expect(agoText(null, NOW)).toBe("");
  });

  it("cuts a post into plain text and mentions", () => {
    const parts = mentionParts("Thanks @Tom Becker can you send it?");
    expect(parts.map((p) => p.text).join("")).toBe(
      "Thanks @Tom Becker can you send it?"
    );
    expect(parts.filter((p) => p.mention).map((p) => p.text)).toEqual([
      "@Tom Becker"
    ]);
    expect(mentionParts("no mentions").length).toBe(1);
    expect(mentionParts("")).toEqual([]);
  });

  it("turns Salesforce rich text from Chatter into plain text", () => {
    expect(chatterText("<p>Testing a reply</p>")).toBe("Testing a reply");
    expect(chatterText("<p>One</p><p>Two</p>")).toBe("One\nTwo");
    expect(chatterText("Line<br>break<br/>here")).toBe("Line\nbreak\nhere");
    expect(
      chatterText(
        '<p><a href="/005x">@Robert Reeves</a> look at <b>this</b></p>'
      )
    ).toBe("@Robert Reeves look at this");
    expect(chatterText("<ul><li>a</li><li>b</li></ul>")).toBe("• a\n• b");
    expect(chatterText("Fish &amp; chips &lt;3 &#39;ok&#39; &nbsp;done")).toBe(
      "Fish & chips <3 'ok'  done"
    );
    expect(chatterText("already plain")).toBe("already plain");
    expect(chatterText(null)).toBe("");
  });

  it("never lets markup through as markup", () => {
    const t = chatterText(
      '<script>alert(1)</script><img src=x onerror="a()">hi'
    );
    expect(t).not.toContain("<");
    expect(t).toContain("hi");
  });
});

describe("dealStatus", () => {
  it("says Open, On Hold, Closed Won or Closed Lost, telling won from lost by the closing stage of each kind", () => {
    const d = (o) => ({
      kind: "opp",
      stage: "Plan",
      isClosed: false,
      onHold: false,
      ...o
    });
    expect(dealStatus(d({})).label).toBe("Open");
    expect(dealStatus(d({ onHold: true })).key).toBe("hold");
    expect(dealStatus(d({ isClosed: true, stage: "Conversion" }))).toEqual({
      key: "won",
      label: "Closed Won"
    });
    expect(
      dealStatus(d({ isClosed: true, stage: "Unsuccessful Conversion" })).label
    ).toBe("Closed Lost");
    expect(
      dealStatus(d({ kind: "risk", isClosed: true, stage: "Closed Retained" }))
        .key
    ).toBe("won");
    expect(
      dealStatus(d({ kind: "risk", isClosed: true, stage: "Lost Business" }))
        .key
    ).toBe("lost");
    expect(
      dealStatus(d({ kind: "rosa", isClosed: true, stage: "Closed Won" })).key
    ).toBe("won");
    expect(
      dealStatus(d({ kind: "rosa", isClosed: true, stage: "Deal Lost" })).key
    ).toBe("lost");
  });
  it("calls any other closed stage just Closed, and never shows a closed deal as on hold", () => {
    expect(
      dealStatus({ kind: "opp", isClosed: true, onHold: true, stage: "Other" })
    ).toEqual({ key: "closed", label: "Closed" });
  });
});
