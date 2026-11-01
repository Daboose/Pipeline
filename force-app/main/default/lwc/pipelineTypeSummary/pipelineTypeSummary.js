import { LightningElement, api } from "lwc";
import {
  formatMoney,
  totalsByCurrency,
  chatterDays,
  stageDays,
  needsAttention,
  quarterRank,
  STAGE_COLOURS,
  plural
} from "c/pipelineFormat";

const NAMES = { opp: "Opportunities", risk: "Risks", rosa: "ROSA" };
const VALUE_WORD = { opp: "Revenue", risk: "Risk value", rosa: "ROSA value" };

/**
 * Pipeline: the summary panel for one kind of deal (one of up to three equal panels side by side). Three totals (deals,
 * value per currency, deals needing attention), a line saying how many are late, and, when opened, a chip per stage and
 * a bar per close quarter. It reads the deals it is handed and changes none; values are never added across currencies.
 */
export default class PipelineTypeSummary extends LightningElement {
  @api kind = "opp";
  @api deals = [];
  @api stageOrder = [];
  @api summaryOpen = false;
  @api status = "open";

  get title() {
    return NAMES[this.kind];
  }
  get countText() {
    const n = (this.deals || []).length;
    return `${n} ${plural(n, "deal")}`;
  }
  get chevClass() {
    return this.summaryOpen ? "chev up" : "chev";
  }
  get toggleTitle() {
    return this.summaryOpen
      ? "Collapse all the summaries"
      : "Expand all the summaries";
  }
  handleToggle() {
    this.dispatchEvent(new CustomEvent("summarytoggle"));
  }

  get openDeals() {
    return (this.deals || []).filter((d) => !d.isClosed);
  }
  get stats() {
    const deals = this.deals || [];
    const out = [
      {
        key: "n",
        label: this.status === "open" ? "Open deals" : "Deals shown",
        value: deals.length,
        cls: "v"
      }
    ];
    const byCur = new Map();
    deals.forEach((d) => {
      const c = d.currencyCode || "";
      byCur.set(c, (byCur.get(c) || 0) + (Number(d.value) || 0));
    });
    [...byCur.entries()]
      .sort((a, b) => b[1] - a[1])
      .forEach(([c, v]) =>
        out.push({
          key: "v" + c,
          label: `${VALUE_WORD[this.kind]} · ${c || "?"}`,
          value: formatMoney(v, c),
          cls: "v"
        })
      );
    const now = Date.now();
    out.push({
      key: "att",
      label: "Needs attention",
      value: deals.filter((d) => needsAttention(d, now)).length,
      cls: "v warn"
    });
    return out;
  }
  get note() {
    const now = Date.now();
    const live = this.openDeals.filter((d) => !d.onHold);
    const upd = live.filter((d) => {
      const n = chatterDays(d, now);
      return n > 30 && n <= 90;
    }).length;
    const old = live.filter((d) => chatterDays(d, now) > 90).length;
    const stuck = live.filter((d) => stageDays(d, now) > 90).length;
    return `${upd} need an update · ${old} very old · ${stuck} no stage move in 90 days`;
  }

  get stageChips() {
    const by = new Map();
    (this.deals || []).forEach((d) => {
      const s = d.stage || "No stage";
      if (!by.has(s)) by.set(s, []);
      by.get(s).push(d);
    });
    const order = this.stageOrder || [];
    const rank = (s) => (order.indexOf(s) === -1 ? 9999 : order.indexOf(s));
    return [...by.keys()]
      .sort((a, b) => rank(a) - rank(b))
      .map((s, i) => ({
        stage: s,
        label: `${s} (${by.get(s).length})`,
        value: totalsByCurrency(by.get(s)),
        style: `background:${STAGE_COLOURS[i % STAGE_COLOURS.length]}`
      }));
  }
  get quarterRows() {
    const by = new Map();
    (this.deals || []).forEach((d) => {
      const q = d.quarter || "No quarter";
      if (!by.has(q)) by.set(q, []);
      by.get(q).push(d);
    });
    const max = Math.max(1, ...[...by.values()].map((l) => l.length));
    const rank = (q) => quarterRank(q === "No quarter" ? null : q);
    return [...by.keys()]
      .sort((a, b) => rank(a) - rank(b))
      .map((q) => ({
        quarter: q,
        count: by.get(q).length,
        value: totalsByCurrency(by.get(q)),
        style: `width:${(100 * by.get(q).length) / max}%`
      }));
  }
}
