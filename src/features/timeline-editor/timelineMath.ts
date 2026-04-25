/**
 * UI-side helpers that need to know about DOM geometry.
 * Framework-agnostic pixel math lives in core/timeline/clips.ts.
 */

export interface ViewportBounds {
  pxPerSecond: number;
  scrollLeft: number;
  contentLeft: number;
}

/**
 * Translate a pointer x (client coords) into an absolute timeline seconds value.
 *
 * `headerOffset` accounts for the sticky-left header column shared by every
 * row (see TimelineTrackHeader). Without it, time=0 would visually appear
 * before the first ruler tick.
 */
export function clientXToTime(
  clientX: number,
  containerRect: DOMRect,
  {
    pxPerSecond,
    scrollLeft,
    headerOffset = 0
  }: { pxPerSecond: number; scrollLeft: number; headerOffset?: number }
): number {
  const localX = clientX - containerRect.left + scrollLeft - headerOffset;
  return pxPerSecond > 0 ? localX / pxPerSecond : 0;
}

/** Width (px) of the shared sticky-left header column on every row. */
export const TRACK_HEADER_WIDTH = 168;

/** Minimum zoom in px/second. Anything below this and clips become invisible. */
export const MIN_PX_PER_SECOND = 8;
/** Maximum zoom in px/second. Anything above this makes scrolling painful. */
export const MAX_PX_PER_SECOND = 400;

export function clampZoom(pxPerSecond: number): number {
  return Math.max(MIN_PX_PER_SECOND, Math.min(MAX_PX_PER_SECOND, pxPerSecond));
}
