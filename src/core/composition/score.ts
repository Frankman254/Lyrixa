import type { LyrixaProject } from '../types/project';
import { parseAuthoringManifest } from './authoringManifest';
import {
  DEFAULT_COMPOSITION_SCORE,
  DEFAULT_COMPOSITION_SCORE_V1,
  VIBRIX_GRANULAR_FAMILIES,
  VIBRIX_SLOT_FAMILIES,
  type CompositionCue,
  type CompositionCueV1,
  type CompositionCueV2,
  type CompositionEasing,
  type CompositionScore,
  type CompositionTargetV2,
  type CompositionTrackV1,
  type CompositionTrackV2,
  type CompositionTransitionType,
  type StoredCompositionV1,
  type StoredCompositionV2,
  type VibrixAuthoringManifest,
  type VibrixGranularFamily,
  type VibrixSlotFamily,
  type VibrixTimelineKind
} from './types';

export const VIBRIX_SCORE_SCHEMA_VERSION = 2;

interface VibrixScoreEnvelopeBase {
  app: 'Lyrixa';
  exportKind: 'vibrix-score';
  exportedAt: string;
  projectName: string;
  sourceTrack: { fileName: string; durationMs: number; fileKey?: string } | null;
  renderer: {
    minimumVersion: string;
    sourceProjectId?: string;
    catalogRevision?: string;
  };
}

export interface VibrixScoreDependencyV1 {
  slotId: string;
  family: VibrixSlotFamily;
  name: string;
  revision: string;
}

export interface VibrixScoreDependencyV2 {
  kind: 'slot' | 'image';
  id: string;
  family: VibrixTimelineKind;
  name: string;
  revision: string;
}

export interface VibrixScoreEnvelopeV1 extends VibrixScoreEnvelopeBase {
  schemaVersion: 1;
  score: Pick<StoredCompositionV1, 'tracks' | 'cues'>;
  dependencies: VibrixScoreDependencyV1[];
}

export interface VibrixScoreEnvelopeV2 extends VibrixScoreEnvelopeBase {
  schemaVersion: 2;
  score: Pick<StoredCompositionV2, 'tracks' | 'cues'>;
  dependencies: VibrixScoreDependencyV2[];
}

export type VibrixScoreEnvelope = VibrixScoreEnvelopeV1 | VibrixScoreEnvelopeV2;

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
  const master = project.audioTracks.master;
  const base: VibrixScoreEnvelopeBase = {
    app: 'Lyrixa',
    exportKind: 'vibrix-score',
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
    }
  };
  return score.schemaVersion === 1
    ? {
        ...base,
        schemaVersion: 1,
        score: { tracks: score.tracks, cues: score.cues },
        dependencies: collectV1Dependencies(score, manifest)
      }
    : {
        ...base,
        schemaVersion: 2,
        score: { tracks: score.tracks, cues: score.cues },
        dependencies: collectV2Dependencies(score, manifest)
      };
}

export function getCompositionExportIssues(
  score: CompositionScore,
  manifest: VibrixAuthoringManifest | undefined
): string[] {
  // A cue on a disabled track never plays (Vibrix drops it in resolveVisualStateAt),
  // so a broken reference under it must not block the export either.
  const activeTrackIds = new Set(score.tracks.filter(track => track.enabled).map(track => track.id));
  const isPlayed = (cue: CompositionCue) => cue.enabled && activeTrackIds.has(cue.trackId);
  if (!score.cues.some(isPlayed)) return [];
  if (!manifest) return ['Import the Vibrix authoring manifest before exporting cues.'];
  const slots = new Map(manifest.slots.map(slot => [slot.id, slot]));
  const images = new Map(manifest.schemaVersion === 2
    ? manifest.images.map(image => [image.id, image] as const)
    : []);

  if (score.schemaVersion === 1) {
    return score.cues.filter(isPlayed).flatMap(cue => {
      const slot = slots.get(cue.target.slotId);
      if (!slot) return [`Cue "${cue.id}" references missing slot "${cue.target.slotId}".`];
      if (!slot.cueable) return [`Cue "${cue.id}" references non-cueable slot "${slot.name}".`];
      if (slot.revision === 'empty') return [`Cue "${cue.id}" references empty slot "${slot.name}".`];
      return [];
    });
  }
  return score.cues.filter(isPlayed).flatMap(cue => {
    if (cue.target.kind === 'inherit') return [];
    if (cue.target.kind === 'image') {
      const image = images.get(cue.target.id);
      if (!image) return [`Cue "${cue.id}" references missing image "${cue.target.id}".`];
      if (!image.enabled) return [`Cue "${cue.id}" references disabled image "${image.name}".`];
      return [];
    }
    const slotId = cue.target.id;
    const slot = slots.get(slotId);
    if (!slot) return [`Cue "${cue.id}" references missing slot "${slotId}".`];
    if (slot.family !== cue.target.family) {
      return [`Cue "${cue.id}" targets ${cue.target.family} but slot "${slot.name}" is ${slot.family}.`];
    }
    if (!slot.cueable) return [`Cue "${cue.id}" references non-cueable slot "${slot.name}".`];
    if (slot.revision === 'empty') return [`Cue "${cue.id}" references empty slot "${slot.name}".`];
    return [];
  });
}

/** Missing schemaVersion is historical v1; it is never inferred from cues. */
export function normalizeCompositionScore(input: unknown): CompositionScore {
  if (isRecord(input) && input.schemaVersion === 2) return normalizeScoreV2(input);
  return normalizeScoreV1(isRecord(input) ? input : {});
}

export function cloneDefaultCompositionScore(): StoredCompositionV2 {
  return {
    schemaVersion: 2,
    tracks: DEFAULT_COMPOSITION_SCORE.tracks.map(track => ({ ...track })),
    cues: []
  };
}

export function cloneDefaultCompositionScoreV1(): StoredCompositionV1 {
  return {
    schemaVersion: 1,
    tracks: DEFAULT_COMPOSITION_SCORE_V1.tracks.map(track => ({ ...track })),
    cues: []
  };
}

export function createCompositionCueId(
  score: CompositionScore,
  targetId: string,
  startTimeMs: number
): string {
  const base = `cue-${targetId}-${Math.max(0, Math.round(startTimeMs))}`;
  const ids = new Set(score.cues.map(cue => cue.id));
  if (!ids.has(base)) return base;
  let suffix = 2;
  while (ids.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function normalizeScoreV1(input: Record<string, unknown>): StoredCompositionV1 {
  const tracks = normalizeTracksV1(input.tracks);
  const resolvedTracks = tracks.length > 0 ? tracks : cloneDefaultCompositionScoreV1().tracks;
  const trackIds = new Set(resolvedTracks.map(track => track.id));
  const cues = uniqueById(normalizeArray(input.cues, normalizeCueV1))
    .filter(cue => trackIds.has(cue.trackId));
  return { schemaVersion: 1, tracks: resolvedTracks, cues };
}

function normalizeScoreV2(input: Record<string, unknown>): StoredCompositionV2 {
  const tracks = normalizeTracksV2(input.tracks);
  const resolvedTracks = tracks.length > 0 ? tracks : cloneDefaultCompositionScore().tracks;
  const trackById = new Map(resolvedTracks.map(track => [track.id, track]));
  const cues = uniqueById(normalizeArray(input.cues, normalizeCueV2))
    .filter(cue => trackById.get(cue.trackId)?.kind === cue.target.family);
  return { schemaVersion: 2, tracks: resolvedTracks, cues };
}

function normalizeTracksV1(input: unknown): CompositionTrackV1[] {
  const tracks = normalizeArray(input, (value, index) => {
    if (!isRecord(value) || !nonEmptyString(value.id) || !isSlotFamily(value.kind)) return null;
    return {
      id: value.id,
      name: nonEmptyString(value.name) ? value.name : `Track ${index + 1}`,
      kind: value.kind,
      order: integer(value.order, index),
      enabled: value.enabled !== false,
      locked: value.locked === true
    };
  });
  return uniqueById(tracks).sort((a, b) => a.order - b.order);
}

function normalizeTracksV2(input: unknown): CompositionTrackV2[] {
  const tracks = normalizeArray(input, (value, index) => {
    if (!isRecord(value) || !nonEmptyString(value.id) || !isTimelineKind(value.kind)) return null;
    return {
      id: value.id,
      name: nonEmptyString(value.name) ? value.name : `Track ${index + 1}`,
      kind: value.kind,
      order: integer(value.order, index),
      enabled: value.enabled !== false,
      locked: value.locked === true
    };
  });
  return uniqueById(tracks).sort((a, b) => a.order - b.order);
}

function normalizeCueV1(input: unknown, index: number): CompositionCueV1 | null {
  if (!isRecord(input) || !nonEmptyString(input.trackId) || !isRecord(input.target)) return null;
  const target = input.target;
  if (target.kind !== 'scene' && target.kind !== 'feature-slot') return null;
  if (!nonEmptyString(target.slotId) || !nonEmptyString(target.slotRevision)) return null;
  if (target.family !== undefined && !isSlotFamily(target.family)) return null;
  const startTimeMs = Math.max(0, integer(input.startTimeMs, 0));
  const transition = normalizeTransition(input.transition);
  return {
    id: nonEmptyString(input.id) ? input.id : `cue-${index + 1}`,
    trackId: input.trackId,
    startTimeMs,
    endTimeMs: Math.max(startTimeMs + 1, integer(input.endTimeMs, startTimeMs + 1)),
    target: {
      kind: target.kind,
      ...(target.family ? { family: target.family } : {}),
      slotId: target.slotId,
      slotRevision: target.slotRevision
    },
    ...(transition ? { transition } : {}),
    priority: integer(input.priority, 0),
    enabled: input.enabled !== false
  };
}

function normalizeCueV2(input: unknown, index: number): CompositionCueV2 | null {
  if (!isRecord(input) || !nonEmptyString(input.trackId) || !isRecord(input.target)) return null;
  const target = normalizeTargetV2(input.target);
  if (!target) return null;
  return {
    id: nonEmptyString(input.id) ? input.id : `cue-${index + 1}`,
    trackId: input.trackId,
    startTimeMs: Math.max(0, integer(input.startTimeMs, 0)),
    target,
    priority: integer(input.priority, 0),
    enabled: input.enabled !== false
  };
}

function normalizeTargetV2(input: Record<string, unknown>): CompositionTargetV2 | null {
  if (input.kind === 'inherit' && isGranularFamily(input.family)) {
    return { kind: 'inherit', family: input.family };
  }
  if (!nonEmptyString(input.id) || !nonEmptyString(input.revision)) return null;
  if (input.kind === 'scene' && input.family === 'scene') {
    return { kind: 'scene', family: 'scene', id: input.id, revision: input.revision };
  }
  if (input.kind === 'image' && input.family === 'image') {
    return { kind: 'image', family: 'image', id: input.id, revision: input.revision };
  }
  if (input.kind === 'feature-slot' && isGranularFamily(input.family)) {
    return { kind: 'feature-slot', family: input.family, id: input.id, revision: input.revision };
  }
  return null;
}

function normalizeTransition(input: unknown): CompositionCueV1['transition'] | undefined {
  if (!isRecord(input)) return undefined;
  const types: CompositionTransitionType[] = ['cut', 'crossfade', 'morph'];
  const easings: CompositionEasing[] = ['linear', 'ease-in', 'ease-out', 'ease-in-out'];
  return {
    type: types.includes(input.type as CompositionTransitionType)
      ? input.type as CompositionTransitionType
      : 'cut',
    durationMs: Math.max(0, integer(input.durationMs, 0)),
    easing: easings.includes(input.easing as CompositionEasing)
      ? input.easing as CompositionEasing
      : 'linear'
  };
}

function collectV1Dependencies(
  score: StoredCompositionV1,
  manifest: VibrixAuthoringManifest | undefined
): VibrixScoreDependencyV1[] {
  const activeTrackIds = new Set(score.tracks.filter(track => track.enabled).map(track => track.id));
  const referencedIds = new Set(
    score.cues
      .filter(cue => cue.enabled && activeTrackIds.has(cue.trackId))
      .map(cue => cue.target.slotId)
  );
  return manifest?.slots
    .filter(slot => referencedIds.has(slot.id))
    .map(slot => ({ slotId: slot.id, family: slot.family, name: slot.name, revision: slot.revision })) ?? [];
}

function collectV2Dependencies(
  score: StoredCompositionV2,
  manifest: VibrixAuthoringManifest | undefined
): VibrixScoreDependencyV2[] {
  if (!manifest) return [];
  const activeTrackIds = new Set(score.tracks.filter(track => track.enabled).map(track => track.id));
  const slotIds = new Set<string>();
  const imageIds = new Set<string>();
  score.cues.forEach(cue => {
    if (!cue.enabled || !activeTrackIds.has(cue.trackId) || cue.target.kind === 'inherit') return;
    if (cue.target.kind === 'image') imageIds.add(cue.target.id);
    else slotIds.add(cue.target.id);
  });
  const slots: VibrixScoreDependencyV2[] = manifest.slots
    .filter(slot => slotIds.has(slot.id))
    .map(slot => ({
      kind: 'slot', id: slot.id, family: slot.family as VibrixTimelineKind,
      name: slot.name, revision: slot.revision
    }));
  const images: VibrixScoreDependencyV2[] = manifest.schemaVersion === 2
    ? manifest.images.filter(image => imageIds.has(image.id)).map(image => ({
        kind: 'image', id: image.id, family: 'image', name: image.name, revision: image.revision
      }))
    : [];
  return [...slots, ...images];
}

function normalizeArray<T>(
  input: unknown,
  normalize: (value: unknown, index: number) => T | null
): T[] {
  return Array.isArray(input)
    ? input.flatMap((value, index) => {
        const normalized = normalize(value, index);
        return normalized ? [normalized] : [];
      })
    : [];
}

function uniqueById<T extends { id: string }>(values: T[]): T[] {
  const seen = new Set<string>();
  return values.filter(value => {
    if (seen.has(value.id)) return false;
    seen.add(value.id);
    return true;
  });
}

function isSlotFamily(value: unknown): value is VibrixSlotFamily {
  return typeof value === 'string' && VIBRIX_SLOT_FAMILIES.includes(value as VibrixSlotFamily);
}

function isGranularFamily(value: unknown): value is VibrixGranularFamily {
  return typeof value === 'string' &&
    VIBRIX_GRANULAR_FAMILIES.includes(value as VibrixGranularFamily);
}

function isTimelineKind(value: unknown): value is VibrixTimelineKind {
  return value === 'image' || (isSlotFamily(value) && value !== 'intro-window');
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function integer(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeStoredManifest(input: unknown): VibrixAuthoringManifest | undefined {
  if (input === undefined) return undefined;
  const parsed = parseAuthoringManifest(input);
  return parsed.ok ? parsed.manifest : undefined;
}
