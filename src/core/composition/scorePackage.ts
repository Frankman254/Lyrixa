import {
  createVibrixScoreEnvelope,
  getCompositionExportIssues,
  type VibrixScoreEnvelope
} from './score';
import { snapshotKey } from './authoringManifest';
import type { LyrixaProject } from '../types/project';
import type {
  StoredCompositionV1,
  StoredCompositionV2,
  VibrixAuthoringManifest,
  VibrixAuthoringSnapshot,
  VibrixAuthoringSource,
  VibrixManifestSlot
} from './types';

export const VIBRIX_SCORE_PACKAGE_FORMAT = 'vibrix-score' as const;
export const VIBRIX_SCORE_PACKAGE_VERSION = 1;

export interface VibrixScorePreview {
  imageId: string;
  revision: string;
  name: string;
  thumbnailDataUrl: string;
}

/**
 * Self-contained hand-off that travels back to Vibrix: the score envelope plus
 * the transitive closure of the snapshots and previews it actually needs.
 *
 * With a loose legacy manifest (no snapshots on the device) it degrades to the
 * reference-only envelope, which is what v1 Vibrix already reads.
 */
export interface VibrixScorePackage {
  format: typeof VIBRIX_SCORE_PACKAGE_FORMAT;
  packageVersion: number;
  exportedAt: string;
  envelope: VibrixScoreEnvelope;
  snapshots: VibrixAuthoringSnapshot[] | null;
  previews: VibrixScorePreview[] | null;
  /** True when the hand-off is self-contained; false for the legacy envelope. */
  selfContained: boolean;
}

interface ClosureNode {
  kind: 'slot' | 'image';
  id: string;
}

/**
 * Transitive dependency closure of the enabled cues, following scene
 * `bindings` and image `sceneSlotId` edges. `inherit` targets never add a
 * dependency. Throws a `VibrixScorePackageError` when the closure cannot be
 * resolved against the current catalog or source snapshots.
 */
export function computeScoreClosure(
  score: StoredCompositionV1 | StoredCompositionV2,
  manifest: VibrixAuthoringManifest,
  sourceSnapshots: VibrixAuthoringSnapshot[] | null
): { snapshots: VibrixAuthoringSnapshot[] | null; previews: VibrixScorePreview[] | null } {
  const slotsById = new Map(manifest.slots.map(slot => [slot.id, slot] as const));
  const imagesById = manifest.schemaVersion === 2
    ? new Map(manifest.images.map(image => [image.id, image] as const))
    : new Map<string, never>();
  const snapshotsByKey = sourceSnapshots
    ? new Map(sourceSnapshots.map(snapshot => [snapshotKey(snapshot.kind, snapshot.id), snapshot] as const))
    : null;

  const errors: string[] = [];
  const visited = new Set<string>();
  const queue: ClosureNode[] = [];
  // A cue sitting on a disabled track never plays (same rule as Vibrix's
  // resolveVisualStateAt), so it must not pull snapshots into the closure or
  // block export on a reference that will never resolve.
  const activeTrackIds = new Set(score.tracks.filter(track => track.enabled).map(track => track.id));

  const enqueue = (node: ClosureNode) => {
    const key = snapshotKey(node.kind, node.id);
    if (visited.has(key)) return;
    visited.add(key);
    queue.push(node);
  };

  if (score.schemaVersion === 1) {
    // Legacy cues only reference slots (via slotId), never inherit or images.
    for (const cue of score.cues) {
      if (!cue.enabled || !activeTrackIds.has(cue.trackId)) continue;
      enqueue({ kind: 'slot', id: cue.target.slotId });
    }
  } else {
    for (const cue of score.cues) {
      if (!cue.enabled || !activeTrackIds.has(cue.trackId)) continue;
      if (cue.target.kind === 'inherit') continue;
      if (cue.target.kind === 'image') enqueue({ kind: 'image', id: cue.target.id });
      else enqueue({ kind: 'slot', id: cue.target.id });
    }
  }

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const node = queue[cursor]!;
    if (node.kind === 'slot') {
      const slot = slotsById.get(node.id);
      if (!slot) {
        errors.push(`Closure references missing slot "${node.id}".`);
        continue;
      }
      validateSnapshotAgainstItem(snapshotKey('slot', node.id), slot, snapshotsByKey, errors);
      for (const [family, binding] of Object.entries(slot.bindings ?? {})) {
        if (binding === 'off') continue;
        const target = slotsById.get(binding);
        if (!target) {
          errors.push(`Slot "${slot.name}" binding ${family} references missing slot "${binding}".`);
          continue;
        }
        if (target.family !== family) {
          errors.push(`Slot "${slot.name}" binding ${family} references a ${target.family} slot.`);
          continue;
        }
        enqueue({ kind: 'slot', id: target.id });
      }
      continue;
    }

    const image = imagesById.get(node.id);
    if (!image) {
      errors.push(`Closure references missing image "${node.id}".`);
      continue;
    }
    validateSnapshotAgainstItem(snapshotKey('image', node.id), image, snapshotsByKey, errors);
    if (image.sceneSlotId) {
      const scene = slotsById.get(image.sceneSlotId);
      if (!scene) {
        errors.push(`Image "${image.name}" references missing scene slot "${image.sceneSlotId}".`);
      } else if (scene.family !== 'scene') {
        errors.push(`Image "${image.name}" references a ${scene.family} slot as its scene.`);
      } else {
        enqueue({ kind: 'slot', id: scene.id });
      }
    }
  }

  if (errors.length > 0) throw new VibrixScorePackageError(errors);

  if (!snapshotsByKey) return { snapshots: null, previews: null };

  const snapshots: VibrixAuthoringSnapshot[] = [];
  const previews: VibrixScorePreview[] = [];
  for (const node of queue) {
    const snapshot = snapshotsByKey.get(snapshotKey(node.kind, node.id));
    if (!snapshot) {
      // Reachability and revision were validated above; this keeps the types honest.
      errors.push(`Missing ${snapshotKey(node.kind, node.id)} snapshot.`);
      continue;
    }
    snapshots.push(snapshot);
    if (node.kind === 'image' && manifest.schemaVersion === 2) {
      const image = manifest.images.find(candidate => candidate.id === node.id);
      if (image?.thumbnailDataUrl) {
        previews.push({
          imageId: image.id,
          revision: image.revision,
          name: image.name,
          thumbnailDataUrl: image.thumbnailDataUrl
        });
      }
    }
  }
  if (errors.length > 0) throw new VibrixScorePackageError(errors);
  return { snapshots, previews };
}

function validateSnapshotAgainstItem(
  key: string,
  item: VibrixManifestSlot | { id: string; name: string; revision: string },
  snapshotsByKey: Map<string, VibrixAuthoringSnapshot> | null,
  errors: string[]
): void {
  if (!snapshotsByKey) return;
  const snapshot = snapshotsByKey.get(key);
  if (!snapshot) {
    errors.push(`Missing ${key} snapshot needed by the score.`);
    return;
  }
  if (snapshot.revision !== item.revision) {
    errors.push(`${key} snapshot revision does not match the catalog.`);
  }
  if (snapshot.kind === 'slot' && 'family' in snapshot && isSlotLike(item)) {
    if (snapshot.family !== item.family) {
      errors.push(`${key} snapshot family does not match the catalog.`);
    }
  }
}

function isSlotLike(item: VibrixManifestSlot | { id: string; name: string; revision: string }): item is VibrixManifestSlot {
  return 'family' in item;
}

export class VibrixScorePackageError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Vibrix score package cannot be built:\n${issues.join('\n')}`);
    this.name = 'VibrixScorePackageError';
    this.issues = issues;
  }
}

export interface BuildScorePackageOptions {
  project: LyrixaProject;
  manifest: VibrixAuthoringManifest | undefined;
  /** Full authoring source from IndexedDB, when the portable package is stored. */
  source: VibrixAuthoringSource | null;
  exportedAt?: string;
}

/**
 * Builds the hand-off document. Throws when enabled cues do not resolve
 * against the current catalog (same checks the reference envelope enforces)
 * or when the closure is incomplete.
 */
export function buildVibrixScorePackage({
  project,
  manifest,
  source,
  exportedAt
}: BuildScorePackageOptions): VibrixScorePackage {
  const score = project.composition;
  const issues = getCompositionExportIssues(score, manifest);
  if (issues.length > 0) throw new VibrixScorePackageError(issues);

  // Reuses the validated envelope (metadata + schema-aware dependencies).
  const envelope = createVibrixScoreEnvelope(
    { ...project, vibrixManifest: manifest },
    exportedAt ?? new Date().toISOString()
  );

  const sourceSnapshots = source?.kind === 'package' ? source.package.snapshots : null;
  const manifestForClosure = source?.kind === 'package' ? source.package.manifest : manifest;
  if (!manifestForClosure) {
    throw new VibrixScorePackageError(['Import the Vibrix authoring catalog before exporting cues.']);
  }
  const { snapshots, previews } = computeScoreClosure(score, manifestForClosure, sourceSnapshots);

  return {
    format: VIBRIX_SCORE_PACKAGE_FORMAT,
    packageVersion: VIBRIX_SCORE_PACKAGE_VERSION,
    exportedAt: envelope.exportedAt,
    envelope,
    snapshots,
    previews,
    selfContained: snapshots !== null
  };
}
