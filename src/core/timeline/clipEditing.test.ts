import { describe, expect, it } from 'vitest';
import {
  applyPlayheadEdit,
  insertClipsAt,
  linesFromPastedText,
  mergeClips,
  setClipText,
  splitClipAt,
  trimClipEdge
} from './clipEditing';
import type { LyricClip } from '../types/clip';
import type { LyricLayer } from '../types/layer';

function clip(overrides: Partial<LyricClip> & Pick<LyricClip, 'id'>): LyricClip {
  return {
    text: 'line',
    startTime: 0,
    endTime: 2,
    layerId: 'main',
    transitionIn: 'fade',
    transitionOut: 'fade',
    position: 'center',
    ...overrides
  };
}

describe('setClipText', () => {
  it('drops word timings that belonged to the old text', () => {
    const before = clip({
      id: 'a',
      text: 'ララララ',
      words: [{ text: 'ララララ', startTime: 0, endTime: 1 }]
    });
    const after = setClipText(before, '雨の街を駆け出した');
    expect(after.text).toBe('雨の街を駆け出した');
    expect(after.words).toBeUndefined();
    expect(before.words).toHaveLength(1);
  });

  it('unmutes an empty block once it gets text', () => {
    expect(setClipText(clip({ id: 'a', text: '', muted: true }), 'hola').muted).toBe(false);
  });

  it('keeps a deliberate mute on a clip that already had text', () => {
    expect(setClipText(clip({ id: 'a', text: 'x', muted: true }), 'y').muted).toBe(true);
  });

  it('returns the same clip when the text does not change', () => {
    const same = clip({ id: 'a' });
    expect(setClipText(same, 'line')).toBe(same);
  });
});

describe('insertClipsAt', () => {
  const existing = [
    clip({ id: 'one', startTime: 10, endTime: 12 }),
    clip({ id: 'two', startTime: 14, endTime: 16 }),
    clip({ id: 'other', layerId: 'es', startTime: 12.5, endTime: 13 })
  ];

  it('adds one empty, muted, manual block at the time on the layer', () => {
    const { clips, insertedIds } = insertClipsAt(existing, [''], {
      layerId: 'main', time: 20, idPrefix: 'ins'
    });
    expect(insertedIds).toEqual(['ins-0']);
    const block = clips.find(c => c.id === 'ins-0')!;
    expect(block).toMatchObject({
      layerId: 'main', startTime: 20, text: '', muted: true, createdBy: 'manual'
    });
    expect(block.endTime).toBeGreaterThan(20);
    expect(clips).toHaveLength(4);
  });

  it('stops a single block at the next block on its layer only', () => {
    const { clips } = insertClipsAt(existing, ['hey'], {
      layerId: 'main', time: 12.2, idPrefix: 'ins'
    });
    // 'other' sits at 12.5 on another layer and doesn't count.
    expect(clips.find(c => c.id === 'ins-0')!.endTime).toBe(14);
  });

  it('keeps its own length when the next block is too close to fit one', () => {
    const { clips } = insertClipsAt(existing, ['hey'], {
      layerId: 'main', time: 13.9, idPrefix: 'ins'
    });
    expect(clips.find(c => c.id === 'ins-0')!.endTime).toBeGreaterThan(14);
  });

  it('lays several pasted lines back to back', () => {
    const { clips, insertedIds } = insertClipsAt([], ['uno', 'dos', 'tres'], {
      layerId: 'main', time: 5, idPrefix: 'paste'
    });
    expect(insertedIds).toHaveLength(3);
    const made = insertedIds.map(id => clips.find(c => c.id === id)!);
    expect(made[0]!.startTime).toBe(5);
    expect(made[1]!.startTime).toBe(made[0]!.endTime);
    expect(made[2]!.startTime).toBe(made[1]!.endTime);
    expect(made.every(c => !c.muted)).toBe(true);
  });

  it('never starts a block past the end of the song', () => {
    const { clips } = insertClipsAt([], [''], {
      layerId: 'main', time: 99, trackDuration: 60, idPrefix: 'ins'
    });
    const block = clips[0]!;
    expect(block.startTime).toBeLessThan(60);
    expect(block.endTime).toBeLessThanOrEqual(60);
  });
});

describe('linesFromPastedText', () => {
  it('splits on any newline and drops blank lines', () => {
    expect(linesFromPastedText('  uno \r\n\r\ndos\rtres\n\n')).toEqual(['uno', 'dos', 'tres']);
  });
});

describe('splitClipAt', () => {
  it('cuts on the word boundary and keeps each half its word timings', () => {
    const glued = clip({
      id: 'a',
      sourceId: 'line-1',
      text: '世界で君が笑う',
      startTime: 10,
      endTime: 14,
      words: [
        { text: '世界', startTime: 10, endTime: 11 },
        { text: 'で', startTime: 11, endTime: 11.5 },
        { text: '君が', startTime: 12, endTime: 13 },
        { text: '笑う', startTime: 13, endTime: 14 }
      ]
    });
    const [left, right] = splitClipAt(glued, 11.8, 'b')!;
    expect(left).toMatchObject({ id: 'a', sourceId: 'line-1', text: '世界で', startTime: 10, endTime: 11.8 });
    expect(left.words?.map(w => w.text)).toEqual(['世界', 'で']);
    expect(right).toMatchObject({ id: 'b', text: '君が笑う', startTime: 11.8, endTime: 14, createdBy: 'manual' });
    expect(right.sourceId).toBeUndefined();
    expect(right.words?.map(w => w.text)).toEqual(['君が', '笑う']);
  });

  it('falls back to the nearest space when there are no word timings', () => {
    const [left, right] = splitClipAt(clip({ id: 'a', text: 'I got my heart', startTime: 0, endTime: 4 }), 1.4, 'b')!;
    expect(left.text).toBe('I got');
    expect(right.text).toBe('my heart');
    expect(left.words).toBeUndefined();
  });

  it('mutes a half that ends up without text', () => {
    const [, right] = splitClipAt(clip({
      id: 'a', text: 'hey', startTime: 0, endTime: 4,
      words: [{ text: 'hey', startTime: 0, endTime: 1 }]
    }), 3, 'b')!;
    expect(right.text).toBe('');
    expect(right.muted).toBe(true);
  });

  it('refuses a cut that leaves a sliver', () => {
    expect(splitClipAt(clip({ id: 'a', startTime: 0, endTime: 2 }), 0.1, 'b')).toBeNull();
    expect(splitClipAt(clip({ id: 'a', startTime: 0, endTime: 2 }), 1.9, 'b')).toBeNull();
  });
});

describe('mergeClips', () => {
  it('joins the selected pieces of each layer into one line', () => {
    const clips = [
      clip({ id: 'b', text: 'my heart', startTime: 2, endTime: 3.5 }),
      clip({ id: 'a', text: 'I got', startTime: 0, endTime: 2 }),
      clip({ id: 'c', text: 'next', startTime: 5, endTime: 6 }),
      clip({ id: 'j1', layerId: 'ja', text: '世界で', startTime: 0, endTime: 1 }),
      clip({ id: 'j2', layerId: 'ja', text: '君が笑う', startTime: 1, endTime: 2 })
    ];
    const { clips: next, mergedIds } = mergeClips(clips, new Set(['a', 'b', 'j1', 'j2']));
    expect(mergedIds.sort()).toEqual(['a', 'j1']);
    expect(next.map(c => c.id)).toEqual(['a', 'c', 'j1']);
    expect(next.find(c => c.id === 'a')).toMatchObject({ text: 'I got my heart', startTime: 0, endTime: 3.5 });
    expect(next.find(c => c.id === 'j1')?.text).toBe('世界で君が笑う');
  });

  it('keeps word timings only when every piece had them', () => {
    const withWords = clip({ id: 'a', text: 'a', words: [{ text: 'a', startTime: 0, endTime: 1 }] });
    const without = clip({ id: 'b', text: 'b', startTime: 2, endTime: 3 });
    const { clips: next } = mergeClips([withWords, without], new Set(['a', 'b']));
    expect(next[0]!.words).toBeUndefined();
  });

  it('leaves a lone selected clip untouched', () => {
    const clips = [clip({ id: 'a' })];
    expect(mergeClips(clips, new Set(['a'])).clips).toBe(clips);
  });
});

describe('trimClipEdge', () => {
  it('moves the start to the playhead and drops words now outside', () => {
    const before = clip({
      id: 'a', startTime: 0, endTime: 4,
      words: [{ text: 'uh', startTime: 0, endTime: 1 }, { text: 'yes', startTime: 2, endTime: 3 }]
    });
    const after = trimClipEdge(before, 1.5, 'start');
    expect(after.startTime).toBe(1.5);
    expect(after.words?.map(w => w.text)).toEqual(['yes']);
  });

  it('moves the end, even past the old end', () => {
    expect(trimClipEdge(clip({ id: 'a', startTime: 0, endTime: 2 }), 3, 'end').endTime).toBe(3);
  });

  it('returns the same clip when the clip would get too short', () => {
    const same = clip({ id: 'a', startTime: 0, endTime: 2 });
    expect(trimClipEdge(same, 1.9, 'start')).toBe(same);
    expect(trimClipEdge(same, 0.1, 'end')).toBe(same);
  });
});

describe('applyPlayheadEdit', () => {
  const layers = [
    { id: 'main', locked: false, visible: true },
    { id: 'tr', locked: true, visible: true }
  ] as unknown as LyricLayer[];
  const clips = [
    clip({ id: 'a', text: 'one two', startTime: 0, endTime: 4 }),
    clip({ id: 'b', text: 'three', startTime: 6, endTime: 8 }),
    clip({ id: 't', layerId: 'tr', text: 'uno dos', startTime: 0, endTime: 4 })
  ];
  const base = { selectedIds: new Set<string>(), activeLayerId: 'main', idPrefix: 'cut' };

  it('splits the active layer clip under the playhead when nothing is selected', () => {
    const { clips: next, affectedIds } = applyPlayheadEdit(clips, layers, { ...base, edit: 'split', time: 2 });
    expect(affectedIds).toEqual(['cut-0']);
    expect(next.map(c => c.id)).toEqual(['a', 'cut-0', 'b', 't']);
  });

  it('acts on the selection instead, and never on a locked layer', () => {
    const { affectedIds } = applyPlayheadEdit(clips, layers, {
      ...base, edit: 'split', time: 2, selectedIds: new Set(['a', 't'])
    });
    expect(affectedIds).toEqual(['cut-0']);
  });

  it('ends the line just heard when the playhead is past it', () => {
    const { clips: next, affectedIds } = applyPlayheadEdit(clips, layers, { ...base, edit: 'trimEnd', time: 5 });
    expect(affectedIds).toEqual(['a']);
    expect(next.find(c => c.id === 'a')?.endTime).toBe(5);
  });

  it('starts the coming line early when the playhead is before it', () => {
    const { clips: next } = applyPlayheadEdit(clips, layers, { ...base, edit: 'trimStart', time: 5 });
    expect(next.find(c => c.id === 'b')?.startTime).toBe(5);
  });

  it('returns the same array when nothing applies', () => {
    expect(applyPlayheadEdit(clips, layers, { ...base, edit: 'split', time: 5 }).clips).toBe(clips);
  });
});
