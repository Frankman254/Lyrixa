import { useMemo } from 'react';
import type { LyricClip, ClipPositionPreset } from '../../core/types/clip';
import type { LyricLayer } from '../../core/types/layer';
import type {
  ClipProgressIndicatorConfig,
  LyricAnimationConfig,
  LyricFxConfig,
  LyricVisualStyle
} from '../../core/types/render';
import {
  DEFAULT_CLIP_PROGRESS_INDICATOR,
  DEFAULT_LYRIC_ANIMATION,
  DEFAULT_LYRIC_FX,
  DEFAULT_LYRIC_STYLE,
  resolveClipProgressIndicator,
  resolveLyricAnimation,
  resolveLyricFx,
  resolveLyricStyle
} from '../../core/types/render';
import './ClipLyricsRenderer.css';

interface ClipLyricsRendererProps {
  clips: LyricClip[];
  layers: LyricLayer[];
  currentTime: number;
  styleConfig?: LyricVisualStyle;
  animationConfig?: LyricAnimationConfig;
  fxConfig?: LyricFxConfig;
  progressIndicatorConfig?: ClipProgressIndicatorConfig;
}

const POSITION_CLASS: Record<string, string> = {
  center:       'pos-center',
  top:          'pos-top',
  bottom:       'pos-bottom',
  'top-left':   'pos-top-left',
  'top-right':  'pos-top-right',
  'bottom-left':  'pos-bottom-left',
  'bottom-right': 'pos-bottom-right'
};

/**
 * Resolve the final render position for a clip.
 *
 * Priority: explicit non-center clip position > layer default > center.
 *
 * A clip position of 'center' is treated as "no override" because all clips
 * start at center by default; the layer's positionPreset (e.g. 'bottom' for
 * Main Lyrics, 'top' for Backing Vocals) provides the per-channel default so
 * multiple active clips from different layers don't all stack in the middle.
 */
function resolvePosition(clip: LyricClip, layer: LyricLayer | undefined): ClipPositionPreset {
  if (clip.position && clip.position !== 'center') return clip.position;
  return layer?.renderSettings?.positionPreset ?? 'center';
}

export function ClipLyricsRenderer({
  clips,
  layers,
  currentTime,
  styleConfig = DEFAULT_LYRIC_STYLE,
  animationConfig = DEFAULT_LYRIC_ANIMATION,
  fxConfig = DEFAULT_LYRIC_FX,
  progressIndicatorConfig = DEFAULT_CLIP_PROGRESS_INDICATOR
}: ClipLyricsRendererProps) {
  const layerMap = useMemo(
    () => new Map(layers.map(l => [l.id, l])),
    [layers]
  );

  const visibleLayerIds = useMemo(
    () => new Set(layers.filter(l => l.visible).map(l => l.id)),
    [layers]
  );

  const renderable = useMemo(
    () =>
      clips.filter(clip => {
        const layer = layerMap.get(clip.layerId);
        if (!layer || !visibleLayerIds.has(clip.layerId)) return false;
        if (clip.muted || clip.text.trim().length === 0) return false;
        const clipAnimation = resolveLyricAnimation(
          animationConfig,
          layer.animationDefaults ?? layer.animation,
          {
            ...clip.animationOverride,
            transitionIn: clip.transitionIn,
            transitionOut: clip.transitionOut
          }
        );
        const exitLingerSeconds = Math.max(0, clipAnimation.exitLingerMs) / 1000;
        return currentTime >= clip.startTime && currentTime <= clip.endTime + exitLingerSeconds;
      }),
    [animationConfig, clips, currentTime, layerMap, visibleLayerIds]
  );

  return (
    <div className="clip-lyrics-stage">
      {renderable.map(clip => {
        const layer   = layerMap.get(clip.layerId);
        const pos     = resolvePosition(clip, layer);
        const posClass = POSITION_CLASS[pos] ?? 'pos-center';
        const duration = clip.endTime - clip.startTime;
        const progress = duration > 0
          ? Math.max(0, Math.min(1, (currentTime - clip.startTime) / duration))
          : 0;
        const zIndex   = layer?.renderSettings?.zIndex;
        const style = resolveLyricStyle(styleConfig, layer?.styleDefaults ?? layer?.style, clip.styleOverride);
        const animation = resolveLyricAnimation(
          animationConfig,
          layer?.animationDefaults ?? layer?.animation,
          {
            ...clip.animationOverride,
            transitionIn: clip.transitionIn,
            transitionOut: clip.transitionOut
          }
        );
        const fx = resolveLyricFx(fxConfig, layer?.fxDefaults ?? layer?.fx, clip.fxOverride);
        const progressIndicator = resolveClipProgressIndicator(
          progressIndicatorConfig,
          layer?.progressIndicatorDefaults ?? layer?.progressIndicator,
          clip.progressIndicatorOverride
        );
        const fillMode = style.textFillMode ?? 'solid';
        const fillImage = fillMode === 'texture' && style.textTextureImage
          ? `url("${style.textTextureImage}")`
          : style.textGradient;
        const isExiting = currentTime > clip.endTime;
        const showProgressDot = progressIndicator.enabled && !isExiting && currentTime >= clip.startTime && currentTime <= clip.endTime;
        const layerType = layer?.layerType ?? 'lyrics';
        const effectiveTransition = isExiting ? animation.transitionOut : animation.transitionIn;
        const cssVariables = {
          '--clip-progress': progress,
          '--clip-layer-color': layer?.color ?? '#ffffff',
          '--lyric-color-primary': style.textColor,
          '--lyric-color-active': style.activeTextColor,
          '--lyric-color-secondary': style.secondaryTextColor,
          '--lyric-glow': style.glowColor,
          '--lyric-glow-intensity': style.glowIntensity,
          '--lyric-shadow-intensity': style.shadowIntensity,
          '--lyric-blur': `${style.blurAmount}px`,
          '--lyric-font-size': style.fontSize,
          '--lyric-font-weight': style.fontWeight,
          '--lyric-font-family': style.fontFamily,
          '--lyric-letter-spacing': style.letterSpacing,
          '--lyric-line-height': style.lineHeight,
          '--lyric-alignment': style.alignment,
          '--lyric-opacity': style.opacity,
          '--lyric-stroke-color': style.strokeColor,
          '--lyric-stroke-width': `${style.strokeWidth}px`,
          '--lyric-bg-color': style.backgroundColor,
          '--lyric-bg-opacity': style.backgroundOpacity,
          '--lyric-bg-opacity-percent': `${Math.max(0, Math.min(1, style.backgroundOpacity)) * 100}%`,
          '--lyric-fill-image': fillImage,
          '--lyric-texture-size': style.textTextureSize,
          '--lyric-animation-duration': `${animation.durationMs}ms`,
          '--lyric-animation-easing': animation.easing,
          '--lyric-animation-intensity': animation.intensity,
          '--lyric-animation-speed': `${Math.max(0.1, animation.speed)}s`,
          '--lyric-fx-intensity': fx.intensity,
          '--lyric-fx-speed': `${Math.max(0.1, fx.speed)}s`,
          '--lyric-fx-color-a': fx.colorA,
          '--lyric-fx-color-b': fx.colorB,
          '--lyric-fx-opacity': fx.opacity,
          '--lyric-fx-blur': `${fx.blur}px`,
          '--lyric-blend-mode': fx.blendMode,
          '--clip-dot-color': progressIndicator.color,
          '--clip-dot-size': `${progressIndicator.size}px`,
          '--clip-dot-glow': progressIndicator.glow,
          ...(zIndex !== undefined ? { zIndex } : {})
        } as React.CSSProperties;
        return (
          <div
            key={clip.id}
            className={[
              'clip-lyric',
              `layer-${layerType}`,
              posClass,
              isExiting ? 'is-exiting' : 'is-active',
              `tx-${effectiveTransition}`,
              `loop-${animation.activeAnimation}`,
              fx.enabled && fx.preset !== 'none' ? `fx-${fx.preset}` : '',
              fillMode !== 'solid' ? `fill-${fillMode}` : '',
              style.backgroundPill || style.backgroundEmphasis ? 'has-pill' : ''
            ].filter(Boolean).join(' ')}
            style={cssVariables}
            data-layer={clip.layerId}
            data-layer-type={layerType}
          >
            <span className="clip-lyric-text">{transformText(clip.text, style.textTransform)}</span>
            {fx.enabled && fx.preset === 'scanline' && <span className="clip-scanline" aria-hidden />}
            {showProgressDot && <span className="clip-progress-dot" aria-hidden />}
          </div>
        );
      })}
    </div>
  );
}

function transformText(text: string, transform: LyricVisualStyle['textTransform']): string {
  if (transform === 'uppercase') return text.toUpperCase();
  if (transform === 'lowercase') return text.toLowerCase();
  return text;
}
