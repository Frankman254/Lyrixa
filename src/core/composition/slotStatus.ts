import type { CompositionCue, VibrixAuthoringManifest, VibrixManifestSlot } from './types';

export type CueSlotStatus = 'current' | 'updated' | 'missing';

export function resolveCueSlotStatus(
  cue: CompositionCue,
  manifest: VibrixAuthoringManifest | undefined
): { status: CueSlotStatus; slot?: VibrixManifestSlot } {
  const slot = manifest?.slots.find(candidate => candidate.id === cue.target.slotId);
  if (!slot) return { status: 'missing' };
  return {
    status: slot.revision === cue.target.slotRevision ? 'current' : 'updated',
    slot
  };
}
