import { LightningElement, api } from "lwc";
import {
  totalsByCurrency,
  chatterDays,
  stageDays,
  plural
} from "c/pipelineFormat";

const KIND_HEADS = {
  opp: "Expected annual revenue",
  risk: "Annual value at risk",
  rosa: "ROSA growth value"
};

/**
 * Pipeline: the Team table, for sales managers only. One row per person with their open deals, the value of their
 * deals per kind (per currency, never added across currencies) and how many are late. Click a person to look at just
 * their deals; click again to go back to everyone. Starts closed. It reads the deals it is handed and changes none.
 */
export default class PipelineTeamTable extends LightningElement {
  @api deals = []; // all the deals in scope, before any single rep is chosen
  @api kinds = ["opp"];
  @api teamNames = {};
  @api selectedOwner = "";
  @api teamPicked = false;
  open = false;

  /** Whether the table starts open (remembered in the person's settings; closed to begin with). */
  @api
  get initialOpen() {
    return this.open;
  }
  set initialOpen(value) {
    this.open = value === true;
  }

  get title() {
    return this.teamPicked ? "Team" : "People";
  }
  get peopleIds() {
    return [...new Set((this.deals || []).map((d) => d.ownerId))];
  }
  get countText() {
    const n = this.peopleIds.length;
    return `${n} ${plural(n, "person", "people")}`;
  }
  get chevClass() {
    return this.open ? "chev up" : "chev";
  }
  get toggleTitle() {
    return this.open ? "Collapse" : "Expand";
  }
  handleToggle() {
    this.open = !this.open;
    this.dispatchEvent(
      new CustomEvent("teamtoggle", { detail: { open: this.open } })
    );
  }
  get kindHeads() {
    return (this.kinds || []).map((kind) => ({
      kind,
      label: KIND_HEADS[kind]
    }));
  }
  get rows() {
    const now = Date.now();
    const byOwner = new Map();
    (this.deals || []).forEach((d) => {
      if (!byOwner.has(d.ownerId)) byOwner.set(d.ownerId, []);
      byOwner.get(d.ownerId).push(d);
    });
    return [...byOwner.entries()]
      .map(([id, list]) => {
        const open = list.filter((d) => !d.isClosed);
        const live = open.filter((d) => !d.onHold);
        const posts = live.map((d) => chatterDays(d, now) ?? 0);
        return {
          id,
          name: list[0].ownerName,
          mark: this.selectedOwner === id ? " ◀" : "",
          cls: this.selectedOwner === id ? "sel" : "",
          team: (this.teamNames && this.teamNames[id]) || "–",
          open: open.length,
          values: this.kinds.map((kind) => ({
            kind,
            text: totalsByCurrency(list.filter((d) => d.kind === kind))
          })),
          update: live.filter((d) => {
            const n = chatterDays(d, now);
            return n > 30 && n <= 90;
          }).length,
          old: live.filter((d) => chatterDays(d, now) > 90).length,
          stuck: live.filter((d) => stageDays(d, now) > 90).length,
          quiet: posts.length ? `${Math.max(...posts)} d` : "–"
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  handlePick(event) {
    const id = event.currentTarget.dataset.id;
    this.dispatchEvent(
      new CustomEvent("pickrep", {
        detail: {
          ownerId: this.selectedOwner === id ? "" : id,
          ownerName:
            this.selectedOwner === id
              ? ""
              : (this.rows.find((r) => r.id === id) || {}).name || ""
        }
      })
    );
  }
}
