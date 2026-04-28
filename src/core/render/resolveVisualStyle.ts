import type {
  ClipProgressIndicatorConfig,
  LyricAnimationConfig,
  LyricFxConfig,
  LyricVisualStyle
} from '../types/render';
import {
  DEFAULT_CLIP_PROGRESS_INDICATOR,
  DEFAULT_LYRIC_ANIMATION,
  DEFAULT_LYRIC_FX,
  DEFAULT_LYRIC_STYLE
} from '../types/render';
import type { TextFillConfig } from '../types/texture';
import { DEFAULT_TEXT_FILL } from '../types/texture';

function resolveTextFill(style: Partial<LyricVisualStyle>): TextFillConfig {
  if (style.textFill) {
    return {
      ...DEFAULT_TEXT_FILL,
      ...style.textFill,
      gradient: {
        ...DEFAULT_TEXT_FILL.gradient!,
        ...style.textFill.gradient
      },
      imageTexture: style.textFill.imageTexture
        ? { ...style.textFill.imageTexture }
        : undefined
    };
  }

  if (style.textFillMode === 'gradient') {
    return {
      ...DEFAULT_TEXT_FILL,
      type: 'gradient',
      gradient: parseLegacyGradient(style.textGradient)
    };
  }

  if (style.textFillMode === 'texture') {
    return {
      ...DEFAULT_TEXT_FILL,
      type: 'image-texture',
      imageTexture: {
        id: style.textTextureImage || 'legacy-texture',
        objectUrl: style.textTextureImage,
        opacity: 1,
        scale: legacyTextureScale(style.textTextureSize),
        offsetX: 0,
        offsetY: 0,
        fit: style.textTextureSize === 'contain' ? 'contain' : 'cover',
        missing: !style.textTextureImage
      }
    };
  }

  return {
    ...DEFAULT_TEXT_FILL,
    type: 'solid',
    solidColor: style.textColor ?? DEFAULT_LYRIC_STYLE.textColor
  };
}

export function normalizePartialLyricVisualStyle(
  style: Partial<LyricVisualStyle> | undefined
): Partial<LyricVisualStyle> | undefined {
  if (!style) return undefined;
  if (!style.textFill && style.textFillMode !== 'gradient' && style.textFillMode !== 'texture') {
    return style;
  }
  return {
    ...style,
    textFill: resolveTextFill(style)
  };
}

export function resolveLyricVisualStyle(
  globalStyle: Partial<LyricVisualStyle> | undefined,
  layerStyle?: Partial<LyricVisualStyle>,
  clipStyle?: Partial<LyricVisualStyle>
): LyricVisualStyle {
  const merged = {
    ...DEFAULT_LYRIC_STYLE,
    ...globalStyle,
    ...layerStyle,
    ...clipStyle
  };
  return {
    ...merged,
    textFill: resolveTextFill(merged),
    lineHeight: merged.lineHeight ?? merged.lineSpacing,
    lineSpacing: merged.lineSpacing ?? merged.lineHeight
  };
}

export function resolveLyricAnimationConfig(
  globalAnimation?: Partial<LyricAnimationConfig>,
  layerAnimation?: Partial<LyricAnimationConfig>,
  clipAnimation?: Partial<LyricAnimationConfig>
): LyricAnimationConfig {
  return {
    ...DEFAULT_LYRIC_ANIMATION,
    ...globalAnimation,
    ...layerAnimation,
    ...clipAnimation
  };
}

export function resolveLyricFxConfig(
  globalFx?: Partial<LyricFxConfig>,
  layerFx?: Partial<LyricFxConfig>,
  clipFx?: Partial<LyricFxConfig>
): LyricFxConfig {
  return {
    ...DEFAULT_LYRIC_FX,
    ...globalFx,
    ...layerFx,
    ...clipFx
  };
}

export function resolveProgressIndicatorConfig(
  globalIndicator?: Partial<ClipProgressIndicatorConfig>,
  layerIndicator?: Partial<ClipProgressIndicatorConfig>,
  clipIndicator?: Partial<ClipProgressIndicatorConfig>
): ClipProgressIndicatorConfig {
  return {
    ...DEFAULT_CLIP_PROGRESS_INDICATOR,
    ...globalIndicator,
    ...layerIndicator,
    ...clipIndicator
  };
}

function legacyTextureScale(size: string | undefined): number {
  if (!size) return 1;
  const px = /^(\d+(?:\.\d+)?)px$/.exec(size)?.[1];
  if (!px) return 1;
  return Math.max(0.2, Math.min(4, Number(px) / 360));
}

function parseLegacyGradient(value: string | undefined) {
  if (!value) return DEFAULT_TEXT_FILL.gradient;
  const hex = value.match(/#[0-9a-f]{6}/gi) ?? [];
  return {
    colorA: hex[0] ?? DEFAULT_TEXT_FILL.gradient!.colorA,
    colorB: hex[1] ?? DEFAULT_TEXT_FILL.gradient!.colorB,
    angle: Number(value.match(/(\d+)deg/)?.[1] ?? DEFAULT_TEXT_FILL.gradient!.angle)
  };
}
