/**
 * Pipeline: keeps a list's heading bar and its column names fixed under the top bar while the page scrolls past that list
 * (Robert, 2026-11-10; mockup docs/mockups/pipeline_sticky_headings_v1.html).
 *
 * Who calls it: the Team table (pipelineTeamTable) and the lists (pipelineTypeList), from their renderedCallback and disconnectedCallback.
 * What it touches: only the component's own card. The sticking itself is style-sheet work (position: sticky, in each component's CSS);
 * this helper does the three things a style sheet cannot, and uses no fixed sizes:
 *   1. sets --lh on the card to the measured height of the heading bar, so the column names stick just under it;
 *   2. adds "stuck" to the heading bar while it is stuck (flat and square, covering the card's own edge, so no side lines or curve show);
 *   3. adds "wide" to the card when the table is wider than its box (many columns). A box that scrolls sideways cannot hold its column
 *      names still, so then only the heading bar stays.
 * The distance from the top of the screen to the top bar (--stick) is set by the page itself (pipelineApp).
 */
export class StickyHeads {
  constructor(template) {
    this.template = template;
    this.watched = [];
    this.queued = false;
    this.onScroll = () => this.queueCheck();
    // a scroll in any scrolling box on the page (the capture flag; scroll events do not bubble)
    window.addEventListener("scroll", this.onScroll, true);
  }

  /** Call after every render: measures again and watches the card's parts, which come and go as the list folds. */
  refresh() {
    const card = this.template.querySelector(".card");
    if (!card) return;
    this.measure(card);
    this.watch(card);
    this.check(card);
  }

  stop() {
    window.removeEventListener("scroll", this.onScroll, true);
    if (this.observer) this.observer.disconnect();
    this.observer = null;
    this.watched = [];
  }

  measure(card) {
    const head = card.querySelector(".lhead");
    // the exact (fractional) height, not the rounded offsetHeight
    if (head)
      card.style.setProperty(
        "--lh",
        `${head.getBoundingClientRect().height}px`
      );
    const wrap = card.querySelector(".tablewrap");
    const table = card.querySelector(".tbl");
    if (wrap && table) {
      card.classList.toggle("wide", table.offsetWidth > wrap.clientWidth + 1);
    } else {
      card.classList.remove("wide");
    }
  }

  /** Heading bar stuck = it is below where it sits when the card is at rest (just inside the card's 1 px edge). */
  check(card) {
    const head = card.querySelector(".lhead");
    if (!head) return;
    const stuck =
      head.getBoundingClientRect().top > card.getBoundingClientRect().top + 1.5;
    head.classList.toggle("stuck", stuck);
  }

  queueCheck() {
    if (this.queued) return;
    this.queued = true;
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    requestAnimationFrame(() => {
      this.queued = false;
      const card = this.template.querySelector(".card");
      if (card) this.check(card);
    });
  }

  /** Measures again whenever the bar, the box or the table changes size (a column dragged, a column added, the window resized). */
  watch(card) {
    if (typeof ResizeObserver === "undefined") return;
    const parts = [
      card.querySelector(".lhead"),
      card.querySelector(".tablewrap"),
      card.querySelector(".tbl")
    ].filter(Boolean);
    const same =
      parts.length === this.watched.length &&
      parts.every((p, i) => p === this.watched[i]);
    if (same) return;
    if (this.observer) this.observer.disconnect();
    this.observer = new ResizeObserver(() => {
      const c = this.template.querySelector(".card");
      if (c) {
        this.measure(c);
        this.check(c);
      }
    });
    parts.forEach((p) => this.observer.observe(p));
    this.watched = parts;
  }
}
