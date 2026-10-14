import { describe, expect, it } from 'vitest';
import { buildSyncQueue, hasProjectLyricLines, hasSyncableLyrics } from './syncQueue';
import { createTapSyncSourceId } from './tapSync';
import { normalizeProject } from '../project/serialization';
import type { LyricSource, LyrixaProject } from '../types/project';
import type { LyricClip } from '../types/clip';

/**
 * Sync resume is derived, never stored: these tests pin down what a session
 * sees when it starts against a given set of persisted clips.
 */

function source(id: string, lines: string[], order: number, startTime = 0): LyricSource {
  return {
    id,
    title: id,
    rawText: lines.join('\n'),
    normalizedLines: lines,
    startTime,
    order,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z'
  };
}

function clip(id: string, text: string, startTime: number, endTime: number, extra: Partial<LyricClip> = {}): LyricClip {
  return {
    id,
    text,
    startTime,
    endTime,
    layerId: 'main',
    transitionIn: 'fade',
    transitionOut: 'fade',
    position: 'center',
    ...extra
  };
}

const LAYERS = [
  { id: 'main', name: 'Main', layerType: 'lyrics', color: '#fff', visible: true, locked: false, order: 0 },
  { id: 'es', name: 'Spanish', layerType: 'lyrics', color: '#fff', visible: true, locked: false, order: 1 }
];

function project(input: Partial<LyrixaProject> = {}): LyrixaProject {
  return normalizeProject({ id: 'p1', name: 'Song', layers: LAYERS, ...input } as Partial<LyrixaProject>);
}

/** The sourceId a line gets from a lyric source — what sync publishes clips under. */
const lineId = (sourceId: string, index: number, text: string) => createTapSyncSourceId(index, text, sourceId);

describe('buildSyncQueue — a fresh session', () => {
  it('queues every source line and starts at the source checkpoint', () => {
    const p = project({ lyricSources: [source('a', ['one', 'two'], 0, 42)], activeLyricSourceId: 'a' });
    const queue = buildSyncQueue(p, 'main', 'a');

    expect(queue.lines.map(line => line.text)).toEqual(['one', 'two']);
    expect(queue.lines.every(line => line.lyricSourceId === 'a')).toBe(true);
    expect(queue.cursorIndex).toBe(0);
    expect(queue.resumeTime).toBe(42);
    expect(queue.clips).toBe(p.clips);
    expect(queue.seedRawLyricsText).toBeNull();
  });

  it('streams all sources in order when no source is selected', () => {
    const p = project({
      lyricMode: 'multi',
      lyricSources: [source('b', ['second'], 1), source('a', ['first'], 0)]
    });

    expect(buildSyncQueue(p, 'main', null).lines.map(line => line.text)).toEqual(['first', 'second']);
  });

  it('returns no lines for a selected source that does not exist', () => {
    const p = project({ lyricSources: [source('a', ['one'], 0)] });
    expect(buildSyncQueue(p, 'main', 'missing').lines).toEqual([]);
  });
});

describe('buildSyncQueue — resuming', () => {
  it('resumes after the last published line', () => {
    const p = project({
      lyricSources: [source('a', ['one', 'two', 'three'], 0, 5)],
      clips: [
        clip('c1', 'one', 5, 8, { sourceId: lineId('a', 0, 'one') }),
        clip('c2', 'two', 9, 12, { sourceId: lineId('a', 1, 'two') })
      ]
    });
    const queue = buildSyncQueue(p, 'main', 'a');

    expect(queue.cursorIndex).toBe(2);
    expect(queue.resumeTime).toBe(12);
  });

  it('treats each layer independently', () => {
    const p = project({
      lyricSources: [source('a', ['one'], 0, 3)],
      clips: [clip('c1', 'one', 5, 8, { sourceId: lineId('a', 0, 'one') })]
    });
    const queue = buildSyncQueue(p, 'es', 'a');

    expect(queue.cursorIndex).toBe(0);
    expect(queue.resumeTime).toBe(3);
  });

  it('does not count a clip whose text no longer matches the line', () => {
    const p = project({
      lyricSources: [source('a', ['one'], 0)],
      clips: [clip('c1', 'one (edited)', 5, 8, { sourceId: lineId('a', 0, 'one') })]
    });

    expect(buildSyncQueue(p, 'main', 'a').cursorIndex).toBe(0);
  });
});

describe('buildSyncQueue — clips that predate line identity', () => {
  it('attaches identity by same text at the same index, then counts them as published', () => {
    const p = project({
      lyricSources: [source('a', ['one', 'two'], 0)],
      clips: [clip('c1', 'one', 1, 3)]
    });
    const queue = buildSyncQueue(p, 'main', 'a');

    expect(queue.clips).not.toBe(p.clips);
    expect(queue.clips[0]).toMatchObject({
      sourceId: lineId('a', 0, 'one'),
      sourceIndex: 0,
      lyricSourceId: 'a',
      createdBy: 'import'
    });
    expect(queue.cursorIndex).toBe(1);
    expect(queue.resumeTime).toBe(3);
  });
});

describe('buildSyncQueue — a project with no lyric text', () => {
  it('recovers lines from the layer with the most clip text and seeds the raw text', () => {
    const p = project({
      clips: [
        clip('e1', 'uno', 0, 1, { layerId: 'es' }),
        clip('e2', 'dos', 1, 2, { layerId: 'es' })
      ]
    });
    const queue = buildSyncQueue(p, 'main', null);

    expect(queue.lines.map(line => line.text)).toEqual(['uno', 'dos']);
    expect(queue.lines[0]!.template?.id).toBe('e1');
    expect(queue.seedRawLyricsText).toBe('uno\ndos');
  });
});

describe('sync availability', () => {
  it('needs a layer and either lyrics or clip text', () => {
    expect(hasSyncableLyrics(project(), 'main')).toBe(false);
    expect(hasSyncableLyrics(project({ lyricSources: [source('a', ['one'], 0)] }), null)).toBe(false);
    expect(hasSyncableLyrics(project({ lyricSources: [source('a', ['one'], 0)] }), 'main')).toBe(true);
    expect(hasSyncableLyrics(project({ clips: [clip('c1', 'text', 0, 1, { layerId: 'es' })] }), 'main')).toBe(true);
  });

  it('sees lyrics in sources or in a bare raw paste', () => {
    expect(hasProjectLyricLines(project())).toBe(false);
    expect(hasProjectLyricLines(project({ lyricSources: [source('a', ['one'], 0)] }))).toBe(true);
  });
});
