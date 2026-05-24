import { useState } from 'react';
import type { AudioBandMode, AudioChannel } from '../../core/types/audio';
import { formatTimecode } from '../../core/timeline/clips';

interface TimelineToolbarProps {
  embedded: boolean;
  trackName: string;
  currentTime: number;
  duration: number;
  pxPerSecond: number;
  masterChannel?: AudioChannel | null;
  bandMode: AudioBandMode;
  /** When true, band-pass extraction is disabled because the file is too long. */
  bandModeDisabled?: boolean;
  snapSeconds: number;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onFitSong: () => void;
  onFitSelection: () => void;
  onCenterPlayhead: () => void;
  fitSelectionEnabled: boolean;
  onBandModeChange: (mode: AudioBandMode) => void;
  onSnapSecondsChange: (seconds: number) => void;
  onExit?: () => void;
}

export function TimelineToolbar({
  embedded,
  trackName,
  currentTime,
  duration,
  pxPerSecond,
  masterChannel,
  bandMode,
  bandModeDisabled = false,
  snapSeconds,
  onZoomOut,
  onZoomIn,
  onFitSong,
  onFitSelection,
  onCenterPlayhead,
  fitSelectionEnabled,
  onBandModeChange,
  onSnapSecondsChange,
  onExit
}: TimelineToolbarProps) {
  // px/s, Fit sel, Band and Snap live inside an Advanced toggle so the basic
  // bar only carries the everyday actions (Play, Fit song, Center).
  const [advancedOpen, setAdvancedOpen] = useState(false);

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
        <div className="tl-zoom">
          <button className="tl-btn small" onClick={onZoomOut} title="Zoom out">−</button>
          <button className="tl-btn small" onClick={onZoomIn} title="Zoom in">+</button>
          <button
            className="tl-btn small"
            onClick={onFitSong}
            title="Fit the entire song into the visible timeline width"
          >
            Fit song
          </button>
          <button
            className="tl-btn small"
            onClick={onCenterPlayhead}
            title="Scroll the timeline so the playhead is centered"
          >
            Center
          </button>
        </div>
        <button
          type="button"
          className={`tl-btn small ghost ${advancedOpen ? 'active' : ''}`}
          onClick={() => setAdvancedOpen(open => !open)}
          title="Show / hide px/s, fit selection, band mode and snap"
        >
          {advancedOpen ? 'Advanced ▴' : 'Advanced ▾'}
        </button>
        {advancedOpen && (
          <>
            <span className="tl-zoom-value">{Math.round(pxPerSecond)} px/s</span>
            <button
              className="tl-btn small"
              onClick={onFitSelection}
              disabled={!fitSelectionEnabled}
              title={fitSelectionEnabled
                ? 'Zoom to fit the current clip selection'
                : 'Select one or more clips to enable fit-to-selection'}
            >
              Fit sel
            </button>
            {masterChannel && (
              <label className="tl-snap">
                Band
                <select
                  value={bandModeDisabled ? 'auto' : bandMode}
                  onChange={(e) => onBandModeChange(e.target.value as AudioBandMode)}
                  disabled={bandModeDisabled}
                  title={bandModeDisabled
                    ? 'Band analysis disabled for long audio (>30 min). Switch to a shorter master to enable it.'
                    : 'Waveform band mode — which frequency range to emphasize in the master lane'}
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
          </>
        )}
        {onExit && (
          <button className="tl-btn danger" onClick={onExit}>✕ Exit</button>
        )}
      </div>
    </header>
  );
}
