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
 * Convert a pointer clientX into an absolute timeline time (seconds).
 *
 * IMPORTANT — pass the SCROLL CONTAINER rect (tl-scroll / scrollRef), NOT the
 * scrollable content element.  The scroll container's left edge is stable in
 * viewport coordinates regardless of how far the content has been scrolled.
 * scrollLeft is then added exactly once to recover the content position.
 *
 *   visualX  = clientX − scrollContainerRect.left
 *              (distance from the visible left edge of the timeline area)
 *   contentX = visualX − headerWidth + scrollLeft
 *              (pixel position inside the timeline content, 0 = time 0)
 *   time     = contentX / pxPerSecond
 *
 * Why NOT the content element rect:
 *   The content element shifts left in the viewport as the user scrolls, so its
 *   getBoundingClientRect().left already encodes the scroll offset.  Adding
 *   scrollLeft on top of that would double-count it.
 */
export function getTimelinePointerTime({
  clientX,
  scrollContainerRect,
  scrollLeft,
  pxPerSecond,
  headerWidth = TRACK_HEADER_WIDTH,
  duration = Infinity
}: {
  clientX: number;
  /** getBoundingClientRect() of the scroll container — stable, not the content. */
  scrollContainerRect: DOMRect;
  scrollLeft: number;
  pxPerSecond: number;
  headerWidth?: number;
  duration?: number;
}): number {
  const visualX  = clientX - scrollContainerRect.left;
  const contentX = visualX - headerWidth + scrollLeft;
  const time     = pxPerSecond > 0 ? contentX / pxPerSecond : 0;
  return Math.max(0, Math.min(duration, time));
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
