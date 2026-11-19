import { LightningElement, api } from "lwc";

/**
 * Pipeline: draws ONE usage (or the one being added) for the Usage card in the compact layout (Robert, 2026-11-19): a row per product
 * line (Hip: Stem then Cup, Shoulders: Anatomical then Reverse) in the same columns for every portfolio (portfolio, line, Company,
 * Product, Type, Cases per year), with the procedure types (purple) and supporting technologies (green) as chips and the pencil
 * and Delete beside the lines; the column headings are drawn once by the card. While editing, the boxes say what they are and the
 * chips take their own line with Save and Cancel under them. Mockup: docs/mockups/pipeline_deal_screens_v1.html.
 *
 * Who uses it: pipelineUsageCard. It changes nothing itself: the card builds the `tile` (pipelineUsageModel.buildTile plus the mode)
 * and this component reports what the person did (edit, delete, a field or a chip changed, save, cancel) as events carrying the
 * tile's id. Colours come from the card's --pcu-* custom properties (light defaults), so a dark surface can restyle it.
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
