import { LightningElement, api } from "lwc";
import getFeed from "@salesforce/apex/PipelineChatterController.getFeed";
import post from "@salesforce/apex/PipelineChatterController.post";
import reply from "@salesforce/apex/PipelineChatterController.reply";
import searchPeople from "@salesforce/apex/PipelineChatterController.searchPeople";
import { chatterText, mentionParts } from "c/pipelineFormat";
import {
  agoShort,
  chatterSummary,
  mentionQuery,
  insertMention,
  segmentsFrom
} from "c/pipelineMobileModel";

const SLIDE_OUT_MS = 450; // a little longer than the slide itself (0.4 s in the style sheet)
const MIN_LETTERS = 3; // letters after an @ before people are offered, as on the desktop
const SEARCH_DELAY_MS = 220;

const errorText = (e) =>
  (e && e.body && e.body.message) ||
  (e && e.message) ||
  "That did not work. Try again.";
const withParts = (text) =>
  mentionParts(chatterText(text)).map((t) => ({
    ...t,
    cls: t.mention ? "mention" : ""
  }));

/**
 * Pipeline Mobile: the Chatter screen of one deal on the phone (Robert, 2026-11-07; mockup pipeline_mobile_chatter_v1.html, option C).
 * It slides in over the deal when the Chatter row is tapped. It shows the newest posts with their replies; "+ New post" and the Reply
 * under each post slide in a writing page (a big box, the post being replied to above it, @ and three letters offering people, a locked
 * Cancel / Post bar). Everything is done through PipelineChatterController as the signed-in person, exactly as the desktop's Chatter
 * does (getFeed, post, reply, searchPeople); an existing Salesforce process moves the deal's Latest Chatter Date, not this component.
 * The parent (pipelineMobile) owns the Chatter row on the deal screen: this component tells it the summary ("feed") and when
 * something was posted ("posted"), and asks it to slide the screen off ("close").
 */
export default class PipelineMobileChatter extends LightningElement {
  @api dealLabel = "";

  _recordId;
  _open = false;
  feed = [];
  loading = false;
  error = "";
  writeOpen = false;
  replyTo = null; // the post being replied to, or null for a new post
  mentioned = []; // the people picked from the list in this piece of writing: [{ id, name }]
  people = [];
  peopleOpen = false;
  peopleHint = "";
  sending = false;
  writeError = "";
  timer;
  seq = 0;
  closeTimer;

  @api
  get recordId() {
    return this._recordId;
  }
  set recordId(value) {
    if (value === this._recordId) return;
    this._recordId = value;
    this.feed = [];
    this.error = "";
    this.resetWriting();
    this.load();
  }
  /** True while the Chatter screen is slid in; the writing page is put away once it has slid off. */
  @api
  get open() {
    return this._open;
  }
  set open(value) {
    this._open = !!value;
    clearTimeout(this.closeTimer);
    if (!value) {
      // eslint-disable-next-line @lwc/lwc/no-async-operation
      this.closeTimer = setTimeout(() => this.resetWriting(), SLIDE_OUT_MS);
    }
  }

  disconnectedCallback() {
    clearTimeout(this.timer);
    clearTimeout(this.closeTimer);
  }
  renderedCallback() {
    this.lockScroll();
  }
  /** A swipe on the Chatter page scrolls the page and is stopped at its top and bottom, not passed on to Salesforce's page underneath. */
  lockScroll() {
    const page = this.template.querySelector(".chatpage");
    if (!page || this.lockedPage === page) return;
    this.lockedPage = page;
    let touchY = 0;
    page.addEventListener(
      "touchstart",
      (e) => {
        touchY = e.touches[0].clientY;
      },
      { passive: true }
    );
    page.addEventListener(
      "touchmove",
      (e) => {
        const dy = e.touches[0].clientY - touchY;
        const atTop = page.scrollTop <= 0;
        const atBottom =
          page.scrollTop + page.clientHeight >= page.scrollHeight - 1;
        if ((atTop && dy > 0) || (atBottom && dy < 0)) e.preventDefault();
      },
      { passive: false }
    );
  }

  load() {
    const id = this._recordId;
    if (!id) return Promise.resolve();
    this.loading = true;
    return getFeed({ dealId: id })
      .then((rows) => {
        if (id !== this._recordId) return;
        this.feed = rows || [];
        this.dispatchEvent(
          new CustomEvent("feed", { detail: chatterSummary(this.feed) })
        );
      })
      .catch((e) => {
        if (id === this._recordId) this.error = errorText(e);
      })
      .finally(() => {
        if (id === this._recordId) this.loading = false;
      });
  }

  /* ----- the screen ----- */
  get pageCls() {
    return "page chatpage" + (this._open ? " on" : "");
  }
  get posts() {
    return this.feed.map((p) => ({
      id: p.id,
      who: p.who,
      ago: agoShort(p.posted),
      parts: withParts(p.text),
      replies: (p.replies || []).map((r) => ({
        id: r.id,
        who: r.who,
        ago: agoShort(r.posted),
        parts: withParts(r.text)
      }))
    }));
  }
  get noPosts() {
    return !this.loading && !this.error && this.feed.length === 0;
  }
  handleBack() {
    this.dispatchEvent(new CustomEvent("close"));
  }

  /* ----- the writing page ----- */
  get writeCls() {
    return "writepage" + (this.writeOpen ? " on" : "");
  }
  get isReply() {
    return !!this.replyTo;
  }
  get writeTitle() {
    return this.replyTo ? `Reply to ${this.replyTo.who}` : "New post";
  }
  get quoteText() {
    if (!this.replyTo) return "";
    const t = chatterText(this.replyTo.text);
    return t.length > 90 ? `${t.slice(0, 90)}…` : t;
  }
  get writePlaceholder() {
    return this.replyTo
      ? "Write a reply. Type @ and a name to mention someone."
      : "Write a post. Type @ and a name to mention someone.";
  }
  get peopleCls() {
    return "people" + (this.peopleOpen ? " on" : "");
  }
  get postWord() {
    return this.sending ? "Posting…" : "Post";
  }
  get hasWriteError() {
    return !!this.writeError;
  }
  get peopleRows() {
    return this.people.map((p) => ({
      id: p.id,
      name: p.name,
      title: p.title || ""
    }));
  }
  get noPeopleRows() {
    return this.people.length === 0;
  }
  get box() {
    return this.template.querySelector(".wtext");
  }
  resetWriting() {
    clearTimeout(this.timer);
    this.seq += 1;
    this.writeOpen = false;
    this.replyTo = null;
    this.mentioned = [];
    this.people = [];
    this.peopleOpen = false;
    this.peopleHint = "";
    this.writeError = "";
    this.sending = false;
    const box = this.box;
    if (box) box.value = "";
  }
  handleNew() {
    this.resetWriting();
    this.writeOpen = true;
  }
  handleReply(event) {
    const id = event.currentTarget.dataset.id;
    const original = this.feed.find((p) => p.id === id);
    this.resetWriting();
    this.replyTo = original || null;
    this.writeOpen = true;
  }
  handleWriteClose() {
    this.resetWriting();
  }

  /* ----- @ and a name: the people who match are offered above the keyboard ----- */
  handleWriteInput() {
    this.writeError = "";
    this.refreshPeople();
  }
  handleCaret() {
    this.refreshPeople();
  }
  refreshPeople() {
    const box = this.box;
    if (!box) return;
    const query = mentionQuery(box.value, box.selectionStart);
    clearTimeout(this.timer);
    this.seq += 1;
    if (!query) {
      this.peopleOpen = false;
      this.people = [];
      return;
    }
    const q = query.q.trim();
    this.peopleOpen = true;
    if (q.length < MIN_LETTERS) {
      this.people = [];
      this.peopleHint =
        "Keep typing the name: suggestions start after three letters.";
      return;
    }
    const mine = this.seq;
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    this.timer = setTimeout(() => {
      searchPeople({ term: q })
        .then((list) => {
          if (mine !== this.seq) return;
          this.people = list || [];
          this.peopleHint = this.people.length
            ? ""
            : `Nobody found for “${q}”. Check the spelling.`;
        })
        .catch(() => {
          if (mine !== this.seq) return;
          this.people = [];
          this.peopleHint = "The list of people could not be read. Try again.";
        });
    }, SEARCH_DELAY_MS);
  }
  handlePickPerson(event) {
    const { id, name } = event.currentTarget.dataset;
    const box = this.box;
    const query = mentionQuery(box.value, box.selectionStart);
    if (!query) return;
    const next = insertMention(box.value, query, name);
    box.value = next.text;
    box.focus();
    box.setSelectionRange(next.caret, next.caret);
    if (!this.mentioned.some((p) => p.id === id))
      this.mentioned = [...this.mentioned, { id, name }];
    this.peopleOpen = false;
    this.people = [];
    this.seq += 1;
  }

  /* ----- posting ----- */
  handlePost() {
    if (this.sending) return;
    const segments = segmentsFrom(this.box.value, this.mentioned);
    if (!segments.length) {
      this.writeError = "Write something to post.";
      return;
    }
    this.sending = true;
    this.writeError = "";
    const call = this.replyTo
      ? reply({
          feedItemId: this.replyTo.id,
          segmentsJson: JSON.stringify(segments)
        })
      : post({
          dealId: this._recordId,
          segmentsJson: JSON.stringify(segments)
        });
    call
      .then(() => {
        this.resetWriting();
        this.dispatchEvent(new CustomEvent("posted"));
        return this.load();
      })
      .catch((e) => {
        this.writeError = errorText(e);
        this.sending = false;
      });
  }
}
