import { useEffect, useMemo, useRef, useState } from 'react';
import type { LyricClip } from '../../core/types/clip';
import type { LyricLayer } from '../../core/types/layer';
import type { LyricProjectMode, LyricSource } from '../../core/types/project';
import type { TapSyncLine } from '../../core/timeline/tapSync';
import { isTapSyncLinePublished } from '../../core/timeline/tapSync';
import { FloatingPanel } from '../../shared/components/FloatingPanel';
import type { UseTapSyncResult } from './useTapSync';
import './TapSyncPanel.css';

const SPEED_OPTIONS = [0.5, 0.75, 1] as const;
const STORAGE_KEY = 'lyrixa_sync_panel_pos';
const WIDTH_KEY = 'lyrixa_sync_panel_width';
const MIN_WIDTH = 360;
const MAX_WIDTH = 860;

interface TapSyncPanelProps {
  clips: LyricClip[];
  lines: TapSyncLine[];
  layers: LyricLayer[];
  layerId: string | null;
  layerName: string;
  /** All lyric sources stored in the project. */
  sources: LyricSource[];
  /** Currently selected source; null = stream every source in order. */
  sourceId: string | null;
  lyricMode: LyricProjectMode;
  isPlaying: boolean;
  playbackTime: number;
  speed: number;
  sync: UseTapSyncResult;
  onPlayToggle: () => void;
  onSeek: (time: number) => void;
  onSpeedChange: (speed: number) => void;
  onLayerChange: (layerId: string) => void;
  onSourceChange: (sourceId: string | null) => void;
  onRestart: () => void;
  onClose: () => void;
  /** Mobile tier: dock the panel as a full-width bottom sheet. */
  docked?: boolean;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0.00s';
  if (seconds < 10) return `${seconds.toFixed(2)}s`;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  return formatTime(seconds);
}

function readStoredWidth(): number {
  try {
    const raw = Number(localStorage.getItem(WIDTH_KEY));
    if (Number.isFinite(raw) && raw >= MIN_WIDTH) return Math.min(MAX_WIDTH, raw);
  } catch { /* ignore */ }
  return 460;
}

export function TapSyncPanel({
  clips,
  lines,
  layers,
  layerId,
  layerName,
  sources,
  sourceId,
  lyricMode,
  isPlaying,
  playbackTime,
  speed,
  sync,
  onPlayToggle,
  onSeek,
  onSpeedChange,
  onLayerChange,
  onSourceChange,
  onRestart,
  onClose,
  docked = false
}: TapSyncPanelProps) {
  const publishedBySourceId = useMemo(
    () => new Map(
      clips
        .filter(clip => clip.layerId === layerId && clip.sourceId)
        .map(clip => [clip.sourceId!, clip])
    ),
    [clips, layerId]
  );

  const [width, setWidth] = useState(readStoredWidth);
  const activeRef = useRef<HTMLButtonElement>(null);
  const activePointerIdRef = useRef<number | null>(null);

  const setWidthClamped = (next: number) => {
    const w = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, next));
    setWidth(w);
    try { localStorage.setItem(WIDTH_KEY, String(w)); } catch { /* ignore */ }
  };

  // Keep the line about to be tapped in view.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [sync.cursorIndex]);

  const { cursorIndex, total, done, canUndo, isHolding } = sync;
  const current = lines[cursorIndex];
  const nextUp = lines[cursorIndex + 1];
  const doneCount = useMemo(
    () => layerId
      ? lines.filter(line => isTapSyncLinePublished(clips, layerId, line)).length
      : 0,
    [clips, layerId, lines]
  );
  const pendingCount = Math.max(0, total - doneCount);
  const seekRelative = (delta: number) => {
    onSeek(Math.max(0, playbackTime + delta));
  };

  // Pointer-based hold so mouse users get the same press-and-release timing.
  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (done || total === 0) return;
    if (activePointerIdRef.current !== null) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.blur();
    activePointerIdRef.current = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch { /* Some browsers can reject capture after cancellation. */ }
    sync.holdStart();
  };
  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (activePointerIdRef.current !== e.pointerId) return;
    e.preventDefault();
    activePointerIdRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch { /* ignore */ }
    sync.holdEnd();
  };
  const handlePointerCancel = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (activePointerIdRef.current !== e.pointerId) return;
    activePointerIdRef.current = null;
    sync.holdEnd();
  };

  return (
    <FloatingPanel
      storageKey={STORAGE_KEY}
      width={width}
      variant={docked ? 'sheet' : 'floating'}
      defaultPosition={{ x: 24, y: 96 }}
      title={`◉ Sync · ${layerName}`}
      allowFullscreen
      edgeTabLabel="Sync"
      headerActions={
        <>
          <span className="tapsync-progress">{Math.min(cursorIndex, total)} / {total}</span>
          {!docked && (
            <>
              <button className="fp-btn" onClick={() => setWidthClamped(width - 80)} title="Narrower">-</button>
              <button className="fp-btn" onClick={() => setWidthClamped(width + 80)} title="Wider">+</button>
            </>
          )}
        </>
      }
      onClose={onClose}
    >
      <div className="tapsync-body">
        <button
          className={`tapsync-tap ${done ? 'is-done' : ''} ${isHolding ? 'is-holding' : ''}`}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onLostPointerCapture={handlePointerCancel}
          onContextMenu={(e) => e.preventDefault()}
          disabled={done || total === 0}
        >
          <span className="tapsync-tap-key">{isHolding ? 'Release to end line' : 'Hold touch / Space'}</span>
          <span className="tapsync-tap-line">
            {done ? '✓ All lines timed' : current ? current.text || '— (blank line) —' : 'Import lyrics first'}
          </span>
          {!done && nextUp && (
            <span className="tapsync-tap-next">next: {nextUp.text || '— blank —'}</span>
          )}
        </button>

        <label className="tapsync-layer">
          <span>Target layer</span>
          <select
            value={layerId ?? ''}
            onChange={(e) => {
              onLayerChange(e.target.value);
              e.currentTarget.blur();
            }}
            disabled={isHolding}
          >
            {layers.map(layer => (
              <option key={layer.id} value={layer.id}>{layer.name}</option>
            ))}
          </select>
        </label>

        {lyricMode === 'multi' && sources.length > 1 && (
          <label className="tapsync-layer">
            <span>Lyric source</span>
            <select
              value={sourceId ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                onSourceChange(v === '' ? null : v);
                e.currentTarget.blur();
              }}
              disabled={isHolding}
              title="Pick which lyric source you want to time onto the selected layer"
            >
              <option value="">All sources (in order)</option>
              {sources.map(source => (
                <option key={source.id} value={source.id}>{source.title}</option>
              ))}
            </select>
          </label>
        )}

        <div className="tapsync-status" aria-label="Sync status">
          <span>Layer <strong>{layerName}</strong></span>
          <span>Paragraph <strong>{total > 0 ? Math.min(cursorIndex + 1, total) : 0}/{total}</strong></span>
          <span>Done <strong>{doneCount}</strong></span>
          <span>Pending <strong>{pendingCount}</strong></span>
          <span>Holding <strong>{isHolding ? 'yes' : 'no'}</strong></span>
          <span>Last clip <strong>{sync.lastCreatedClipId ?? 'none'}</strong></span>
          <span>Committed <strong>{sync.lastCommittedTime == null ? 'none' : formatTime(sync.lastCommittedTime)}</strong></span>
        </div>

        <div className="tapsync-controls">
          <button className="tapsync-btn primary" onClick={onPlayToggle} title="Play / pause (P)">
            {isPlaying ? '❚❚ Pause' : '▶ Play'}
          </button>
          <span className="tapsync-clock mono">{formatTime(playbackTime)}</span>
          <button className="tapsync-btn" onClick={sync.undo} disabled={!canUndo} title="Undo last line (Backspace)">↶ Undo</button>
          <button className="tapsync-btn" onClick={sync.stepBack} disabled={cursorIndex === 0} title="Re-time the previous line (Shift+←)">◀ Back</button>
          <div className="tapsync-nudge" title="Shift all timings on this layer">
            <span>Offset</span>
            <button className="tapsync-btn icon" onClick={() => sync.nudge(-0.05)} title="Nudge earlier (←)">−</button>
            <button className="tapsync-btn icon" onClick={() => sync.nudge(0.05)} title="Nudge later (→)">+</button>
          </div>
          <button
            className="tapsync-btn ghost"
            onClick={() => {
              const confirmed = window.confirm(
                `Clear every clip from "${layerName}"? This cannot be undone unless you exported the project.`
              );
              if (confirmed) onRestart();
            }}
            title="Clear only the selected layer and tap from the first line"
          >
            Clear layer
          </button>
        </div>

        <div className="tapsync-seek-strip" aria-label="Quick seek controls">
          <button className="tapsync-btn small" onClick={() => seekRelative(-5)} title="Go back 5 seconds">-5s</button>
          <button className="tapsync-btn small" onClick={() => seekRelative(-3)} title="Go back 3 seconds">-3s</button>
          <button className="tapsync-btn small" onClick={() => seekRelative(-1)} title="Go back 1 second">-1s</button>
          <span className="tapsync-seek-time mono">{formatTime(playbackTime)}</span>
          <button className="tapsync-btn small" onClick={() => seekRelative(1)} title="Go forward 1 second">+1s</button>
          <button className="tapsync-btn small" onClick={() => seekRelative(3)} title="Go forward 3 seconds">+3s</button>
          <button className="tapsync-btn small" onClick={() => seekRelative(5)} title="Go forward 5 seconds">+5s</button>
        </div>

        <div className="tapsync-speed" title="Slow the song down so fast lines are easier to time precisely">
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

        <div className="tapsync-list">
          {lines.length === 0 && (
            <div className="tapsync-empty">No lyric source lines found. Import lyrics, then come back to sync.</div>
          )}
          {lines.map((line, idx) => {
            const isPublished = !!layerId && isTapSyncLinePublished(clips, layerId, line);
            const state =
              isPublished
                ? 'done'
                : idx === cursorIndex
                  ? 'active'
                  : 'pending';
            const published = publishedBySourceId.get(line.sourceId);
            const duration = published ? Math.max(0, published.endTime - published.startTime) : 0;
            const hasTiming = !!published && !published.muted && published.text.trim().length > 0 && duration > 0;
            const timingLabel = hasTiming ? formatDuration(duration) : '·';
            return (
              <button
                key={line.sourceId}
                ref={idx === cursorIndex ? activeRef : undefined}
                className={`tapsync-row ${state}`}
                onClick={() => published && onSeek(published.startTime)}
                title={hasTiming
                  ? `Jump playback to this line (${formatTime(published.startTime)} - ${formatTime(published.endTime)})`
                  : 'Jump playback to this line'}
              >
                <span className="tapsync-row-index">{idx + 1}</span>
                <span className="tapsync-row-text">{line.text || '— blank —'}</span>
                <span className="tapsync-row-time mono">{timingLabel}</span>
              </button>
            );
          })}
        </div>

        <p className="tapsync-hint">
          <kbd>Hold Space</kbd> while a line is sung, release at its end · <kbd>P</kbd> play/pause · <kbd>Backspace</kbd> undo · <kbd>←</kbd>/<kbd>→</kbd> nudge all
        </p>
      </div>
    </FloatingPanel>
  );
}
