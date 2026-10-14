import { describe, expect, it } from 'vitest';
import {
  isManifestSlotDraggable,
  manifestFromAuthoringSource,
  parseAuthoringManifest,
  parseAuthoringPackage,
  parseAuthoringSource
} from './authoringManifest';
import type { VibrixAuthoringPackage } from './types';

const CONTRACT_FIXTURE = {
  "schemaVersion": 1,
  "app": "Vibrix",
  "exportKind": "vibrix-manifest",
  "exportedAt": "2026-10-02T00:00:00.000Z",
  "rendererVersion": "0.7.0-alpha",
  "storePersistVersion": 144,
  "projectName": "Demo",
  "revision": "7f3a1c9e",
  "slots": [
    {
      "id": "scene-a",
      "family": "scene",
      "name": "Verse",
      "revision": "1a2b3c4d",
      "sceneBindable": false,
      "cueable": true,
      "bindings": {
        "spectrum": "spec-1",
        "looks": "look-1",
        "particles": "off"
      }
    },
    {
      "id": "scene-b",
      "family": "scene",
      "name": "Chorus",
      "revision": "5e6f7a8b",
      "sceneBindable": false,
      "cueable": true,
      "bindings": { "spectrum": "spec-2", "looks": "look-1" }
    },
    {
      "id": "scene-c",
      "family": "scene",
      "name": "Bridge",
      "revision": "empty",
      "sceneBindable": false,
      "cueable": true
    },
    {
      "id": "spec-1",
      "family": "spectrum",
      "name": "Bars tight",
      "revision": "9c0d1e2f",
      "sceneBindable": true,
      "cueable": true
    },
    {
      "id": "spec-2",
      "family": "spectrum",
      "name": "Bars wide",
      "revision": "3a4b5c6d",
      "sceneBindable": true,
      "cueable": true
    },
    {
      "id": "look-1",
      "family": "looks",
      "name": "Warm grade",
      "revision": "7e8f9a0b",
      "sceneBindable": true,
      "cueable": true
    },
    {
      "id": "bgz-1",
      "family": "background-zoom",
      "name": "Punchy",
      "revision": "1c2d3e4f",
      "sceneBindable": false,
      "cueable": true
    },
    {
      "id": "intro-1",
      "family": "intro-window",
      "name": "Title fade",
      "revision": "5a6b7c8d",
      "sceneBindable": false,
      "cueable": false
    }
  ]
};

const PACKAGE_FIXTURE: VibrixAuthoringPackage = {
  format: 'vibrix-authoring',
  packageVersion: 1,
  exportedAt: '2026-10-14T03:19:44.097Z',
  manifest: {
    schemaVersion: 2,
    app: 'Vibrix',
    exportKind: 'vibrix-manifest',
    exportedAt: '2026-10-14T03:19:44.097Z',
    rendererVersion: '0.7.0-alpha',
    storePersistVersion: 153,
    projectName: 'Package fixture',
    revision: 'catalog-revision',
    slots: [
      {
        id: 'spectrum-a',
        family: 'spectrum-second',
        name: 'Spectrum 2',
        revision: 'spectrum-revision',
        sceneBindable: true,
        cueable: true
      },
      {
        id: 'intro-a',
        family: 'intro-window',
        name: 'Intro',
        revision: 'empty',
        sceneBindable: false,
        cueable: false
      }
    ],
    images: [
      {
        id: 'image-a',
        kind: 'image',
        name: 'Cover.webp',
        revision: 'image-revision',
        enabled: true,
        sceneSlotId: null,
        thumbnailDataUrl: 'data:image/webp;base64,AQID'
      }
    ]
  },
  snapshots: [
    {
      kind: 'slot',
      id: 'spectrum-a',
      family: 'spectrum-second',
      name: 'Spectrum 2',
      revision: 'spectrum-revision',
      values: { enabled: true }
    },
    {
      kind: 'slot',
      id: 'intro-a',
      family: 'intro-window',
      name: 'Intro',
      revision: 'empty',
      values: null
    },
    {
      kind: 'image',
      id: 'image-a',
      name: 'Cover.webp',
      revision: 'image-revision',
      values: { assetId: 'image-a', transitionType: 'fade' }
    }
  ]
};

describe('parseAuthoringManifest', () => {
  it('accepts the literal shared contract fixture', () => {
    const result = parseAuthoringManifest(CONTRACT_FIXTURE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.manifest).toEqual(CONTRACT_FIXTURE);
  });

  it('keeps absent bindings distinct from explicit off', () => {
    const result = parseAuthoringManifest(CONTRACT_FIXTURE);
    if (!result.ok) throw new Error(result.errors.join('\n'));
    const sceneA = result.manifest.slots.find(slot => slot.id === 'scene-a')!;
    const sceneB = result.manifest.slots.find(slot => slot.id === 'scene-b')!;
    expect(sceneA.bindings?.particles).toBe('off');
    expect(Object.hasOwn(sceneB.bindings ?? {}, 'particles')).toBe(false);
  });

  it('lists empty and informative slots but prevents dragging them', () => {
    const result = parseAuthoringManifest(CONTRACT_FIXTURE);
    if (!result.ok) throw new Error(result.errors.join('\n'));
    expect(isManifestSlotDraggable(result.manifest.slots.find(slot => slot.id === 'scene-c')!)).toBe(false);
    expect(isManifestSlotDraggable(result.manifest.slots.find(slot => slot.id === 'intro-1')!)).toBe(false);
    expect(result.manifest.slots.find(slot => slot.id === 'bgz-1')?.sceneBindable).toBe(false);
  });

  it('returns readable validation errors', () => {
    const result = parseAuthoringManifest({ app: 'Other', slots: 'bad' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContain('app must be "Vibrix".');
    expect(result.errors).toContain('slots must be an array.');
  });

  it('rejects scene bindings to slots that are not scene-bindable', () => {
    const malformed = structuredClone(CONTRACT_FIXTURE);
    const scene = malformed.slots.find(slot => slot.id === 'scene-a')!;
    (scene as unknown as { bindings: Record<string, string> }).bindings['background-zoom'] = 'bgz-1';
    const result = parseAuthoringManifest(malformed);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join('\n')).toContain('sceneBindable is false');
  });

  it('accepts a schema v2 manifest with transportable image previews', () => {
    const result = parseAuthoringManifest(PACKAGE_FIXTURE.manifest);
    expect(result.ok).toBe(true);
    if (!result.ok || result.manifest.schemaVersion !== 2) return;
    expect(result.manifest.images[0]?.thumbnailDataUrl).toBe('data:image/webp;base64,AQID');
  });

  it('rejects browser-local previews', () => {
    const malformed = structuredClone(PACKAGE_FIXTURE.manifest);
    malformed.images[0]!.thumbnailDataUrl = 'blob:http://localhost/private';
    const result = parseAuthoringManifest(malformed);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join('\n')).toContain('transportable image data URL');
  });
});

describe('parseAuthoringPackage', () => {
  it('accepts a complete v2 package and detects it as an authoring source', () => {
    const parsed = parseAuthoringPackage(PACKAGE_FIXTURE);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.package.snapshots).toHaveLength(3);

    const source = parseAuthoringSource(PACKAGE_FIXTURE);
    expect(source.ok).toBe(true);
    if (!source.ok) return;
    expect(source.source.kind).toBe('package');
    expect(manifestFromAuthoringSource(source.source).schemaVersion).toBe(2);
  });

  it('rejects missing, orphaned and mismatched snapshots', () => {
    const malformed = structuredClone(PACKAGE_FIXTURE);
    malformed.snapshots = [
      ...malformed.snapshots.filter(snapshot => snapshot.id !== 'intro-a'),
      {
        kind: 'slot',
        id: 'orphan',
        family: 'looks',
        name: 'Orphan',
        revision: 'orphan-revision',
        values: {}
      }
    ];
    const image = malformed.snapshots.find(snapshot => snapshot.id === 'image-a')!;
    image.revision = 'wrong-revision';

    const result = parseAuthoringPackage(malformed);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join('\n')).toContain('Missing slot:intro-a snapshot.');
    expect(result.errors.join('\n')).toContain('Orphan slot:orphan snapshot.');
    expect(result.errors.join('\n')).toContain('image:image-a snapshot revision');
  });

  it('rejects duplicate snapshot keys and non-transportable snapshot values', () => {
    const malformed = structuredClone(PACKAGE_FIXTURE);
    malformed.snapshots.push(structuredClone(malformed.snapshots[0]!));
    malformed.snapshots[0]!.values = { url: 'blob:http://localhost/private' };
    const result = parseAuthoringPackage(malformed);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join('\n')).toContain('contains a non-transportable URL');
    expect(result.errors.join('\n')).toContain('duplicates (slot, "spectrum-a")');
  });
});
