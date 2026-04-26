import type { ClipPositionPreset } from './clip';

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
}

export const MAIN_LAYER_ID = 'layer-main';
export const BACKING_LAYER_ID = 'layer-backing';
export const FX_LAYER_ID = 'layer-fx';

export function createDefaultLayers(): LyricLayer[] {
  return [
    {
      id: MAIN_LAYER_ID,
      name: 'Main Lyrics',
      color: '#2e7afb',
      visible: true,
      locked: false,
      order: 0,
      renderSettings: { positionPreset: 'bottom', textAlign: 'center' }
    },
    {
      id: BACKING_LAYER_ID,
      name: 'Backing Vocals',
      color: '#8a5cf6',
      visible: true,
      locked: false,
      order: 1,
      renderSettings: { positionPreset: 'top', textAlign: 'center' }
    },
    {
      id: FX_LAYER_ID,
      name: 'FX / Adlibs',
      color: '#f6a25c',
      visible: true,
      locked: false,
      order: 2,
      renderSettings: { positionPreset: 'top-right', textAlign: 'right' }
    }
  ];
}
