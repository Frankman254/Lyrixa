import { useMemo, useState } from 'react';
import { normalizeLyricsText } from '../../core/lyrics/normalize';
import type { LyricProjectMode } from '../../core/types/project';
import type { ApplyLyricsOptions } from './useLyrixaProject';
import './LyricsImportPanel.css';

interface LyricsImportPanelProps {
  open: boolean;
  initialText: string;
  /** Title suggested for the lyric source when adding it. */
  initialTitle?: string;
  initialStartTime?: number;
  currentTime: number;
  lyricMode: LyricProjectMode;
  /** When true, the form starts in "add as new source" mode. */
  defaultAsNewSource?: boolean;
  onClose: () => void;
  onApply: (rawText: string, options: ApplyLyricsOptions) => void;
}

/**
 * Lyrics imports are SOURCE-ONLY. They never auto-place clips on a layer; the
 * Sync Lyrics button is the single path that puts lyric paragraphs onto a
 * specific layer with real timings, and it preserves clips it has already
 * synced. This panel just edits the lyric source library.
 */
export function LyricsImportPanel({
  open,
  initialText,
  initialTitle,
  initialStartTime,
  currentTime,
  lyricMode,
  defaultAsNewSource = false,
  onClose,
  onApply
}: LyricsImportPanelProps) {
  const [text, setText] = useState(initialText);
  const [sourceTitle, setSourceTitle] = useState(initialTitle ?? 'Lyrics');
  const [startTime, setStartTime] = useState(initialStartTime ?? currentTime ?? 0);
  const [addAsNewSource, setAddAsNewSource] = useState(lyricMode === 'multi' && defaultAsNewSource);

  const preview = useMemo(() => normalizeLyricsText(text), [text]);

  if (!open) return null;

  const handleApply = () => {
    onApply(text, {
      sourceMode: lyricMode === 'multi' && addAsNewSource ? 'add' : 'replace-active',
      sourceTitle,
      sourceStartTime: startTime
    });
    onClose();
  };

  return (
    <div className="lyrics-import-backdrop" onClick={onClose} role="presentation">
      <aside
        className="lyrics-import-panel glass-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Import lyrics"
      >
        <header className="lip-header">
          <div>
            <h2>Import Lyrics</h2>
            <p>
              Paste lyrics here. They become a <strong>lyric source</strong> in
              your project — they are not placed on a layer yet. Use{' '}
              <strong>Sync lyrics</strong> on a layer to time them with the song.
              LRC timestamps are stripped automatically.
            </p>
          </div>
          <button className="lip-close" onClick={onClose} aria-label="Close">✕</button>
        </header>

        <div className="lip-body">
          <div className="lip-editor">
            <label className="lip-label">Raw lyrics</label>
            <textarea
              className="lip-textarea"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={'Paste lyrics here…\nOne line per lyric line — or blank lines between verses.'}
              autoFocus
            />
          </div>

          <div className="lip-preview">
            <label className="lip-label">
              Preview <span className="lip-count">{preview.lines.length} lines</span>
            </label>
            <div className="lip-lines">
              {preview.lines.length === 0 ? (
                <div className="lip-empty">Normalized output will appear here.</div>
              ) : (
                preview.lines.map((line, idx) => (
                  <div key={idx} className="lip-line">
                    <span className="lip-line-index">{idx + 1}</span>
                    <span className="lip-line-text">{line}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <footer className="lip-footer">
          <div className="lip-options">
            <label>
              Source name
              <input
                type="text"
                value={sourceTitle}
                onChange={(e) => setSourceTitle(e.target.value)}
              />
            </label>

            <label>
              Start checkpoint
              <input
                type="number"
                min={0}
                step={0.1}
                value={formatSecondsValue(startTime)}
                onChange={(e) => setStartTime(Math.max(0, Number(e.target.value) || 0))}
              />
              <button
                type="button"
                className="lip-inline-btn"
                onClick={() => setStartTime(currentTime)}
                title="Use the current playhead time"
              >
                Current
              </button>
            </label>

            <label className="lip-check">
              <input
                type="checkbox"
                checked={addAsNewSource}
                onChange={(e) => setAddAsNewSource(e.target.checked)}
                disabled={lyricMode === 'single'}
              />
              {lyricMode === 'multi'
                ? 'Add as a new lyric source (keep existing sources)'
                : 'Single mode: replace the active lyric source'}
            </label>
          </div>

          <p className="lip-strategy-hint">
            Imports never overwrite clips you have already synced. After applying,
            open Sync lyrics, pick the target layer, and time the new source line by line.
          </p>

          <div className="lip-actions">
            <button className="lip-btn ghost" onClick={onClose}>Cancel</button>
            <button
              className="lip-btn primary"
              onClick={handleApply}
              disabled={preview.lines.length === 0}
            >
              Save lyric source
            </button>
          </div>
        </footer>
      </aside>
    </div>
  );
}

function formatSecondsValue(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0';
  return Number(seconds.toFixed(1)).toString();
}
