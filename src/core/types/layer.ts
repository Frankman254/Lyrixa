import type { ClipPositionPreset } from './clip';
import type {
  ClipProgressIndicatorConfig,
  LyricAnimationConfig,
  LyricFxConfig,
  LyricVisualStyle
} from './render';

export type LyricLayerType = 'lyrics' | 'backing' | 'fx' | 'annotation';

/**
 * Controls where a layer's clips appear in the preview renderer.
 * Clips can override positionPreset individually; when a clip's position
 * is the default 'center', the layer's positionPreset is used instead.
 */
export interface LayerRenderSettings {
  positionPreset: ClipPositionPreset;
  textAlign?: 'left' | 'center' | 'right';
  /** Stacking z-index in the preview. Higher = in front. */
  zIndex?: number;
  /**
   * When true, the lyric text of clips on this layer is NOT rendered — only
   * the layer's FX/background still apply. Intended for the FX/Adlibs layer
   * so it behaves as a visual accent track instead of a third paragraph row.
   * A clip can opt back in with `forceTextRender: true`.
   */
  suppressClipText?: boolean;
}

/** Where the reactive signal is sampled from when rendering. */
export type LyricLayerAudioReactiveSource = 'master' | 'estimated';

/** Frequency band emphasized for the reactive envelope. */
export type LyricLayerAudioReactiveBandMode =
  | 'full-mix'
  | 'vocals'
  | 'instrumental'
  | 'kick'
  | 'bass'
  | 'hihat';

/** How the reactive signal is converted into a 0..1 value over time. */
export type LyricLayerAudioReactiveResponseMode = 'envelope' | 'peak';

/**
 * One reactive target. `amount` is how much the signal modulates the field;
 * `min`/`max` clamp the resulting value so the renderer can't push past UX
 * limits (e.g. opacity outside [0,1]).
 */
export interface LyricLayerAudioReactiveTarget {
  amount: number;
  min: number;
  max: number;
}

/**
 * Per-target opt-in. Renderers that don't yet support a given target
 * should silently ignore it instead of failing the import.
 */
export interface LyricLayerAudioReactiveTargets {
  opacity?: LyricLayerAudioReactiveTarget;
  blur?: LyricLayerAudioReactiveTarget;
  glowIntensity?: LyricLayerAudioReactiveTarget;
  scale?: LyricLayerAudioReactiveTarget;
  offsetY?: LyricLayerAudioReactiveTarget;
}

/**
 * Audio-reactive configuration applied to the whole layer (not per clip).
 * Lyrixa is the authoring surface; LiveWallpaper consumes this to drive
 * envelope/peak modulation on the layer's children at render time.
 */
export interface LyricLayerAudioReactive {
  enabled: boolean;
  source: LyricLayerAudioReactiveSource;
  bandMode: LyricLayerAudioReactiveBandMode;
  responseMode: LyricLayerAudioReactiveResponseMode;
  attackMs: number;
  releaseMs: number;
  /** 0..1 — values below this are treated as silence. */
  threshold: number;
  /** 0..1 — eases the transition near the threshold. */
  softness: number;
  /** When true, modulation pushes targets toward `min` instead of `max`. */
  invert: boolean;
  targets: LyricLayerAudioReactiveTargets;
}

/** Renderer-safe defaults. Used when the field is missing or partially supplied. */
export const DEFAULT_LAYER_AUDIO_REACTIVE: LyricLayerAudioReactive = {
  enabled: false,
  source: 'master',
  bandMode: 'full-mix',
  responseMode: 'envelope',
  attackMs: 35,
  releaseMs: 220,
  threshold: 0.08,
  softness: 0.25,
  invert: false,
  targets: {}
};

/**
 * A horizontal track on the timeline editor.
 * Each lyric clip belongs to exactly one layer.
 *
 * Layers support overlapping vocals: main voice, backing vocals, adlibs,
 * translations, and secondary text effects can each live on a dedicated layer.
 */
export interface LyricLayer {
  id: string;
  name: string;
  /** Semantic role used by renderers and future clip factories. */
  layerType: LyricLayerType;
  /** CSS color used for the track background, clip accent, and layer chip */
  color: string;
  /** When false, clips on this layer are hidden in the preview renderer */
  visible: boolean;
  /** When true, clips on this layer cannot be dragged, resized, or selected */
  locked: boolean;
  /** Vertical stacking order. Lower = closer to the top of the timeline. */
  order: number;
  /**
   * Preview render settings. When absent, clips fall back to their own
   * position field (default: center).
   */
  renderSettings?: LayerRenderSettings;
  /** Defaults applied to clips on this layer after project-level defaults. */
  styleDefaults?: Partial<LyricVisualStyle>;
  animationDefaults?: Partial<LyricAnimationConfig>;
  fxDefaults?: Partial<LyricFxConfig>;
  progressIndicatorDefaults?: Partial<ClipProgressIndicatorConfig>;
  /**
   * Audio-reactive modulation applied to this layer as a whole. Targets
   * apply to the whole channel, not to individual clip boxes — that's the
   * intentional contract with the renderer.
   */
  audioReactive?: LyricLayerAudioReactive;
  /** @deprecated Use styleDefaults. Kept for older saved projects. */
  style?: Partial<LyricVisualStyle>;
  /** @deprecated Use animationDefaults. Kept for older saved projects. */
  animation?: Partial<LyricAnimationConfig>;
  /** @deprecated Use fxDefaults. Kept for older saved projects. */
  fx?: Partial<LyricFxConfig>;
  /** @deprecated Use progressIndicatorDefaults. Kept for older saved projects. */
  progressIndicator?: Partial<ClipProgressIndicatorConfig>;
}

export const MAIN_LAYER_ID = 'layer-main';
export const BACKING_LAYER_ID = 'layer-backing';
export const FX_LAYER_ID = 'layer-fx';

export function createDefaultLayers(): LyricLayer[] {
  return [
    {
      id: MAIN_LAYER_ID,
      name: 'Main Lyrics',
      layerType: 'lyrics',
      color: '#2e7afb',
      visible: true,
      locked: false,
      order: 0,
      renderSettings: { positionPreset: 'bottom', textAlign: 'center', zIndex: 20 },
      styleDefaults: { fontSize: '2.8rem', fontWeight: '800', textColor: '#ffffff' }
    },
    {
      id: BACKING_LAYER_ID,
      name: 'Backing Vocals',
      layerType: 'backing',
      color: '#8a5cf6',
      visible: true,
      locked: false,
      order: 1,
      renderSettings: { positionPreset: 'top', textAlign: 'center', zIndex: 15 },
      styleDefaults: {
        fontSize: '1.55rem',
        fontWeight: '700',
        textColor: 'rgba(200, 218, 255, 0.82)',
        opacity: 0.82,
        glowIntensity: 0.35
      }
    },
    {
      id: FX_LAYER_ID,
      name: 'FX / Adlibs',
      layerType: 'fx',
      color: '#f6a25c',
      visible: true,
      locked: false,
      order: 2,
      // suppressClipText keeps the FX layer purely accent-y by default: clips
      // placed here drive FX/glow but don't render normal paragraph text.
      // Toggle off in the Layer inspector if you want adlib text on screen.
      renderSettings: { positionPreset: 'top-right', textAlign: 'right', zIndex: 30, suppressClipText: true },
      styleDefaults: {
        fontSize: '1.15rem',
        fontWeight: '900',
        textColor: '#ffd29c',
        opacity: 0.78,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        glowColor: '#ff9d45',
        glowIntensity: 0.9
      },
      animationDefaults: {
        transitionIn: 'glitch-in',
        transitionOut: 'glitch-out',
        activeAnimation: 'flicker',
        durationMs: 260,
        exitLingerMs: 520
      },
      fxDefaults: {
        enabled: true,
        preset: 'rgb-shift',
        intensity: 0.5,
        opacity: 0.75,
        blendMode: 'screen'
      }
    }
  ];
}
