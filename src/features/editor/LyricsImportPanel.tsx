import { useEffect, useMemo, useState } from 'react';
import { normalizeLyricsText } from '../../core/lyrics/normalize';
import type { LyricLayer } from '../../core/types/layer';
import type { ClipDurationStrategy } from '../../core/timeline/durationStrategies';
import type { ApplyLyricsOptions } from './useLyrixaProject';
import './LyricsImportPanel.css';

interface LyricsImportPanelProps {
  open: boolean;
  initialText: string;
  layers: LyricLayer[];
  /** When true, the vocal-energy strategy is enabled in the picker. */
  vocalsAvailable?: boolean;
  onClose: () => void;
  onApply: (rawText: string, options: ApplyLyricsOptions) => void;
}

const STRATEGY_DESCRIPTIONS: Record<ClipDurationStrategy, string> = {
  fixed: 'Every clip gets the same duration. Quickest baseline.',
  'line-length-weighted':
    'Short lines get short clips, long lines get longer clips.',
  'vocal-energy':
    'Use the vocals stem to place each clip on the matching vocal segment.'
};

export function LyricsImportPanel({
  open,
  initialText,
  layers,
  vocalsAvailable = false,
  onClose,
  onApply
}: LyricsImportPanelProps) {
  const [text, setText] = useState(initialText);
  const [defaultDuration, setDefaultDuration] = useState(2.5);
  const [minDuration, setMinDuration] = useState(1.5);
  const [maxDuration, setMaxDuration] = useState(5.0);
  const [preserveTiming, setPreserveTiming] = useState(true);
  const [layerId, setLayerId] = useState(layers[0]?.id ?? 'layer-main');
  const [strategy, setStrategy] = useState<ClipDurationStrategy>('line-length-weighted');

  useEffect(() => {
    if (open) setText(initialText);
  }, [open, initialText]);

  // If vocals aren't available, force the picker off the vocal-energy option.
  useEffect(() => {
    if (!vocalsAvailable && strategy === 'vocal-energy') {
      setStrategy('line-length-weighted');
    }
  }, [vocalsAvailable, strategy]);

  const preview = useMemo(() => normalizeLyricsText(text), [text]);

  if (!open) return null;

  const handleApply = () => {
    onApply(text, {
      defaultDuration,
      minDuration,
      maxDuration,
      preserveExistingTiming: preserveTiming,
      layerId,
      strategy
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
            <p>Paste your raw lyrics. Single-enter lines work. Blank lines between verses work. LRC timestamps are stripped automatically.</p>
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
              Strategy
              <select
                value={strategy}
                onChange={(e) => setStrategy(e.target.value as ClipDurationStrategy)}
              >
                <option value="fixed">Fixed duration</option>
                <option value="line-length-weighted">Line-length weighted</option>
                <option value="vocal-energy" disabled={!vocalsAvailable}>
                  Vocal energy{vocalsAvailable ? '' : ' (load vocals stem)'}
                </option>
              </select>
            </label>

            {strategy === 'fixed' && (
              <label>
                Duration
                <input
                  type="number"
                  min={0.25}
                  step={0.25}
                  value={defaultDuration}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (Number.isFinite(v) && v > 0) setDefaultDuration(v);
                  }}
                />
                <span className="lip-suffix">s</span>
              </label>
            )}

            {strategy !== 'fixed' && (
              <>
                <label>
                  Min
                  <input
                    type="number"
                    min={0.25}
                    step={0.25}
                    value={minDuration}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (Number.isFinite(v) && v > 0) setMinDuration(v);
                    }}
                  />
                  <span className="lip-suffix">s</span>
                </label>
                <label>
                  Max
                  <input
                    type="number"
                    min={0.5}
                    step={0.25}
                    value={maxDuration}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (Number.isFinite(v) && v > 0) setMaxDuration(v);
                    }}
                  />
                  <span className="lip-suffix">s</span>
                </label>
              </>
            )}

            <label>
              Layer
              <select value={layerId} onChange={(e) => setLayerId(e.target.value)}>
                {layers.map(l => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </label>

            <label className="lip-check">
              <input
                type="checkbox"
                checked={preserveTiming}
                onChange={(e) => setPreserveTiming(e.target.checked)}
                disabled={strategy === 'vocal-energy'}
              />
              Preserve existing timing
            </label>
          </div>

          <p className="lip-strategy-hint">{STRATEGY_DESCRIPTIONS[strategy]}</p>

          <div className="lip-actions">
            <button className="lip-btn ghost" onClick={onClose}>Cancel</button>
            <button
              className="lip-btn primary"
              onClick={handleApply}
              disabled={preview.lines.length === 0}
            >
              Apply to timeline
            </button>
          </div>
        </footer>
      </aside>
    </div>
  );
}
