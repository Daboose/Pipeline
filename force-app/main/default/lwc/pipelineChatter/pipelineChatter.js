import { LightningElement, api } from "lwc";
import getFeed from "@salesforce/apex/PipelineChatterController.getFeed";
import post from "@salesforce/apex/PipelineChatterController.post";
import reply from "@salesforce/apex/PipelineChatterController.reply";
import { agoText, mentionParts, chatterText } from "c/pipelineFormat";

function errorText(e) {
  return (
    (e && e.body && e.body.message) ||
    (e && e.message) ||
    "That did not work. Try again."
  );
}
const withParts = (text) =>
  mentionParts(chatterText(text)).map((t) => ({
    ...t,
    cls: t.mention ? "mention" : ""
  }));

/**
 * Pipeline: Chatter on one deal, inside the deal flyout. Shows the newest posts with their replies, lets the person
 * write a post (with @mentions picked from a list, through the pipelineMentionBox component) and reply to a post, all as
 * themselves. It does exactly what the deal's own
 * Chatter feed does; an existing Salesforce process moves the deal's Latest Chatter Date, not this component.
 */
export default class PipelineChatter extends LightningElement {
  _recordId;
  feed = [];
  draftEmpty = true;
  error = "";
  sending = false;
  replyingTo = "";
  replyEmpty = true;
  pendingPrefill = "";

  @api
  get recordId() {
    return this._recordId;
  }
  set recordId(value) {
    if (value !== this._recordId) {
      this._recordId = value;
      this.feed = [];
      this.replyingTo = "";
      this.error = "";
      const box = this.postBox;
      if (box) box.clear();
      this.load();
    }
  }

  /** Puts text in the post box (for example a manager's request to check a surgeon's usages) without posting it. */
  @api
  prefill(text) {
    const box = this.postBox;
    if (box) box.setText(text);
    else this.pendingPrefill = text;
  }
  renderedCallback() {
    if (this.pendingPrefill && this.postBox) {
      this.postBox.setText(this.pendingPrefill);
      this.pendingPrefill = "";
    }
  }
  get postBox() {
    return this.template.querySelector(".postbox");
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
    return this.sending || this.draftEmpty;
  }
  get cantReply() {
    return this.sending || this.replyEmpty;
  }

  handleDraft(event) {
    this.draftEmpty = event.detail.empty;
  }
  handlePost() {
    this.sending = true;
    this.error = "";
    const box = this.postBox;
    post({
      dealId: this._recordId,
      segmentsJson: JSON.stringify(box.getSegments())
    })
      .then(() => {
        box.clear();
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
    this.replyEmpty = true;
  }
  handleReplyDraft(event) {
    this.replyEmpty = event.detail.empty;
  }
  handleReplyCancel() {
    this.replyingTo = "";
  }
  handleReplySend(event) {
    const id = event.currentTarget.dataset.id;
    this.sending = true;
    this.error = "";
    const field = this.template.querySelector(".replyfield");
    reply({
      feedItemId: id,
      segmentsJson: JSON.stringify(field.getSegments())
    })
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
