import { LightningElement, api } from "lwc";

/**
 * pipelineSegmented: the one-pill choice Robert likes (modelled on My Case Plan's switch, rebuilt for Pipeline): a label on a
 * white end, a shaded track, and one highlight that slides, with a small spring and squash, to the chosen option.
 * Used by Campaign Management (pipelineCampaigns) for the theme, Active or All, and a campaign's status.
 * Colours come from the parent through CSS variables (--seg-track, --seg-line, --seg-lab, --seg-optx, --seg-indigo, --seg-shadow,
 * --seg-muted) so dark and light both work.
 */
export default class PipelineSegmented extends LightningElement {
  /** The choices: [{ value, label, icon?, tone? }]. icon "sun" or "moon" shows a picture instead of the words. tone "good" (green) or
   *  "warn" (amber) makes the whole pill go that solid colour while that option is the chosen one (Robert, 2026-11-07: Yes in the deal panel). */
  @api options = [];
  /** The value of the chosen option. */
  @api value = "";
  /** The label on the white end (optional). */
  @api heading = "";
  /** What the group is called for screen readers. */
  @api label = "Choose one";
  /** True when the person may look but not change (greyed, and a press does nothing). */
  @api disabled = false;
  /** True makes an option's tone colour only the sliding highlight (the thumb), not the whole pill: the label end and the track stay plain
   *  (Robert, 2026-11-08: the phone's sliders). Unset, a tone fills the whole pill as before (the desktop). */
  @api toneThumb = false;

  placed = false;
  animated = false;
  pillKey = "";

  get items() {
    return (this.options || []).map((o) => ({
      value: o.value,
      label: o.label,
      title: o.label,
      isSun: o.icon === "sun",
      isMoon: o.icon === "moon",
      hasText: !o.icon,
      pressed: o.value === this.value ? "true" : "false",
      cls: (o.value === this.value ? "opt on" : "opt") + (o.icon ? " icon" : "")
    }));
  }
  get trackCls() {
    return `choices${this.placed ? " placed" : ""}${this.animated ? " animated" : ""}`;
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

  /** Puts the highlight under the chosen option; after the first time it slides there. */
  place(animate) {
    const chosen = this.template.querySelector(".opt.on");
    const pill = this.refs.pill;
    if (!pill) return;
    if (!chosen) {
      // nothing is chosen (for example the stages were picked one by one): no highlight until something is
      if (this.pillKey !== "") {
        this.pillKey = "";
        this.placed = false;
      }
      return;
    }
    if (!chosen.offsetWidth) return;
    const key = `${chosen.offsetLeft}:${chosen.offsetWidth}`;
    if (key === this.pillKey) return;
    const first = this.pillKey === "";
    this.pillKey = key;
    pill.style.left = `${chosen.offsetLeft}px`;
    pill.style.width = `${chosen.offsetWidth}px`;
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

  get wrapCls() {
    const chosen = (this.options || []).find((o) => o.value === this.value);
    return (
      "wrap" +
      (this.disabled ? " off" : "") +
      (chosen && chosen.tone
        ? ` ${this.toneThumb ? "tt" : "t"}-${chosen.tone}`
        : "")
    );
  }

  handleClick(event) {
    if (this.disabled) return;
    const value = event.currentTarget.dataset.value;
    if (value === this.value) return;
    this.dispatchEvent(new CustomEvent("change", { detail: { value } }));
  }
}
