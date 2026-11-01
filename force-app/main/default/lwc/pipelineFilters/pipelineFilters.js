import { LightningElement, api } from "lwc";
import saveFilter from "@salesforce/apex/PipelineFilterController.saveFilter";
import renameFilter from "@salesforce/apex/PipelineFilterController.renameFilter";
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
 * Pipeline: the My filters panel, the one place all filters are managed. It flies down from the top row. Each filter:
 * click the name to run it, the star makes it the one Pipeline opens on (only one), the pencil renames it, share gives
 * another person (or, for a team manager, the whole team) their own copy, the bin deletes it after asking. At the foot:
 * "Save as new filter" and "Save over <the open one>" (only while what is on the screen differs from it).
 * The screen hands in the filters (with a plain-words summary each), what is on the screen as "snapshot" (JSON) and
 * whether it has changed; this component only changes the person's own saved filters and never reads or changes a deal.
 */
export default class PipelineFilters extends LightningElement {
  @api filters = []; // { id, name, isDefault, summary }
  @api snapshot = "{}";
  @api activeId = "";
  @api changed = false; // what is on the screen no longer matches the open filter
  @api screenSummary = "";
  @api isManager = false;
  /** True once the panel is to be slid into view; false slides it back up (the screen keeps it on the page while it slides). */
  @api open = false;

  name = "";
  saving = false;
  busy = false;
  message = "";
  error = "";
  renamingId = "";
  renameValue = "";
  deletingId = "";
  sharingId = "";
  term = "";
  results = [];
  chosen = [];
  timer;
  focusSelector = "";

  connectedCallback() {
    this.onKey = (event) => {
      if (event.key !== "Escape" || !this.open) return;
      if (this.renamingId) this.handleRenameCancel();
      else this.handleClose();
    };
    document.addEventListener("keydown", this.onKey);
  }
  disconnectedCallback() {
    document.removeEventListener("keydown", this.onKey);
    clearTimeout(this.timer);
  }
  renderedCallback() {
    if (this.focusSelector) {
      const el = this.template.querySelector(this.focusSelector);
      if (el) {
        el.focus();
        if (el.select) el.select();
        this.focusSelector = "";
      }
    }
  }

  get scrimCls() {
    return this.open ? "scrim on" : "scrim";
  }
  get panelCls() {
    return this.open ? "panel on" : "panel";
  }
  get rows() {
    return (this.filters || []).map((f) => {
      const active = f.id === this.activeId;
      return {
        id: f.id,
        name: f.name,
        summary: f.summary || "",
        active,
        showChanged: active && this.changed,
        cls: "frow" + (active ? " active" : ""),
        starCls: "ib star" + (f.isDefault ? " on" : ""),
        starTitle: f.isDefault
          ? "Your default: click to have no default"
          : "Make this my default",
        renaming: this.renamingId === f.id,
        deleting: this.deletingId === f.id,
        sharing: this.sharingId === f.id
      };
    });
  }
  get noFilters() {
    return !(this.filters && this.filters.length);
  }
  get activeName() {
    const f = (this.filters || []).find((x) => x.id === this.activeId);
    return f ? f.name : "";
  }
  get overText() {
    return `Save over “${this.activeName}”`;
  }
  get cantOver() {
    return this.busy || !this.changed;
  }
  get overTitle() {
    return this.changed
      ? ""
      : "Nothing on the screen has changed since you opened this filter";
  }
  get cantSave() {
    return this.busy || !this.name.trim();
  }
  get cantRename() {
    return this.busy || !this.renameValue.trim();
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
  filtersChanged(activeId) {
    this.dispatchEvent(
      new CustomEvent("filterschanged", { detail: { activeId } })
    );
  }
  handleClose() {
    this.dispatchEvent(new CustomEvent("close"));
  }
  /* ----- run, star ----- */
  handleRun(event) {
    this.dispatchEvent(
      new CustomEvent("openfilter", {
        detail: { id: event.currentTarget.dataset.id }
      })
    );
  }
  handleStar(event) {
    const id = event.currentTarget.dataset.id;
    const f = (this.filters || []).find((x) => x.id === id);
    this.run(
      () => setDefault({ filterId: f.isDefault ? null : id }),
      () => this.filtersChanged(this.activeId)
    );
  }

  /* ----- rename ----- */
  handleRenameOpen(event) {
    const id = event.currentTarget.dataset.id;
    const f = (this.filters || []).find((x) => x.id === id);
    this.renamingId = id;
    this.renameValue = f ? f.name : "";
    this.deletingId = "";
    this.sharingId = "";
    this.focusSelector = ".fedit .in";
  }
  handleRenameInput(event) {
    this.renameValue = event.target.value;
  }
  handleRenameKey(event) {
    if (event.key === "Enter" && !this.cantRename)
      this.keepName(this.renamingId);
  }
  handleRenameKeep(event) {
    this.keepName(event.currentTarget.dataset.id);
  }
  keepName(id) {
    this.run(
      () => renameFilter({ filterId: id, name: this.renameValue }),
      (row) => {
        this.renamingId = "";
        this.message = `Renamed to “${row.name}”.`;
        this.filtersChanged(this.activeId);
      }
    );
  }
  handleRenameCancel() {
    this.renamingId = "";
  }

  /* ----- delete ----- */
  handleDeleteAsk(event) {
    this.deletingId = event.currentTarget.dataset.id;
    this.renamingId = "";
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
        this.filtersChanged(id === this.activeId ? "" : this.activeId);
      }
    );
  }

  /* ----- save ----- */
  handleSaveOpen() {
    this.saving = true;
    this.message = "";
    this.error = "";
    this.focusSelector = ".ffoot .name";
  }
  handleSaveCancel() {
    this.saving = false;
    this.name = "";
  }
  handleName(event) {
    this.name = event.target.value;
  }
  handleNameKey(event) {
    if (event.key === "Enter" && !this.cantSave) this.handleSaveNew();
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
        this.message = `Saved “${row.name}” as a new filter.`;
        this.saving = false;
        this.name = "";
        this.filtersChanged(row.id);
      }
    );
  }
  handleSaveOver() {
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
        this.message = `“${row.name}” now holds what is on the screen.`;
        this.filtersChanged(row.id);
      }
    );
  }

  /* ----- sharing ----- */
  handleShareOpen(event) {
    const id = event.currentTarget.dataset.id;
    this.sharingId = this.sharingId === id ? "" : id;
    this.deletingId = "";
    this.renamingId = "";
    this.term = "";
    this.results = [];
    this.chosen = [];
  }
  handleShareClose() {
    this.sharingId = "";
  }
  handleTermClear() {
    clearTimeout(this.timer);
    this.term = "";
    this.results = [];
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
