import { useMemo } from 'react';
import type { LyricClip } from '../../core/types/clip';
import type { LyricLayer } from '../../core/types/layer';
import type { LyricVisualStyle } from '../../core/types/render';
import { DEFAULT_LYRIC_STYLE } from '../../core/types/render';
import { resolveActiveClips } from '../../core/timeline/clips';
import './ClipLyricsRenderer.css';

interface ClipLyricsRendererProps {
  clips: LyricClip[];
  layers: LyricLayer[];
  currentTime: number;
  styleConfig?: LyricVisualStyle;
}

const POSITION_CLASS: Record<string, string> = {
  center: 'pos-center',
  top: 'pos-top',
  bottom: 'pos-bottom',
  'top-left': 'pos-top-left',
  'top-right': 'pos-top-right',
  'bottom-left': 'pos-bottom-left',
  'bottom-right': 'pos-bottom-right'
};

export function ClipLyricsRenderer({
  clips,
  layers,
  currentTime,
  styleConfig = DEFAULT_LYRIC_STYLE
}: ClipLyricsRendererProps) {
  const visibleLayerIds = useMemo(
    () => new Set(layers.filter(l => l.visible).map(l => l.id)),
    [layers]
  );

  const active = useMemo(
    () =>
      resolveActiveClips(clips, currentTime).filter(
        c => visibleLayerIds.has(c.layerId) && c.text.trim().length > 0
      ),
    [clips, currentTime, visibleLayerIds]
  );

  const cssVariables = {
    '--lyric-color-primary': styleConfig.textColor,
    '--lyric-color-active': styleConfig.activeTextColor,
    '--lyric-color-secondary': styleConfig.secondaryTextColor,
    '--lyric-glow': styleConfig.glowColor,
    '--lyric-shadow-intensity': styleConfig.shadowIntensity,
    '--lyric-blur': `${styleConfig.blurAmount}px`,
    '--lyric-font-size': styleConfig.fontSize,
    '--lyric-font-weight': styleConfig.fontWeight,
    '--lyric-letter-spacing': styleConfig.letterSpacing,
    '--lyric-line-spacing': styleConfig.lineSpacing,
    '--lyric-alignment': styleConfig.alignment
  } as React.CSSProperties;

  return (
    <div className="clip-lyrics-stage" style={cssVariables}>
      {active.map(clip => {
        const duration = clip.endTime - clip.startTime;
        const progress = duration > 0 ? (currentTime - clip.startTime) / duration : 0;
        const posClass = POSITION_CLASS[clip.position] ?? 'pos-center';
        const layer = layers.find(l => l.id === clip.layerId);
        return (
          <div
            key={clip.id}
            className={`clip-lyric ${posClass} in-${clip.transitionIn} out-${clip.transitionOut}`}
            style={{
              '--clip-progress': progress,
              '--clip-layer-color': layer?.color ?? '#ffffff'
            } as React.CSSProperties}
            data-layer={clip.layerId}
          >
            <span className="clip-lyric-text">{clip.text}</span>
          </div>
        );
      })}
    </div>
  );
}
