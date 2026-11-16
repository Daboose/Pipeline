import { LightningElement, api } from "lwc";
import { ZOOM_STEPS, DEFAULT_ZOOM, cleanZoom } from "c/pipelineZoom";

/**
 * Pipeline: the Zoom slider (Robert, 2026-11-16; mockup docs/mockups/archive/pipeline_screen_size_v1.html, option A). The one-pill look
 * of the other sliders: a "Zoom" label end, a shaded track with a tick for each step (100, 90, 80, 70, 60) and a draggable handle that
 * shows the percentage. Bigger is on the left, smaller on the right. Dragging only moves the handle; the choice is announced when the
 * mouse is let go (the screen behind then changes, over 0.4 s), because a screen that shrank under the person's finger would carry the
 * slider away with it. A press on the track jumps to that step; the arrow keys step it.
 * It announces `zoomchange` ({ value: 80 }) and changes nothing itself: the parent saves it and applies it. `compact` leaves out the row
 * of numbers under the track (Campaign Management's top bar). Colours come from the parent, as for pipelineSegmented.
 */
export default class PipelineZoomSlider extends LightningElement {
  /** The chosen step, 100 to 60. */
  @api
  get value() {
    return this.current;
  }
  set value(v) {
    this.current = cleanZoom(v);
    this.shown = this.current;
  }
  /** True leaves out the numbers under the track. */
  @api compact = false;

  current = DEFAULT_ZOOM; // the step the screen is at
  shown = DEFAULT_ZOOM; // the step the handle is on (it differs from current while a drag is going on)
  dragging = false;
  placedOnce = false;
  live = null; // the drag's listeners, so they can be taken off

  get steps() {
    return ZOOM_STEPS;
  }
  get showLabels() {
    return !this.compact;
  }
  get handleText() {
    return `${this.shown}%`;
  }

  renderedCallback() {
    this.place(false);
  }
  connectedCallback() {
    this.onResize = () => this.place(false);
    window.addEventListener("resize", this.onResize);
  }
  disconnectedCallback() {
    window.removeEventListener("resize", this.onResize);
    this.endDrag();
  }

  /** The measurements of the track: its scale (drawn size over its own size, so it is right inside any zoom), and the room the handle has. */
  geometry() {
    const track = this.refs.track;
    const handle = this.refs.handle;
    if (!track || !handle || !track.offsetWidth) return null;
    const rect = track.getBoundingClientRect();
    const scale = rect.width / track.offsetWidth || 1;
    const room = track.clientWidth - handle.offsetWidth;
    return {
      track,
      handle,
      rect,
      scale,
      room,
      step: room / (ZOOM_STEPS.length - 1)
    };
  }
  /** Puts the handle on the step it is at, the ticks under it and the numbers below; it springs there after the first time. */
  place(animate) {
    const g = this.geometry();
    if (!g || this.dragging) return;
    const i = ZOOM_STEPS.indexOf(this.shown);
    g.handle.style.transition = animate || this.placedOnce ? "" : "none";
    g.handle.style.left = `${i * g.step}px`;
    const half = g.handle.offsetWidth / 2;
    g.track.querySelectorAll(".tk").forEach((t, k) => {
      t.style.left = `${half + k * g.step}px`;
    });
    const labels = this.refs.labels;
    if (labels) {
      const shift = g.rect.left - labels.getBoundingClientRect().left;
      labels.querySelectorAll("span").forEach((s, k) => {
        s.style.left = `${shift / g.scale + half + k * g.step}px`;
      });
    }
    this.placedOnce = true;
  }

  /** A press on the track: the handle follows the mouse until it is let go, then settles on the nearest step. */
  handleDown(event) {
    if (event.button) return;
    const g = this.geometry();
    if (!g) return;
    event.preventDefault();
    this.dragging = true;
    g.handle.style.transition = "none";
    const follow = (e) => {
      const x = Math.max(
        0,
        Math.min(
          g.room,
          (e.clientX - g.rect.left) / g.scale - g.handle.offsetWidth / 2
        )
      );
      g.handle.style.left = `${x}px`;
      const i = Math.round(x / g.step);
      this.shown = ZOOM_STEPS[i];
    };
    const up = () => {
      this.endDrag();
      this.dragging = false;
      this.settle();
    };
    this.live = { follow, up };
    window.addEventListener("pointermove", follow);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    follow(event);
  }
  endDrag() {
    if (!this.live) return;
    window.removeEventListener("pointermove", this.live.follow);
    window.removeEventListener("pointerup", this.live.up);
    window.removeEventListener("pointercancel", this.live.up);
    this.live = null;
  }
  /** Lets the handle spring onto its step and tells the parent if the step changed. */
  settle() {
    this.place(true);
    if (this.shown !== this.current) {
      this.current = this.shown;
      this.dispatchEvent(
        new CustomEvent("zoomchange", { detail: { value: this.current } })
      );
    }
  }
  handleKey(event) {
    const i = ZOOM_STEPS.indexOf(this.current);
    let next = i;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = i + 1;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = i - 1;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = ZOOM_STEPS.length - 1;
    next = Math.max(0, Math.min(ZOOM_STEPS.length - 1, next));
    if (next === i) return;
    event.preventDefault();
    this.shown = ZOOM_STEPS[next];
    this.settle();
  }
}
