import { describe, expect, it } from 'vitest';
import { resolveCompositionVisualState } from './visualState';
import type {
  CompositionCueV2,
  StoredCompositionV2,
  VibrixAuthoringManifestV2,
  VibrixManifestImage,
  VibrixManifestSlot,
  VibrixTimelineKind
} from './types';

const slot = (
  id: string,
  family: VibrixManifestSlot['family'],
  overrides: Partial<VibrixManifestSlot> = {}
): VibrixManifestSlot => ({
  id,
  family,
  name: id,
  revision: 'rev-1',
  sceneBindable: family !== 'scene',
  cueable: true,
  ...overrides
});

const image = (id: string, overrides: Partial<VibrixManifestImage> = {}): VibrixManifestImage => ({
  id,
  kind: 'image',
  name: id,
  revision: 'rev-1',
  enabled: true,
  sceneSlotId: null,
  ...overrides
});

const track = (kind: VibrixTimelineKind, enabled = true): StoredCompositionV2['tracks'][number] => ({
  id: kind,
  name: kind,
  kind,
  order: 0,
  enabled,
  locked: false
});

const cue = (
  id: string,
  trackId: string,
  startTimeMs: number,
  target: CompositionCueV2['target']
): CompositionCueV2 => ({ id, trackId, startTimeMs, target, priority: 0, enabled: true });

const manifest: VibrixAuthoringManifestV2 = {
  schemaVersion: 2,
  app: 'Vibrix',
  exportKind: 'vibrix-manifest',
  exportedAt: '2026-10-14T00:00:00.000Z',
  rendererVersion: '0.7.0-alpha',
  storePersistVersion: 153,
  projectName: 'Demo',
  revision: 'man-1',
  slots: [
    slot('scene-a', 'scene', { bindings: { spectrum: 'spec-1', rain: 'off' } }),
    slot('scene-b', 'scene', { bindings: { spectrum: 'spec-2' } }),
    slot('spec-1', 'spectrum', { thumbnailDataUrl: 'data:image/png;base64,AAA' }),
    slot('spec-2', 'spectrum'),
    slot('rain-1', 'rain'),
    slot('look-1', 'looks')
  ],
  images: [
    image('img-1', { thumbnailDataUrl: 'data:image/png;base64,III' }),
    image('img-2'),
    image('img-3', { sceneSlotId: 'scene-b' })
  ]
};

const emptyScore: StoredCompositionV2 = { schemaVersion: 2, tracks: [], cues: [] };

const sceneCue = (startTimeMs: number, id: string): CompositionCueV2 =>
  cue(`s-${startTimeMs}`, 'scene', startTimeMs, {
    kind: 'scene', family: 'scene', id, revision: 'rev-1'
  });

describe('resolveCompositionVisualState', () => {
  it('is inactive with no manifest and with no cut before the time', () => {
    expect(resolveCompositionVisualState(emptyScore, undefined, 5000).active).toBe(false);

    const score: StoredCompositionV2 = {
      tracks: [track('scene')],
      cues: [sceneCue(2000, 'scene-a')],
      schemaVersion: 2
    };
    const before = resolveCompositionVisualState(score, manifest, 1000);
    expect(before).toMatchObject({ active: false, scene: null, image: null, lanes: [] });
    expect(before.timeMs).toBe(1000);
  });

  it('holds a sustained image until the next cut in its lane', () => {
    const score: StoredCompositionV2 = {
      tracks: [track('image')],
      cues: [
        cue('i1', 'image', 0, { kind: 'image', family: 'image', id: 'img-1', revision: 'rev-1' }),
        cue('i2', 'image', 3000, { kind: 'image', family: 'image', id: 'img-2', revision: 'rev-1' })
      ],
      schemaVersion: 2
    };

    expect(resolveCompositionVisualState(score, manifest, 1000).image).toMatchObject({
      id: 'img-1', name: 'img-1', thumbnailDataUrl: 'data:image/png;base64,III'
    });
    expect(resolveCompositionVisualState(score, manifest, 3000).image).toMatchObject({ id: 'img-2' });
  });

  it('pulls the scene binding lanes forward, honouring off and absent', () => {
    const score: StoredCompositionV2 = {
      tracks: [track('scene')],
      cues: [sceneCue(0, 'scene-a')],
      schemaVersion: 2
    };
    const state = resolveCompositionVisualState(score, manifest, 0);

    expect(state.scene).toMatchObject({ id: 'scene-a' });
    // spec-1 is bound and resolves through the scene; rain is explicitly off;
    // looks is absent (no bindings key), so it contributes nothing.
    expect(state.lanes).toEqual([
      { family: 'spectrum', activation: {
        family: 'spectrum', kind: 'feature-slot', id: 'spec-1', name: 'spec-1',
        thumbnailDataUrl: 'data:image/png;base64,AAA', fromScene: true
      }, off: false },
      { family: 'rain', activation: null, off: true }
    ]);
  });

  it('holds a granular override above later scenes until inherit', () => {
    const score: StoredCompositionV2 = {
      tracks: [track('scene'), track('spectrum')],
      cues: [
        sceneCue(0, 'scene-a'),
        cue('ov', 'spectrum', 1000, { kind: 'feature-slot', family: 'spectrum', id: 'spec-2', revision: 'rev-1' }),
        sceneCue(2000, 'scene-b'),
        cue('inh', 'spectrum', 3000, { kind: 'inherit', family: 'spectrum' })
      ],
      schemaVersion: 2
    };

    // Before the override the scene binding wins.
    expect(resolveCompositionVisualState(score, manifest, 500).lanes.find(l => l.family === 'spectrum')?.activation?.id)
      .toBe('spec-1');
    // After the override, spec-2 holds even though scene-b later rebinds spec-2 anyway.
    const held = resolveCompositionVisualState(score, manifest, 2500).lanes.find(l => l.family === 'spectrum');
    expect(held).toMatchObject({ activation: { id: 'spec-2', fromScene: false }, off: false });
    // After inherit the lane returns to scene-b's binding (spec-2) flagged fromScene.
    const released = resolveCompositionVisualState(score, manifest, 3500).lanes.find(l => l.family === 'spectrum');
    expect(released).toMatchObject({ activation: { id: 'spec-2', fromScene: true }, off: false });
  });

  it('applies an image that carries its own scene', () => {
    const score: StoredCompositionV2 = {
      tracks: [track('image')],
      cues: [cue('i', 'image', 0, { kind: 'image', family: 'image', id: 'img-3', revision: 'rev-1' })],
      schemaVersion: 2
    };
    const state = resolveCompositionVisualState(score, manifest, 0);
    expect(state.image).toMatchObject({ id: 'img-3' });
    expect(state.scene).toMatchObject({ id: 'scene-b' });
    expect(state.lanes.find(l => l.family === 'spectrum')?.activation?.id).toBe('spec-2');
  });

  it('resolves same-ms ties scene then image then granular', () => {
    const score: StoredCompositionV2 = {
      tracks: [track('scene'), track('spectrum')],
      cues: [
        sceneCue(1000, 'scene-a'),
        cue('ov', 'spectrum', 1000, { kind: 'feature-slot', family: 'spectrum', id: 'spec-2', revision: 'rev-1' })
      ],
      schemaVersion: 2
    };
    // The granular cut lands exactly on the scene cut and still refines it.
    const state = resolveCompositionVisualState(score, manifest, 1000);
    expect(state.scene?.id).toBe('scene-a');
    expect(state.lanes.find(l => l.family === 'spectrum')?.activation)
      .toMatchObject({ id: 'spec-2', fromScene: false });
  });

  it('ignores cues on disabled lanes and disabled cues', () => {
    const score: StoredCompositionV2 = {
      tracks: [{ ...track('scene'), enabled: false }],
      cues: [sceneCue(0, 'scene-a')],
      schemaVersion: 2
    };
    // A cut that can never play (its lane is off) is not an activation, matching
    // the shared "disabled lane = inactive cue" rule in the authoring contract.
    expect(resolveCompositionVisualState(score, manifest, 1000))
      .toMatchObject({ active: false, scene: null, lanes: [] });
  });

  it('degrades a missing referenced slot to a bare id, never crashes', () => {
    const score: StoredCompositionV2 = {
      tracks: [track('scene')],
      cues: [sceneCue(0, 'gone')],
      schemaVersion: 2
    };
    expect(resolveCompositionVisualState(score, manifest, 0).scene).toMatchObject({ id: 'gone', name: 'gone' });
  });

  it('clamps negative and rounds the requested time', () => {
    const state = resolveCompositionVisualState(emptyScore, manifest, -12.6);
    expect(state.timeMs).toBe(0);
  });
});
