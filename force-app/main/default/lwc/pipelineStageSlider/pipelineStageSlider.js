import { LightningElement, api } from "lwc";

/**
 * pipelineStageSlider: the stage slider in the deal panel's header (Robert, 2026-11-07; mockup pipeline_stage_slider_solid_v3.html,
 * option B). One pill that is always a solid colour, like the Yes / No sliders: a label end, a darker track holding every stage, and
 * one white highlight that slides, with a small spring and squash, to the stage the deal is at, carrying the colour as its text.
 * - A working stage (Plan to 5th Case): solid blue (Pipeline's indigo).
 * - The won stage (Conversion): solid green. The lost stage (Unsuccessful Conversion): solid red.
 * - The stages still to come are dimmer (40% white), so progress shows; a stage the deal has moved past (not the won or lost stage)
 *   carries a small tick in a little white circle after its name.
 * - No stage set: every stage on the plain blue track, nothing highlighted.
 * - Read only (the person may not change the stage): the whole slider is greyed and a click does nothing.
 * Used by pipelineDeal. The parent owns the stage: a click only fires "change" with { value }.
 * Colours: blue from the parent's --indigo; green and red are set here.
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
    return (
      "wrap" +
      (this.isWon ? " good" : "") +
      (this.isLost ? " bad" : "") +
      (this.readonly ? " lock" : "")
    );
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
    return (this.steps || []).map((value, i) => {
      const finished =
        at >= 0 && i < at && value !== this.won && value !== this.lost;
      let cls = i === at ? "opt on" : "opt";
      if (at >= 0 && i > at) cls += " ahead";
      return {
        value,
        cls,
        done: finished,
        pressed: i === at ? "true" : "false"
      };
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

  /** Puts the highlight under the chosen stage; after the first time it slides there. */
  place(animate) {
    const on = this.template.querySelector(".opt.on");
    const pill = this.refs.pill;
    if (!pill) return;
    if (!on) {
      this.pillKey = "";
      this.placed = false;
      return;
    }
    if (!on.offsetWidth) return;
    const key = `${on.offsetLeft}:${on.offsetWidth}`;
    if (key === this.pillKey) return;
    const first = this.pillKey === "";
    this.pillKey = key;
    pill.style.left = `${on.offsetLeft}px`;
    pill.style.width = `${on.offsetWidth}px`;
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
