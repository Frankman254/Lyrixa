import { timeToPx } from '../../core/timeline/clips';

interface TimelinePlayheadProps {
  currentTime: number;
  pxPerSecond: number;
  height: number;
}

export function TimelinePlayhead({ currentTime, pxPerSecond, height }: TimelinePlayheadProps) {
  const left = timeToPx(currentTime, pxPerSecond);
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
