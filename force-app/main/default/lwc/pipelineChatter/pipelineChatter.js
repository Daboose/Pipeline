import { LightningElement, api } from "lwc";
import getFeed from "@salesforce/apex/PipelineChatterController.getFeed";
import post from "@salesforce/apex/PipelineChatterController.post";
import reply from "@salesforce/apex/PipelineChatterController.reply";
import { agoText, mentionParts } from "c/pipelineFormat";

function errorText(e) {
  return (
    (e && e.body && e.body.message) ||
    (e && e.message) ||
    "That did not work. Try again."
  );
}
const withParts = (text) =>
  mentionParts(text).map((t) => ({ ...t, cls: t.mention ? "mention" : "" }));

/**
 * Pipeline: Chatter on one deal, inside the deal flyout. Shows the newest posts with their replies, lets the person
 * write a post (with @Name mentions) and reply to a post, all as themselves. It does exactly what the deal's own
 * Chatter feed does; an existing Salesforce process moves the deal's Latest Chatter Date, not this component.
 */
export default class PipelineChatter extends LightningElement {
  _recordId;
  feed = [];
  draft = "";
  error = "";
  sending = false;
  replyingTo = "";
  replyDraft = "";

  @api
  get recordId() {
    return this._recordId;
  }
  set recordId(value) {
    if (value !== this._recordId) {
      this._recordId = value;
      this.feed = [];
      this.draft = "";
      this.replyingTo = "";
      this.error = "";
      this.load();
    }
  }

  /** Puts text in the post box (for example a manager's request to check a surgeon's usages) without posting it. */
  @api
  prefill(text) {
    this.draft = text;
  }

  load() {
    const id = this._recordId;
    if (!id) return;
    getFeed({ dealId: id })
      .then((rows) => {
        if (id === this._recordId) this.feed = rows;
      })
      .catch((e) => {
        this.error = errorText(e);
      });
  }

  get posts() {
    return this.feed.map((p) => ({
      id: p.id,
      who: p.who,
      ago: agoText(p.posted),
      parts: withParts(p.text),
      canReply: this.replyingTo !== p.id,
      replying: this.replyingTo === p.id,
      replies: (p.replies || []).map((r) => ({
        id: r.id,
        who: r.who,
        ago: agoText(r.posted),
        parts: withParts(r.text)
      }))
    }));
  }
  get noPosts() {
    return this.feed.length === 0;
  }
  get cantPost() {
    return this.sending || !this.draft.trim();
  }
  get cantReply() {
    return this.sending || !this.replyDraft.trim();
  }

  handleDraft(event) {
    this.draft = event.target.value;
  }
  handlePost() {
    this.sending = true;
    this.error = "";
    post({ dealId: this._recordId, text: this.draft })
      .then(() => {
        this.draft = "";
        this.load();
        this.dispatchEvent(new CustomEvent("posted"));
      })
      .catch((e) => {
        this.error = errorText(e);
      })
      .finally(() => {
        this.sending = false;
      });
  }
  handleReplyOpen(event) {
    this.replyingTo = event.currentTarget.dataset.id;
    this.replyDraft = "";
  }
  handleReplyDraft(event) {
    this.replyDraft = event.target.value;
  }
  handleReplyCancel() {
    this.replyingTo = "";
  }
  handleReplySend(event) {
    const id = event.currentTarget.dataset.id;
    this.sending = true;
    this.error = "";
    reply({ feedItemId: id, text: this.replyDraft })
      .then(() => {
        this.replyingTo = "";
        this.load();
        this.dispatchEvent(new CustomEvent("posted"));
      })
      .catch((e) => {
        this.error = errorText(e);
      })
      .finally(() => {
        this.sending = false;
      });
  }
}
