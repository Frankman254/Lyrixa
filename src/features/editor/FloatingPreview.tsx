import { useMemo } from 'react';
import type { LyricClip } from '../../core/types/clip';
import type { LyricLayer } from '../../core/types/layer';
import type { LyricVisualStyle } from '../../core/types/render';
import { ClipLyricsRenderer } from '../lyrics-view/ClipLyricsRenderer';
import { FloatingPanel } from '../../shared/components/FloatingPanel';

const PREVIEW_W = 320;
const PREVIEW_H = 180;
const STORAGE_KEY = 'lyrixa_preview_panel_pos';

interface FloatingPreviewProps {
  clips: LyricClip[];
  layers: LyricLayer[];
  currentTime: number;
  styleConfig: LyricVisualStyle;
  onExpand: () => void;
  onClose: () => void;
}

export function FloatingPreview({
  clips,
  layers,
  currentTime,
  styleConfig,
  onExpand,
  onClose
}: FloatingPreviewProps) {
  const miniStyle = useMemo<LyricVisualStyle>(
    () => ({ ...styleConfig, fontSize: '1.05rem' }),
    [styleConfig]
  );

  return (
    <FloatingPanel
      storageKey={STORAGE_KEY}
      width={PREVIEW_W}
      title="Live preview"
      headerActions={
        <button
          className="fp-btn"
          onClick={onExpand}
          title="Expand to full preview"
        >
          ⤢
        </button>
      }
      onClose={onClose}
    >
      <div
        style={{
          width:  PREVIEW_W,
          height: PREVIEW_H,
          position: 'relative',
          background: 'radial-gradient(circle at 50% 50%, rgba(40,45,60,0.4), #06080d 75%)'
        }}
      >
        <ClipLyricsRenderer
          clips={clips}
          layers={layers}
          currentTime={currentTime}
          styleConfig={miniStyle}
        />
      </div>
    </FloatingPanel>
  );
}
