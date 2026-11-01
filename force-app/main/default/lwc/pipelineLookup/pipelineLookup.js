import { LightningElement, api } from "lwc";
import search from "@salesforce/apex/PipelineLookupController.search";

/**
 * Pipeline: a picker for a lookup field (the deal's Primary HCP, Healthcare facility, Link To ROSA Deal). The person types
 * two letters or more and the matching records are offered (what may be offered follows the field's own lookup filter,
 * written down in PipelineLookupController). Choosing one announces a "change" event with its Id and name; the cross clears
 * it, and the same place then turns into the search box (one box: the name with a cross, or the search). It saves nothing: the deal flyout does, through Salesforce, which applies the real lookup filter again.
 */
export default class PipelineLookup extends LightningElement {
  @api fieldName = ""; // the field on the deal: Account__c, Healthcare_Facility__c or Link_To_ROSA_Deal__c
  @api valueId = "";
  @api valueName = "";
  @api placeholder = "Search…";

  term = "";
  results = [];
  searched = false;
  timer;
  focusSearch = false;

  /** After the cross clears a name, the search box takes its place and is ready to type in. */
  renderedCallback() {
    if (this.focusSearch && !this.hasValue) {
      const input = this.template.querySelector("input");
      if (input) {
        input.focus();
        this.focusSearch = false;
      }
    }
  }

  get hasValue() {
    return !!this.valueId;
  }
  get showList() {
    return this.searched && this.term.trim().length >= 2;
  }
  get noResults() {
    return this.searched && this.results.length === 0;
  }

  handleTerm(event) {
    this.term = event.target.value;
    clearTimeout(this.timer);
    const t = this.term;
    if (t.trim().length < 2) {
      this.results = [];
      this.searched = false;
      return;
    }
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    this.timer = setTimeout(() => {
      search({ fieldName: this.fieldName, term: t })
        .then((rows) => {
          if (t === this.term) {
            this.results = rows.map((r) => ({
              id: r.id,
              name: r.name,
              sub: r.sub || ""
            }));
            this.searched = true;
          }
        })
        .catch(() => {
          if (t === this.term) {
            this.results = [];
            this.searched = true;
          }
        });
    }, 300);
  }
  handlePick(event) {
    const { id, name } = event.currentTarget.dataset;
    this.term = "";
    this.results = [];
    this.searched = false;
    this.dispatchEvent(new CustomEvent("change", { detail: { id, name } }));
  }
  handleTermClear() {
    clearTimeout(this.timer);
    this.term = "";
    this.results = [];
    this.searched = false;
  }
  handleClear() {
    this.focusSearch = true;
    this.dispatchEvent(
      new CustomEvent("change", { detail: { id: "", name: "" } })
    );
  }
}
