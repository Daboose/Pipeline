/**
 * pipelineMobileSaving: the saving screen of Pipeline Mobile (Robert, 2026-11-08; mockup pipeline_mobile_home_v1.html). While a Save, Create,
 * Add or Delete is with Salesforce the whole screen is dimmed and blurred, the Pipeline logo shows with a spinner and a word ("Saving…"),
 * and every tap is blocked, so nobody can tap twice or leave half way. When Salesforce answers, a green tick and the past tense show
 * ("Saved") for a moment, then the screen comes back. Called by: pipelineMobile, pipelineMobileNew and pipelineMobileUsages, each with
 * the word and phase it is told by withSavingScreen() in pipelineMobileModel. It touches nothing in Salesforce; it only draws.
 * Limit: the Salesforce phone app's own bars (its title, the top-left arrow and the bottom tabs) are outside this component and are not dimmed.
 */
import { LightningElement, api } from "lwc";

export default class PipelineMobileSaving extends LightningElement {
  /** "" (not showing), "working" (spinner) or "done" (green tick). */
  @api phase = "";
  /** The word beside the spinner or the tick ("Saving…", "Saved"). */
  @api word = "";

  get cls() {
    return (
      "over" +
      (this.phase ? " show" : "") +
      (this.phase === "done" ? " done" : "")
    );
  }
  get isDone() {
    return this.phase === "done";
  }
}
