import type { LyrixaProject } from '../types/project';
import {
  DEFAULT_COMPOSITION_SCORE,
  VIBRIX_SLOT_FAMILIES,
  type CompositionCue,
  type CompositionScore,
  type CompositionTrack,
  type VibrixAuthoringManifest,
  type VibrixSlotFamily
} from './types';

export const VIBRIX_SCORE_SCHEMA_VERSION = 1;

export interface VibrixScoreEnvelope {
  app: 'Lyrixa';
  exportKind: 'vibrix-score';
  schemaVersion: 1;
  exportedAt: string;
  projectName: string;
  sourceTrack: { fileName: string; durationMs: number; fileKey?: string } | null;
  renderer: {
    minimumVersion: string;
    sourceProjectId?: string;
    catalogRevision?: string;
  };
  score: CompositionScore;
  dependencies: Array<{
    slotId: string;
    family: VibrixSlotFamily;
    name: string;
    revision: string;
  }>;
}

export function createVibrixScoreEnvelope(
  project: LyrixaProject,
  exportedAt = new Date().toISOString()
): VibrixScoreEnvelope {
  const score = normalizeCompositionScore(project.composition);
  const manifest = project.vibrixManifest;
  const exportIssues = getCompositionExportIssues(score, manifest);
  if (exportIssues.length > 0) {
    throw new Error(`Vibrix score cannot be exported:\n${exportIssues.join('\n')}`);
  }
  const referencedIds = new Set(score.cues.map(cue => cue.target.slotId));
  const dependencies = manifest?.slots
    .filter(slot => referencedIds.has(slot.id))
    .map(slot => ({ slotId: slot.id, family: slot.family, name: slot.name, revision: slot.revision })) ?? [];
  const master = project.audioTracks.master;
  return {
    app: 'Lyrixa',
    exportKind: 'vibrix-score',
    schemaVersion: VIBRIX_SCORE_SCHEMA_VERSION,
    exportedAt,
    projectName: project.name,
    sourceTrack: master
      ? {
          fileName: master.fileName,
          durationMs: Math.max(0, Math.round(master.duration * 1000)),
          ...(master.fileKey ? { fileKey: master.fileKey } : {})
        }
      : null,
    renderer: {
      minimumVersion: manifest?.rendererVersion ?? '0.7.0-alpha',
      sourceProjectId: project.id,
      ...(manifest ? { catalogRevision: manifest.revision } : {})
    },
    score,
    dependencies
  };
}

export function getCompositionExportIssues(
  score: CompositionScore,
  manifest: VibrixAuthoringManifest | undefined
): string[] {
  if (score.cues.length === 0) return [];
  if (!manifest) return ['Import the Vibrix authoring manifest before exporting cues.'];
  const slots = new Map(manifest.slots.map(slot => [slot.id, slot]));
  return score.cues.flatMap(cue => {
    const slot = slots.get(cue.target.slotId);
    if (!slot) return [`Cue "${cue.id}" references missing slot "${cue.target.slotId}".`];
    if (!slot.cueable) return [`Cue "${cue.id}" references non-cueable slot "${slot.name}".`];
    if (slot.revision === 'empty') return [`Cue "${cue.id}" references empty slot "${slot.name}".`];
    return [];
  });
}

export function normalizeCompositionScore(input: Partial<CompositionScore> | undefined): CompositionScore {
  const tracks = normalizeTracks(input?.tracks);
  const trackIds = new Set(tracks.map(track => track.id));
  const cues = Array.isArray(input?.cues)
    ? input.cues.flatMap((cue, index) => {
        const normalized = normalizeCue(cue, index);
        return normalized && trackIds.has(normalized.trackId) ? [normalized] : [];
      })
    : [];
  return { tracks, cues };
}

export function cloneDefaultCompositionScore(): CompositionScore {
  return { tracks: DEFAULT_COMPOSITION_SCORE.tracks.map(track => ({ ...track })), cues: [] };
}

export function createCompositionCueId(
  score: CompositionScore,
  slotId: string,
  startTimeMs: number
): string {
  const base = `cue-${slotId}-${Math.max(0, Math.round(startTimeMs))}`;
  const ids = new Set(score.cues.map(cue => cue.id));
  if (!ids.has(base)) return base;
  let suffix = 2;
  while (ids.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function normalizeTracks(input: CompositionTrack[] | undefined): CompositionTrack[] {
  if (!Array.isArray(input) || input.length === 0) return cloneDefaultCompositionScore().tracks;
  const valid = input.flatMap((track, index) => {
    if (!track || typeof track.id !== 'string' || !track.id) return [];
    if (!VIBRIX_SLOT_FAMILIES.includes(track.kind)) return [];
    return [{
      id: track.id,
      name: typeof track.name === 'string' && track.name ? track.name : `Track ${index + 1}`,
      kind: track.kind,
      order: integer(track.order, index),
      enabled: track.enabled !== false,
      locked: track.locked === true
    }];
  });
  return valid.length > 0 ? valid.sort((a, b) => a.order - b.order) : cloneDefaultCompositionScore().tracks;
}

function normalizeCue(input: CompositionCue, index: number): CompositionCue | null {
  if (!input || typeof input.trackId !== 'string' || !input.target) return null;
  const family = input.target.family;
  if (family !== undefined && !VIBRIX_SLOT_FAMILIES.includes(family)) return null;
  if (typeof input.target.slotId !== 'string' || !input.target.slotId) return null;
  if (typeof input.target.slotRevision !== 'string' || !input.target.slotRevision) return null;
  const startTimeMs = Math.max(0, integer(input.startTimeMs, 0));
  const endTimeMs = Math.max(startTimeMs + 1, integer(input.endTimeMs, startTimeMs + 1));
  const transition = input.transition ? {
    type: (['cut', 'crossfade', 'morph'].includes(input.transition.type)
      ? input.transition.type
      : 'cut') as CompositionCue['transition'] extends infer T
        ? T extends { type: infer U } ? U : never
        : never,
    durationMs: Math.max(0, integer(input.transition.durationMs, 0)),
    easing: (['linear', 'ease-in', 'ease-out', 'ease-in-out'].includes(input.transition.easing)
      ? input.transition.easing
      : 'linear') as NonNullable<CompositionCue['transition']>['easing']
  } : undefined;
  return {
    id: typeof input.id === 'string' && input.id ? input.id : `cue-${index + 1}`,
    trackId: input.trackId,
    startTimeMs,
    endTimeMs,
    target: {
      kind: input.target.kind === 'feature-slot' ? 'feature-slot' : 'scene',
      ...(family ? { family } : {}),
      slotId: input.target.slotId,
      slotRevision: input.target.slotRevision
    },
    ...(transition ? { transition } : {}),
    priority: integer(input.priority, 0),
    enabled: input.enabled !== false
  };
}

function integer(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.round(value) : fallback;
}

export function normalizeStoredManifest(input: unknown): VibrixAuthoringManifest | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const candidate = input as VibrixAuthoringManifest;
  return candidate.app === 'Vibrix' && candidate.exportKind === 'vibrix-manifest'
    ? candidate
    : undefined;
}
