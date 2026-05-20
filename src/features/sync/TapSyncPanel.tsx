import { useEffect, useMemo, useRef } from 'react';
import type { LyricClip } from '../../core/types/clip';
import { orderedLayerClips } from '../../core/timeline/tapSync';
import type { UseTapSyncResult } from './useTapSync';
import './TapSyncPanel.css';

const SPEED_OPTIONS = [0.5, 0.75, 1] as const;

interface TapSyncPanelProps {
  clips: LyricClip[];
  layerId: string | null;
  layerName: string;
  isPlaying: boolean;
  playbackTime: number;
  speed: number;
  sync: UseTapSyncResult;
  onPlayToggle: () => void;
  onSeek: (time: number) => void;
  onSpeedChange: (speed: number) => void;
  onRestart: () => void;
  onClose: () => void;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function TapSyncPanel({
  clips,
  layerId,
  layerName,
  isPlaying,
  playbackTime,
  speed,
  sync,
  onPlayToggle,
  onSeek,
  onSpeedChange,
  onRestart,
  onClose
}: TapSyncPanelProps) {
  const lines = useMemo(
    () => (layerId ? orderedLayerClips(clips, layerId) : []),
    [clips, layerId]
  );

  const listRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  // Keep the line about to be tapped in view.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [sync.cursorIndex]);

  const { cursorIndex, total, done, canUndo } = sync;
  const current = lines[cursorIndex];
  const nextUp = lines[cursorIndex + 1];

  return (
    <div className="tapsync" role="dialog" aria-label="Tap to sync">
      <header className="tapsync-head">
        <div className="tapsync-title">
          <span className="tapsync-badge">SYNC</span>
          <span className="tapsync-layer" title="Target layer">{layerName}</span>
        </div>
        <div className="tapsync-progress">{Math.min(cursorIndex, total)} / {total}</div>
        <button className="tapsync-close" onClick={onClose} aria-label="Exit sync mode">✕</button>
      </header>

      <div className="tapsync-stage">
        <button
          className={`tapsync-tap ${done ? 'is-done' : ''}`}
          onClick={sync.tap}
          disabled={done || total === 0}
        >
          <span className="tapsync-tap-key">Space</span>
          <span className="tapsync-tap-line">
            {done ? '✓ All lines timed' : current ? current.text || '— (blank line) —' : 'Import lyrics first'}
          </span>
          {!done && nextUp && (
            <span className="tapsync-tap-next">next: {nextUp.text || '— blank —'}</span>
          )}
        </button>
      </div>

      <div className="tapsync-controls">
        <button className="tapsync-btn primary" onClick={onPlayToggle} title="Play / pause (P)">
          {isPlaying ? '❚❚ Pause' : '▶ Play'}
        </button>
        <span className="tapsync-clock mono">{formatTime(playbackTime)}</span>
        <button className="tapsync-btn" onClick={sync.undo} disabled={!canUndo} title="Undo last tap (Backspace)">↶ Undo</button>
        <button className="tapsync-btn" onClick={sync.stepBack} disabled={cursorIndex === 0} title="Re-time the previous line (Shift+←)">◀ Back</button>
        <div className="tapsync-nudge" title="Shift all timings on this layer">
          <span>Offset</span>
          <button className="tapsync-btn icon" onClick={() => sync.nudge(-0.05)} title="Nudge earlier (←)">−</button>
          <button className="tapsync-btn icon" onClick={() => sync.nudge(0.05)} title="Nudge later (→)">+</button>
        </div>
        <button className="tapsync-btn ghost" onClick={onRestart} title="Clear this layer and tap from the first line">↻ Restart</button>
      </div>

      <div className="tapsync-speed" title="Slow the song down so fast lines are easier to tap precisely">
        <span>Speed</span>
        {SPEED_OPTIONS.map(opt => (
          <button
            key={opt}
            className={`tapsync-btn small ${speed === opt ? 'active' : ''}`}
            onClick={() => onSpeedChange(opt)}
          >
            {opt}×
          </button>
        ))}
      </div>

      <div className="tapsync-list" ref={listRef}>
        {lines.length === 0 && (
          <div className="tapsync-empty">No lyric clips on this layer. Import lyrics, then come back to sync.</div>
        )}
        {lines.map((line, idx) => {
          const state =
            idx < cursorIndex ? 'done' : idx === cursorIndex ? 'active' : 'pending';
          return (
            <button
              key={line.id}
              ref={idx === cursorIndex ? activeRef : undefined}
              className={`tapsync-row ${state}`}
              onClick={() => onSeek(line.startTime)}
              title="Jump playback to this line"
            >
              <span className="tapsync-row-index">{idx + 1}</span>
              <span className="tapsync-row-text">{line.text || '— blank —'}</span>
              <span className="tapsync-row-time mono">{idx < cursorIndex ? formatTime(line.startTime) : '·'}</span>
            </button>
          );
        })}
      </div>

      <p className="tapsync-hint">
        Press <kbd>Space</kbd> on every line as it's sung · <kbd>P</kbd> play/pause · <kbd>Backspace</kbd> undo · <kbd>←</kbd>/<kbd>→</kbd> nudge all
      </p>
    </div>
  );
}
