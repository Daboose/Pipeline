/**
 * Pipeline: shared helper so every Pipeline table has columns the person can resize. Project rule: any table of data
 * lets the person drag a column edge and reset a column by double-clicking it. (The same helper pattern as ACCRURA's,
 * rebuilt here; the widths are kept in the person's own Pipeline settings, so they follow them to any computer.)
 */

/**
 * Starts a drag on a column edge. Calls onMove(width) as the mouse moves and onEnd() on release.
 * @param event      the mousedown event on the drag handle
 * @param startWidth the column's width in pixels when the drag began
 * @param minWidth   the narrowest the column may be made
 */
export function beginColumnDrag(event, startWidth, minWidth, onMove, onEnd) {
  event.preventDefault();
  event.stopPropagation();
  const startX = event.clientX;
  const move = (e) =>
    onMove(Math.max(minWidth, Math.round(startWidth + e.clientX - startX)));
  const up = () => {
    window.removeEventListener("mousemove", move);
    window.removeEventListener("mouseup", up);
    onEnd();
  };
  window.addEventListener("mousemove", move);
  window.addEventListener("mouseup", up);
}
