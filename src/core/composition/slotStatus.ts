import type {
  CompositionCue,
  CompositionCueV1,
  VibrixAuthoringManifest,
  VibrixManifestImage,
  VibrixManifestSlot
} from './types';

export type CueDependencyStatus =
  | 'current'
  | 'updated'
  | 'missing'
  | 'empty'
  | 'disabled'
  | 'inherit';

export interface CueDependencyResolution {
  status: CueDependencyStatus;
  slot?: VibrixManifestSlot;
  image?: VibrixManifestImage;
}

/** Legacy helper retained for the v1 Scene editor until L3 replaces it. */
export function resolveCueSlotStatus(
  cue: CompositionCueV1,
  manifest: VibrixAuthoringManifest | undefined
): CueDependencyResolution {
  const slot = manifest?.slots.find(candidate => candidate.id === cue.target.slotId);
  return resolveSlot(slot, cue.target.slotRevision);
}

export function resolveCueDependencyStatus(
  cue: CompositionCue,
  manifest: VibrixAuthoringManifest | undefined
): CueDependencyResolution {
  if ('slotId' in cue.target) return resolveCueSlotStatus(cue as CompositionCueV1, manifest);
  const target = cue.target;
  if (target.kind === 'inherit') return { status: 'inherit' };
  if (target.kind === 'image') {
    const image = manifest?.schemaVersion === 2
      ? manifest.images.find(candidate => candidate.id === target.id)
      : undefined;
    if (!image) return { status: 'missing' };
    if (!image.enabled) return { status: 'disabled', image };
    return {
      status: image.revision === target.revision ? 'current' : 'updated',
      image
    };
  }
  const slot = manifest?.slots.find(candidate => candidate.id === target.id);
  return resolveSlot(slot, target.revision);
}

function resolveSlot(
  slot: VibrixManifestSlot | undefined,
  authoredRevision: string
): CueDependencyResolution {
  if (!slot) return { status: 'missing' };
  if (slot.revision === 'empty') return { status: 'empty', slot };
  if (!slot.cueable) return { status: 'disabled', slot };
  return {
    status: slot.revision === authoredRevision ? 'current' : 'updated',
    slot
  };
}
