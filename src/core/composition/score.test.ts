import { describe, expect, it } from 'vitest';
import { normalizeProject } from '../project/serialization';
import { createProjectExportEnvelope, parseProjectExportEnvelope } from '../project/serialization';
import { parseAuthoringManifest } from './authoringManifest';
import {
  cloneDefaultCompositionScore,
  createVibrixScoreEnvelope,
  normalizeCompositionScore
} from './score';
import { resolveCueDependencyStatus, resolveCueSlotStatus } from './slotStatus';

const SCORE_MANIFEST = {
  schemaVersion: 1,
  app: 'Vibrix',
  exportKind: 'vibrix-manifest',
  exportedAt: '2026-10-02T00:00:00.000Z',
  rendererVersion: '0.7.0-alpha',
  storePersistVersion: 144,
  projectName: 'Demo',
  revision: '7f3a1c9e',
  slots: [{
    id: 'scene-a', family: 'scene', name: 'Verse', revision: '1a2b3c4d',
    sceneBindable: false, cueable: true
  }]
};

const SCORE_MANIFEST_V2 = {
  ...SCORE_MANIFEST,
  schemaVersion: 2,
  slots: [
    ...SCORE_MANIFEST.slots,
    {
      id: 'spectrum-a', family: 'spectrum-second', name: 'Spectrum 2',
      revision: 'spectrum-revision', sceneBindable: true, cueable: true
    },
    {
      id: 'intro-a', family: 'intro-window', name: 'Intro',
      revision: 'empty', sceneBindable: false, cueable: false
    }
  ],
  images: [{
    id: 'image-a', kind: 'image', name: 'Cover', revision: 'image-revision',
    enabled: true, sceneSlotId: null
  }, {
    id: 'image-disabled', kind: 'image', name: 'Disabled cover', revision: 'disabled-revision',
    enabled: false, sceneSlotId: null
  }]
};

describe('Vibrix composition score', () => {
  it('normalizes times to non-negative integer milliseconds', () => {
    const score = normalizeCompositionScore({
      tracks: [{ id: 'scenes', name: 'Scenes', kind: 'scene', order: 0, enabled: true, locked: false }],
      cues: [{
        id: 'cue-a', trackId: 'scenes', startTimeMs: 100.4, endTimeMs: 100.2,
        target: { kind: 'scene', family: 'scene', slotId: 'scene-a', slotRevision: '1a2b3c4d' },
        priority: 0, enabled: true
      }]
    });
    expect(score.cues[0]).toMatchObject({ startTimeMs: 100, endTimeMs: 101 });
    expect(score.schemaVersion).toBe(1);
  });

  it('stores new empty projects explicitly as schema v2', () => {
    const score = cloneDefaultCompositionScore();
    expect(score).toMatchObject({ schemaVersion: 2, cues: [] });
    expect(normalizeCompositionScore(score).schemaVersion).toBe(2);
  });

  it('treats a missing discriminator as v1 without inferring from cue contents', () => {
    const legacy = normalizeCompositionScore({ tracks: [], cues: [] });
    const sustainedLooking = normalizeCompositionScore({
      tracks: [{ id: 'images', name: 'Images', kind: 'image', order: 0 }],
      cues: [{
        id: 'image', trackId: 'images', startTimeMs: 0,
        target: { kind: 'image', family: 'image', id: 'image-a', revision: 'r1' }
      }]
    });
    expect(legacy.schemaVersion).toBe(1);
    expect(sustainedLooking).toMatchObject({ schemaVersion: 1, cues: [] });
  });

  it('normalizes strict sustained v2 targets without storing duration or transition', () => {
    const score = normalizeCompositionScore({
      schemaVersion: 2,
      tracks: [
        { id: 'images', name: 'Images', kind: 'image', order: 0 },
        { id: 'spectrum-2', name: 'Spectrum 2', kind: 'spectrum-second', order: 1 },
        { id: 'intro', name: 'Intro', kind: 'intro-window', order: 2 }
      ],
      cues: [{
        id: 'image-a', trackId: 'images', startTimeMs: 10.6, endTimeMs: 999,
        transition: { type: 'cut', durationMs: 0, easing: 'linear' },
        target: { kind: 'image', family: 'image', id: 'image-a', revision: 'image-revision' }
      }, {
        id: 'spectrum-a', trackId: 'spectrum-2', startTimeMs: 1000,
        target: {
          kind: 'feature-slot', family: 'spectrum-second',
          id: 'spectrum-a', revision: 'spectrum-revision'
        }
      }, {
        id: 'inherit-spectrum', trackId: 'spectrum-2', startTimeMs: 2000,
        target: { kind: 'inherit', family: 'spectrum-second' }
      }, {
        id: 'invalid-inherit', trackId: 'images', startTimeMs: 3000,
        target: { kind: 'inherit', family: 'scene' }
      }]
    });
    expect(score.schemaVersion).toBe(2);
    expect(score.tracks.map(track => track.kind)).toEqual(['image', 'spectrum-second']);
    expect(score.cues).toHaveLength(3);
    expect(score.cues[0]).toEqual({
      id: 'image-a', trackId: 'images', startTimeMs: 11,
      target: { kind: 'image', family: 'image', id: 'image-a', revision: 'image-revision' },
      priority: 0, enabled: true
    });
    expect(score.cues[0]).not.toHaveProperty('endTimeMs');
    expect(score.cues[0]).not.toHaveProperty('transition');
  });

  it('builds a deterministic file/transport payload from project state', () => {
    const parsed = parseAuthoringManifest(SCORE_MANIFEST);
    if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
    const project = normalizeProject({
      id: 'project-1',
      name: 'Demo score',
      vibrixManifest: parsed.manifest,
      composition: {
        schemaVersion: 1,
        tracks: [{ id: 'scenes', name: 'Scene', kind: 'scene', order: 0, enabled: true, locked: false }],
        cues: [{
          id: 'cue-a', trackId: 'scenes', startTimeMs: 1000, endTimeMs: 5000,
          target: { kind: 'scene', family: 'scene', slotId: 'scene-a', slotRevision: '1a2b3c4d' },
          transition: { type: 'crossfade', durationMs: 500, easing: 'ease-in-out' },
          priority: 0, enabled: true
        }]
      }
    });
    const envelope = createVibrixScoreEnvelope(project, '2026-10-02T01:00:00.000Z');
    expect(envelope.exportKind).toBe('vibrix-score');
    expect(envelope.score).toEqual({
      tracks: project.composition.tracks,
      cues: project.composition.cues
    });
    expect(envelope.score).not.toHaveProperty('schemaVersion');
    expect(envelope.dependencies).toEqual([{
      slotId: 'scene-a', family: 'scene', name: 'Verse', revision: '1a2b3c4d'
    }]);
    expect(JSON.stringify(envelope)).toBe(JSON.stringify(createVibrixScoreEnvelope(project, envelope.exportedAt)));
  });

  it('round-trips composition and manifest through the project export', () => {
    const parsed = parseAuthoringManifest(SCORE_MANIFEST);
    if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
    const project = normalizeProject({
      id: 'round-trip',
      name: 'Round trip',
      vibrixManifest: parsed.manifest,
      composition: {
        schemaVersion: 1,
        tracks: [{ id: 'scenes', name: 'Scene', kind: 'scene', order: 0, enabled: true, locked: false }],
        cues: [{
          id: 'cue-a', trackId: 'scenes', startTimeMs: 1200, endTimeMs: 4200,
          target: { kind: 'scene', family: 'scene', slotId: 'scene-a', slotRevision: '1a2b3c4d' },
          priority: 0, enabled: true
        }]
      }
    });
    const restored = parseProjectExportEnvelope(JSON.parse(JSON.stringify(createProjectExportEnvelope(project))));
    expect(restored.composition).toEqual(project.composition);
    expect(restored.vibrixManifest).toEqual(parsed.manifest);
  });

  it('round-trips v2 ids, revisions, order and start times', () => {
    const parsed = parseAuthoringManifest(SCORE_MANIFEST_V2);
    if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
    const composition = normalizeCompositionScore({
      schemaVersion: 2,
      tracks: [
        { id: 'images', name: 'Images', kind: 'image', order: 0, enabled: true, locked: false },
        { id: 'spectrum-2', name: 'Spectrum 2', kind: 'spectrum-second', order: 1, enabled: true, locked: false }
      ],
      cues: [{
        id: 'image-cue', trackId: 'images', startTimeMs: 1234,
        target: { kind: 'image', family: 'image', id: 'image-a', revision: 'image-revision' },
        priority: 1, enabled: true
      }, {
        id: 'spectrum-cue', trackId: 'spectrum-2', startTimeMs: 3456,
        target: {
          kind: 'feature-slot', family: 'spectrum-second',
          id: 'spectrum-a', revision: 'spectrum-revision'
        },
        priority: 0, enabled: true
      }, {
        id: 'inherit-cue', trackId: 'spectrum-2', startTimeMs: 5678,
        target: { kind: 'inherit', family: 'spectrum-second' }, priority: 0, enabled: true
      }]
    });
    const project = normalizeProject({
      id: 'round-trip-v2', name: 'Round trip v2', vibrixManifest: parsed.manifest, composition
    });
    const restored = parseProjectExportEnvelope(JSON.parse(JSON.stringify(createProjectExportEnvelope(project))));
    expect(restored.composition).toEqual(composition);
    expect(restored.composition.schemaVersion).toBe(2);

    const envelope = createVibrixScoreEnvelope(project, '2026-10-13T00:00:00.000Z');
    expect(envelope.schemaVersion).toBe(2);
    expect(envelope.score).not.toHaveProperty('schemaVersion');
    expect(envelope.dependencies).toEqual([
      {
        kind: 'slot', id: 'spectrum-a', family: 'spectrum-second',
        name: 'Spectrum 2', revision: 'spectrum-revision'
      },
      {
        kind: 'image', id: 'image-a', family: 'image',
        name: 'Cover', revision: 'image-revision'
      }
    ]);
  });

  it('detects current, updated, and missing slots by id and revision', () => {
    const parsed = parseAuthoringManifest(SCORE_MANIFEST);
    if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
    const cue = normalizeCompositionScore({
      tracks: [{ id: 'scenes', name: 'Scene', kind: 'scene', order: 0, enabled: true, locked: false }],
      cues: [{
        id: 'cue', trackId: 'scenes', startTimeMs: 0, endTimeMs: 1000,
        target: { kind: 'scene', slotId: 'scene-a', slotRevision: '1a2b3c4d' }, priority: 0, enabled: true
      }]
    });
    if (cue.schemaVersion !== 1) throw new Error('Expected a v1 score');
    const legacyCue = cue.cues[0]!;
    expect(resolveCueSlotStatus(legacyCue, parsed.manifest).status).toBe('current');
    expect(resolveCueSlotStatus({ ...legacyCue, target: { ...legacyCue.target, slotRevision: 'old' } }, parsed.manifest).status).toBe('updated');
    expect(resolveCueSlotStatus({ ...legacyCue, target: { ...legacyCue.target, slotId: 'gone' } }, parsed.manifest).status).toBe('missing');
  });

  it('reports v2 image and slot dependency states without treating inherit as a dependency', () => {
    const parsed = parseAuthoringManifest(SCORE_MANIFEST_V2);
    if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
    const score = normalizeCompositionScore({
      schemaVersion: 2,
      tracks: [
        { id: 'images', name: 'Images', kind: 'image', order: 0 },
        { id: 'spectrum', name: 'Spectrum', kind: 'spectrum-second', order: 1 }
      ],
      cues: [{
        id: 'image', trackId: 'images', startTimeMs: 0,
        target: { kind: 'image', family: 'image', id: 'image-disabled', revision: 'disabled-revision' }
      }, {
        id: 'slot', trackId: 'spectrum', startTimeMs: 0,
        target: { kind: 'feature-slot', family: 'spectrum-second', id: 'spectrum-a', revision: 'old' }
      }, {
        id: 'inherit', trackId: 'spectrum', startTimeMs: 1,
        target: { kind: 'inherit', family: 'spectrum-second' }
      }]
    });
    expect(score.schemaVersion).toBe(2);
    expect(resolveCueDependencyStatus(score.cues[0]!, parsed.manifest).status).toBe('disabled');
    expect(resolveCueDependencyStatus(score.cues[1]!, parsed.manifest).status).toBe('updated');
    expect(resolveCueDependencyStatus(score.cues[2]!, parsed.manifest).status).toBe('inherit');

    const emptyManifest = {
      ...parsed.manifest,
      slots: parsed.manifest.slots.map(slot => slot.id === 'spectrum-a'
        ? { ...slot, revision: 'empty' }
        : slot)
    };
    expect(resolveCueDependencyStatus(score.cues[1]!, emptyManifest).status).toBe('empty');
  });
});
