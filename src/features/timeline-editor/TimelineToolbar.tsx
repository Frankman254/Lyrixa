import type { AudioBandMode, AudioChannel } from '../../core/types/audio';
import { formatTimecode } from '../../core/timeline/clips';

interface TimelineToolbarProps {
  embedded: boolean;
  trackName: string;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  pxPerSecond: number;
  masterChannel?: AudioChannel | null;
  vocalsChannel?: AudioChannel | null;
  bandMode: AudioBandMode;
  waveformView: 'master' | 'vocals' | 'both';
  snapSeconds: number;
  onPlayToggle: () => void;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onBandModeChange: (mode: AudioBandMode) => void;
  onWaveformViewChange: (view: 'master' | 'vocals' | 'both') => void;
  onSnapSecondsChange: (seconds: number) => void;
  onExit?: () => void;
}

export function TimelineToolbar({
  embedded,
  trackName,
  currentTime,
  duration,
  isPlaying,
  pxPerSecond,
  masterChannel,
  vocalsChannel,
  bandMode,
  waveformView,
  snapSeconds,
  onPlayToggle,
  onZoomOut,
  onZoomIn,
  onBandModeChange,
  onWaveformViewChange,
  onSnapSecondsChange,
  onExit
}: TimelineToolbarProps) {
  return (
    <header className="tl-topbar">
      {!embedded && (
        <div className="tl-topbar-left">
          <h2>Timeline Editor</h2>
          <span className="tl-track-chip">{trackName}</span>
        </div>
      )}
      <div className="tl-topbar-center">
        <span className="tl-time">{formatTimecode(currentTime, true)}</span>
        <span className="tl-time-sep">/</span>
        <span className="tl-time muted">{formatTimecode(duration)}</span>
      </div>
      <div className="tl-topbar-right">
        <button
          className={`tl-btn tl-play-btn ${isPlaying ? 'active' : ''}`}
          onClick={onPlayToggle}
          title="Play / Pause  (Space)"
        >
          {isPlaying ? '⏸' : '▶'}
        </button>
        <div className="tl-zoom">
          <button className="tl-btn small" onClick={onZoomOut} title="Zoom out">−</button>
          <span className="tl-zoom-value">{Math.round(pxPerSecond)} px/s</span>
          <button className="tl-btn small" onClick={onZoomIn} title="Zoom in">+</button>
        </div>
        {masterChannel && (
          <label className="tl-snap">
            Band
            <select
              value={bandMode}
              onChange={(e) => onBandModeChange(e.target.value as AudioBandMode)}
              title="Waveform band mode — which frequency range to emphasize in the master lane"
            >
              <option value="auto">Auto</option>
              <option value="full-mix">Full Mix</option>
              <option value="vocals">Vocals</option>
              <option value="instrumental">Instrumental</option>
              <option value="bass">Bass</option>
              <option value="kick">Kick</option>
              <option value="hihat">Hi-Hat</option>
            </select>
          </label>
        )}
        {(masterChannel || vocalsChannel) && (
          <label className="tl-snap">
            Waves
            <select
              value={waveformView}
              onChange={(e) => onWaveformViewChange(e.target.value as 'master' | 'vocals' | 'both')}
              title="Which waveform rows to show"
            >
              <option value="both">Both</option>
              <option value="master">Master</option>
              {vocalsChannel && <option value="vocals">Vocals</option>}
            </select>
          </label>
        )}
        <label className="tl-snap">
          Snap
          <select
            value={snapSeconds}
            onChange={(e) => onSnapSecondsChange(parseFloat(e.target.value))}
          >
            <option value={0}>Off</option>
            <option value={0.1}>0.1s</option>
            <option value={0.25}>0.25s</option>
            <option value={0.5}>0.5s</option>
            <option value={1}>1s</option>
          </select>
        </label>
        {onExit && (
          <button className="tl-btn danger" onClick={onExit}>✕ Exit</button>
        )}
      </div>
    </header>
  );
}
