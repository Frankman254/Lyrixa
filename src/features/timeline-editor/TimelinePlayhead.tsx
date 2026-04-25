import { timeToPx } from '../../core/timeline/clips';

interface TimelinePlayheadProps {
  currentTime: number;
  pxPerSecond: number;
  height: number;
  /** Pixel offset of the lane content area (e.g. shared header column width). */
  offsetLeft?: number;
}

export function TimelinePlayhead({
  currentTime,
  pxPerSecond,
  height,
  offsetLeft = 0
}: TimelinePlayheadProps) {
  const left = offsetLeft + timeToPx(currentTime, pxPerSecond);
  return (
    <div
      className="tl-playhead"
      style={{ left: `${left}px`, height: `${height}px` }}
      aria-hidden
    >
      <div className="tl-playhead-head" />
      <div className="tl-playhead-line" />
    </div>
  );
}
