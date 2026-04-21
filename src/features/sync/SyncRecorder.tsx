import { useEffect, useCallback, useState, useMemo } from 'react';
import type { SyncSession } from '../../core/types/sync';
import type { TimelineSnapshot, TimelineEntry } from '../../core/types/timeline';
import type { LyricLine } from '../../core/types/lyrics';
import type { LyricVisualStyle } from '../../core/types/render';
import { createTimelineEntries, computeTimelineSnapshot } from '../../core/timeline/engine';
import { LyricsRenderer } from '../lyrics-view/LyricsRenderer';
import { AudioSpectrum } from './AudioSpectrum';
import { TrackTimeline } from '../../shared/components/TrackTimeline';
import './SyncRecorder.css';

interface SyncRecorderProps {
  session: SyncSession;
  audioTime: number;
  duration: number;
  isPlaying: boolean;
  styleConfig: LyricVisualStyle;
  analyser: AnalyserNode | null;
  onPlayToggle: () => void;
  onStampLine: (time: number) => void;
  onUndoLast: () => void;
  onSeek: (time: number) => void;
  onExitSync: () => void;
}

export function SyncRecorder({
  session,
  audioTime,
  duration,
  isPlaying,
  styleConfig,
  analyser,
  onPlayToggle,
  onStampLine,
  onUndoLast,
  onSeek,
  onExitSync
}: SyncRecorderProps) {

  const [copied, setCopied] = useState(false);

  const pendingLine = session.rawLines[session.pendingLineIndex];
  const isFinished = session.pendingLineIndex >= session.rawLines.length;

  // Build live timeline entries from synced lines for the preview renderer
  const liveEntries: TimelineEntry<LyricLine>[] = useMemo(() => {
    const lines: LyricLine[] = session.syncedLines.map(sl => ({
      text: sl.text,
      startTime: sl.startTime
    }));
    return createTimelineEntries(lines, (l) => l.startTime, (_, i) => `live-${i}`);
  }, [session.syncedLines]);

  const [liveSnapshot, setLiveSnapshot] = useState<TimelineSnapshot<LyricLine>>({
    currentTime: 0,
    activeIndex: -1,
    previousIndex: -1,
    activeEntry: null,
    nextEntry: null,
    progress: 0,
    phase: 'idle'
  });

  useEffect(() => {
    setLiveSnapshot(prev => computeTimelineSnapshot(liveEntries, audioTime, prev));
  }, [audioTime, liveEntries]);

  // Spacebar global listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        if (isPlaying && !isFinished) {
          onStampLine(audioTime);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, isFinished, audioTime, onStampLine]);

  // LRC Export
  const exportLRC = useCallback(() => {
    let lrcString = `[ti:${session.trackName}]\n`;
    lrcString += `[by:Lyrixa Sync]\n\n`;
    session.syncedLines.forEach(line => {
      const mins = Math.floor(line.startTime / 60);
      const secs = (line.startTime % 60).toFixed(2).padStart(5, '0');
      lrcString += `[${mins.toString().padStart(2, '0')}:${secs}]${line.text}\n`;
    });
    navigator.clipboard.writeText(lrcString).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [session]);

  const formatTime = (t: number) => {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="sync-workspace">

      {/* ══════════ TOP BAR ══════════ */}
      <header className="sync-topbar">
        <div className="topbar-left">
          <h2>Lyrixa Sync Studio</h2>
          <span className="topbar-track">{session.trackName}</span>
        </div>
        <div className="topbar-center">
          <span className="topbar-time">{formatTime(audioTime)}</span>
          <span className="topbar-separator">/</span>
          <span className="topbar-duration">{formatTime(duration)}</span>
        </div>
        <div className="topbar-right">
          <button className="tb-btn" onClick={onPlayToggle}>
            {isPlaying ? '⏸ Pause' : '▶ Play'}
          </button>
          <button className="tb-btn" onClick={onUndoLast} disabled={session.syncedLines.length === 0}>
            ↩ Undo
          </button>
          <button className="tb-btn accent" onClick={exportLRC}>
            {copied ? '✓ Copied!' : '⬇ Export LRC'}
          </button>
          <button className="tb-btn danger" onClick={onExitSync}>
            ✕ Exit
          </button>
        </div>
      </header>

      {/* ══════════ MAIN SPLIT ══════════ */}
      <div className="sync-split">

        {/* LEFT: Live Preview */}
        <div className="sync-panel preview-panel">
          <div className="panel-label">LIVE PREVIEW</div>
          <div className="preview-viewport">
            {liveEntries.length > 0 ? (
              <LyricsRenderer
                entries={liveEntries}
                snapshot={liveSnapshot}
                styleConfig={styleConfig}
              />
            ) : (
              <div className="preview-empty">
                <p>Start stamping lines to see the live preview here</p>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Console (Spectrum + Stamp) */}
        <div className="sync-panel console-panel">

          {/* Spectrum Visualizer */}
          <div className="console-spectrum">
            <AudioSpectrum analyser={analyser} isPlaying={isPlaying} />
          </div>

          {/* Timeline with markers */}
          <div className="console-timeline">
            <TrackTimeline
              entries={liveEntries}
              currentTime={audioTime}
              duration={duration}
              onSeek={onSeek}
            />
          </div>

          {/* Stamp Area */}
          <div className="console-stamp">
            {!isFinished ? (
              <>
                <div className="stamp-progress-label">
                  Paragraph {session.pendingLineIndex + 1} of {session.rawLines.length}
                </div>
                <div className="stamp-target-text">{pendingLine || '(Instrumental)'}</div>
                <button
                  className={`stamp-btn ${isPlaying ? 'pulse' : ''}`}
                  onClick={() => isPlaying && onStampLine(audioTime)}
                  disabled={!isPlaying}
                >
                  {isPlaying ? 'STAMP — Spacebar' : 'Press Play first'}
                </button>
                <div className="stamp-upcoming">
                  {session.rawLines.slice(session.pendingLineIndex + 1, session.pendingLineIndex + 3).map((line, idx) => (
                    <div key={idx} className="upcoming-line">{line}</div>
                  ))}
                </div>
              </>
            ) : (
              <div className="stamp-finished">
                <h3>✓ All {session.rawLines.length} paragraphs synced</h3>
                <p>Export your LRC or switch to Player to preview the result.</p>
              </div>
            )}
          </div>

          {/* Synced History Log */}
          <div className="console-history">
            {session.syncedLines.map((line, idx) => (
              <div key={idx} className="history-row">
                <span className="history-time">[{formatTime(line.startTime)}]</span>
                <span className="history-text">{line.text.length > 60 ? line.text.substring(0, 60) + '…' : line.text}</span>
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}
