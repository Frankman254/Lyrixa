import { describe, expect, it } from 'vitest';
import {
  attachLyricSource,
  findActiveLyricSource,
  getLyricSourceStartTime,
  recoverLyricSourceFromLayer,
  removeLyricSource,
  setActiveLyricSource,
  setLyricSourceAudioAssignment,
  setLyricSourceStartTime,
  setLyricSourceTitle,
  upsertLyricSource
} from './lyricSourceLibrary';
import { normalizeProject } from '../project/serialization';
import type { LyricSource, LyrixaProject } from '../types/project';
import type { LyricClip } from '../types/clip';

/**
 * The invariant under test everywhere below: `rawLyricsText` and
 * `normalizedLyrics` always equal the sources concatenated in `order`.
 */
function expectDerivedTextInSync(project: LyrixaProject) {
  const sorted = [...project.lyricSources].sort((a, b) => a.order - b.order);
  expect(project.lyricSources.map(s => s.id)).toEqual(sorted.map(s => s.id));
  expect(project.rawLyricsText).toBe(sorted.map(s => s.rawText.trim()).filter(Boolean).join('\n\n'));
  expect(project.normalizedLyrics).toEqual(sorted.flatMap(s => s.normalizedLines));
}

function source(id: string, rawText: string, order: number, extra: Partial<LyricSource> = {}): LyricSource {
  return {
    id,
    title: id,
    rawText,
    normalizedLines: rawText.split('\n').map(line => line.trim()).filter(Boolean),
    order,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...extra
  };
}

function clip(id: string, text: string, startTime: number, extra: Partial<LyricClip> = {}): LyricClip {
  return {
    id,
    text,
    startTime,
    endTime: startTime + 2,
    layerId: 'layer-main',
    transitionIn: 'fade',
    transitionOut: 'fade',
    position: 'center',
    ...extra
  };
}

function project(input: Partial<LyrixaProject> = {}): LyrixaProject {
  return normalizeProject({
    id: 'p1',
    name: 'Song',
    layers: [{
      id: 'layer-main',
      name: 'Main Lyrics',
      layerType: 'lyrics',
      color: '#2e7afb',
      visible: true,
      locked: false,
      order: 0
    }],
    ...input
  } as Partial<LyrixaProject>);
}

describe('upsertLyricSource', () => {
  it('creates the first source and makes it active', () => {
    const { project: next, replaced } = upsertLyricSource(project(), 'one\ntwo');

    expect(next.lyricSources).toHaveLength(1);
    expect(next.activeLyricSourceId).toBe(next.lyricSources[0]!.id);
    expect(next.lyricSources[0]!.normalizedLines).toEqual(['one', 'two']);
    expect(next.lyricSources[0]!.title).toBe('Lyrics 1');
    expect(replaced).toBeNull();
    expectDerivedTextInSync(next);
  });

  it('replaces the active source in place, keeping its identity', () => {
    const before = project({
      lyricSources: [source('a', 'old line', 0, { audioFileKeys: ['k1'], startTime: 12 })],
      activeLyricSourceId: 'a'
    });
    const { project: next, replaced } = upsertLyricSource(before, 'new line');

    const updated = next.lyricSources[0]!;
    expect(next.lyricSources).toHaveLength(1);
    expect(updated.id).toBe('a');
    expect(updated.createdAt).toBe('2025-01-01T00:00:00.000Z');
    expect(updated.audioFileKeys).toEqual(['k1']);
    expect(updated.startTime).toBe(12);
    expect(updated.rawText).toBe('new line');
    expectDerivedTextInSync(next);
    // The outgoing text is handed back so the caller can archive it.
    expect(replaced?.rawText).toBe('old line');
  });

  it('reports nothing to archive when the text is unchanged or was empty', () => {
    const same = project({ lyricSources: [source('a', 'line', 0)], activeLyricSourceId: 'a' });
    expect(upsertLyricSource(same, 'line').replaced).toBeNull();

    const empty = project({ lyricSources: [source('a', '', 0)], activeLyricSourceId: 'a' });
    expect(upsertLyricSource(empty, 'line').replaced).toBeNull();
  });

  it('adds a new source after the highest order in multi mode', () => {
    const before = project({
      lyricMode: 'multi',
      lyricSources: [source('a', 'first', 0), source('b', 'second', 5)],
      activeLyricSourceId: 'a',
      audioTracks: { master: { fileName: 'mix.mp3', duration: 300, fileKey: 'mix-key' } }
    } as Partial<LyrixaProject>);
    const { project: next, replaced } = upsertLyricSource(before, 'third', { sourceMode: 'add' });

    const added = next.lyricSources[2]!;
    expect(next.lyricSources).toHaveLength(3);
    expect(added.order).toBe(6);
    expect(added.title).toBe('Lyrics 3');
    expect(added.audioFileKeys).toEqual(['mix-key']);
    expect(next.activeLyricSourceId).toBe(added.id);
    expect(replaced).toBeNull();
    expectDerivedTextInSync(next);
  });

  it('ignores add mode in single mode and replaces instead', () => {
    const before = project({ lyricSources: [source('a', 'first', 0)], activeLyricSourceId: 'a' });
    const { project: next } = upsertLyricSource(before, 'other', { sourceMode: 'add' });

    expect(next.lyricSources.map(s => s.id)).toEqual(['a']);
  });

  it('edits an explicit source without changing the others', () => {
    const before = project({
      lyricMode: 'multi',
      lyricSources: [source('a', 'first', 0), source('b', 'second', 1)],
      activeLyricSourceId: 'a'
    });
    const { project: next } = upsertLyricSource(before, 'second, edited', { sourceId: 'b', sourceTitle: ' B ' });

    expect(next.lyricSources[0]!.rawText).toBe('first');
    expect(next.lyricSources[1]).toMatchObject({ id: 'b', title: 'B', rawText: 'second, edited' });
    expect(next.activeLyricSourceId).toBe('b');
    expectDerivedTextInSync(next);
  });

  it('never touches clips', () => {
    const clips = [clip('c1', 'old line', 0)];
    const before = project({ lyricSources: [source('a', 'old line', 0)], activeLyricSourceId: 'a', clips });

    expect(upsertLyricSource(before, 'new line').project.clips).toBe(before.clips);
  });
});

describe('removeLyricSource', () => {
  it('re-derives the combined text and moves the active source', () => {
    const before = project({
      lyricMode: 'multi',
      lyricSources: [source('a', 'first', 0), source('b', 'second', 1)],
      activeLyricSourceId: 'a'
    });
    const next = removeLyricSource(before, 'a');

    expect(next.lyricSources.map(s => s.id)).toEqual(['b']);
    expect(next.activeLyricSourceId).toBe('b');
    expect(next.rawLyricsText).toBe('second');
    expectDerivedTextInSync(next);
  });

  it('keeps clips timed from the removed source', () => {
    const before = project({
      lyricSources: [source('a', 'first', 0)],
      clips: [clip('c1', 'first', 0, { lyricSourceId: 'a' })]
    });

    expect(removeLyricSource(before, 'a').clips).toHaveLength(1);
  });

  it('is a no-op for an unknown id', () => {
    const before = project({ lyricSources: [source('a', 'first', 0)] });
    expect(removeLyricSource(before, 'missing')).toBe(before);
  });
});

describe('attachLyricSource', () => {
  it('appends after the highest order even when orders have gaps', () => {
    const before = project({
      lyricSources: [source('a', 'first', 0), source('b', 'second', 4)],
      activeLyricSourceId: 'a'
    });
    const next = attachLyricSource(before, source('lib', 'from library', 0));

    expect(next.lyricSources.at(-1)).toMatchObject({ id: 'lib', order: 5 });
    expect(next.activeLyricSourceId).toBe('lib');
    expect(next.lyricMode).toBe('multi');
    expectDerivedTextInSync(next);
  });

  it('only activates a source that is already linked', () => {
    const before = project({
      lyricMode: 'multi',
      lyricSources: [source('a', 'first', 0), source('b', 'second', 1)],
      activeLyricSourceId: 'a'
    });
    const next = attachLyricSource(before, source('b', 'stale library copy', 9));

    expect(next.lyricSources).toBe(before.lyricSources);
    expect(next.activeLyricSourceId).toBe('b');
  });
});

describe('recoverLyricSourceFromLayer', () => {
  it('builds a source from visible clips and re-labels them without moving them', () => {
    const before = project({
      lyricSources: [source('a', 'unrelated', 0)],
      clips: [
        clip('c1', 'hello', 3),
        clip('c2', 'muted', 5, { muted: true }),
        clip('c3', '  world  ', 7)
      ]
    });
    const next = recoverLyricSourceFromLayer(before, 'layer-main');
    const recovered = next.lyricSources.at(-1)!;

    expect(recovered.title).toBe('Recovered from Main Lyrics');
    expect(recovered.normalizedLines).toEqual(['hello', 'world']);
    expect(recovered.startTime).toBe(3);
    expect(next.activeLyricSourceId).toBe(recovered.id);
    expect(next.lyricMode).toBe('multi');
    expectDerivedTextInSync(next);

    const [c1, c2, c3] = next.clips;
    expect(c1).toMatchObject({ startTime: 3, lyricSourceId: recovered.id, sourceIndex: 0 });
    expect(c3).toMatchObject({ startTime: 7, lyricSourceId: recovered.id, sourceIndex: 1 });
    expect(c2!.lyricSourceId).toBeUndefined();
    expect(c1!.sourceId).not.toBe(c3!.sourceId);
  });

  it('is a no-op when the layer has no visible text', () => {
    const before = project({ clips: [clip('c1', '   ', 0)] });
    expect(recoverLyricSourceFromLayer(before, 'layer-main')).toBe(before);
    expect(recoverLyricSourceFromLayer(before, 'no-such-layer')).toBe(before);
  });
});

describe('small source edits', () => {
  const base = project({
    lyricMode: 'multi',
    lyricSources: [source('a', 'first', 0, { startTime: 10 }), source('b', 'second', 1, { startTime: 90 })],
    activeLyricSourceId: 'a'
  });

  it('renames, ignoring blank titles', () => {
    expect(setLyricSourceTitle(base, 'a', '  Verse  ').lyricSources[0]!.title).toBe('Verse');
    expect(setLyricSourceTitle(base, 'a', '   ')).toBe(base);
  });

  it('clamps start times at zero', () => {
    expect(setLyricSourceStartTime(base, 'b', -4).lyricSources[1]!.startTime).toBe(0);
    expect(setLyricSourceStartTime(base, 'b', Number.NaN).lyricSources[1]!.startTime).toBe(0);
  });

  it('toggles audio assignments as a set', () => {
    const once = setLyricSourceAudioAssignment(base, 'a', 'k1', true);
    const twice = setLyricSourceAudioAssignment(once, 'a', 'k1', true);
    expect(twice.lyricSources[0]!.audioFileKeys).toEqual(['k1']);
    expect(setLyricSourceAudioAssignment(twice, 'a', 'k1', false).lyricSources[0]!.audioFileKeys).toEqual([]);
  });

  it('activates only known sources', () => {
    expect(setActiveLyricSource(base, 'b').activeLyricSourceId).toBe('b');
    expect(setActiveLyricSource(base, 'missing')).toBe(base);
  });

  it('answers start time and active-source queries', () => {
    expect(getLyricSourceStartTime(base, 'b')).toBe(90);
    expect(getLyricSourceStartTime(base, null)).toBe(10);
    expect(getLyricSourceStartTime(base, 'missing')).toBe(0);
    expect(findActiveLyricSource(base)?.id).toBe('a');
    expect(findActiveLyricSource(base, 'b')?.id).toBe('b');
  });
});
