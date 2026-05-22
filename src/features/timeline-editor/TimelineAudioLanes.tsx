import { memo, type MouseEvent } from 'react';
import type { AudioBandMode, AudioChannel, AudioPeak } from '../../core/types/audio';
import { TimelineAudioTrack } from './TimelineAudioTrack';
import { TimelineRuler } from './TimelineRuler';
import { TimelineTrackHeader } from './TimelineTrackHeader';

interface TimelineAudioLanesProps {
  duration: number;
  pxPerSecond: number;
  laneWidth: number;
  rulerHeight: number;
  masterHeight: number;
  bandMode: AudioBandMode;
  bandPeaksLoading: boolean;
  masterChannel?: AudioChannel | null;
  waveformEnabled: boolean;
  displayPeaks?: AudioPeak[];
  bandPeaks: AudioPeak[] | null;
  masterIsMock: boolean;
  visibleStartPx: number;
  visibleWidthPx: number;
  onRulerClick: (e: MouseEvent<HTMLDivElement>) => void;
  onLaneClick: (e: MouseEvent) => void;
}

const BAND_MODE_COLORS: Record<AudioBandMode, string> = {
  'auto': '#53c2f0',
  'full-mix': '#53c2f0',
  'vocals': '#5fc88e',
  'instrumental': '#e6a86a',
  'bass': '#e65e8f',
  'kick': '#e55252',
  'hihat': '#a88ee6'
};

export const TimelineAudioLanes = memo(function TimelineAudioLanes({
  duration,
  pxPerSecond,
  laneWidth,
  rulerHeight,
  masterHeight,
  bandMode,
  bandPeaksLoading,
  masterChannel,
  waveformEnabled,
  displayPeaks,
  bandPeaks,
  masterIsMock,
  visibleStartPx,
  visibleWidthPx,
  onRulerClick,
  onLaneClick
}: TimelineAudioLanesProps) {
  return (
    <>
      <div className="tl-track tl-ruler-row" style={{ height: `${rulerHeight}px` }}>
        <TimelineTrackHeader title="Time" variant="thin" />
        <div
          className="tl-ruler-wrap"
          style={{ width: `${laneWidth}px`, height: `${rulerHeight}px` }}
          onClick={onRulerClick}
        >
          <TimelineRuler duration={duration} pxPerSecond={pxPerSecond} />
        </div>
      </div>

      <TimelineAudioTrack
        title="Master track"
        color={BAND_MODE_COLORS[bandMode]}
        duration={duration}
        pxPerSecond={pxPerSecond}
        height={masterHeight}
        peaks={displayPeaks}
        badge={waveformEnabled ? getBandBadge(bandMode, bandPeaksLoading, !!masterChannel?.fileName) : 'waveform off'}
        mockFallback={masterIsMock && !bandPeaks && !bandPeaksLoading}
        showWaveform={waveformEnabled}
        visibleStartPx={visibleStartPx}
        visibleWidthPx={visibleWidthPx}
        onLaneClick={onLaneClick}
      />
    </>
  );
});

function getBandBadge(
  mode: AudioBandMode,
  loading: boolean,
  hasMasterFile: boolean
): string | undefined {
  if (loading) return 'analyzing...';
  switch (mode) {
    case 'auto':
    case 'full-mix':
      return hasMasterFile ? undefined : 'mock';
    case 'vocals': return 'Vocals Band ≈';
    case 'instrumental': return 'Instrumental Band ≈';
    case 'bass': return 'Bass Band';
    case 'kick': return 'Kick Band';
    case 'hihat': return 'Hi-Hat Band';
  }
}
