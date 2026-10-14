import { describe, expect, it } from 'vitest';
import type { StoredCompositionV2 } from './types';
import {
  deriveSustainedCueSpans,
  moveSustainedCue,
  sortCompositionTracksForTimeline
} from './timeline';

const score: StoredCompositionV2 = {
  schemaVersion: 2,
  tracks: [{
    id: 'scene', name: 'Scene', kind: 'scene', order: 0, enabled: true, locked: false
  }],
  cues: [
    {
      id: 'third', trackId: 'scene', startTimeMs: 9000,
      target: { kind: 'scene', family: 'scene', id: 'scene-c', revision: '3' },
      priority: 0, enabled: true
    },
    {
      id: 'first', trackId: 'scene', startTimeMs: 1000,
      target: { kind: 'scene', family: 'scene', id: 'scene-a', revision: '1' },
      priority: 0, enabled: true
    },
    {
      id: 'second', trackId: 'scene', startTimeMs: 4000,
      target: { kind: 'scene', family: 'scene', id: 'scene-b', revision: '2' },
      priority: 0, enabled: true
    }
  ]
};

describe('composition timeline v2', () => {
  it('derives every cue end from the next cut and the final one from audio duration', () => {
    const spans = deriveSustainedCueSpans(score, 'scene', 12_000);

    expect(spans.map(span => [span.cue.id, span.cue.startTimeMs, span.endTimeMs])).toEqual([
      ['first', 1000, 4000],
      ['second', 4000, 9000],
      ['third', 9000, 12_000]
    ]);
  });

  it('moves only the cut, applies snap and clamps to the audio duration', () => {
    const moved = moveSustainedCue(score, 'second', 4670, 12_000, 500);
    const clamped = moveSustainedCue(moved, 'third', 20_000, 12_000);

    expect(moved.cues.find(cue => cue.id === 'second')?.startTimeMs).toBe(4500);
    expect(clamped.cues.find(cue => cue.id === 'third')?.startTimeMs).toBe(12_000);
    expect(clamped.cues.find(cue => cue.id === 'first')).toEqual(score.cues[1]);
  });

  it('orders Scene and Image before granular tracks', () => {
    const tracks: StoredCompositionV2['tracks'] = [
      { id: 'looks', name: 'Looks', kind: 'looks', order: 0, enabled: true, locked: false },
      { id: 'image', name: 'Image', kind: 'image', order: 99, enabled: true, locked: false },
      { id: 'scene', name: 'Scene', kind: 'scene', order: 99, enabled: true, locked: false },
      { id: 'rain', name: 'Rain', kind: 'rain', order: 1, enabled: true, locked: false }
    ];

    expect(sortCompositionTracksForTimeline(tracks).map(track => track.kind)).toEqual([
      'scene', 'image', 'looks', 'rain'
    ]);
  });
});
