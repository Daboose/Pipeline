/**
 * Pipeline: the one place that knows about Zoom (Robert, 2026-11-16). A person can shrink the whole Pipeline or Campaign Management
 * screen to 90, 80, 70 or 60 percent so more fits on a laptop that runs at 150% or 200% Windows scaling. The choice is saved in their own
 * Pipeline settings (the entry "zoom"). The screens apply it as ONE number, the CSS custom property --z (0.8 for 80%) on their root, and
 * the root takes `zoom: var(--z, 1)`; nothing inside is resized one by one.
 *
 * Two things follow from CSS zoom, and the helpers here deal with both:
 *  - lengths in vh and vw are NOT corrected by zoom, so a size that means "a share of the window" is written
 *    calc(94vh / var(--z, 1)) (or, in a script, divided by zoomOf);
 *  - getBoundingClientRect() answers in what is drawn on the screen, while offsetWidth, clientHeight, scrollTop and the sizes a script
 *    writes into a style are in the zoomed element's own units. localWidth() and zoomOf() convert between the two.
 * Used by pipelineApp, pipelineCampaigns, pipelineZoomSlider, pipelineSticky, pipelineColumnResize, pipelineSelection and the lists.
 */

/** The choices, biggest first. 100 is how the screens have always looked. */
export const ZOOM_STEPS = [100, 90, 80, 70, 60];

/** What a person gets until they choose (Robert, 2026-11-16: 80% suits the Zimmer Biomet laptops, which run at 150% or 200% Windows scaling). */
export const DEFAULT_ZOOM = 80;

/** Turns anything saved (a number, a text, nothing) into one of the steps; the default (80) when nothing is saved or it is not one. */
export function cleanZoom(value) {
  if (value === null || value === undefined || value === "")
    return DEFAULT_ZOOM;
  const n = Number(value);
  return ZOOM_STEPS.includes(n) ? n : DEFAULT_ZOOM;
}

/** The inline style that sets the zoom on a screen's root: "--z:0.8". */
export function zoomStyle(value) {
  return `--z:${cleanZoom(value) / 100}`;
}

/** The zoom in force where this element sits, as a number (1 at 100%). It reads the --z the screen's root set. */
export function zoomOf(el) {
  if (!el || typeof window === "undefined") return 1;
  const z = parseFloat(window.getComputedStyle(el).getPropertyValue("--z"));
  return z > 0 && z <= 1 ? z : 1;
}

/** An element's width in its own units (what a script writes into a style), from what getBoundingClientRect says is drawn. */
export function localWidth(el) {
  return el.getBoundingClientRect().width / zoomOf(el);
}
