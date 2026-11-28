import { LightningElement, api } from "lwc";

/**
 * rosaDealFields: one card's fields on the ROSA deal screen. Read-only until the card is put into Edit; then each field becomes
 * an input of its kind. Long text fields (wide) are full width and grow to fit their text, never a small box scrolled inside.
 * Each field: { key, label, kind, value, display, options, pickKind, valueName, wide }
 *  kind: text, number, date, select, multi, check, area, pick (a person or record search), ro (always read-only)
 * Fires "fieldchange" with { key, value, name } (name only for pick). The parent keeps the draft and saves.
 */
export default class RosaDealFields extends LightningElement {
  @api fields = [];
  @api editing = false;
  @api columns = 4;
  /** Optional column layout that overrides columns (used to line a field up with a table column below it). */
  @api gridTemplate;

  get gridStyle() {
    if (this.gridTemplate)
      return `grid-template-columns:${this.gridTemplate};column-gap:0`;
    return `grid-template-columns:repeat(${this.columns},minmax(0,1fr))`;
  }

  shape(f) {
    const ed = this.editing && f.kind !== "ro";
    const values =
      f.kind === "multi"
        ? String(f.value || "")
            .split(";")
            .filter((v) => v)
        : [];
    return {
      ...f,
      ro: !ed,
      vCls: "v" + (f.good ? " good" : ""),
      fStyle: f.col ? `grid-column:${f.col};text-align:center` : "",
      shown:
        f.display === undefined || f.display === null || f.display === ""
          ? "–"
          : f.display,
      isText: ed && f.kind === "text",
      isNumber: ed && f.kind === "number",
      isDate: ed && f.kind === "date",
      isSelect: ed && f.kind === "select",
      isMulti: ed && f.kind === "multi",
      isCheck: ed && f.kind === "check",
      isArea: ed && f.kind === "area",
      isPick: ed && f.kind === "pick",
      inputValue: f.value === null || f.value === undefined ? "" : f.value,
      rows: Math.max(3, Math.ceil(String(f.value || "").length / 110) + 1),
      opts: (f.options || []).map((o) => ({
        value: o.value,
        label: o.label,
        selected:
          f.kind === "multi" ? values.includes(o.value) : o.value === f.value,
        key: f.key + "|" + o.value
      }))
    };
  }

  get shortFields() {
    return (this.fields || []).filter((f) => !f.wide).map((f) => this.shape(f));
  }
  get wideFields() {
    return (this.fields || []).filter((f) => f.wide).map((f) => this.shape(f));
  }
  get hasWide() {
    return this.wideFields.length > 0;
  }

  fire(key, value, name) {
    this.dispatchEvent(
      new CustomEvent("fieldchange", { detail: { key, value, name } })
    );
  }

  handleDateClear(event) {
    const key = event.currentTarget.dataset.key;
    const inp = this.template.querySelector(
      'input[type="date"][data-key="' + key + '"]'
    );
    if (inp) inp.value = "";
    this.fire(key, "");
  }
  handleInput(event) {
    const t = event.target;
    this.fire(t.dataset.key, t.value);
  }

  handleArea(event) {
    const t = event.target;
    // grow to fit where the browser does not size the box to its text itself
    t.style.height = "auto";
    t.style.height = t.scrollHeight + 2 + "px";
    this.fire(t.dataset.key, t.value);
  }

  handleCheck(event) {
    this.fire(event.target.dataset.key, event.target.checked);
  }

  handleMulti(event) {
    const key = event.target.dataset.key;
    const boxes = this.template.querySelectorAll(`input[data-multi="${key}"]`);
    const picked = [];
    boxes.forEach((b) => {
      if (b.checked) picked.push(b.value);
    });
    this.fire(key, picked.join(";"));
  }

  handlePick(event) {
    this.fire(event.target.dataset.key, event.detail.id, event.detail.name);
  }

  renderedCallback() {
    this.template.querySelectorAll("textarea").forEach((t) => {
      t.style.height = "auto";
      t.style.height = t.scrollHeight + 2 + "px";
    });
  }
}
