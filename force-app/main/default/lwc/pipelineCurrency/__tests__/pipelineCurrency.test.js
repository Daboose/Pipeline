import { toUsd, usdAmount, usdDeals } from "c/pipelineCurrency";

const RATES = { rates: { USD: 1, AUD: 1.5, NZD: 2 } };

describe("pipelineCurrency", () => {
  it("divides each amount by its currency's rate and adds them up in US dollars", () => {
    expect(toUsd({ AUD: 150000, NZD: 50000 }, RATES)).toEqual({
      usd: 125000,
      missing: []
    });
    expect(toUsd({ AUD: 150000, JPY: 1000 }, RATES)).toEqual({
      usd: 100000,
      missing: ["JPY"]
    });
  });

  it("converts one amount, or says there is no rate", () => {
    expect(usdAmount(150000, "AUD", RATES)).toBe(100000);
    expect(usdAmount(100, "USD", RATES)).toBe(100);
    expect(usdAmount(100, "JPY", RATES)).toBeNull();
    expect(usdAmount(100, "AUD", null)).toBeNull();
  });

  it("gives every deal a US dollar value without changing the deals, and leaves a deal with no rate alone", () => {
    const deals = [
      { id: "1", value: 150000, currencyCode: "AUD" },
      { id: "2", value: 50000, currencyCode: "NZD" },
      { id: "3", value: 1000, currencyCode: "JPY" }
    ];
    const out = usdDeals(deals, RATES);
    expect(out.map((d) => [d.value, d.currencyCode])).toEqual([
      [100000, "USD"],
      [25000, "USD"],
      [1000, "JPY"]
    ]);
    expect(deals[0]).toEqual({ id: "1", value: 150000, currencyCode: "AUD" });
    expect(usdDeals(null, RATES)).toEqual([]);
  });
});
