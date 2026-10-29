import { describe, expect, it } from 'vitest';
import { getClipsInBox, shiftClips, withLinkedClips } from './clipSelection';
import type { LyricClip } from '../types/clip';
import type { LyricLayer } from '../types/layer';

function clip(overrides: Partial<LyricClip> & Pick<LyricClip, 'id' | 'layerId'>): LyricClip {
  return {
    text: 'line',
    startTime: 0,
    endTime: 2,
    transitionIn: 'fade',
    transitionOut: 'fade',
    position: 'center',
    ...overrides
  };
}

function layer(id: string, overrides: Partial<LyricLayer> = {}): LyricLayer {
  return {
    id, name: id, layerType: 'lyrics', color: '#fff',
    visible: true, locked: false, order: 0, ...overrides
  } as LyricLayer;
}

const layers = [layer('jp'), layer('es'), layer('romaji'), layer('fx', { locked: true })];
const clips = [
  clip({ id: 'jp-1', layerId: 'jp', startTime: 10, endTime: 12, sourceId: 'l1' }),
  clip({ id: 'es-1', layerId: 'es', startTime: 10, endTime: 12, sourceId: 'l1' }),
  clip({ id: 'ro-1', layerId: 'romaji', startTime: 10, endTime: 12, sourceId: 'l1' }),
  clip({ id: 'jp-2', layerId: 'jp', startTime: 20, endTime: 22, sourceId: 'l2' }),
  clip({ id: 'fx-1', layerId: 'fx', startTime: 10, endTime: 12, sourceId: 'l1' }),
  clip({ id: 'es-locked', layerId: 'es', startTime: 11, endTime: 13, locked: true })
];

describe('getClipsInBox', () => {
  it('takes every clip the box touches on the layers it crosses', () => {
    const ids = getClipsInBox(clips, layers, {
      startTime: 11.5, endTime: 21, layerIds: ['jp', 'es']
    }).map(c => c.id);
    expect(ids.sort()).toEqual(['es-1', 'jp-1', 'jp-2']);
  });

  it('accepts a box drawn right to left', () => {
    const ids = getClipsInBox(clips, layers, {
      startTime: 21, endTime: 11.5, layerIds: ['jp']
    }).map(c => c.id);
    expect(ids.sort()).toEqual(['jp-1', 'jp-2']);
  });

  it('skips locked clips, locked layers and hidden layers', () => {
    const hidden = [layer('jp', { visible: false }), ...layers.slice(1)];
    const ids = getClipsInBox(clips, hidden, {
      startTime: 0, endTime: 100, layerIds: ['jp', 'es', 'fx']
    }).map(c => c.id);
    expect(ids).toEqual(['es-1']);
  });
});

describe('withLinkedClips', () => {
  it('brings the same line from the other layers, not from locked ones', () => {
    expect([...withLinkedClips(clips, layers, ['jp-1'])].sort())
      .toEqual(['es-1', 'jp-1', 'ro-1']);
  });

  it('leaves a clip without a sourceId alone', () => {
    expect([...withLinkedClips(clips, layers, ['es-locked'])]).toEqual(['es-locked']);
  });
});

describe('shiftClips', () => {
  it('moves absolute word timings with their clip', () => {
    const timed = clip({
      id: 'timed',
      layerId: 'jp',
      startTime: 10,
      endTime: 12,
      words: [{ text: 'line', startTime: 10.25, endTime: 11.75 }]
    });
    const [shifted] = shiftClips([timed], ['timed'], 5, { layers });
    expect(shifted).toMatchObject({ startTime: 15, endTime: 17 });
    expect(shifted?.words).toEqual([{ text: 'line', startTime: 15.25, endTime: 16.75 }]);
  });
});
