import { describe, expect, it } from 'vitest';
import {
  createProjectExportEnvelope,
  normalizeLayers,
  normalizeProject,
  parseProjectExportEnvelope
} from './serialization';
import type { LyrixaProject } from '../types/project';

/**
 * Backward compatibility is the hard requirement here: a project saved before
 * roles, languages, or line identity existed must open unchanged, and a new
 * field must never become something an old file has to carry.
 */

const LEGACY_PROJECT = {
  schemaVersion: 1,
  app: 'Lyrixa',
  exportedAt: '2025-01-01T00:00:00.000Z',
  project: {
    id: 'legacy-1',
    name: 'Old Song',
    rawLyricsText: 'first line\nsecond line',
    normalizedLyrics: ['first line', 'second line'],
    layers: [
      {
        id: 'layer-main',
        name: 'Main Lyrics',
        layerType: 'lyrics',
        color: '#2e7afb',
        visible: true,
        locked: false,
        order: 0
      }
    ],
    clips: [
      {
        id: 'clip-1',
        text: 'first line',
        startTime: 0,
        endTime: 2,
        layerId: 'layer-main',
        transitionIn: 'fade',
        transitionOut: 'fade',
        position: 'center'
      }
    ],
    currentTime: 0,
    renderMode: 'editor'
  }
};

describe('parsing a project saved before roles existed', () => {
  it('opens without inventing a role or a language', () => {
    const project = parseProjectExportEnvelope(LEGACY_PROJECT);

    expect(project.name).toBe('Old Song');
    expect(project.layers[0]!.role).toBeUndefined();
    expect(project.layers[0]!.language).toBeUndefined();
    expect(project.clips).toHaveLength(1);
    expect(project.clips[0]!.sourceId).toBeUndefined();
  });

  it('keeps every legacy clip field intact', () => {
    const clip = parseProjectExportEnvelope(LEGACY_PROJECT).clips[0]!;

    expect(clip).toMatchObject({
      id: 'clip-1',
      text: 'first line',
      startTime: 0,
      endTime: 2,
      layerId: 'layer-main',
      position: 'center'
    });
  });

  it('survives a full export/import round trip unchanged', () => {
    const first = parseProjectExportEnvelope(LEGACY_PROJECT);
    const second = parseProjectExportEnvelope(createProjectExportEnvelope(first));

    expect(second.layers).toEqual(first.layers);
    expect(second.clips).toEqual(first.clips);
  });
});

describe('parsing a project that declares roles and languages', () => {
  const modern = {
    ...LEGACY_PROJECT,
    project: {
      ...LEGACY_PROJECT.project,
      layers: [
        { ...LEGACY_PROJECT.project.layers[0], role: 'primary', language: 'ja' },
        {
          id: 'layer-romaji',
          name: 'Romaji',
          layerType: 'backing',
          role: 'romanization',
          language: 'ja-Latn',
          color: '#8a5cf6',
          visible: true,
          locked: false,
          order: 1
        },
        {
          id: 'layer-es',
          name: 'Traducción',
          layerType: 'backing',
          role: 'translation',
          language: 'es',
          color: '#22c55e',
          visible: true,
          locked: false,
          order: 2
        }
      ]
    }
  };

  it('keeps declared roles and languages', () => {
    const layers = parseProjectExportEnvelope(modern).layers;

    expect(layers[0]!.role).toBe('primary');
    expect(layers[0]!.language).toBe('ja');
    expect(layers[2]!.role).toBe('translation');
    expect(layers[2]!.language).toBe('es');
  });

  it('resolves the `romanization` alias to the canonical role name', () => {
    // Transcriptor and LiveWallpaper agreed on `transliteration`; accepting
    // the other spelling on input must not leak two names downstream.
    expect(parseProjectExportEnvelope(modern).layers[1]!.role).toBe('transliteration');
  });

  it('drops an invented role rather than passing it to a renderer', () => {
    const layers = normalizeLayers([
      {
        id: 'layer-x',
        name: 'X',
        layerType: 'lyrics',
        role: 'karaoke-solo' as never,
        color: '#fff',
        visible: true,
        locked: false,
        order: 0
      }
    ]);

    expect(layers[0]!.role).toBeUndefined();
  });

  it('carries roles and languages through an export round trip', () => {
    const project = parseProjectExportEnvelope(modern);
    const round = parseProjectExportEnvelope(createProjectExportEnvelope(project));

    expect(round.layers.map(layer => [layer.role, layer.language])).toEqual([
      ['primary', 'ja'],
      ['transliteration', 'ja-Latn'],
      ['translation', 'es']
    ]);
  });
});

describe('serializing runtime state', () => {
  it('never writes an object URL into the exported project', () => {
    const project = normalizeProject({
      ...LEGACY_PROJECT.project,
      audioTracks: {
        master: {
          fileName: 'song.mp3',
          duration: 180,
          objectUrl: 'blob:http://localhost/deadbeef'
        }
      }
    } as unknown as Partial<LyrixaProject>);

    const envelope = createProjectExportEnvelope(project);

    expect(envelope.project.audioTracks.master).not.toHaveProperty('objectUrl');
    expect(JSON.stringify(envelope)).not.toContain('blob:');
  });

  it('keeps line identity and its fingerprint across serialization', () => {
    const project = normalizeProject({
      ...LEGACY_PROJECT.project,
      clips: [
        {
          ...LEGACY_PROJECT.project.clips[0],
          sourceId: 'line-42',
          sourceTextHash: 'abc123'
        }
      ]
    } as unknown as Partial<LyrixaProject>);

    const round = parseProjectExportEnvelope(createProjectExportEnvelope(project));

    expect(round.clips[0]!.sourceId).toBe('line-42');
    expect(round.clips[0]!.sourceTextHash).toBe('abc123');
  });

  it('drops an empty sourceId instead of grouping unlinked clips together', () => {
    const project = normalizeProject({
      ...LEGACY_PROJECT.project,
      clips: [{ ...LEGACY_PROJECT.project.clips[0], sourceId: '' }]
    } as unknown as Partial<LyrixaProject>);

    expect(project.clips[0]!.sourceId).toBeUndefined();
  });
});

describe('rejecting files that are not Lyrixa projects', () => {
  it('refuses a foreign envelope', () => {
    expect(() => parseProjectExportEnvelope({ app: 'SomethingElse' })).toThrow(/not a Lyrixa project/);
  });

  it('refuses a future schema version instead of guessing', () => {
    expect(() =>
      parseProjectExportEnvelope({ ...LEGACY_PROJECT, schemaVersion: 99 })
    ).toThrow(/Unsupported/);
  });
});
