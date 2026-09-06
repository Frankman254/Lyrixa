import { describe, expect, it } from 'vitest';
import {
  createDerivedClip,
  findPrimaryClip,
  findStaleDerivedClips,
  getClipsByRole,
  getRelatedClips,
  getSiblingClips,
  groupClipsByLineKey,
  isDerivedClipStale,
  markDerivedClipFresh,
  reconcileClipLineIdentity,
  resolveClipLineKey,
  seedDerivedTextHashes
} from './lineIdentity';
import type { LyricClip } from '../types/clip';
import type { LyricLayer, LyricLayerRole } from '../types/layer';

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

function layer(id: string, role?: LyricLayerRole, language?: string): LyricLayer {
  return {
    id,
    name: id,
    layerType: 'lyrics',
    role,
    language,
    color: '#fff',
    visible: true,
    locked: false,
    order: 0
  };
}

describe('grouping the same line across layers', () => {
  // The scenario from the spec: one Japanese line with a romanization and two
  // translations, on four layers with ids that mean nothing to the code.
  const layers = [
    layer('jp', 'primary', 'ja'),
    layer('romaji', 'transliteration', 'ja-Latn'),
    layer('es', 'translation', 'es'),
    layer('en', 'translation', 'en')
  ];
  const clips = [
    clip({ id: 'clip-main-42', layerId: 'jp', sourceId: 'line-42', text: '君の名は' }),
    clip({ id: 'clip-romaji-42', layerId: 'romaji', sourceId: 'line-42', text: 'kimi no na wa' }),
    clip({ id: 'clip-es-42', layerId: 'es', sourceId: 'line-42', text: 'tu nombre' }),
    clip({ id: 'clip-en-42', layerId: 'en', sourceId: 'line-42', text: 'your name' }),
    clip({ id: 'clip-main-43', layerId: 'jp', sourceId: 'line-43', text: 'another' })
  ];

  it('finds every clip of one line regardless of how many layers exist', () => {
    expect(getRelatedClips(clips, 'line-42').map(c => c.id)).toEqual([
      'clip-en-42', 'clip-es-42', 'clip-main-42', 'clip-romaji-42'
    ]);
  });

  it('scales past two translations without any per-layer wiring', () => {
    const translations = getClipsByRole(clips, layers, 'translation');

    expect(translations.map(c => c.id)).toEqual(['clip-es-42', 'clip-en-42']);
  });

  it('is not coupled to layer ids like layer-main or layer-backing', () => {
    // Same data, renamed layers. Nothing about the result may change.
    const renamed = clips.map(c => ({ ...c, layerId: `x-${c.layerId}` }));
    const renamedLayers = layers.map(l => ({ ...l, id: `x-${l.id}` }));

    expect(getRelatedClips(renamed, 'line-42')).toHaveLength(4);
    expect(getClipsByRole(renamed, renamedLayers, 'translation')).toHaveLength(2);
  });

  it('reports siblings without the clip itself', () => {
    const main = clips[0]!;

    expect(getSiblingClips(clips, main).map(c => c.id)).toEqual([
      'clip-en-42', 'clip-es-42', 'clip-romaji-42'
    ]);
  });

  it('picks the primary clip by role, not by array order', () => {
    const shuffled = [...clips].reverse();

    expect(findPrimaryClip(shuffled, layers, 'line-42')!.id).toBe('clip-main-42');
  });

  it('falls back to the earliest clip when no layer declares a role', () => {
    const roleless = layers.map(l => ({ ...l, role: undefined }));
    const staggered = clips.map((c, i) => ({ ...c, startTime: 10 - i, endTime: 12 - i }));

    expect(findPrimaryClip(staggered, roleless, 'line-42')!.id).toBe('clip-en-42');
  });

  it('groups one line per key and leaves unlinked clips alone', () => {
    const groups = groupClipsByLineKey([...clips, clip({ id: 'loose', layerId: 'jp' })]);

    expect(groups.get('line-42')).toHaveLength(4);
    expect(groups.get('line-43')).toHaveLength(1);
    expect(groups.get('loose')).toHaveLength(1);
  });

  it('keys an unlinked clip by its own id, not by an empty string', () => {
    expect(resolveClipLineKey(clip({ id: 'solo', layerId: 'jp' }))).toBe('solo');
  });

  it('returns nothing for a missing sourceId rather than every unlinked clip', () => {
    expect(getRelatedClips(clips, undefined)).toEqual([]);
  });
});

describe('creating a derived line', () => {
  const source = clip({
    id: 'clip-main-42',
    layerId: 'jp',
    sourceId: 'line-42',
    text: '君の名は',
    startTime: 12.5,
    endTime: 16.25,
    sourceIndex: 42,
    lyricSourceId: 'lyrics-main'
  });

  it('inherits timing and line identity from the primary line', () => {
    const derived = createDerivedClip(source, { layerId: 'es', text: 'tu nombre' });

    expect(derived.startTime).toBe(12.5);
    expect(derived.endTime).toBe(16.25);
    expect(derived.sourceId).toBe('line-42');
    expect(derived.sourceIndex).toBe(42);
    expect(derived.lyricSourceId).toBe('lyrics-main');
  });

  it('lands on the requested layer with its own id', () => {
    const derived = createDerivedClip(source, { layerId: 'es', text: 'tu nombre' });

    expect(derived.layerId).toBe('es');
    expect(derived.id).not.toBe(source.id);
  });

  it('adopts the source clip id as identity when the source had none', () => {
    const orphan = clip({ id: 'clip-99', layerId: 'jp', text: 'hello' });

    expect(createDerivedClip(orphan, { layerId: 'es', text: 'hola' }).sourceId).toBe('clip-99');
  });

  it('does not copy the primary clip visual overrides onto the translation', () => {
    const styled = { ...source, styleOverride: { fontSize: '4rem' }, locked: true };

    const derived = createDerivedClip(styled, { layerId: 'es', text: 'tu nombre' });

    expect(derived.styleOverride).toBeUndefined();
    expect(derived.locked).toBeUndefined();
  });

  it('leaves the primary clip untouched', () => {
    const before = { ...source };

    createDerivedClip(source, { layerId: 'es', text: 'tu nombre' });

    expect(source).toEqual(before);
  });
});

describe('timing stays where the author put it', () => {
  it('editing translated text does not move the translation', () => {
    const source = clip({ id: 'a', layerId: 'jp', sourceId: 'line-1', text: 'original' });
    const derived = createDerivedClip(source, { layerId: 'es', text: 'traducción' });

    const edited = { ...derived, text: 'traducción corregida' };

    expect(edited.startTime).toBe(derived.startTime);
    expect(edited.endTime).toBe(derived.endTime);
  });

  it('moving the primary line does not drag its translation with it', () => {
    // No hidden sync: a deliberately re-timed translation must survive an
    // edit to the line it came from.
    const source = clip({ id: 'a', layerId: 'jp', sourceId: 'line-1', text: 'original' });
    const derived = createDerivedClip(source, { layerId: 'es', text: 'traducción' });
    const movedPrimary = { ...source, startTime: 30, endTime: 34 };

    const stale = findStaleDerivedClips(
      [movedPrimary, derived],
      [layer('jp', 'primary'), layer('es', 'translation')]
    );

    expect(derived.startTime).toBe(0);
    expect(stale).toEqual([]);
  });
});

describe('knowing when a translation went stale', () => {
  const layers = [layer('jp', 'primary', 'ja'), layer('es', 'translation', 'es')];
  const primary = clip({ id: 'a', layerId: 'jp', sourceId: 'line-1', text: 'original line' });
  const derived = createDerivedClip(primary, { layerId: 'es', text: 'línea original' });

  it('reports nothing while the primary text is unchanged', () => {
    expect(findStaleDerivedClips([primary, derived], layers)).toEqual([]);
  });

  it('reports the translation once its primary line is edited', () => {
    const edited = { ...primary, text: 'a different line' };

    const stale = findStaleDerivedClips([edited, derived], layers);

    expect(stale).toHaveLength(1);
    expect(stale[0]!.clip.id).toBe(derived.id);
    expect(stale[0]!.primary.id).toBe('a');
  });

  it('ignores whitespace-only changes to the primary line', () => {
    const rewrapped = { ...primary, text: '  original   line  ' };

    expect(findStaleDerivedClips([rewrapped, derived], layers)).toEqual([]);
  });

  it('un-stales itself when the edit is undone', () => {
    // Staleness is computed from the current text, not stored as a flag, so
    // undo needs no cleanup pass of its own.
    const edited = { ...primary, text: 'changed' };
    expect(findStaleDerivedClips([edited, derived], layers)).toHaveLength(1);

    expect(findStaleDerivedClips([primary, derived], layers)).toEqual([]);
  });

  it('never reports a hand-written line with no fingerprint', () => {
    const handWritten = { ...derived, sourceTextHash: undefined };
    const edited = { ...primary, text: 'changed' };

    expect(findStaleDerivedClips([edited, handWritten], layers)).toEqual([]);
    expect(isDerivedClipStale(handWritten, edited)).toBe(false);
  });

  it('does not treat a backing-vocal layer as a translation', () => {
    const backingLayers = [layer('jp', 'primary'), layer('es', 'backing')];
    const edited = { ...primary, text: 'changed' };

    expect(findStaleDerivedClips([edited, derived], backingLayers)).toEqual([]);
  });

  it('clears after a retranslation', () => {
    const edited = { ...primary, text: 'changed' };
    const refreshed = markDerivedClipFresh(
      { ...derived, text: 'cambiado' },
      edited.text
    );

    expect(findStaleDerivedClips([edited, refreshed], layers)).toEqual([]);
  });

  it('reports each stale translation when several languages exist', () => {
    const en = createDerivedClip(primary, { layerId: 'en', text: 'original line' });
    const edited = { ...primary, text: 'changed' };

    const stale = findStaleDerivedClips(
      [edited, derived, en],
      [...layers, layer('en', 'translation', 'en')]
    );

    expect(stale.map(item => item.clip.layerId).sort()).toEqual(['en', 'es']);
  });
});

describe('repairing sourceId from the transcriptor bridge', () => {
  // The bridge writes the whisper segment number as the main clip's sourceId
  // (shared by every line cut from that segment) and the parent clip's *id* as
  // the translation's sourceId. Neither side can find the other.
  const bridgeClips = [
    clip({ id: 'clip-0000', layerId: 'layer-main', sourceId: 'segment-0', text: 'one' }),
    clip({ id: 'clip-0001', layerId: 'layer-main', sourceId: 'segment-0', text: 'two' }),
    clip({ id: 'clip-0000-t', layerId: 'layer-backing', sourceId: 'clip-0000', text: 'uno' }),
    clip({ id: 'clip-0001-t', layerId: 'layer-backing', sourceId: 'clip-0001', text: 'dos' })
  ];

  it('makes each line findable from either layer', () => {
    const repaired = reconcileClipLineIdentity(bridgeClips);
    const first = repaired.find(c => c.id === 'clip-0000')!;

    expect(getRelatedClips(repaired, first.sourceId).map(c => c.id).sort())
      .toEqual(['clip-0000', 'clip-0000-t']);
  });

  it('does not merge two lines that came from one whisper segment', () => {
    const repaired = reconcileClipLineIdentity(bridgeClips);
    const groups = groupClipsByLineKey(repaired);

    expect(groups.size).toBe(2);
    for (const group of groups.values()) expect(group).toHaveLength(2);
  });

  it('leaves tap-sync identities exactly as the user synced them', () => {
    // Already one sourceId per line per layer: matches neither repair rule.
    const synced = [
      clip({ id: 'tap-a', layerId: 'main', sourceId: 'lyric-0-x1y2' }),
      clip({ id: 'tap-b', layerId: 'main', sourceId: 'lyric-1-z3w4' }),
      clip({ id: 'tap-c', layerId: 'es', sourceId: 'lyric-0-x1y2' })
    ];

    expect(reconcileClipLineIdentity(synced)).toBe(synced);
  });

  it('leaves a project with no sourceIds untouched', () => {
    const bare = [clip({ id: 'a', layerId: 'main' }), clip({ id: 'b', layerId: 'main' })];

    expect(reconcileClipLineIdentity(bare)).toBe(bare);
  });

  it('does not hang on a sourceId cycle', () => {
    const cyclic = [
      clip({ id: 'a', layerId: 'main', sourceId: 'b' }),
      clip({ id: 'b', layerId: 'main', sourceId: 'a' })
    ];

    expect(() => reconcileClipLineIdentity(cyclic)).not.toThrow();
  });

  it('handles ids and source ids containing separators', () => {
    const awkward = [
      clip({ id: 'clip a b', layerId: 'layer one', sourceId: 'seg 1' }),
      clip({ id: 'clip c d', layerId: 'layer one', sourceId: 'seg 1' }),
      clip({ id: 'clip a b t', layerId: 'layer two', sourceId: 'clip a b' })
    ];

    const repaired = reconcileClipLineIdentity(awkward);

    expect(groupClipsByLineKey(repaired).size).toBe(2);
    expect(repaired.find(c => c.id === 'clip a b t')!.sourceId).toBe('clip a b');
  });

  it('seeds fingerprints so an imported project reports staleness immediately', () => {
    const layers = [layer('layer-main', 'primary', 'en'), layer('layer-backing', 'translation', 'es')];
    const repaired = seedDerivedTextHashes(reconcileClipLineIdentity(bridgeClips), layers);

    expect(findStaleDerivedClips(repaired, layers)).toEqual([]);

    const edited = repaired.map(c => (c.id === 'clip-0000' ? { ...c, text: 'ONE!' } : c));
    expect(findStaleDerivedClips(edited, layers)).toHaveLength(1);
  });

  it('does not fingerprint clips on a project with no derived-text layers', () => {
    const layers = [layer('layer-main', 'primary'), layer('layer-backing', 'backing')];

    expect(seedDerivedTextHashes(bridgeClips, layers)).toBe(bridgeClips);
  });
});
