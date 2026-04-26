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
}

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
      renderSettings: { positionPreset: 'top-right', textAlign: 'right', zIndex: 30 },
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
