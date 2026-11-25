import { LightningElement, api } from "lwc";

/**
 * Pipeline: a flyout for a surgeon who has no deal yet. It opens, the way the deal flyout does, when the rating plate of a surgeon with
 * no deal is pressed in the campaign list (Robert, 2026-11-19), and shows just that surgeon's usages (the Usage Card) so a usage can be
 * added or put right. It is the deal flyout's Surgeon Usages screen without a deal behind it; a screen for adding a deal for the surgeon
 * is planned next.
 *
 * For a healthcare facility (isFacility) the flyout has only New Deal, which is the ROSA deal screen (pipelineNewRosaDeal; Robert, 2026-11-25).
 *
 * It has two pills: New Deal (the New Deal screen, pipelineNewDeal, which makes an implant opportunity for the surgeon and puts it into the
 * campaign) and Surgeon Usages. Pressing the rating plate opens it on Surgeon Usages; pressing "No deal yet" opens it on New Deal.
 *
 * Who uses it: pipelineApp, which says when to slide it in (`open`) and takes it off once it has slid away. It reads and changes nothing
 * itself: the Usage Card does that, in the person's own access. It only fires `close` (the round close button, or the dimmed screen).
 */
export default class PipelineSurgeonFlyout extends LightningElement {
  /** True slides the flyout in from the right; false slides it away (the screen keeps it on the page while it slides). */
  @api open = false;
  /** The surgeon's Account id. */
  @api accountId;
  /** The surgeon's name, shown at the top. */
  @api name = "";
  /** The campaign the surgeon was listed in: a deal made here is put into it. */
  @api campaignId = "";
  /** The screen to open on: "usages" (the default; a rating plate was pressed) or "new" ("No deal yet" was pressed). */
  @api startScreen = "usages";

  /** True for a healthcare facility (Robert, 2026-11-25): it has only the New Deal screen, which makes a ROSA deal; a facility has no surgeon usages. */
  @api isFacility = false;

  screen = "";
  get current() {
    if (this.isFacility) return "new";
    return this.screen || this.startScreen || "usages";
  }
  get onRosa() {
    return !!this.isFacility;
  }
  get showUsages() {
    return !this.isFacility;
  }
  get ariaLabel() {
    return this.isFacility ? "New ROSA deal" : "Surgeon usages";
  }
  get onNew() {
    return this.current === "new";
  }
  pillCls(name) {
    return this.current === name ? "btn nav on" : "btn nav";
  }
  get newBtnCls() {
    return this.pillCls("new");
  }
  get usagesBtnCls() {
    return this.pillCls("usages");
  }
  handleScreen(event) {
    this.screen = event.currentTarget.dataset.screen;
  }
  /** A deal was made: the screen is told its Id (and whether it could not join the campaign), and shows the deal's own screens. */
  handleCreated(event) {
    this.dispatchEvent(
      new CustomEvent("dealcreated", { detail: event.detail })
    );
  }

  get scrimCls() {
    return this.open ? "scrim on" : "scrim";
  }
  get flyCls() {
    return this.open ? "fly on" : "fly";
  }
  handleUsagesChanged() {
    this.dispatchEvent(new CustomEvent("usageschanged"));
  }
  handleClose() {
    this.dispatchEvent(new CustomEvent("close"));
  }
}
