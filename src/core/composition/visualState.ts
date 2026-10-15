import {
  VIBRIX_GRANULAR_FAMILIES,
  type CompositionTargetV2,
  type StoredCompositionV2,
  type VibrixAuthoringManifest,
  type VibrixGranularFamily,
  type VibrixTimelineKind
} from './types';
import { TRACK_KIND_ORDER } from './timeline';

/**
 * What the editor currently "sees" at one instant, resolved from the score the
 * user authored. This mirrors the fold rule Vibrix applies in
 * `resolveVisualStateAt`, but only down to identities, labels and thumbnails —
 * Lyrixa never evaluates shaders. The panel built on it is orientational: the
 * authoritative render stays in Vibrix (see VIBRIX_AUTHORING_CONTRACT.md).
 */
export interface ResolvedVisualActivation {
  family: VibrixTimelineKind;
  kind: 'scene' | 'image' | 'feature-slot';
  id: string;
  name: string;
  /** Transportable preview from the manifest; absent for slots until V2.4a. */
  thumbnailDataUrl?: string;
  /** True when this family comes from the active scene's binding, not a cue. */
  fromScene: boolean;
}

export interface GranularLaneState {
  family: VibrixGranularFamily;
  activation: ResolvedVisualActivation | null;
  /** The active scene explicitly turns this family `'off'`. */
  off: boolean;
}

export interface CompositionVisualStateAtTime {
  timeMs: number;
  /** False until the user has placed any enabled cut at or before `timeMs`. */
  active: boolean;
  image: ResolvedVisualActivation | null;
  scene: ResolvedVisualActivation | null;
  /** Only granular families that currently resolve to something (or `'off'`). */
  lanes: GranularLaneState[];
}

/**
 * Folds every enabled sustained cut whose `startTimeMs <= timeMs` — on enabled
 * lanes only — into the state a viewer would show at that instant. Ties in the
 * same millisecond resolve Scene, then Image, then granular (TRACK_KIND_ORDER),
 * so a cut landing exactly on a scene/image boundary can fine-tune it. A
 * sustained granular override holds above later scenes and images until another
 * cut in its own lane or an `inherit` releases it back to the scene binding.
 */
export function resolveCompositionVisualState(
  score: StoredCompositionV2,
  manifest: VibrixAuthoringManifest | undefined,
  timeMs: number
): CompositionVisualStateAtTime {
  const emptyTime = Math.max(0, Math.round(timeMs));
  if (!manifest) {
    return { timeMs: emptyTime, active: false, image: null, scene: null, lanes: [] };
  }

  const enabledTrackIds = new Set(
    score.tracks.filter(track => track.enabled).map(track => track.id)
  );
  const slotById = new Map(manifest.slots.map(slot => [slot.id, slot]));
  const imageById = new Map(
    manifest.schemaVersion === 2 ? manifest.images.map(image => [image.id, image]) : []
  );

  const placed = score.cues
    .filter(cue => cue.enabled && enabledTrackIds.has(cue.trackId) && cue.startTimeMs <= emptyTime)
    .sort((left, right) =>
      left.startTimeMs - right.startTimeMs ||
      TRACK_KIND_ORDER[targetKind(left.target)] - TRACK_KIND_ORDER[targetKind(right.target)] ||
      left.id.localeCompare(right.id)
    );

  let image: ResolvedVisualActivation | null = null;
  let scene: ResolvedVisualActivation | null = null;
  let sceneBindings: Record<string, string | 'off'> | null = null;
  const overrides = new Map<VibrixGranularFamily, ResolvedVisualActivation>();

  const applyScene = (sceneId: string) => {
    const slot = slotById.get(sceneId);
    if (!slot) {
      scene = { family: 'scene', kind: 'scene', id: sceneId, name: sceneId, fromScene: false };
      sceneBindings = null;
      return;
    }
    scene = { family: 'scene', kind: 'scene', id: slot.id, name: slot.name, fromScene: false };
    sceneBindings = slot.bindings ? { ...slot.bindings } : null;
  };

  for (const cue of placed) {
    const target = cue.target;
    if (target.kind === 'scene') {
      applyScene(target.id);
    } else if (target.kind === 'image') {
      const asset = imageById.get(target.id);
      image = asset
        ? {
            family: 'image',
            kind: 'image',
            id: asset.id,
            name: asset.name,
            thumbnailDataUrl: asset.thumbnailDataUrl,
            fromScene: false
          }
        : { family: 'image', kind: 'image', id: target.id, name: target.id, fromScene: false };
      // An image drags its own scene along, exactly as Vibrix resolves it.
      if (asset?.sceneSlotId) applyScene(asset.sceneSlotId);
    } else if (target.kind === 'feature-slot') {
      const activation = activationForSlot(slotById, target.id, target.family, false);
      if (activation) overrides.set(target.family, activation);
    } else {
      // inherit: release the lane so it falls back to the active scene binding.
      overrides.delete(target.family);
    }
  }

  const lanes: GranularLaneState[] = [];
  for (const family of VIBRIX_GRANULAR_FAMILIES) {
    const override = overrides.get(family);
    if (override) {
      lanes.push({ family, activation: override, off: false });
      continue;
    }
    const bound = sceneBindings?.[family];
    if (bound === 'off') {
      lanes.push({ family, activation: null, off: true });
    } else if (typeof bound === 'string') {
      const activation = activationForSlot(slotById, bound, family, true);
      lanes.push({ family, activation, off: false });
    }
    // No override and no scene binding: the lane contributes nothing to show.
  }

  return {
    timeMs: emptyTime,
    active: placed.length > 0,
    image,
    scene,
    lanes
  };
}

function targetKind(target: CompositionTargetV2): VibrixTimelineKind {
  return target.family;
}

function activationForSlot(
  slotById: Map<string, { id: string; name: string; thumbnailDataUrl?: string }>,
  id: string,
  family: VibrixGranularFamily,
  fromScene: boolean
): ResolvedVisualActivation | null {
  const slot = slotById.get(id);
  if (!slot) return null;
  return {
    family,
    kind: 'feature-slot',
    id: slot.id,
    name: slot.name,
    thumbnailDataUrl: slot.thumbnailDataUrl,
    fromScene
  };
}
