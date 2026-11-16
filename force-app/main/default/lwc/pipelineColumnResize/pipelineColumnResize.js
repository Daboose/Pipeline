/**
 * Pipeline: shared helper so every Pipeline table has columns the person can resize. Project rule: any table of data
 * lets the person drag a column edge and reset a column by double-clicking it. (The same helper pattern as ACCRURA's,
 * rebuilt here; the widths are kept in the person's own Pipeline settings, so they follow them to any computer.)
 *
 * Zoom (2026-11-16): the mouse moves in drawn pixels but a column is sized in the table's own units, so the distance moved is divided by the
 * zoom in force there, and startWidth must be in own units too (see localWidth in c/pipelineZoom).
 */
import { zoomOf } from "c/pipelineZoom";

/**
 * Starts a drag on a column edge. Calls onMove(width) as the mouse moves and onEnd() on release.
 * @param event      the mousedown event on the drag handle
 * @param startWidth the column's width in its own units when the drag began (localWidth), not drawn pixels
 * @param minWidth   the narrowest the column may be made
 */
export function beginColumnDrag(event, startWidth, minWidth, onMove, onEnd) {
  event.preventDefault();
  event.stopPropagation();
  const startX = event.clientX;
  const zoom = zoomOf(event.currentTarget || event.target);
  const move = (e) =>
    onMove(
      Math.max(minWidth, Math.round(startWidth + (e.clientX - startX) / zoom))
    );
  const up = () => {
    window.removeEventListener("mousemove", move);
    window.removeEventListener("mouseup", up);
    onEnd();
  };
  window.addEventListener("mousemove", move);
  window.addEventListener("mouseup", up);
}
