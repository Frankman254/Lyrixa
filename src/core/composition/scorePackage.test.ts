import { describe, expect, it } from 'vitest';
import {
  VIBRIX_SCORE_PACKAGE_FORMAT,
  VIBRIX_SCORE_PACKAGE_VERSION,
  VibrixScorePackageError,
  buildVibrixScorePackage,
  computeScoreClosure
} from './scorePackage';
import type {
  CompositionCueV2,
  StoredCompositionV2,
  VibrixAuthoringManifestV2,
  VibrixAuthoringPackage,
  VibrixAuthoringSnapshot
} from './types';
import type { LyrixaProject } from '../types/project';

const MANIFEST: VibrixAuthoringManifestV2 = {
  schemaVersion: 2,
  app: 'Vibrix',
  exportKind: 'vibrix-manifest',
  exportedAt: '2026-10-14T00:00:00.000Z',
  rendererVersion: '0.7.0-alpha',
  storePersistVersion: 153,
  projectName: 'Closure fixture',
  revision: 'catalog-1',
  slots: [
    {
      id: 'scene-a', family: 'scene', name: 'Verse', revision: 'sa-1',
      sceneBindable: false, cueable: true,
      bindings: { spectrum: 'spec-1', looks: 'look-1', particles: 'off' }
    },
    {
      id: 'scene-b', family: 'scene', name: 'Chorus', revision: 'sb-1',
      sceneBindable: false, cueable: true,
      bindings: { looks: 'look-1' }
    },
    { id: 'spec-1', family: 'spectrum', name: 'Bars', revision: 'sp-1', sceneBindable: true, cueable: true },
    { id: 'look-1', family: 'looks', name: 'Warm', revision: 'lk-1', sceneBindable: true, cueable: true },
    { id: 'rain-1', family: 'rain', name: 'Unused rain', revision: 'rn-1', sceneBindable: true, cueable: true }
  ],
  images: [
    {
      id: 'img-a', kind: 'image', name: 'Cover', revision: 'im-1',
      enabled: true, sceneSlotId: 'scene-a',
      thumbnailDataUrl: 'data:image/webp;base64,AQID'
    },
    {
      id: 'img-nothumb', kind: 'image', name: 'Raw', revision: 'im-2',
      enabled: true, sceneSlotId: null
    }
  ]
};

const SNAPSHOTS: VibrixAuthoringSnapshot[] = [
  { kind: 'slot', id: 'scene-a', family: 'scene', name: 'Verse', revision: 'sa-1', values: { enabled: true } },
  { kind: 'slot', id: 'scene-b', family: 'scene', name: 'Chorus', revision: 'sb-1', values: { enabled: true } },
  { kind: 'slot', id: 'spec-1', family: 'spectrum', name: 'Bars', revision: 'sp-1', values: { enabled: true } },
  { kind: 'slot', id: 'look-1', family: 'looks', name: 'Warm', revision: 'lk-1', values: { enabled: true } },
  { kind: 'slot', id: 'rain-1', family: 'rain', name: 'Unused rain', revision: 'rn-1', values: { enabled: true } },
  { kind: 'image', id: 'img-a', name: 'Cover', revision: 'im-1', values: { assetId: 'img-a' } },
  { kind: 'image', id: 'img-nothumb', name: 'Raw', revision: 'im-2', values: { assetId: 'img-nothumb' } }
];

const PACKAGE_SOURCE: VibrixAuthoringPackage = {
  format: 'vibrix-authoring',
  packageVersion: 1,
  exportedAt: '2026-10-14T00:00:00.000Z',
  manifest: MANIFEST,
  snapshots: SNAPSHOTS
};

function score(cues: CompositionCueV2[]): StoredCompositionV2 {
  return {
    schemaVersion: 2,
    tracks: [{ id: 'composition-scene', name: 'Scene', kind: 'scene', order: 0, enabled: true, locked: false }],
    cues
  };
}

const cue = (id: string, target: CompositionCueV2['target'], enabled = true): CompositionCueV2 => ({
  id,
  trackId: 'composition-scene',
  startTimeMs: 0,
  target,
  priority: 0,
  enabled
});

function makeProject(comp: StoredCompositionV2): LyrixaProject {
  return {
    id: 'project-1',
    name: 'Demo',
    composition: comp,
    audioTracks: { master: null },
    vibrixManifest: MANIFEST
  } as unknown as LyrixaProject;
}

describe('computeScoreClosure', () => {
  it('follows scene bindings transitively and stops at explicit off', () => {
    const result = computeScoreClosure(
      score([cue('c1', { kind: 'scene', family: 'scene', id: 'scene-a', revision: 'sa-1' })]),
      MANIFEST,
      SNAPSHOTS
    );
    const ids = result.snapshots!.map(s => `${s.kind}:${s.id}`).sort();
    // scene-a pulls spec-1 and look-1 via bindings; particles is 'off' so rain stays out.
    expect(ids).toEqual(['slot:look-1', 'slot:scene-a', 'slot:spec-1']);
  });

  it('never adds a dependency for inherit targets', () => {
    const result = computeScoreClosure(
      score([cue('c1', { kind: 'inherit', family: 'spectrum' })]),
      MANIFEST,
      SNAPSHOTS
    );
    expect(result.snapshots).toEqual([]);
    expect(result.previews).toEqual([]);
  });

  it('ignores disabled cues', () => {
    const result = computeScoreClosure(
      score([cue('c1', { kind: 'image', family: 'image', id: 'img-nothumb', revision: 'im-2' }, false)]),
      MANIFEST,
      SNAPSHOTS
    );
    expect(result.snapshots).toEqual([]);
  });

  it('ignores cues on a disabled track (matches Vibrix playback)', () => {
    const muted = score([cue('c1', { kind: 'scene', family: 'scene', id: 'scene-a', revision: 'sa-1' })]);
    muted.tracks[0] = { ...muted.tracks[0]!, enabled: false };
    const result = computeScoreClosure(muted, MANIFEST, SNAPSHOTS);
    expect(result.snapshots).toEqual([]);
    expect(result.previews).toEqual([]);
  });

  it('drops a v1 cue whose legacy track is disabled', () => {
    const result = computeScoreClosure(
      {
        schemaVersion: 1,
        tracks: [{ id: 'scenes', name: 'Scene', kind: 'scene', order: 0, enabled: false, locked: false }],
        cues: [{
          id: 'c1', trackId: 'scenes', startTimeMs: 0, endTimeMs: 1000,
          target: { kind: 'scene', family: 'scene', slotId: 'scene-a', slotRevision: 'sa-1' },
          priority: 0, enabled: true
        }]
      },
      MANIFEST,
      SNAPSHOTS
    );
    expect(result.snapshots).toEqual([]);
  });

  it('pulls the scene (and its bindings) through an image sceneSlotId', () => {
    const result = computeScoreClosure(
      score([cue('c1', { kind: 'image', family: 'image', id: 'img-a', revision: 'im-1' })]),
      MANIFEST,
      SNAPSHOTS
    );
    const ids = result.snapshots!.map(s => `${s.kind}:${s.id}`).sort();
    expect(ids).toEqual(['image:img-a', 'slot:look-1', 'slot:scene-a', 'slot:spec-1']);
  });

  it('degrades to reference-only for a loose manifest without snapshots', () => {
    const result = computeScoreClosure(
      score([cue('c1', { kind: 'scene', family: 'scene', id: 'scene-a', revision: 'sa-1' })]),
      MANIFEST,
      null
    );
    expect(result.snapshots).toBeNull();
    expect(result.previews).toBeNull();
  });

  it('throws when a snapshot revision disagrees with the catalog', () => {
    const drifted = SNAPSHOTS.map(s => s.id === 'spec-1' ? { ...s, revision: 'stale' } : s);
    try {
      computeScoreClosure(
        score([cue('c1', { kind: 'scene', family: 'scene', id: 'scene-a', revision: 'sa-1' })]),
        MANIFEST,
        drifted
      );
      expect.unreachable();
    } catch (reason) {
      expect(reason).toBeInstanceOf(VibrixScorePackageError);
      expect((reason as VibrixScorePackageError).issues.join('\n')).toContain('slot:spec-1 snapshot revision');
    }
  });

  it('throws when a reachable node has no snapshot', () => {
    const missing = SNAPSHOTS.filter(s => s.id !== 'look-1');
    expect(() => computeScoreClosure(
      score([cue('c1', { kind: 'scene', family: 'scene', id: 'scene-a', revision: 'sa-1' })]),
      MANIFEST,
      missing
    )).toThrow(/Missing slot:look-1 snapshot/);
  });

  it('throws when a snapshot family disagrees with the catalog', () => {
    const mismatched = SNAPSHOTS.map(s => s.id === 'spec-1' ? { ...s, family: 'rain' as const } : s);
    expect(() => computeScoreClosure(
      score([cue('c1', { kind: 'scene', family: 'scene', id: 'scene-a', revision: 'sa-1' })]),
      MANIFEST,
      mismatched
    )).toThrow(/slot:spec-1 snapshot family/);
  });
});

describe('buildVibrixScorePackage', () => {
  it('assembles a self-contained package with only the used closure', () => {
    const pkg = buildVibrixScorePackage({
      project: makeProject(score([
        cue('c1', { kind: 'scene', family: 'scene', id: 'scene-a', revision: 'sa-1' })
      ])),
      manifest: MANIFEST,
      source: { kind: 'package', package: PACKAGE_SOURCE },
      exportedAt: '2026-10-14T12:00:00.000Z'
    });
    expect(pkg.format).toBe(VIBRIX_SCORE_PACKAGE_FORMAT);
    expect(pkg.packageVersion).toBe(VIBRIX_SCORE_PACKAGE_VERSION);
    expect(pkg.selfContained).toBe(true);
    expect(pkg.envelope.exportKind).toBe('vibrix-score');
    expect(pkg.envelope.schemaVersion).toBe(2);
    expect(pkg.envelope.exportedAt).toBe('2026-10-14T12:00:00.000Z');
    const ids = pkg.snapshots!.map(s => `${s.kind}:${s.id}`).sort();
    // rain-1 and the images are never used, so they stay out.
    expect(ids).toEqual(['slot:look-1', 'slot:scene-a', 'slot:spec-1']);
    expect(pkg.previews).toEqual([]);
  });

  it('includes transportable previews for closure images', () => {
    const pkg = buildVibrixScorePackage({
      project: makeProject(score([
        cue('c1', { kind: 'image', family: 'image', id: 'img-a', revision: 'im-1' })
      ])),
      manifest: MANIFEST,
      source: { kind: 'package', package: PACKAGE_SOURCE }
    });
    expect(pkg.selfContained).toBe(true);
    expect(pkg.previews).toEqual([{
      imageId: 'img-a', revision: 'im-1', name: 'Cover', thumbnailDataUrl: 'data:image/webp;base64,AQID'
    }]);
  });

  it('falls back to the reference-only envelope for a loose manifest', () => {
    const pkg = buildVibrixScorePackage({
      project: makeProject(score([
        cue('c1', { kind: 'scene', family: 'scene', id: 'scene-a', revision: 'sa-1' })
      ])),
      manifest: MANIFEST,
      source: { kind: 'manifest', manifest: MANIFEST }
    });
    expect(pkg.selfContained).toBe(false);
    expect(pkg.snapshots).toBeNull();
    expect(pkg.previews).toBeNull();
    expect(pkg.envelope.dependencies.map(d => 'id' in d ? d.id : d.slotId)).toContain('scene-a');
  });

  it('refuses to export when an enabled cue references a missing slot', () => {
    expect(() => buildVibrixScorePackage({
      project: makeProject(score([
        cue('c1', { kind: 'scene', family: 'scene', id: 'nope', revision: 'x' })
      ])),
      manifest: MANIFEST,
      source: { kind: 'package', package: PACKAGE_SOURCE }
    })).toThrow(VibrixScorePackageError);
  });

  it('exports when a broken reference sits on a disabled track', () => {
    const muted = score([cue('c1', { kind: 'scene', family: 'scene', id: 'nope', revision: 'x' })]);
    muted.tracks[0] = { ...muted.tracks[0]!, enabled: false };
    const pkg = buildVibrixScorePackage({
      project: makeProject(muted),
      manifest: MANIFEST,
      source: { kind: 'package', package: PACKAGE_SOURCE }
    });
    // The cue never plays, so it must neither block export nor appear as a dependency.
    expect(pkg.envelope.dependencies).toEqual([]);
    expect(pkg.snapshots).toEqual([]);
  });
});
