import { LightningElement, api } from "lwc";

/**
 * pipelineStageSlider: the stage slider in the deal panel's header (Robert, 2026-11-07; mockup pipeline_deal_header_v2.html,
 * the fading trail). It replaces the old arrow path. One pill: a label end, a shaded track holding every stage, and one highlight
 * that slides, with a small spring and squash, to the stage the deal is at.
 * - A working stage: a blue trail fades in from the start of the track up to the highlight.
 * - The won stage: a flat green fill from the start up to the won stage, and the lost stage after it stays plain.
 * - The lost stage: the whole pill fills light red and the lost stage is a solid red.
 * - No stage set: every stage on the plain track, nothing highlighted.
 * Used by pipelineDeal. The parent owns the stage: a click only fires "change" with { value }, and nothing happens when readonly.
 * Colours come from the parent's CSS variables (--seg-*, --indigo) so dark and light both work.
 */
export default class PipelineStageSlider extends LightningElement {
  /** The stages in order, as plain words. */
  @api steps = [];
  /** The stage that means won (the green end) and the one that means lost (the red end). */
  @api won = "";
  @api lost = "";
  /** The stage the deal is at. */
  @api value = "";
  /** True when the person may not change the stage. */
  @api readonly = false;

  placed = false;
  animated = false;
  pillKey = "";

  get index() {
    return (this.steps || []).indexOf(this.value);
  }
  get isWon() {
    return !!this.value && this.value === this.won;
  }
  get isLost() {
    return !!this.value && this.value === this.lost;
  }
  get wrapCls() {
    return "wrap" + (this.isWon ? " good" : "") + (this.isLost ? " bad" : "");
  }
  get trackCls() {
    return (
      "choices" +
      (this.placed ? " placed" : "") +
      (this.animated ? " animated" : "") +
      (this.readonly ? " ro" : "")
    );
  }
  get items() {
    const at = this.index;
    const workingStage = at >= 0 && !this.isWon && !this.isLost;
    return (this.steps || []).map((value, i) => {
      let cls = i === at ? "opt on" : "opt";
      if (workingStage && i < at) cls += " done";
      if (this.isWon && i < at) cls += " in";
      return { value, cls, pressed: i === at ? "true" : "false" };
    });
  }

  connectedCallback() {
    this.onResize = () => this.place(false);
    window.addEventListener("resize", this.onResize);
  }
  disconnectedCallback() {
    window.removeEventListener("resize", this.onResize);
  }
  renderedCallback() {
    this.place(this.pillKey !== "");
  }

  /** Puts the highlight and the trail under the chosen stage; after the first time they slide there. */
  place(animate) {
    const on = this.template.querySelector(".opt.on");
    const pill = this.refs.pill;
    const trail = this.refs.trail;
    if (!pill || !trail) return;
    if (!on) {
      this.pillKey = "";
      this.placed = false;
      return;
    }
    if (!on.offsetWidth) return;
    const key = `${on.offsetLeft}:${on.offsetWidth}:${this.isWon}`;
    if (key === this.pillKey) return;
    const first = this.pillKey === "";
    this.pillKey = key;
    pill.style.left = `${on.offsetLeft}px`;
    pill.style.width = `${on.offsetWidth}px`;
    const end = on.offsetLeft + on.offsetWidth - 3;
    // the won stage: a flat fill from the very start to just past the stage; a working stage: the trail inside the track
    trail.style.width = `${this.isWon ? end + 7 : end}px`;
    if (first) {
      this.placed = true;
      // the first placing does not slide; sliding is switched on a moment later
      // eslint-disable-next-line @lwc/lwc/no-async-operation
      setTimeout(() => {
        this.animated = true;
      }, 50);
      return;
    }
    if (animate && this.animated) {
      pill.classList.remove("squish");
      // eslint-disable-next-line no-void
      void pill.offsetWidth; // restart the squash
      pill.classList.add("squish");
    }
  }

  handleClick(event) {
    if (this.readonly) return;
    const value = event.currentTarget.dataset.value;
    if (value === this.value) return;
    this.dispatchEvent(new CustomEvent("change", { detail: { value } }));
  }
}
