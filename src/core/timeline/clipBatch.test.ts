import { describe, expect, it } from 'vitest';
import type { LyricClip } from '../types/clip';
import type { LyricLayer } from '../types/layer';
import { copyTimingToLinkedClips, moveClipSelectionStartTo, resizeClipSelection } from './clipBatch';

const layers = [
  { id: 'main', locked: false },
  { id: 'es', locked: false },
  { id: 'locked', locked: true }
] as LyricLayer[];

function clip(id: string, layerId: string, startTime: number, endTime: number, sourceId?: string): LyricClip {
  return {
    id, layerId, startTime, endTime, sourceId, text: id,
    transitionIn: 'fade', transitionOut: 'fade', position: 'center'
  };
}

describe('resizeClipSelection', () => {
  it('extends every selected clip by the same end delta', () => {
    const clips = [clip('a', 'main', 1, 3), clip('b', 'es', 1, 4), clip('c', 'es', 8, 9)];
    const next = resizeClipSelection(clips, ['a', 'b'], 'end', 2, { layers, trackDuration: 20 });
    expect(next.map(item => item.endTime)).toEqual([5, 6, 9]);
  });

  it('respects locked layers and minimum duration', () => {
    const clips = [clip('a', 'main', 1, 3), clip('b', 'locked', 1, 3)];
    const next = resizeClipSelection(clips, ['a', 'b'], 'start', 10, { layers });
    expect(next[0]!.endTime - next[0]!.startTime).toBeCloseTo(0.25);
    expect(next[1]).toBe(clips[1]);
  });
});

describe('moveClipSelectionStartTo', () => {
  it('places the earliest clip at the requested time and preserves spacing', () => {
    const clips = [clip('a', 'main', 2, 4), clip('b', 'es', 5, 7)];
    const next = moveClipSelectionStartTo(clips, ['a', 'b'], 20, { layers, trackDuration: 30 });
    expect(next.map(item => [item.startTime, item.endTime])).toEqual([[20, 22], [23, 25]]);
  });
});

describe('copyTimingToLinkedClips', () => {
  it('copies exact timing to sourceId siblings on other editable layers', () => {
    const clips = [
      clip('main', 'main', 10, 14, 'line-1'),
      clip('es', 'es', 10.03, 12, 'line-1'),
      clip('other', 'es', 20, 22, 'line-2'),
      clip('repeated-chorus', 'es', 50, 53, 'line-1'),
      clip('locked', 'locked', 8, 9, 'line-1')
    ];
    const result = copyTimingToLinkedClips(clips, layers, 'main');
    expect(result.affectedIds).toEqual(['es']);
    expect(result.clips.find(item => item.id === 'es')).toMatchObject({ startTime: 10, endTime: 14 });
    expect(result.clips.find(item => item.id === 'locked')).toMatchObject({ startTime: 8, endTime: 9 });
    expect(result.clips.find(item => item.id === 'repeated-chorus')).toMatchObject({ startTime: 50, endTime: 53 });
  });

  it('falls back to matching the initial time for legacy clips without sourceId', () => {
    const clips = [clip('main', 'main', 10, 14), clip('es', 'es', 10.03, 11), clip('later', 'es', 10.2, 12)];
    const result = copyTimingToLinkedClips(clips, layers, 'main');
    expect(result.affectedIds).toEqual(['es']);
  });
});
