import { LightningElement, api } from "lwc";
import saveFilter from "@salesforce/apex/PipelineFilterController.saveFilter";
import deleteFilter from "@salesforce/apex/PipelineFilterController.deleteFilter";
import setDefault from "@salesforce/apex/PipelineFilterController.setDefault";
import searchPeople from "@salesforce/apex/PipelineFilterController.searchPeople";
import shareWithPeople from "@salesforce/apex/PipelineFilterController.shareWithPeople";
import shareWithTeam from "@salesforce/apex/PipelineFilterController.shareWithTeam";

function errorText(e) {
  return (
    (e && e.body && e.body.message) ||
    (e && e.message) ||
    "That did not work. Try again."
  );
}
const plural = (n, one, many) => (n === 1 ? one : many);

/**
 * Pipeline: the My filters part of the settings panel. Save what is on the screen as a named filter (or update the one
 * that is open), mark one as the filter Pipeline opens on (the star), open, delete, and share. Sharing gives the other
 * person their own copy: to a named person, or (a team manager only) to everyone on the team. Never to everybody.
 * The screen's current choices are handed in as "snapshot" (JSON); this component never reads or changes a deal.
 */
export default class PipelineFilters extends LightningElement {
  @api filters = [];
  @api snapshot = "{}";
  @api activeId = "";
  @api isManager = false;

  name = "";
  busy = false;
  message = "";
  error = "";
  deletingId = "";
  sharingId = "";
  term = "";
  results = [];
  chosen = [];
  timer;

  get rows() {
    return (this.filters || []).map((f) => ({
      id: f.id,
      name: f.name,
      star: f.isDefault ? "★" : "☆",
      starCls: "star" + (f.isDefault ? " on" : ""),
      starTitle: f.isDefault
        ? "Pipeline opens on this filter. Click to stop."
        : "Click to open Pipeline on this filter.",
      sub: f.isDefault
        ? "Opens by default"
        : f.id === this.activeId
          ? "Open now"
          : "",
      deleting: this.deletingId === f.id,
      sharing: this.sharingId === f.id
    }));
  }
  get noFilters() {
    return !(this.filters && this.filters.length);
  }
  get activeName() {
    const f = (this.filters || []).find((x) => x.id === this.activeId);
    return f ? f.name : "";
  }
  get cantSave() {
    return this.busy || !this.name.trim();
  }
  get cantShare() {
    return this.busy || this.chosen.length === 0;
  }
  get chosenText() {
    const n = this.chosen.length;
    return n ? `${n} ${plural(n, "person", "people")}` : "…";
  }

  run(work, done) {
    this.busy = true;
    this.message = "";
    this.error = "";
    return work()
      .then((r) => done && done(r))
      .catch((e) => {
        this.error = errorText(e);
      })
      .finally(() => {
        this.busy = false;
      });
  }
  changed(activeId) {
    this.dispatchEvent(
      new CustomEvent("filterschanged", { detail: { activeId } })
    );
  }

  handleName(event) {
    this.name = event.target.value;
  }
  handleSaveNew() {
    this.run(
      () =>
        saveFilter({
          existingId: null,
          name: this.name,
          filterJson: this.snapshot
        }),
      (row) => {
        this.message = `Saved “${row.name}”.`;
        this.name = "";
        this.changed(row.id);
      }
    );
  }
  handleUpdate() {
    const f = (this.filters || []).find((x) => x.id === this.activeId);
    if (!f) return;
    this.run(
      () =>
        saveFilter({
          existingId: f.id,
          name: f.name,
          filterJson: this.snapshot
        }),
      (row) => {
        this.message = `Updated “${row.name}”.`;
        this.changed(row.id);
      }
    );
  }
  handleStar(event) {
    const id = event.currentTarget.dataset.id;
    const f = (this.filters || []).find((x) => x.id === id);
    this.run(
      () => setDefault({ filterId: f.isDefault ? null : id }),
      () => this.changed(this.activeId)
    );
  }
  handleOpen(event) {
    this.dispatchEvent(
      new CustomEvent("openfilter", {
        detail: { id: event.currentTarget.dataset.id }
      })
    );
  }
  handleDeleteAsk(event) {
    this.deletingId = event.currentTarget.dataset.id;
    this.sharingId = "";
  }
  handleDeleteNo() {
    this.deletingId = "";
  }
  handleDeleteYes(event) {
    const id = event.currentTarget.dataset.id;
    this.run(
      () => deleteFilter({ filterId: id }),
      () => {
        this.deletingId = "";
        this.message = "Deleted.";
        this.changed(id === this.activeId ? "" : this.activeId);
      }
    );
  }

  /* ----- sharing ----- */
  handleShareOpen(event) {
    const id = event.currentTarget.dataset.id;
    this.sharingId = this.sharingId === id ? "" : id;
    this.deletingId = "";
    this.term = "";
    this.results = [];
    this.chosen = [];
  }
  handleShareClose() {
    this.sharingId = "";
  }
  handleTerm(event) {
    this.term = event.target.value;
    clearTimeout(this.timer);
    const t = this.term;
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    this.timer = setTimeout(() => {
      if (t.trim().length < 2) {
        this.results = [];
        return;
      }
      searchPeople({ term: t })
        .then((list) => {
          if (t === this.term) this.results = this.mark(list);
        })
        .catch((e) => {
          this.error = errorText(e);
        });
    }, 300);
  }
  mark(list) {
    return list.map((p) => ({
      ...p,
      title: p.title || "",
      cls: "person" + (this.chosen.some((c) => c.id === p.id) ? " on" : "")
    }));
  }
  handlePerson(event) {
    const id = event.currentTarget.dataset.id;
    const p = this.results.find((x) => x.id === id);
    this.chosen = this.chosen.some((c) => c.id === id)
      ? this.chosen.filter((c) => c.id !== id)
      : [...this.chosen, { id, name: p.name }];
    this.results = this.mark(this.results);
  }
  handleShareSend(event) {
    const id = event.currentTarget.dataset.id;
    this.run(
      () =>
        shareWithPeople({
          filterId: id,
          userIds: this.chosen.map((c) => c.id)
        }),
      (n) => {
        this.message = `Shared with ${n} ${plural(n, "person", "people")}. They each have their own copy.`;
        this.sharingId = "";
      }
    );
  }
  handleShareTeam(event) {
    const id = event.currentTarget.dataset.id;
    this.run(
      () => shareWithTeam({ filterId: id }),
      (n) => {
        this.message = `Shared with your team (${n} ${plural(n, "person", "people")}). They each have their own copy.`;
        this.sharingId = "";
      }
    );
  }
}
