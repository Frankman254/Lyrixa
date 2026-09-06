import { describe, expect, it } from 'vitest';
import {
  createLyricsBundleEnvelope,
  mergeLyricsBundleIntoProject,
  parseLyricsBundleEnvelope
} from './lyricsBundle';
import { normalizeProject } from './serialization';
import { getRelatedClips } from '../timeline/lineIdentity';
import type { LyrixaProject } from '../types/project';

/**
 * The bundle is the contract LiveWallpaper consumes. What matters here is what
 * survives the trip out — role, language, and line identity — and what must
 * never make it in: audio bytes, blob URLs, and editor UI state.
 */

function multiLayerProject(): LyrixaProject {
  return normalizeProject({
    id: 'p1',
    name: 'Kimi no na wa',
    audioTracks: {
      master: {
        fileName: 'song.mp3',
        duration: 245.5,
        fileKey: 'song.mp3::1000::42',
        objectUrl: 'blob:http://localhost/abcdef',
        waveformPeaks: [{ time: 0, amplitude: 0.5 }]
      }
    },
    rawLyricsText: 'kimi\nno',
    normalizedLyrics: ['kimi', 'no'],
    layers: [
      {
        id: 'jp', name: 'Original', layerType: 'lyrics', role: 'primary', language: 'ja',
        color: '#2e7afb', visible: true, locked: false, order: 0
      },
      {
        id: 'romaji', name: 'Romaji', layerType: 'backing', role: 'romanization', language: 'ja-Latn',
        color: '#8a5cf6', visible: true, locked: false, order: 1
      },
      {
        id: 'es', name: 'Español', layerType: 'backing', role: 'translation', language: 'es',
        color: '#22c55e', visible: true, locked: false, order: 2
      },
      {
        id: 'en', name: 'English', layerType: 'backing', role: 'translation', language: 'en',
        color: '#f59e0b', visible: true, locked: false, order: 3
      }
    ],
    clips: [
      {
        id: 'c-jp', text: '君の名は', startTime: 1, endTime: 3, layerId: 'jp',
        sourceId: 'line-42', transitionIn: 'fade', transitionOut: 'fade', position: 'center'
      },
      {
        id: 'c-romaji', text: 'kimi no na wa', startTime: 1, endTime: 3, layerId: 'romaji',
        sourceId: 'line-42', sourceTextHash: 'zz9',
        transitionIn: 'fade', transitionOut: 'fade', position: 'center'
      },
      {
        id: 'c-es', text: 'tu nombre', startTime: 1, endTime: 3, layerId: 'es',
        sourceId: 'line-42', sourceTextHash: 'zz9',
        transitionIn: 'fade', transitionOut: 'fade', position: 'center'
      },
      {
        id: 'c-en', text: 'your name', startTime: 1, endTime: 3, layerId: 'en',
        sourceId: 'line-42', sourceTextHash: 'zz9',
        transitionIn: 'fade', transitionOut: 'fade', position: 'center'
      }
    ],
    currentTime: 87.5,
    renderMode: 'editor'
  } as unknown as Partial<LyrixaProject>);
}

describe('what the bundle carries to the renderer', () => {
  it('preserves every layer role and language', () => {
    const bundle = createLyricsBundleEnvelope(multiLayerProject());

    expect(bundle.project.layers.map(l => [l.role, l.language])).toEqual([
      ['primary', 'ja'],
      ['transliteration', 'ja-Latn'],
      ['translation', 'es'],
      ['translation', 'en']
    ]);
  });

  it('preserves line identity across all four layers', () => {
    const bundle = createLyricsBundleEnvelope(multiLayerProject());

    expect(getRelatedClips(bundle.project.clips, 'line-42')).toHaveLength(4);
  });

  it('keeps roles and identity through a parse of the exported file', () => {
    const raw = JSON.parse(JSON.stringify(createLyricsBundleEnvelope(multiLayerProject())));

    const parsed = parseLyricsBundleEnvelope(raw);

    expect(parsed.fragment.layers.map(l => l.role)).toEqual([
      'primary', 'transliteration', 'translation', 'translation'
    ]);
    expect(getRelatedClips(parsed.fragment.clips, 'line-42')).toHaveLength(4);
  });

  it('exports the source track as a reference the renderer can rebind', () => {
    const bundle = createLyricsBundleEnvelope(multiLayerProject());

    expect(bundle.sourceTrack).toMatchObject({
      fileName: 'song.mp3',
      durationMs: 245500,
      fileKey: 'song.mp3::1000::42'
    });
  });
});

describe('what the bundle must never carry', () => {
  const serialized = JSON.stringify(createLyricsBundleEnvelope(multiLayerProject()));

  it('contains no blob or object URL', () => {
    expect(serialized).not.toContain('blob:');
    expect(serialized).not.toContain('objectUrl');
  });

  it('contains no audio bytes or waveform peaks', () => {
    expect(serialized).not.toContain('waveformPeaks');
    expect(serialized).not.toContain('audioLibrary');
  });

  it('contains no editor UI state', () => {
    for (const key of ['currentTime', 'uiPreferences', 'selectedClipId', 'renderMode', 'lyricSources']) {
      expect(serialized).not.toContain(key);
    }
  });

  it('stays a small, consumption-shaped payload', () => {
    const bundle = createLyricsBundleEnvelope(multiLayerProject());

    expect(Object.keys(bundle.project).sort()).toEqual([
      'animationConfig', 'clips', 'fxConfig', 'layers',
      'normalizedLyrics', 'progressIndicatorConfig', 'rawLyricsText', 'styleConfig'
    ]);
  });
});

describe('importing a bundle back into a project', () => {
  it('replaces lyrics and layers but keeps the editor audio binding', () => {
    const base = multiLayerProject();
    const parsed = parseLyricsBundleEnvelope(
      JSON.parse(JSON.stringify(createLyricsBundleEnvelope(base)))
    );

    const merged = mergeLyricsBundleIntoProject(base, parsed);

    expect(merged.audioTracks).toBe(base.audioTracks);
    expect(merged.layers.map(l => l.role)).toEqual(parsed.fragment.layers.map(l => l.role));
  });

  it('refuses a project envelope handed to the bundle parser', () => {
    expect(() => parseLyricsBundleEnvelope({ app: 'Lyrixa', schemaVersion: 1 }))
      .toThrow(/wrong export kind/);
  });

  it('refuses a bundle version it cannot migrate', () => {
    const raw = createLyricsBundleEnvelope(multiLayerProject());

    expect(() => parseLyricsBundleEnvelope({ ...raw, schemaVersion: 7 }))
      .toThrow(/Unsupported lyrics bundle version/);
  });

  it('reads a pre-role bundle without inventing roles', () => {
    const raw = createLyricsBundleEnvelope(multiLayerProject());
    const legacy = {
      ...raw,
      project: {
        ...raw.project,
        layers: raw.project.layers.map(layer => omit(layer, 'role', 'language')),
        clips: raw.project.clips.map(clip => omit(clip, 'sourceId'))
      }
    };

    const parsed = parseLyricsBundleEnvelope(JSON.parse(JSON.stringify(legacy)));

    expect(parsed.fragment.layers.every(l => l.role === undefined)).toBe(true);
    expect(parsed.fragment.clips).toHaveLength(4);
  });
});

/** Drops keys from an object, the way a pre-role export simply lacked them. */
function omit(value: object, ...keys: string[]): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...value };
  for (const key of keys) delete copy[key];
  return copy;
}
