import { useMemo } from 'react';
import { chooseTickInterval, formatTimecode } from '../../core/timeline/clips';

interface TimelineRulerProps {
  duration: number;
  pxPerSecond: number;
  /** Left edge of the visible lane viewport, in lane pixels. */
  visibleStartPx?: number;
  /** Visible viewport width, in pixels. */
  visibleWidthPx?: number;
}

/**
 * Renders ticks only inside the visible lane viewport (plus overscan), so a
 * 95-minute timeline doesn't mount tens of thousands of tick nodes at once.
 * The outer div still spans the full lane width so scroll geometry is intact.
 */
export function TimelineRuler({
  duration,
  pxPerSecond,
  visibleStartPx,
  visibleWidthPx
}: TimelineRulerProps) {
  const totalWidth = Math.max(duration, 1) * pxPerSecond;

  const ticks = useMemo(() => {
    const interval = chooseTickInterval(pxPerSecond);
    const minor = interval / 5;
    const total = Math.max(duration, 1);

    // Window the ticks: only generate the ones in the visible range + overscan.
    // Fallback to the whole timeline when no viewport metrics are supplied.
    const haveViewport = visibleStartPx != null && visibleWidthPx != null && visibleWidthPx > 0;
    const overscanPx = haveViewport ? Math.max(400, visibleWidthPx * 0.5) : 0;
    const startPx = haveViewport ? Math.max(0, visibleStartPx - overscanPx) : 0;
    const endPx = haveViewport
      ? Math.min(totalWidth, visibleStartPx + visibleWidthPx + overscanPx)
      : totalWidth;
    const startTime = pxPerSecond > 0 ? startPx / pxPerSecond : 0;
    const endTime = pxPerSecond > 0 ? endPx / pxPerSecond : total;

    const firstTickIndex = Math.max(0, Math.floor(startTime / minor));
    const lastTickIndex = Math.min(
      Math.ceil(total / minor),
      Math.ceil(endTime / minor)
    );

    const result: { time: number; major: boolean }[] = [];
    for (let i = firstTickIndex; i <= lastTickIndex; i += 1) {
      const t = i * minor;
      if (t > total + 0.0001) break;
      const rounded = Math.round(t * 1000) / 1000;
      const isMajor = Math.abs((rounded % interval)) < 0.0001
        || Math.abs((rounded % interval) - interval) < 0.0001;
      result.push({ time: rounded, major: isMajor });
    }
    return result;
  }, [duration, pxPerSecond, totalWidth, visibleStartPx, visibleWidthPx]);

  return (
    <div className="tl-ruler" style={{ width: `${totalWidth}px` }}>
      {ticks.map((tick, idx) => (
        <div
          key={`${tick.time}-${idx}`}
          className={`tl-ruler-tick ${tick.major ? 'major' : 'minor'}`}
          style={{ left: `${tick.time * pxPerSecond}px` }}
        >
          {tick.major && (
            <span className="tl-ruler-label">{formatTimecode(tick.time)}</span>
          )}
        </div>
      ))}
    </div>
  );
}
