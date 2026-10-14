import { createCompositionCueId } from './score';
import { TRACK_KIND_ORDER } from './timeline';
import { isManifestSlotDraggable } from './authoringManifest';
import { VIBRIX_GRANULAR_FAMILIES } from './types';
import type {
  CompositionCueV2,
  CompositionTargetV2,
  CompositionTrackV2,
  StoredCompositionV2,
  VibrixAuthoringManifest,
  VibrixGranularFamily,
  VibrixManifestImage,
  VibrixManifestSlot,
  VibrixTimelineKind
} from './types';

/**
 * A catalog object the user can place on the v2 timeline. `inherit` is the
 * explicit "drop this granular override" activation; it has no source object.
 */
export type CompositionPlacement =
  | { kind: 'scene'; slot: VibrixManifestSlot }
  | { kind: 'granular'; slot: VibrixManifestSlot; family: VibrixGranularFamily }
  | { kind: 'image'; image: VibrixManifestImage }
  | { kind: 'inherit'; family: VibrixGranularFamily };

export function timelineKindForPlacement(placement: CompositionPlacement): VibrixTimelineKind {
  if (placement.kind === 'image') return 'image';
  if (placement.kind === 'scene') return 'scene';
  return placement.family;
}

const TIMELINE_TRACK_NAMES: Record<VibrixTimelineKind, string> = {
  scene: 'Scene',
  image: 'Image',
  spectrum: 'Spectrum',
  'spectrum-second': 'Spectrum 2',
  looks: 'Looks',
  particles: 'Particles',
  rain: 'Rain',
  lights: 'Lights',
  'camera-fx': 'Camera FX',
  logo: 'Logo',
  'track-title': 'Track Title',
  'background-zoom': 'Background Zoom'
};

export function timelineTrackNameForKind(kind: VibrixTimelineKind): string {
  return TIMELINE_TRACK_NAMES[kind];
}

function createTimelineTrack(kind: VibrixTimelineKind): CompositionTrackV2 {
  return {
    id: `composition-${kind}`,
    name: timelineTrackNameForKind(kind),
    kind,
    order: TRACK_KIND_ORDER[kind],
    enabled: true,
    locked: false
  };
}

/** Ensures the lane for a kind exists; keeps every other track untouched. */
export function ensureTimelineTrack(
  score: StoredCompositionV2,
  kind: VibrixTimelineKind
): StoredCompositionV2 {
  if (score.tracks.some(track => track.kind === kind)) return score;
  return { ...score, tracks: [...score.tracks, createTimelineTrack(kind)] };
}

export interface PlacementResult {
  score: StoredCompositionV2;
  cue: CompositionCueV2;
}

/** Places a catalog object at `startTimeMs`, creating its lane when needed. */
export function placeFromCatalog(
  score: StoredCompositionV2,
  placement: CompositionPlacement,
  startTimeMs: number
): PlacementResult | null {
  const startTime = Math.max(0, Math.round(startTimeMs));
  const trackKind = timelineKindForPlacement(placement);
  let target: CompositionTargetV2;

  if (placement.kind === 'inherit') {
    target = { kind: 'inherit', family: placement.family };
  } else if (placement.kind === 'image') {
    // Loose v1 manifests have no images array; still accept an explicit placement.
    target = { kind: 'image', family: 'image', id: placement.image.id, revision: placement.image.revision };
  } else if (placement.kind === 'scene') {
    if (!isManifestSlotDraggable(placement.slot)) return null;
    if (placement.slot.family !== 'scene') return null;
    target = { kind: 'scene', family: 'scene', id: placement.slot.id, revision: placement.slot.revision };
  } else {
    if (!isManifestSlotDraggable(placement.slot)) return null;
    if (placement.slot.family !== placement.family) return null;
    target = { kind: 'feature-slot', family: placement.family, id: placement.slot.id, revision: placement.slot.revision };
  }

  const withTrack = ensureTimelineTrack(score, trackKind);
  const track = withTrack.tracks.find(candidate => candidate.kind === trackKind)!;
  const cue: CompositionCueV2 = {
    id: createCompositionCueId(
      withTrack,
      target.kind === 'inherit' ? `inherit-${target.family}` : target.id,
      startTime
    ),
    trackId: track.id,
    startTimeMs: startTime,
    target,
    priority: 0,
    enabled: true
  };
  return { score: { ...withTrack, cues: [...withTrack.cues, cue] }, cue };
}

const GRANULAR_ORDER: Record<VibrixGranularFamily, number> = {
  spectrum: 0,
  'spectrum-second': 1,
  looks: 2,
  particles: 3,
  rain: 4,
  lights: 5,
  'camera-fx': 6,
  logo: 7,
  'track-title': 8,
  'background-zoom': 9
};

export interface CatalogGroup {
  scenes: VibrixManifestSlot[];
  images: VibrixManifestImage[];
  granular: { family: VibrixGranularFamily; slots: VibrixManifestSlot[] }[];
}

/** Partitions manifest objects into the three catalog sections. */
export function groupManifestForCatalog(manifest: VibrixAuthoringManifest): CatalogGroup {
  const scenes = manifest.slots.filter(slot => slot.family === 'scene');
  const byFamily = new Map<VibrixGranularFamily, VibrixManifestSlot[]>();
  for (const slot of manifest.slots) {
    if (slot.family === 'scene' || slot.family === 'intro-window') continue;
    const list = byFamily.get(slot.family) ?? [];
    list.push(slot);
    byFamily.set(slot.family, list);
  }
  const granular = [...byFamily.entries()]
    .map(([family, slots]) => ({
      family,
      slots: [...slots].sort((left, right) => left.name.localeCompare(right.name))
    }))
    .sort((left, right) => GRANULAR_ORDER[left.family] - GRANULAR_ORDER[right.family]);
  return {
    scenes,
    images: manifest.schemaVersion === 2 ? manifest.images : [],
    granular
  };
}

/** Filters groups by case-insensitive substring on name/id; keeps section order. */
export function filterCatalogGroup(group: CatalogGroup, query: string): CatalogGroup {
  const needle = query.trim().toLowerCase();
  if (!needle) return group;
  const matches = (value: { name: string; id: string }) =>
    value.name.toLowerCase().includes(needle) || value.id.toLowerCase().includes(needle);
  return {
    scenes: group.scenes.filter(matches),
    images: group.images.filter(matches),
    granular: group.granular
      .map(section => ({ ...section, slots: section.slots.filter(matches) }))
      .filter(section => section.slots.length > 0)
  };
}

/**
 * Compact payload moved through HTML5 drag. It carries ids only, never a
 * revision, so the drop side always resolves the object (and its current
 * revision) against the live manifest — Vibrix stays the visual authority.
 */
export type PlacementDescriptor =
  | { kind: 'scene'; slotId: string }
  | { kind: 'granular'; slotId: string; family: VibrixGranularFamily }
  | { kind: 'image'; imageId: string }
  | { kind: 'inherit'; family: VibrixGranularFamily };

export function descriptorForPlacement(placement: CompositionPlacement): PlacementDescriptor {
  switch (placement.kind) {
    case 'scene': return { kind: 'scene', slotId: placement.slot.id };
    case 'granular': return { kind: 'granular', slotId: placement.slot.id, family: placement.family };
    case 'image': return { kind: 'image', imageId: placement.image.id };
    case 'inherit': return { kind: 'inherit', family: placement.family };
  }
}

export function isPlacementDescriptor(value: unknown): value is PlacementDescriptor {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  switch (record.kind) {
    case 'scene': return typeof record.slotId === 'string';
    case 'granular': return typeof record.slotId === 'string'
      && (VIBRIX_GRANULAR_FAMILIES as readonly unknown[]).includes(record.family);
    case 'image': return typeof record.imageId === 'string';
    case 'inherit': return (VIBRIX_GRANULAR_FAMILIES as readonly unknown[]).includes(record.family);
    default: return false;
  }
}

/** Resolves a descriptor against the live manifest; null when it no longer exists. */
export function resolvePlacementDescriptor(
  manifest: VibrixAuthoringManifest | undefined,
  descriptor: PlacementDescriptor
): CompositionPlacement | null {
  if (descriptor.kind === 'inherit') return { kind: 'inherit', family: descriptor.family };
  if (!manifest) return null;
  if (descriptor.kind === 'image') {
    if (manifest.schemaVersion !== 2) return null;
    const image = manifest.images.find(candidate => candidate.id === descriptor.imageId);
    return image ? { kind: 'image', image } : null;
  }
  const slot = manifest.slots.find(candidate => candidate.id === descriptor.slotId);
  if (!slot) return null;
  if (descriptor.kind === 'scene') return slot.family === 'scene' ? { kind: 'scene', slot } : null;
  return slot.family === descriptor.family ? { kind: 'granular', slot, family: descriptor.family } : null;
}
