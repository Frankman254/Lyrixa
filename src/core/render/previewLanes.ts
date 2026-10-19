import type { LyricClip, ClipPositionPreset } from '../types/clip';
import type { LyricLayer, LyricLayerRole } from '../types/layer';

/**
 * A horizontal band of the preview stage reserved for one text layer.
 * `center` and `height` are fractions (0..1) of the stage height.
 */
export interface PreviewLane {
  index: number;
  count: number;
  center: number;
  height: number;
}

/** Vertical slice of the stage the lanes share (leaves room for controls). */
export const PREVIEW_LANE_TOP = 0.08;
export const PREVIEW_LANE_BOTTOM = 0.86;

/** Layer presets that share the central column and therefore can collide. */
const STACKABLE_PRESETS: ReadonlySet<ClipPositionPreset> = new Set(['top', 'center', 'bottom']);

const PRESET_RANK: Record<string, number> = { top: 0, center: 1, bottom: 2 };

/** Inside the same preset group: original line, then its reading, then the rest. */
const ROLE_RANK: Partial<Record<LyricLayerRole, number>> = {
  primary: 0,
  transliteration: 1,
  translation: 2,
  backing: 3
};

function layerPreset(layer: LyricLayer): ClipPositionPreset {
  return layer.renderSettings?.positionPreset ?? 'center';
}

function isTextLayer(layer: LyricLayer): boolean {
  if (!layer.visible || layer.layerType === 'fx') return false;
  if (layer.renderSettings?.suppressClipText) return false;
  return STACKABLE_PRESETS.has(layerPreset(layer));
}

/**
 * Split the preview into one lane per text layer so lines from different
 * layers (e.g. Japanese, romaji and translation) never overlap.
 *
 * The lane count comes from the layers that carry text anywhere in the song,
 * not only at the current instant, so lines keep their place while playing.
 * With a single text layer nothing is laned and the layer preset applies.
 */
export function computePreviewLanes(
  layers: readonly LyricLayer[],
  clips: readonly LyricClip[]
): Map<string, PreviewLane> {
  const withText = new Set<string>();
  for (const clip of clips) {
    if (!clip.muted && clip.text.trim().length > 0) withText.add(clip.layerId);
  }

  const laned = layers
    .filter(layer => withText.has(layer.id) && isTextLayer(layer))
    .sort((a, b) =>
      (PRESET_RANK[layerPreset(a)] ?? 1) - (PRESET_RANK[layerPreset(b)] ?? 1) ||
      (ROLE_RANK[a.role ?? 'primary'] ?? 4) - (ROLE_RANK[b.role ?? 'primary'] ?? 4) ||
      a.order - b.order
    );

  const lanes = new Map<string, PreviewLane>();
  if (laned.length < 2) return lanes;

  const span = PREVIEW_LANE_BOTTOM - PREVIEW_LANE_TOP;
  const height = span / laned.length;
  laned.forEach((layer, index) => {
    lanes.set(layer.id, {
      index,
      count: laned.length,
      center: PREVIEW_LANE_TOP + height * (index + 0.5),
      height
    });
  });
  return lanes;
}

/**
 * The lane a clip renders in, or undefined when it keeps its own position:
 * an explicit non-center clip position always wins over the lane layout.
 */
export function resolveClipLane(
  clip: LyricClip,
  lanes: ReadonlyMap<string, PreviewLane>
): PreviewLane | undefined {
  if (clip.position && clip.position !== 'center') return undefined;
  return lanes.get(clip.layerId);
}
