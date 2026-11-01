import { LightningElement, api } from "lwc";
import { beginColumnDrag } from "c/pipelineColumnResize";
import {
  totalsByCurrency,
  chatterDays,
  stageDays,
  plural
} from "c/pipelineFormat";

const FOLD_IN_DELAY_MS = 30; // lets the closed state be drawn first, so the unfolding runs
const FOLD_MS = 450; // a little longer than the fold itself (0.4 s in the style sheet)

const KIND_HEADS = {
  opp: "Expected annual revenue",
  risk: "Annual value at risk",
  rosa: "ROSA growth value"
};

/**
 * Pipeline: the Team table, for sales managers only. One row per person with their open deals, the value of their
 * deals per kind (per currency, never added across currencies) and how many are late. Click a person to look at just
 * their deals; click again to go back to everyone. Starts closed. Columns can be resized (drag the edge; double-click to reset). It reads the deals it is handed and changes none.
 */
export default class PipelineTeamTable extends LightningElement {
  @api deals = []; // all the deals in scope, before any single rep is chosen
  @api kinds = ["opp"];
  @api teamNames = {};
  @api selectedOwner = "";
  @api teamPicked = false;
  @api widths; // saved column widths in pixels, by column id, or undefined for automatic
  open = false;
  bodyMounted = false; // the table is on the page (it stays a moment after closing, to fold away)
  bodyOn = false; // and this says it is unfolded
  foldTimer;
  live = null; // widths while a drag is in progress

  /** Whether the table starts open (remembered in the person's settings; closed to begin with). */
  @api
  get initialOpen() {
    return this.open;
  }
  set initialOpen(value) {
    const open = value === true;
    if (open === this.open) return;
    clearTimeout(this.foldTimer);
    this.open = open;
    this.bodyMounted = open;
    this.bodyOn = open;
  }
  disconnectedCallback() {
    clearTimeout(this.foldTimer);
  }
  get bodyCls() {
    return this.bodyOn ? "fold on" : "fold";
  }
  /** Unfolds or folds the table: put on the page first and opened a moment later, closed first and taken off after it has folded. */
  fold(open) {
    clearTimeout(this.foldTimer);
    if (open) {
      this.bodyMounted = true;
      // eslint-disable-next-line @lwc/lwc/no-async-operation
      this.foldTimer = setTimeout(() => {
        this.bodyOn = true;
      }, FOLD_IN_DELAY_MS);
    } else {
      this.bodyOn = false;
      // eslint-disable-next-line @lwc/lwc/no-async-operation
      this.foldTimer = setTimeout(() => {
        this.bodyMounted = false;
      }, FOLD_MS);
    }
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
  get cardCls() {
    return this.open ? "card" : "card shut";
  }
  get chevClass() {
    return this.open ? "chev up" : "chev";
  }
  get toggleTitle() {
    return this.open ? "Collapse" : "Expand";
  }
  handleToggle() {
    this.open = !this.open;
    this.fold(this.open);
    this.dispatchEvent(
      new CustomEvent("teamtoggle", { detail: { open: this.open } })
    );
  }
  /** Every column in order: id (for its width), heading and, for some, a second line under it. */
  get heads() {
    const list = [
      { id: "name", label: "Rep" },
      { id: "team", label: "Team" },
      { id: "open", label: "Open", cls: "num" }
    ];
    this.kindHeads.forEach((k) =>
      list.push({ id: `v_${k.kind}`, label: k.label, cls: "num" })
    );
    list.push(
      {
        id: "update",
        label: "Needs update",
        sub: "(30–90 d)",
        cls: "num"
      },
      { id: "old", label: "Very old", sub: "(over 90 d)", cls: "num" },
      { id: "stuck", label: "No stage move", sub: "(90 d)", cls: "num" },
      { id: "quiet", label: "Longest quiet", cls: "num" }
    );
    return list;
  }

  /* ----- column widths ----- */
  get widthMap() {
    return this.live || this.widths || {};
  }
  get hasWidths() {
    return Object.keys(this.widthMap).length > 0;
  }
  get colWidths() {
    return this.heads.map((h) => ({
      id: h.id,
      px: this.widthMap[h.id] || 140,
      style: `width:${this.widthMap[h.id] || 140}px`
    }));
  }
  get tableStyle() {
    if (!this.hasWidths) return "";
    const total = this.colWidths.reduce((a, c) => a + c.px, 0);
    return `table-layout:fixed;width:${total}px`;
  }
  handleResizeStart(event) {
    const id = event.currentTarget.dataset.id;
    const snapshot = {};
    this.template.querySelectorAll("th[data-id]").forEach((th) => {
      snapshot[th.dataset.id] = Math.round(th.getBoundingClientRect().width);
    });
    this.live = { ...snapshot };
    beginColumnDrag(
      event,
      snapshot[id] || 140,
      50,
      (width) => {
        this.live = { ...this.live, [id]: width };
      },
      () => {
        const done = this.live;
        this.live = null;
        this.dispatchEvent(
          new CustomEvent("widthschange", {
            detail: { kind: "team", widths: done }
          })
        );
      }
    );
  }
  handleWidthsReset() {
    this.dispatchEvent(
      new CustomEvent("widthschange", {
        detail: { kind: "team", widths: null }
      })
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
