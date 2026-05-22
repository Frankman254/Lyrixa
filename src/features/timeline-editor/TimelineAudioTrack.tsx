import { memo, type MouseEventHandler, type ReactNode } from 'react';
import type { AudioPeak } from '../../core/types/audio';
import { AudioWaveformTrack } from './AudioWaveformTrack';
import { TimelineTrackHeader } from './TimelineTrackHeader';

interface TimelineAudioTrackProps {
  title: string;
  color: string;
  duration: number;
  pxPerSecond: number;
  height: number;
  peaks?: AudioPeak[];
  badge?: string;
  /** Header action buttons (Replace, Remove, etc.). */
  actions?: ReactNode;
  /** True when no real decoded peaks exist and the waveform is the mock fallback. */
  mockFallback?: boolean;
  /** Click handler for the waveform lane — used for timeline seek. */
  onLaneClick?: MouseEventHandler<HTMLDivElement>;
  visibleStartPx?: number;
  visibleWidthPx?: number;
}

/**
 * One audio row inside the timeline. Uses the shared TimelineTrackHeader so
 * the lane area aligns with lyric clip lanes.
 */
export const TimelineAudioTrack = memo(function TimelineAudioTrack({
  title,
  color,
  duration,
  pxPerSecond,
  height,
  peaks,
  badge,
  actions,
  mockFallback,
  onLaneClick,
  visibleStartPx,
  visibleWidthPx
}: TimelineAudioTrackProps) {
  const totalWidth = Math.max(duration, 1) * pxPerSecond;

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
          visibleStartPx={visibleStartPx}
          visibleWidthPx={visibleWidthPx}
        />
      </div>
    </div>
  );
});
