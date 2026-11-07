/**
 * pipelineMobileChoices: one multi-choice field on the phone (Brand, a risk's Portfolio, the ROSA sales type), drawn like the stage control.
 * Closed, it is one indigo row naming the chosen words in plain bold type separated by commas ("Persona, NexGen"), or "None selected";
 * open, it folds down to the choices as round chips (a chosen one is indigo). It starts closed (Robert, 2026-11-08; mockup
 * pipeline_mobile_home_v1.html). Called by: pipelineMobile (the deal form) and pipelineMobileNew (the New deal page).
 * Touches nothing in Salesforce: it only reports a tap, as the event "toggle" with { value }, and the parent keeps the draft.
 */
import { LightningElement, api } from "lwc";

export default class PipelineMobileChoices extends LightningElement {
  /** The field's name above the chosen words ("Brand"). */
  @api label = "";
  /** True for a required field: a red star after the name. */
  @api required = false;
  /** The choices: [{ value, label, on }]. */
  @api options = [];
  /** True when the field cannot be changed: the chips do nothing. */
  @api disabled = false;

  isOpen = false;

  get list() {
    return this.options || [];
  }
  get chosenText() {
    const on = this.list.filter((o) => o.on).map((o) => o.label);
    return on.length ? on.join(", ") : "None selected";
  }
  get chosenCls() {
    return "chosen" + (this.list.some((o) => o.on) ? "" : " none");
  }
  get wrapCls() {
    return "bc" + (this.isOpen ? "" : " shut");
  }
  get chips() {
    return this.list.map((o) => ({
      value: o.value,
      label: o.label,
      cls: "chip" + (o.on ? " on" : "")
    }));
  }
  handleHead() {
    this.isOpen = !this.isOpen;
  }
  handleChip(event) {
    if (this.disabled) return;
    this.dispatchEvent(
      new CustomEvent("toggle", {
        detail: { value: event.currentTarget.dataset.value }
      })
    );
  }
}
