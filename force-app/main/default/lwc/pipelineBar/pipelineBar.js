import { LightningElement, api } from "lwc";
import { KINDS, NAMES, derivedStatus, chipList } from "c/pipelineFilterModel";

const STATUSES = [
  ["open", "Open"],
  ["closed", "Closed"],
  ["both", "Both"],
  ["custom", "Custom"]
];

/**
 * Pipeline: the filter bar under the header. The three deal-type buttons, Open / Closed / Both / Custom (worked out
 * from the stages chosen) and chips saying in words what is being looked at. (My filters and Change selection are in the
 * top row of the page.) The type and status buttons act at once; everything else is chosen in the panel. It changes
 * nothing itself: it announces what was pressed and the Pipeline screen does the rest.
 */
export default class PipelineBar extends LightningElement {
  @api filter = {};
  @api choices = {};
  @api teams = [];
  @api isRep = false;

  get kindButtons() {
    const on = this.filter.kinds || [];
    return KINDS.map((k) => ({
      kind: k,
      label: NAMES[k],
      on: on.includes(k),
      cls: "ktog" + (on.includes(k) ? " on" : "")
    }));
  }
  get status() {
    return this.filter.stages
      ? derivedStatus(this.filter, this.choices)
      : "open";
  }
  get statusButtons() {
    return STATUSES.map(([value, label]) => ({
      value,
      label,
      cls: this.status === value ? "on" : ""
    }));
  }
  get chips() {
    return this.filter.stages
      ? chipList(this.filter, this.choices, this.teams, this.isRep)
      : [];
  }

  handleKind(event) {
    this.dispatchEvent(
      new CustomEvent("kindtoggle", {
        detail: { kind: event.currentTarget.dataset.kind }
      })
    );
  }
  handleStatus(event) {
    const value = event.currentTarget.dataset.value;
    if (value === "custom") {
      this.dispatchEvent(new CustomEvent("openpanel"));
      return;
    }
    this.dispatchEvent(new CustomEvent("statuspick", { detail: { value } }));
  }
}
