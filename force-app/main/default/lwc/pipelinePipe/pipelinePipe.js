import { LightningElement, api } from "lwc";
import PIPE from "@salesforce/resourceUrl/Pipeline_Pipe_Blank";
import PIPE_WIDE from "@salesforce/resourceUrl/Pipeline_Pipe_Blank_Wide";

/**
 * Pipeline: the chrome pipe with two-colour words on it. The first word is amber (the logo's amber) and the second
 * white; the words are live text, never baked into the picture. variant "logo" is the PIPELINE wordmark; variant
 * "wide" is the longer pipe behind headings such as CHOOSE YOUR DATA. Every pipe has the same height (in pixels):
 * a longer heading gets a longer pipe, never a taller one. The wide pipe's band was lengthened by
 * scripts/build_pipeline_pipe.py; a heading too long for it needs a longer one built the same way.
 */
export default class PipelinePipe extends LightningElement {
  @api variant = "logo";
  @api a = "";
  @api b = "";
  @api height = 42;

  get wide() {
    return this.variant === "wide";
  }
  get src() {
    return this.wide ? PIPE_WIDE : PIPE;
  }
  get viewBox() {
    return this.wide ? "225 1100 6070 800" : "225 1100 4770 800";
  }
  get textX() {
    return this.wide ? 2510 : 1860;
  }
  get fontSize() {
    return this.wide ? 250 : 300;
  }
  get spacing() {
    return this.wide ? 12 : 16;
  }
  /** A wide heading has a space between its two words; the logo's PIPE and LINE touch. */
  get bText() {
    return this.wide && this.b ? " " + this.b : this.b;
  }
  /** The picture's width follows from the one height every pipe shares (its drawing is 800 units high). */
  get wrapStyle() {
    const units = this.wide ? 6070 : 4770;
    return `width:${Math.round((this.height * units) / 800)}px`;
  }
}
