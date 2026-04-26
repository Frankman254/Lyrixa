import { useMemo } from 'react';
import type { MouseEventHandler, ReactNode } from 'react';
import type { AudioPeak, VocalActivitySegment } from '../../core/types/audio';
import { AudioWaveformTrack } from './AudioWaveformTrack';
import { TimelineTrackHeader } from './TimelineTrackHeader';

interface TimelineAudioTrackProps {
  title: string;
  color: string;
  duration: number;
  pxPerSecond: number;
  height: number;
  peaks?: AudioPeak[];
  /** Drawn as soft highlights over the waveform. Omit when no analysis exists. */
  vocalActivity?: VocalActivitySegment[];
  badge?: string;
  /** Header action buttons (Replace, Remove, etc.). */
  actions?: ReactNode;
  /** True when no real decoded peaks exist and the waveform is the mock fallback. */
  mockFallback?: boolean;
  /** Click handler for the waveform lane — used for timeline seek. */
  onLaneClick?: MouseEventHandler<HTMLDivElement>;
}

/**
 * One audio row inside the timeline. Uses the shared TimelineTrackHeader so
 * the lane area aligns with lyric clip lanes.
 */
export function TimelineAudioTrack({
  title,
  color,
  duration,
  pxPerSecond,
  height,
  peaks,
  vocalActivity,
  badge,
  actions,
  mockFallback,
  onLaneClick
}: TimelineAudioTrackProps) {
  const totalWidth = Math.max(duration, 1) * pxPerSecond;

  const overlay = useMemo(() => {
    if (!vocalActivity || vocalActivity.length === 0) return null;
    return vocalActivity.map((seg, i) => {
      const left = seg.startTime * pxPerSecond;
      const width = Math.max(2, (seg.endTime - seg.startTime) * pxPerSecond);
      const opacity = 0.18 + Math.min(0.5, seg.energy);
      return (
        <div
          key={i}
          className="tl-vocal-band"
          style={{ left, width, background: `rgba(95, 200, 142, ${opacity.toFixed(3)})` }}
          title={`Vocal segment ${i + 1}`}
        />
      );
    });
  }, [vocalActivity, pxPerSecond]);

  return (
    <div className="tl-track tl-audio-track">
      <TimelineTrackHeader
        title={title}
        color={color}
        badge={badge ?? (mockFallback ? 'mock' : undefined)}
        actions={actions}
        variant="audio"
      />
      <div
        className={`tl-track-lane tl-audio-lane${onLaneClick ? ' tl-audio-lane--seekable' : ''}`}
        style={{ width: `${totalWidth}px`, height: `${height}px` }}
        onClick={onLaneClick}
      >
        <AudioWaveformTrack
          duration={duration}
          pxPerSecond={pxPerSecond}
          peaks={peaks}
          height={height}
          color={color}
          seed={title}
        />
        {overlay && <div className="tl-vocal-bands">{overlay}</div>}
      </div>
    </div>
  );
}
