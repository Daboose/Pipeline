import { api } from "lwc";
import LightningModal from "lightning/modal";

/**
 * rosaDealModal: the near full-screen pop-up that holds the ROSA deal screen (rosaDeal). Opened by rosaDealAction (the deal page's
 * Open ROSA deal button) and by pipelineApp for ROSA deals. Closes with "saved" when anything was changed, so the caller can refresh.
 * The screen's height is measured from where it starts to the bottom of the window (never guessed) and re-fitted on resize.
 * Never uses disableClose (Robert's rule).
 */
export default class RosaDealModal extends LightningModal {
  @api dealId;
  @api theme;
  changed = false;

  connectedCallback() {
    this.onResize = () => this.fit();
    window.addEventListener("resize", this.onResize);
  }
  disconnectedCallback() {
    window.removeEventListener("resize", this.onResize);
  }
  renderedCallback() {
    this.fit();
  }
  fit() {
    const box = this.template.querySelector(".fill");
    if (!box) return;
    const bottomGap = 96; // Salesforce keeps the pop-up 80 px off the bottom of the window, plus the pop-up body padding
    const h = window.innerHeight - box.getBoundingClientRect().top - bottomGap;
    box.style.height = Math.max(420, Math.floor(h)) + "px";
  }

  handleSaved() {
    this.changed = true;
  }
  handleClose() {
    this.close(this.changed ? "saved" : undefined);
  }
}
