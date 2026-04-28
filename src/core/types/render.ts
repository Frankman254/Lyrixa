import type { TextFillConfig } from './texture';
import { DEFAULT_TEXT_FILL } from './texture';

export type RenderMode = 'player' | 'editor' | 'overlay-preview' | 'sync-recorder' | 'timeline-editor';

export type LyricTextTransform = 'none' | 'uppercase' | 'lowercase';
export type LyricTextFillMode = 'solid' | 'gradient' | 'texture';

export interface LyricVisualStyle {
  textColor: string;
  activeTextColor: string;
  secondaryTextColor: string;
  glowColor: string;
  glowIntensity: number;
  shadowIntensity: number; // e.g., 0 to 1
  blurAmount: number; // in pixels
  fontSize: string;
  fontWeight: string | number;
  fontFamily: string;
  letterSpacing: string;
  lineHeight: string;
  lineSpacing: string;
  alignment: 'left' | 'center' | 'right';
  textTransform: LyricTextTransform;
  opacity: number;
  strokeColor: string;
  strokeWidth: number;
  backgroundPill: boolean;
  backgroundColor: string;
  backgroundOpacity: number;
  backgroundEmphasis: boolean;
  textFill: TextFillConfig;
  /** @deprecated Use textFill. Kept for old saved projects. */
  textFillMode: LyricTextFillMode;
  /** @deprecated Use textFill. Kept for old saved projects. */
  textGradient: string;
  /** @deprecated Use textFill.imageTexture. Kept for old saved projects. */
  textTextureImage: string;
  textTextureSize: string;
  textTexturePosition: string;
  textTextureRepeat: 'repeat' | 'no-repeat';
  textTextureBrightness: number;
  textTextureContrast: number;
  textTextureSaturation: number;
}

export type LyricTransitionPreset =
  | 'none'
  | 'fade'
  | 'fade-out'
  | 'slide-up'
  | 'slide-down'
  | 'scale-in'
  | 'scale-out'
  | 'blur-in'
  | 'blur-out'
  | 'glow-pop'
  | 'glitch-in'
  | 'glitch-out'
  // Legacy aliases kept so older projects hydrate without losing intent.
  | 'zoom-in'
  | 'zoom-out';

export type LyricActiveAnimationPreset =
  | 'none'
  | 'pulse'
  | 'glow-pulse'
  | 'breathing'
  | 'shake-light'
  | 'wave'
  | 'flicker';

export interface LyricAnimationConfig {
  transitionIn: LyricTransitionPreset;
  transitionOut: LyricTransitionPreset;
  activeAnimation: LyricActiveAnimationPreset;
  intensity: number;
  durationMs: number;
  exitLingerMs: number;
  easing: string;
  speed: number;
}

export type LyricFxPreset =
  | 'none'
  | 'neon-glow'
  | 'rgb-shift'
  | 'glitch'
  | 'scanline'
  | 'chromatic-aberration'
  | 'blur-flicker'
  | 'wave-distort'
  | 'shadow-trail'
  | 'energy-pulse'
  | 'soft-bloom'
  | 'prism-shader'
  | 'liquid-shimmer'
  | 'heat-haze';

export type LyricBlendMode = 'normal' | 'screen' | 'multiply' | 'overlay' | 'plus-lighter';

export interface LyricFxConfig {
  enabled: boolean;
  preset: LyricFxPreset;
  intensity: number;
  speed: number;
  colorA: string;
  colorB: string;
  opacity: number;
  blur: number;
  blendMode: LyricBlendMode;
}

export interface ClipProgressIndicatorConfig {
  enabled: boolean;
  color: string;
  size: number;
  glow: number;
}

export const DEFAULT_LYRIC_STYLE: LyricVisualStyle = {
  textColor: '#ffffff',
  activeTextColor: '#ffffff',
  secondaryTextColor: 'rgba(255, 255, 255, 0.2)',
  glowColor: 'rgba(255, 255, 255, 0.5)',
  glowIntensity: 0.7,
  shadowIntensity: 0.5,
  blurAmount: 2,
  fontSize: '2.5rem',
  fontWeight: '800',
  fontFamily: 'inherit',
  letterSpacing: '0px',
  lineHeight: '1.2',
  lineSpacing: '1.2',
  alignment: 'center',
  textTransform: 'none',
  opacity: 1,
  strokeColor: 'rgba(0, 0, 0, 0.65)',
  strokeWidth: 0,
  backgroundPill: false,
  backgroundColor: '#000000',
  backgroundOpacity: 0.28,
  backgroundEmphasis: false,
  textFill: DEFAULT_TEXT_FILL,
  textFillMode: 'solid',
  textGradient: 'linear-gradient(110deg, #ffffff 0%, #80eaff 45%, #ff6bd5 100%)',
  textTextureImage: '',
  textTextureSize: 'cover',
  textTexturePosition: 'center',
  textTextureRepeat: 'no-repeat',
  textTextureBrightness: 1.08,
  textTextureContrast: 1.22,
  textTextureSaturation: 1.18
};

export const DEFAULT_LYRIC_ANIMATION: LyricAnimationConfig = {
  transitionIn: 'fade',
  transitionOut: 'fade-out',
  activeAnimation: 'none',
  intensity: 1,
  durationMs: 360,
  exitLingerMs: 420,
  easing: 'ease-out',
  speed: 1
};

export const DEFAULT_LYRIC_FX: LyricFxConfig = {
  enabled: false,
  preset: 'none',
  intensity: 0.7,
  speed: 1,
  colorA: '#60f5ff',
  colorB: '#ff4fd8',
  opacity: 1,
  blur: 0,
  blendMode: 'normal'
};

export const DEFAULT_CLIP_PROGRESS_INDICATOR: ClipProgressIndicatorConfig = {
  enabled: false,
  color: '#ffffff',
  size: 8,
  glow: 0.8
};

export function resolveLyricStyle(
  globalStyle: Partial<LyricVisualStyle> | undefined,
  layerStyle?: Partial<LyricVisualStyle>,
  clipStyle?: Partial<LyricVisualStyle>
): LyricVisualStyle {
  const merged = { ...DEFAULT_LYRIC_STYLE, ...globalStyle, ...layerStyle, ...clipStyle };
  return { ...merged, lineHeight: merged.lineHeight ?? merged.lineSpacing, lineSpacing: merged.lineSpacing ?? merged.lineHeight };
}

export function resolveLyricAnimation(
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

export function resolveLyricFx(
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

export function resolveClipProgressIndicator(
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
