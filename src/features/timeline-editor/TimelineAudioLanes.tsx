import type { MouseEvent } from 'react';
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
  vocalsHeight: number;
  waveformView: 'master' | 'vocals' | 'both';
  bandMode: AudioBandMode;
  bandPeaksSource: 'master' | 'vocals-stem' | 'estimated';
  bandPeaksLoading: boolean;
  masterChannel?: AudioChannel | null;
  vocalsChannel?: AudioChannel | null;
  displayPeaks?: AudioPeak[];
  bandPeaks: AudioPeak[] | null;
  masterIsMock: boolean;
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

export function TimelineAudioLanes({
  duration,
  pxPerSecond,
  laneWidth,
  rulerHeight,
  masterHeight,
  vocalsHeight,
  waveformView,
  bandMode,
  bandPeaksSource,
  bandPeaksLoading,
  masterChannel,
  vocalsChannel,
  displayPeaks,
  bandPeaks,
  masterIsMock,
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

      {(waveformView === 'master' || waveformView === 'both') && (
        <TimelineAudioTrack
          title="Master track"
          color={BAND_MODE_COLORS[bandMode]}
          duration={duration}
          pxPerSecond={pxPerSecond}
          height={masterHeight}
          peaks={displayPeaks}
          badge={getBandBadge(bandMode, bandPeaksSource, bandPeaksLoading, !!masterChannel?.fileName)}
          mockFallback={masterIsMock && !bandPeaks && !bandPeaksLoading}
          onLaneClick={onLaneClick}
        />
      )}

      {vocalsChannel && (waveformView === 'vocals' || waveformView === 'both') && (
        <TimelineAudioTrack
          title="Vocals stem"
          color="#5fc88e"
          duration={duration}
          pxPerSecond={pxPerSecond}
          height={vocalsHeight}
          peaks={vocalsChannel.waveformPeaks}
          vocalActivity={vocalsChannel.vocalActivity}
          badge={
            vocalsChannel.vocalActivity?.length
              ? `${vocalsChannel.vocalActivity.length} vocal segments`
              : 'analyzing...'
          }
          mockFallback={!vocalsChannel.waveformPeaks?.length}
          onLaneClick={onLaneClick}
        />
      )}
    </>
  );
}

function getBandBadge(
  mode: AudioBandMode,
  source: 'master' | 'vocals-stem' | 'estimated',
  loading: boolean,
  hasMasterFile: boolean
): string | undefined {
  if (loading) return 'analyzing...';
  switch (mode) {
    case 'auto':
    case 'full-mix':
      return hasMasterFile ? undefined : 'mock';
    case 'vocals':
      return source === 'vocals-stem' ? 'Vocals Stem' : 'Est. Vocals';
    case 'instrumental':
      return source === 'master' ? 'Instrumental ≈' : 'Est. Instrumental';
    case 'bass': return 'Bass Band';
    case 'kick': return 'Kick Band';
    case 'hihat': return 'Hi-Hat Band';
  }
}
