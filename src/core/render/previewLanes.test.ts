import { describe, expect, it } from 'vitest';
import type { LyricClip } from '../types/clip';
import type { LyricLayer } from '../types/layer';
import { createDefaultLayers } from '../types/layer';
import { computePreviewLanes, resolveClipLane } from './previewLanes';

function layer(id: string, preset: 'top' | 'bottom', role: LyricLayer['role'], order: number): LyricLayer {
  const base = createDefaultLayers()[0];
  return {
    ...base,
    id,
    name: id,
    role,
    order,
    renderSettings: { ...base.renderSettings!, positionPreset: preset }
  };
}

function clip(layerId: string, text = 'line', extra: Partial<LyricClip> = {}): LyricClip {
  return { id: `${layerId}-c`, layerId, text, startTime: 0, endTime: 1, ...extra } as LyricClip;
}

describe('computePreviewLanes', () => {
  const ja = layer('ja', 'bottom', 'primary', 0);
  const romaji = layer('romaji', 'bottom', 'transliteration', 1);
  const es = layer('es', 'top', 'translation', 2);

  it('gives each text layer its own lane, top preset first', () => {
    const lanes = computePreviewLanes([ja, romaji, es], [clip('ja'), clip('romaji'), clip('es')]);
    expect([...lanes.keys()]).toEqual(['es', 'ja', 'romaji']);
    expect(lanes.get('es')!.count).toBe(3);
    expect(lanes.get('es')!.center).toBeLessThan(lanes.get('ja')!.center);
    expect(lanes.get('ja')!.center).toBeLessThan(lanes.get('romaji')!.center);
  });

  it('splits in two when there is no translation', () => {
    const lanes = computePreviewLanes([ja, romaji, es], [clip('ja'), clip('romaji')]);
    expect([...lanes.keys()]).toEqual(['ja', 'romaji']);
    expect(lanes.get('ja')!.count).toBe(2);
  });

  it('leaves a single text layer on its preset', () => {
    expect(computePreviewLanes([ja, romaji], [clip('ja')]).size).toBe(0);
  });

  it('ignores hidden layers and muted or empty clips', () => {
    const hidden = { ...romaji, visible: false };
    const lanes = computePreviewLanes(
      [ja, hidden, es],
      [clip('ja'), clip('romaji'), clip('es', '  '), clip('es', 'x', { muted: true })]
    );
    expect(lanes.size).toBe(0);
  });

  it('keeps explicit clip positions out of the lanes', () => {
    const lanes = computePreviewLanes([ja, romaji], [clip('ja'), clip('romaji')]);
    expect(resolveClipLane(clip('ja'), lanes)).toBeDefined();
    expect(resolveClipLane(clip('ja', 'x', { position: 'top-left' }), lanes)).toBeUndefined();
  });
});
