import { useMemo } from 'react';
import type { LyricClip } from '../../core/types/clip';
import type { LyricLayer } from '../../core/types/layer';
import type {
  ClipProgressIndicatorConfig,
  LyricAnimationConfig,
  LyricFxConfig,
  LyricVisualStyle
} from '../../core/types/render';
import { ClipLyricsRenderer } from '../lyrics-view/ClipLyricsRenderer';
import { FloatingPanel } from '../../shared/components/FloatingPanel';

const PREVIEW_ASPECT = 16 / 9;
const STORAGE_KEY = 'lyrixa_preview_panel_pos';

interface FloatingPreviewProps {
  clips: LyricClip[];
  layers: LyricLayer[];
  currentTime: number;
  styleConfig: LyricVisualStyle;
  animationConfig: LyricAnimationConfig;
  fxConfig: LyricFxConfig;
  progressIndicatorConfig: ClipProgressIndicatorConfig;
  width: number;
  onSizeChange: (width: number) => void;
  onExpand: () => void;
  onClose: () => void;
}

export function FloatingPreview({
  clips,
  layers,
  currentTime,
  styleConfig,
  animationConfig,
  fxConfig,
  progressIndicatorConfig,
  width,
  onSizeChange,
  onExpand,
  onClose
}: FloatingPreviewProps) {
  const previewWidth = Math.max(320, Math.min(760, width));
  const previewHeight = Math.round(previewWidth / PREVIEW_ASPECT);
  const miniStyle = useMemo<LyricVisualStyle>(
    () => ({ ...styleConfig, fontSize: `${Math.max(1.05, previewWidth / 305)}rem` }),
    [previewWidth, styleConfig]
  );

  return (
    <FloatingPanel
      storageKey={STORAGE_KEY}
      width={previewWidth}
      title="Live preview"
      headerActions={
        <>
          <button
            className="fp-btn"
            onClick={() => onSizeChange(previewWidth - 80)}
            title="Smaller preview"
          >
            -
          </button>
          <button
            className="fp-btn"
            onClick={() => onSizeChange(previewWidth + 80)}
            title="Larger preview"
          >
            +
          </button>
          <button
            className="fp-btn"
            onClick={onExpand}
            title="Expand to full preview"
          >
            ⤢
          </button>
        </>
      }
      onClose={onClose}
    >
      <div
        style={{
          width:  previewWidth,
          height: previewHeight,
          position: 'relative',
          background: 'radial-gradient(circle at 50% 50%, rgba(40,45,60,0.4), #06080d 75%)'
        }}
      >
        <ClipLyricsRenderer
          clips={clips}
          layers={layers}
          currentTime={currentTime}
          styleConfig={miniStyle}
          animationConfig={animationConfig}
          fxConfig={fxConfig}
          progressIndicatorConfig={progressIndicatorConfig}
        />
      </div>
    </FloatingPanel>
  );
}
