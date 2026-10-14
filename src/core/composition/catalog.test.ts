import { describe, expect, it } from 'vitest';
import {
  descriptorForPlacement,
  ensureTimelineTrack,
  filterCatalogGroup,
  groupManifestForCatalog,
  isPlacementDescriptor,
  placeFromCatalog,
  resolvePlacementDescriptor,
  timelineKindForPlacement,
  timelineTrackNameForKind
} from './catalog';
import type {
  StoredCompositionV2,
  VibrixAuthoringManifestV2,
  VibrixManifestImage,
  VibrixManifestSlot
} from './types';

const slot = (id: string, family: VibrixManifestSlot['family'], overrides: Partial<VibrixManifestSlot> = {}): VibrixManifestSlot => ({
  id,
  family,
  name: id,
  revision: 'rev-1',
  sceneBindable: false,
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

const emptyScore: StoredCompositionV2 = {
  schemaVersion: 2,
  tracks: [{ id: 'composition-scene', name: 'Scene', kind: 'scene', order: 0, enabled: true, locked: false }],
  cues: []
};

const manifest: VibrixAuthoringManifestV2 = {
  app: 'Vibrix',
  exportKind: 'vibrix-manifest',
  schemaVersion: 2,
  exportedAt: '2026-10-13T00:00:00.000Z',
  rendererVersion: '0.4.1-alpha',
  storePersistVersion: 153,
  projectName: 'Test',
  revision: 'manifest-1',
  slots: [
    slot('scene-a', 'scene'),
    slot('scene-empty', 'scene', { revision: 'empty' }),
    slot('looks-neon', 'looks'),
    slot('spectrum-one', 'spectrum'),
    slot('spectrum-two', 'spectrum-second'),
    slot('intro-win', 'intro-window', { cueable: false })
  ],
  images: [image('img-cover'), image('img-backdrop', { name: 'Backdrop' })]
};

describe('catalog placement v2', () => {
  it('routes every placement kind to its timeline lane kind', () => {
    expect(timelineKindForPlacement({ kind: 'scene', slot: slot('scene-a', 'scene') })).toBe('scene');
    expect(timelineKindForPlacement({ kind: 'image', image: image('img-cover') })).toBe('image');
    expect(timelineKindForPlacement({ kind: 'granular', slot: slot('looks-neon', 'looks'), family: 'looks' })).toBe('looks');
    expect(timelineKindForPlacement({ kind: 'inherit', family: 'spectrum-second' })).toBe('spectrum-second');
    expect(timelineTrackNameForKind('spectrum-second')).toBe('Spectrum 2');
    expect(timelineTrackNameForKind('track-title')).toBe('Track Title');
  });

  it('creates the lane on first placement and reuses it afterwards', () => {
    const first = placeFromCatalog(emptyScore, { kind: 'granular', slot: slot('looks-neon', 'looks'), family: 'looks' }, 4000)!;
    expect(first.score.tracks).toHaveLength(2);
    const lane = first.score.tracks[1];
    expect(lane).toMatchObject({ id: 'composition-looks', kind: 'looks', order: 4, enabled: true, locked: false });
    expect(first.cue).toEqual({
      id: 'cue-looks-neon-4000',
      trackId: 'composition-looks',
      startTimeMs: 4000,
      target: { kind: 'feature-slot', family: 'looks', id: 'looks-neon', revision: 'rev-1' },
      priority: 0,
      enabled: true
    });

    const second = placeFromCatalog(first.score, { kind: 'granular', slot: slot('looks-neon', 'looks'), family: 'looks' }, 9000)!;
    expect(second.score.tracks).toHaveLength(2);
    expect(second.cue.trackId).toBe('composition-looks');
  });

  it('keeps existing cues and lanes untouched while placing into a new lane', () => {
    const withScene = placeFromCatalog(emptyScore, { kind: 'scene', slot: slot('scene-a', 'scene') }, 0)!;
    const placed = placeFromCatalog(withScene.score, { kind: 'image', image: image('img-cover') }, 2000)!;
    expect(placed.score.cues).toHaveLength(2);
    expect(placed.score.cues[0]).toEqual(withScene.cue);
    expect(placed.score.tracks.map(track => track.kind)).toEqual(['scene', 'image']);
    expect(placed.cue.target).toEqual({ kind: 'image', family: 'image', id: 'img-cover', revision: 'rev-1' });
  });

  it('emits an inherit target for granular lanes only', () => {
    const placed = placeFromCatalog(emptyScore, { kind: 'inherit', family: 'rain' }, 1500)!;
    expect(placed.cue.target).toEqual({ kind: 'inherit', family: 'rain' });
    expect(placed.cue.trackId).toBe('composition-rain');
    expect(placed.cue.id).toBe('cue-inherit-rain-1500');
  });

  it('rejects empty or non-cueable slots and mismatched families', () => {
    expect(placeFromCatalog(emptyScore, { kind: 'scene', slot: slot('scene-empty', 'scene', { revision: 'empty' }) }, 0)).toBeNull();
    expect(placeFromCatalog(emptyScore, { kind: 'scene', slot: slot('intro-win', 'intro-window', { cueable: false }) }, 0)).toBeNull();
    expect(placeFromCatalog(emptyScore, {
      kind: 'granular',
      slot: slot('looks-neon', 'looks'),
      family: 'particles'
    }, 0)).toBeNull();
  });

  it('clamps and rounds negative or fractional start times', () => {
    const placed = placeFromCatalog(emptyScore, { kind: 'scene', slot: slot('scene-a', 'scene') }, -120.6)!;
    expect(placed.cue.startTimeMs).toBe(0);
  });

  it('de-duplicates cue ids when two objects share target and time', () => {
    const first = placeFromCatalog(emptyScore, { kind: 'scene', slot: slot('scene-a', 'scene') }, 1000)!;
    const second = placeFromCatalog(first.score, { kind: 'scene', slot: slot('scene-a', 'scene') }, 1000)!;
    expect(second.cue.id).toBe('cue-scene-a-1000-2');
  });

  it('ensureTimelineTrack is identity when the lane already exists', () => {
    expect(ensureTimelineTrack(emptyScore, 'scene')).toBe(emptyScore);
    const added = ensureTimelineTrack(emptyScore, 'logo');
    expect(added.tracks).toHaveLength(2);
    expect(added.tracks[1]).toMatchObject({ id: 'composition-logo', kind: 'logo', order: 9 });
  });
});

describe('catalog grouping', () => {
  it('partitions scenes, images and granular families in contract order', () => {
    const groups = groupManifestForCatalog(manifest);
    expect(groups.scenes.map(s => s.id)).toEqual(['scene-a', 'scene-empty']);
    expect(groups.images.map(i => i.id)).toEqual(['img-cover', 'img-backdrop']);
    expect(groups.granular.map(section => section.family)).toEqual(['spectrum', 'spectrum-second', 'looks']);
    expect(groups.granular.map(section => section.slots.map(s => s.id))).toEqual([
      ['spectrum-one'],
      ['spectrum-two'],
      ['looks-neon']
    ]);
  });

  it('hides intro-window and never invents images for v1 manifests', () => {
    const groups = groupManifestForCatalog({ ...manifest, schemaVersion: 1 } as never);
    expect(groups.granular.flatMap(section => section.slots).map(s => s.id)).not.toContain('intro-win');
    expect(groups.images).toEqual([]);
  });

  it('filters by name or id across all sections and drops empty ones', () => {
    const filtered = filterCatalogGroup(groupManifestForCatalog(manifest), 'back');
    expect(filtered.scenes).toEqual([]);
    expect(filtered.images.map(i => i.id)).toEqual(['img-backdrop']);
    expect(filtered.granular).toEqual([]);

    const sameId = filterCatalogGroup(groupManifestForCatalog(manifest), 'NEON');
    expect(sameId.granular.map(section => section.family)).toEqual(['looks']);
    expect(sameId.images).toEqual([]);

    expect(filterCatalogGroup(groupManifestForCatalog(manifest), '   ')).toEqual(groupManifestForCatalog(manifest));
  });
});

describe('placement drag descriptors', () => {
  it('round-trips every placement kind through the manifest', () => {
    const placements = [
      { kind: 'scene', slot: slot('scene-a', 'scene') },
      { kind: 'granular', slot: slot('looks-neon', 'looks'), family: 'looks' },
      { kind: 'image', image: image('img-cover') },
      { kind: 'inherit', family: 'spectrum' }
    ] as const;
    for (const placement of placements) {
      const descriptor = descriptorForPlacement(placement);
      expect(isPlacementDescriptor(descriptor)).toBe(true);
      const resolved = resolvePlacementDescriptor(manifest, descriptor);
      expect(JSON.parse(JSON.stringify(resolved))).toEqual(JSON.parse(JSON.stringify(placement)));
    }
  });

  it('resolves revisions from the live manifest, not from the drag payload', () => {
    const tampered = { kind: 'image', imageId: 'img-cover', revision: 'outdated' };
    expect(isPlacementDescriptor(tampered)).toBe(true);
    const descriptor = descriptorForPlacement({ kind: 'image', image: image('img-cover', { revision: 'rev-old' }) });
    const resolved = resolvePlacementDescriptor(manifest, descriptor)!;
    expect(resolved.kind === 'image' && resolved.image.revision).toBe('rev-1');
  });

  it('rejects unknown objects, vanished items and family mismatches', () => {
    expect(isPlacementDescriptor('scene-a')).toBe(false);
    expect(isPlacementDescriptor({ kind: 'scene' })).toBe(false);
    expect(isPlacementDescriptor({ kind: 'granular', slotId: 'x', family: 'intro-window' })).toBe(false);
    expect(resolvePlacementDescriptor(manifest, { kind: 'scene', slotId: 'looks-neon' })).toBeNull();
    expect(resolvePlacementDescriptor(manifest, { kind: 'granular', slotId: 'scene-a', family: 'looks' })).toBeNull();
    expect(resolvePlacementDescriptor(manifest, { kind: 'image', imageId: 'img-removed' })).toBeNull();
    expect(resolvePlacementDescriptor(undefined, { kind: 'scene', slotId: 'scene-a' })).toBeNull();
    expect(resolvePlacementDescriptor(undefined, { kind: 'inherit', family: 'rain' })).toEqual({ kind: 'inherit', family: 'rain' });
  });
});
