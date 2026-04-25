import { useMemo } from 'react';
import type { LyricClip } from '../../core/types/clip';
import type { LyricLayer } from '../../core/types/layer';
import type { LyricVisualStyle } from '../../core/types/render';
import { ClipLyricsRenderer } from '../lyrics-view/ClipLyricsRenderer';

interface MiniPreviewProps {
  clips: LyricClip[];
  layers: LyricLayer[];
  currentTime: number;
  styleConfig: LyricVisualStyle;
  onExpand: () => void;
  onClose: () => void;
}

/**
 * Always-on miniature preview docked in a corner of the shell.
 * Uses the same ClipLyricsRenderer the full overlay uses, with a
 * scaled-down style so text fits inside the small frame.
 */
export function MiniPreview({
  clips,
  layers,
  currentTime,
  styleConfig,
  onExpand,
  onClose
}: MiniPreviewProps) {
  const miniStyle = useMemo<LyricVisualStyle>(
    () => ({ ...styleConfig, fontSize: '1.05rem' }),
    [styleConfig]
  );

  return (
    <div className="ls-mini-preview" role="complementary" aria-label="Mini preview">
      <header className="ls-mini-header">
        <span className="ls-mini-title">Live preview</span>
        <div className="ls-mini-actions">
          <button
            className="ls-mini-btn"
            onClick={onExpand}
            title="Expand preview"
          >
            ⤢
          </button>
          <button className="ls-mini-btn" onClick={onClose} title="Hide mini preview">
            ✕
          </button>
        </div>
      </header>
      <div className="ls-mini-stage">
        <ClipLyricsRenderer
          clips={clips}
          layers={layers}
          currentTime={currentTime}
          styleConfig={miniStyle}
        />
      </div>
    </div>
  );
}
