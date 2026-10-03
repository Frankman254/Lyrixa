import { describe, expect, it } from 'vitest';
import { normalizeProject } from '../project/serialization';
import { createProjectExportEnvelope, parseProjectExportEnvelope } from '../project/serialization';
import { parseAuthoringManifest } from './authoringManifest';
import { createVibrixScoreEnvelope, normalizeCompositionScore } from './score';
import { resolveCueSlotStatus } from './slotStatus';

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
  });

  it('builds a deterministic file/transport payload from project state', () => {
    const parsed = parseAuthoringManifest(SCORE_MANIFEST);
    if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
    const project = normalizeProject({
      id: 'project-1',
      name: 'Demo score',
      vibrixManifest: parsed.manifest,
      composition: {
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
    expect(envelope.score).toEqual(project.composition);
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

  it('detects current, updated, and missing slots by id and revision', () => {
    const parsed = parseAuthoringManifest(SCORE_MANIFEST);
    if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
    const cue = normalizeCompositionScore({
      tracks: [{ id: 'scenes', name: 'Scene', kind: 'scene', order: 0, enabled: true, locked: false }],
      cues: [{
        id: 'cue', trackId: 'scenes', startTimeMs: 0, endTimeMs: 1000,
        target: { kind: 'scene', slotId: 'scene-a', slotRevision: '1a2b3c4d' }, priority: 0, enabled: true
      }]
    }).cues[0]!;
    expect(resolveCueSlotStatus(cue, parsed.manifest).status).toBe('current');
    expect(resolveCueSlotStatus({ ...cue, target: { ...cue.target, slotRevision: 'old' } }, parsed.manifest).status).toBe('updated');
    expect(resolveCueSlotStatus({ ...cue, target: { ...cue.target, slotId: 'gone' } }, parsed.manifest).status).toBe('missing');
  });
});
