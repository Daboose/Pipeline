/**
 * Pipeline: the one place that turns amounts into US dollars (Robert, 2026-11-17). The exchange rates are the ones held in Salesforce
 * (Setup, Manage Currencies), read by PipelineCampaignController.currencyRates and handed in as { rates: { USD: 1, AUD: 1.47, ... } },
 * each rate being the units of that currency per one unit of the corporate currency. Pipeline keeps no rate of its own.
 * Used by pipelineApp (every deal on the Pipeline screen), pipelineCampaignModel and the campaign screen, and pipelineDeal.
 */

/**
 * Turns amounts per currency into US dollars: each amount is divided by its currency's rate and taken to US dollars.
 * Returns { usd, missing }, where missing lists the currencies that have no rate (left out of the sum).
 */
export function toUsd(amounts, rates) {
  const table = (rates && rates.rates) || {};
  const usdRate = table.USD;
  let usd = 0;
  const missing = [];
  Object.keys(amounts || {}).forEach((c) => {
    const rate = table[c];
    if (!rate || !usdRate) {
      if (amounts[c]) missing.push(c);
      return;
    }
    usd += (amounts[c] * usdRate) / rate;
  });
  return { usd, missing };
}

/** One amount in US dollars, or null when its currency has no rate. */
export function usdAmount(value, currencyCode, rates) {
  const { usd, missing } = toUsd(
    { [currencyCode || ""]: Number(value) || 0 },
    rates
  );
  return missing.length ? null : usd;
}

/**
 * The deals as the screen shows them: with USD chosen and the rates read, every deal's value is in US dollars and its currency says USD,
 * so every list, summary and total downstream (which only read value and currencyCode) works in one currency. A deal whose currency has
 * no rate is left as it is. Nothing is changed in place: the deals themselves, which the deal panel edits, stay in their own currency.
 */
export function usdDeals(deals, rates) {
  return (deals || []).map((d) => {
    const u = usdAmount(d.value, d.currencyCode, rates);
    return u === null ? d : { ...d, value: u, currencyCode: "USD" };
  });
}
