import { describe, expect, it } from 'vitest';
import { isManifestSlotDraggable, parseAuthoringManifest } from './authoringManifest';

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
});
