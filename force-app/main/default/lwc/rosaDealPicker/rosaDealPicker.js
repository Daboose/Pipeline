import { LightningElement, api } from "lwc";
import searchUsers from "@salesforce/apex/ROSADealController.searchUsers";
import searchSurgeons from "@salesforce/apex/ROSADealController.searchSurgeons";
import searchFacilities from "@salesforce/apex/ROSADealController.searchFacilities";

const SEARCH = {
  user: searchUsers,
  surgeon: searchSurgeons,
  facility: searchFacilities
};

/**
 * rosaDealPicker: a search box that picks a person, a surgeon or a hospital for the ROSA deal screen.
 * Users are active, non-portal only (ROSADealController.searchUsers). The chosen record shows as a box with Change.
 * Fires "pick" with { id, name } (id null when cleared). Used by rosaDealFields and rosaDeal (Add surgeon).
 */
export default class RosaDealPicker extends LightningElement {
  /** user, surgeon or facility */
  @api kind = "user";
  @api valueId;
  @api valueName;
  @api placeholder = "Search by name";
  @api required = false;

  term = "";
  hits = [];
  searching = false;
  timer;

  get hasValue() {
    return !!this.valueId;
  }
  get hasTerm() {
    return this.term.length > 0;
  }
  get showHits() {
    return this.hits.length > 0;
  }
  get showNone() {
    return !this.searching && this.term.length >= 2 && this.hits.length === 0;
  }

  handleInput(event) {
    this.term = event.target.value || "";
    clearTimeout(this.timer);
    if (this.term.trim().length < 2) {
      this.hits = [];
      return;
    }
    this.searching = true;
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    this.timer = setTimeout(() => this.run(), 250);
  }

  run() {
    const asked = this.term;
    SEARCH[this.kind]({ term: asked })
      .then((rows) => {
        if (asked === this.term) {
          this.hits = (rows || []).map((r) => ({ ...r, sub: r.sub || "" }));
        }
      })
      .catch(() => {
        this.hits = [];
      })
      .finally(() => {
        this.searching = false;
      });
  }

  handleClear() {
    this.term = "";
    this.hits = [];
  }

  handlePick(event) {
    const id = event.currentTarget.dataset.id;
    const hit = this.hits.find((h) => h.id === id);
    this.term = "";
    this.hits = [];
    this.dispatchEvent(
      new CustomEvent("pick", { detail: { id, name: hit ? hit.name : "" } })
    );
  }

  handleChange() {
    this.dispatchEvent(
      new CustomEvent("pick", { detail: { id: null, name: "" } })
    );
  }
}
