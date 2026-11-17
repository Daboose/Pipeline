import { LightningElement, api } from "lwc";

/**
 * Pipeline: draws ONE usage (or the one being added) for the Usage card as a tile: one set of column headings, a row per product line
 * (Hip: Stem then Cup, Shoulders: Anatomical then Reverse), the bearing type under the Company column, and the procedure types
 * (purple) and supporting technologies (green) as chips along the bottom. Mockup: docs/mockups/pipeline_usage_card_fields_v2.html.
 *
 * Who uses it: pipelineUsageCard. It changes nothing itself: the card builds the `tile` (pipelineUsageModel.buildTile plus the mode)
 * and this component reports what the person did (edit, delete, a field or a chip changed, save, cancel) as events carrying the
 * tile's id.
 */
export default class PipelineUsageTile extends LightningElement {
  @api tile = {};

  say(name, detail) {
    this.dispatchEvent(
      new CustomEvent(name, { detail: { id: this.tile.id, ...detail } })
    );
  }
  handleEdit() {
    this.say("edit");
  }
  handleDelete() {
    this.say("delete");
  }
  handleDeleteYes() {
    this.say("deleteyes");
  }
  handleDeleteNo() {
    this.say("deleteno");
  }
  handleCancel() {
    this.say("cancel");
  }
  handleSave() {
    this.say("save");
  }
  handleField(event) {
    this.say("fieldchange", {
      field: event.target.dataset.field,
      value: event.target.value
    });
  }
  handleNumber(event) {
    const clean = event.target.value.replace(/[^0-9]/g, "");
    if (clean !== event.target.value) event.target.value = clean;
    this.say("fieldchange", {
      field: event.target.dataset.field,
      value: clean
    });
  }
  handleChip(event) {
    this.say("chip", {
      field: event.currentTarget.dataset.field,
      value: event.currentTarget.dataset.v
    });
  }
}
