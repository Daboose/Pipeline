import { LightningElement, api } from "lwc";
import { KINDS, NAMES, derivedStatus, chipList } from "c/pipelineFilterModel";

const STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
  { value: "both", label: "Both" }
];

/**
 * Pipeline: the filter bar under the header. The three deal-type buttons, the Status slider (Open / Closed / Both, worked out
 * from the stages chosen; with stages picked one by one in the panel nothing is highlighted) and chips saying in words what is being looked at. (My filters and Change selection are in the
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
  get statusOptions() {
    return STATUS_OPTIONS;
  }
  /** The slider's choice: nothing while the stages were picked one by one (what used to be "Custom"); the chips then name the stages. */
  get statusValue() {
    return this.status === "custom" ? "" : this.status;
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
    this.dispatchEvent(
      new CustomEvent("statuspick", { detail: { value: event.detail.value } })
    );
  }
}
