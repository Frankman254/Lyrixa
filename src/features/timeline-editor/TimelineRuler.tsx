import { useMemo } from 'react';
import { chooseTickInterval, formatTimecode } from '../../core/timeline/clips';

interface TimelineRulerProps {
  duration: number;
  pxPerSecond: number;
}

export function TimelineRuler({ duration, pxPerSecond }: TimelineRulerProps) {
  const ticks = useMemo(() => {
    const interval = chooseTickInterval(pxPerSecond);
    const minor = interval / 5;
    const result: { time: number; major: boolean }[] = [];
    const total = Math.max(duration, 1);
    for (let t = 0; t <= total + 0.0001; t += minor) {
      const rounded = Math.round(t * 1000) / 1000;
      const isMajor = Math.abs((rounded % interval)) < 0.0001
        || Math.abs((rounded % interval) - interval) < 0.0001;
      result.push({ time: rounded, major: isMajor });
    }
    return result;
  }, [duration, pxPerSecond]);

  const totalWidth = Math.max(duration, 1) * pxPerSecond;

  return (
    <div className="tl-ruler" style={{ width: `${totalWidth}px` }}>
      {ticks.map((tick, idx) => (
        <div
          key={idx}
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
