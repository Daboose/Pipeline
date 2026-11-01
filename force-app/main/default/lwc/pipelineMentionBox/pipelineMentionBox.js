import { LightningElement, api } from "lwc";
import searchPeople from "@salesforce/apex/PipelineChatterController.searchPeople";

const MIN_LETTERS = 3;
const SEARCH_DELAY_MS = 220;
const NBSP = "\u00a0";

/** The word-starts of a name that the typed words match, so they can be shown in bold. */
function boldParts(name, typed) {
  const qs = typed.toLowerCase().split(/\s+/).filter(Boolean);
  const out = [];
  name.split(/(\s+)/).forEach((word, i) => {
    const q = qs.find((x) => word.toLowerCase().startsWith(x));
    if (q) {
      out.push({ key: `${i}a`, text: word.slice(0, q.length), cls: "b" });
      if (word.length > q.length)
        out.push({ key: `${i}b`, text: word.slice(q.length), cls: "" });
    } else {
      out.push({ key: `${i}a`, text: word, cls: "" });
    }
  });
  return out;
}

/**
 * Pipeline: the Chatter writing box, with @mentions. Typing @ and three letters offers the people who match (read from
 * Salesforce, active people only). Picking one turns what was typed into a chip, bold and coloured, with a small cross
 * to take it off; the chip is one unit, so deleting backwards through the text takes the whole chip in one go. A chip
 * carries the person's Id, so the right person is mentioned; a name typed but never picked stays plain text.
 * The box posts nothing: getSegments() hands the text on as pieces ([{ t: "text" }, { u: "Id", n: "Name" }]) and the
 * Chatter component posts them through PipelineChatterController.
 */
export default class PipelineMentionBox extends LightningElement {
  @api placeholder = "Write a post. Type @ and a name to mention someone.";

  items = [];
  selIndex = 0;
  hint = "";
  listOpen = false;
  mentioned = [];
  timer;
  seq = 0;
  ctxQuery = ""; // what is typed after the @ (for the bold letters in the list)

  disconnectedCallback() {
    clearTimeout(this.timer);
  }

  /* ----- what the parent can ask ----- */
  /** The text as pieces: plain text and chips (a mention carries the person's Id and the name picked). */
  @api
  getSegments() {
    const out = [];
    let text = "";
    const flush = () => {
      if (text) out.push({ t: text });
      text = "";
    };
    const walk = (n) => {
      if (n.nodeType === 3) {
        text += n.textContent.split(NBSP).join(" ");
      } else if (n.classList && n.classList.contains("chip")) {
        flush();
        out.push({ u: n.dataset.id, n: n.dataset.name });
      } else if (n.nodeName === "BR") {
        text += "\n";
      } else if (n.childNodes) {
        if (text && !text.endsWith("\n")) text += "\n";
        for (let i = 0; i < n.childNodes.length; i += 1) walk(n.childNodes[i]);
      }
    };
    for (let i = 0; i < this.box.childNodes.length; i += 1)
      walk(this.box.childNodes[i]);
    flush();
    if (out.length && out[0].t) out[0].t = out[0].t.replace(/^\s+/, "");
    const last = out[out.length - 1];
    if (last && last.t) last.t = last.t.replace(/\s+$/, "");
    return out.filter((s) => s.u || s.t);
  }
  @api
  clear() {
    this.box.textContent = "";
    this.closeList();
    this.changed();
  }
  /** Puts plain text in the box (for example a manager's request) without posting it. */
  @api
  setText(text) {
    this.box.textContent = text || "";
    this.changed();
  }
  @api
  focus() {
    this.box.focus();
  }

  get box() {
    return this.template.querySelector(".box");
  }
  get listCls() {
    return this.listOpen ? "list on" : "list";
  }
  get rows() {
    const q = this.ctxQuery || "";
    return this.items.map((p, i) => ({
      i,
      id: p.id,
      title: p.title || "",
      parts: boldParts(p.name, q),
      cls: "it" + (i === this.selIndex ? " sel" : "")
    }));
  }
  get hasMentions() {
    return this.mentioned.length > 0;
  }
  get mentionNames() {
    return this.mentioned.join(", ");
  }

  /* ----- the caret and the @ it sits after ----- */
  /** The caret's selection. A real (native) shadow root has its own; Salesforce's emulated one does not allow it. */
  selection() {
    try {
      if (typeof this.template.getSelection === "function")
        return this.template.getSelection();
    } catch {
      // the emulated shadow DOM refuses; the window's selection is the right one there
    }
    return window.getSelection();
  }
  /** The text typed after an @ just before the caret, with where it sits, or null. */
  query() {
    const s = this.selection();
    if (!s || !s.rangeCount || !s.isCollapsed) return null;
    const r = s.getRangeAt(0);
    const n = r.startContainer;
    // the handlers only run for events inside the box, so the caret is known to be in it
    if (n.nodeType !== 3) return null;
    const before = n.textContent.slice(0, r.startOffset);
    const m = /(^|[\s\u00a0])@([\p{L}'.\- ]{0,40})$/u.exec(before);
    if (!m) return null;
    return {
      node: n,
      start: r.startOffset - m[2].length - 1,
      end: r.startOffset,
      q: m[2]
    };
  }
  closeList() {
    this.listOpen = false;
    this.items = [];
    this.hint = "";
    clearTimeout(this.timer);
    this.seq += 1;
  }
  refresh() {
    const ctx = this.query();
    if (!ctx) {
      this.closeList();
      return;
    }
    const q = ctx.q.trim();
    this.ctxQuery = q;
    this.listOpen = true;
    if (q.length < MIN_LETTERS) {
      this.items = [];
      this.hint =
        "Keep typing the name: suggestions start after three letters.";
      clearTimeout(this.timer);
      this.seq += 1;
      return;
    }
    const mine = ++this.seq;
    clearTimeout(this.timer);
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    this.timer = setTimeout(() => {
      searchPeople({ term: q })
        .then((list) => {
          if (mine !== this.seq) return;
          this.items = list;
          this.selIndex = 0;
          this.hint = list.length
            ? ""
            : `Nobody found for “${q}”. Check the spelling.`;
        })
        .catch(() => {
          if (mine !== this.seq) return;
          this.items = [];
          this.hint = "The list of people could not be read. Try again.";
        });
    }, SEARCH_DELAY_MS);
  }

  /* ----- picking, chips, deleting ----- */
  makeChip(person) {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.contentEditable = "false";
    chip.dataset.id = person.id;
    chip.dataset.name = person.name;
    const name = document.createElement("span");
    name.textContent = person.name;
    const x = document.createElement("button");
    x.className = "x";
    x.type = "button";
    x.tabIndex = -1;
    x.setAttribute("aria-label", `Remove ${person.name}`);
    chip.appendChild(name);
    chip.appendChild(x);
    return chip;
  }
  pick(index) {
    const person = this.items[index];
    const ctx = this.query();
    if (!person || !ctx) return;
    const range = document.createRange();
    range.setStart(ctx.node, ctx.start);
    range.setEnd(ctx.node, ctx.end);
    range.deleteContents();
    const chip = this.makeChip(person);
    range.insertNode(chip);
    // a space after the chip to type on from (insertBefore, because Salesforce's page ignores ChildNode.after)
    const space = document.createTextNode(NBSP);
    chip.parentNode.insertBefore(space, chip.nextSibling);
    const rest = space.nextSibling;
    if (rest && rest.nodeType === 3 && rest.textContent === "")
      rest.parentNode.removeChild(rest);
    const s = this.selection();
    s.removeAllRanges();
    const caret = document.createRange();
    caret.setStart(space, 1);
    caret.collapse(true);
    s.addRange(caret);
    this.closeList();
    this.changed();
  }
  /** The node just before the caret (so Backspace can take a whole chip). */
  nodeBeforeCaret() {
    const s = this.selection();
    if (!s || !s.rangeCount || !s.isCollapsed) return null;
    const r = s.getRangeAt(0);
    const n = r.startContainer;
    if (n.nodeType === 3) return r.startOffset === 0 ? n.previousSibling : null;
    return r.startOffset > 0 ? n.childNodes[r.startOffset - 1] : null;
  }
  removeNode(n) {
    if (n && n.parentNode) n.parentNode.removeChild(n);
  }
  isChip(n) {
    return !!(n && n.classList && n.classList.contains("chip"));
  }
  /** Every chip in the box, found by walking the box (a chip may sit inside a line made by Enter). */
  chips() {
    const found = [];
    const walk = (n) => {
      if (this.isChip(n)) found.push(n);
      else if (n.childNodes)
        for (let i = 0; i < n.childNodes.length; i += 1) walk(n.childNodes[i]);
    };
    for (let i = 0; i < this.box.childNodes.length; i += 1)
      walk(this.box.childNodes[i]);
    return found;
  }
  changed() {
    const chips = this.chips();
    this.mentioned = chips.map((c) => c.dataset.name);
    const empty =
      !this.box.textContent.split(NBSP).join("").trim() && chips.length === 0;
    if (empty) this.box.textContent = "";
    this.dispatchEvent(
      new CustomEvent("contentchange", {
        detail: { empty, mentions: this.mentioned }
      })
    );
  }

  /* ----- events ----- */
  handleInput() {
    this.selIndex = 0;
    this.refresh();
    this.changed();
  }
  handleKeyup(event) {
    if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
      this.refresh();
  }
  handleClick(event) {
    const x = event.target.closest && event.target.closest(".x");
    if (x) {
      this.removeNode(x.closest(".chip"));
      this.closeList();
      this.changed();
      this.box.focus();
    } else {
      this.refresh();
    }
  }
  handleKeydown(event) {
    const navigating = this.listOpen && this.items.length > 0;
    if (navigating) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        this.selIndex = (this.selIndex + 1) % this.items.length;
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        this.selIndex =
          (this.selIndex - 1 + this.items.length) % this.items.length;
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        this.pick(this.selIndex);
        return;
      }
    }
    if (event.key === "Escape" && this.listOpen) {
      event.preventDefault();
      event.stopPropagation();
      this.closeList();
      return;
    }
    if (event.key === "Backspace") {
      const before = this.nodeBeforeCaret();
      if (this.isChip(before)) {
        event.preventDefault();
        this.removeNode(before);
        this.changed();
      }
    }
  }
  handlePick(event) {
    const row = event.target.closest && event.target.closest(".it");
    if (!row) return;
    event.preventDefault(); // keep the caret in the box
    this.pick(Number(row.dataset.i));
  }
  /** Pasting brings in plain text only (no colours, fonts or pictures from wherever it was copied). */
  handlePaste(event) {
    event.preventDefault();
    const clip = event.clipboardData || window.clipboardData;
    const text = clip ? clip.getData("text/plain") : "";
    // insertText is the browser's own way to put text at the caret in an editable box
    if (text) document.execCommand("insertText", false, text);
  }
  handleBlur() {
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    setTimeout(() => this.closeList(), 150);
  }
}
