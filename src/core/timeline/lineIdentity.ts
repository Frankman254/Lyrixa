import type { LyricClip } from '../types/clip';
import type { LyricLayer, LyricLayerRole } from '../types/layer';
import { isDerivedTextRole } from '../types/layer';
import { hashLyricText } from '../lyrics/textHash';

/**
 * Line identity across layers.
 *
 * A song line exists once, but is rendered on as many layers as the author
 * wants: the sung Japanese, its romaji, a Spanish translation, an English
 * one. `LyricClip.sourceId` is what says "these are the same line", and this
 * module is the only place that interprets it.
 *
 * Everything here works with N layers of any ids. Nothing keys off
 * `layer-main` / `layer-backing` / `layer-fx` — those are default layer ids,
 * not a schema, and a project may have none of them.
 */

/** A line's identity, as used for grouping. Never empty. */
export type LineKey = string;

/**
 * The key a clip groups under.
 *
 * `sourceId` when present; otherwise the clip's own id, which makes an
 * unlinked clip a group of one rather than lumping every unlinked clip
 * together under a shared empty key.
 */
export function resolveClipLineKey(clip: LyricClip): LineKey {
  return clip.sourceId && clip.sourceId.length > 0 ? clip.sourceId : clip.id;
}

/**
 * Every clip that renders the same lyric line as `sourceId`, in a stable
 * order (earliest start first, then by layer id so the result never depends
 * on array order).
 *
 * Pass a clip's `sourceId`, not its `id`. A clip with no `sourceId` has no
 * siblings by definition; use `getRelatedClipsForClip` for that case.
 */
export function getRelatedClips(clips: LyricClip[], sourceId: string | undefined): LyricClip[] {
  if (!sourceId) return [];
  return clips
    .filter(clip => clip.sourceId === sourceId)
    .sort(compareClipsForDisplay);
}

/** The siblings of one clip, including the clip itself. */
export function getRelatedClipsForClip(clips: LyricClip[], clip: LyricClip): LyricClip[] {
  if (!clip.sourceId) return [clip];
  return getRelatedClips(clips, clip.sourceId);
}

/** The siblings of one clip, excluding the clip itself. */
export function getSiblingClips(clips: LyricClip[], clip: LyricClip): LyricClip[] {
  return getRelatedClipsForClip(clips, clip).filter(other => other.id !== clip.id);
}

/** Every line in the project, keyed by line identity. */
export function groupClipsByLineKey(clips: LyricClip[]): Map<LineKey, LyricClip[]> {
  const groups = new Map<LineKey, LyricClip[]>();
  for (const clip of clips) {
    const key = resolveClipLineKey(clip);
    const existing = groups.get(key);
    if (existing) existing.push(clip);
    else groups.set(key, [clip]);
  }
  for (const group of groups.values()) group.sort(compareClipsForDisplay);
  return groups;
}

/**
 * The clip on `clips` that carries the primary text for a line.
 *
 * "Primary" is decided by the layer's declared role. When no layer declares
 * one — every pre-role project — the earliest clip in the group stands in,
 * which is what the author sees as the lead line anyway.
 */
export function findPrimaryClip(
  clips: LyricClip[],
  layers: LyricLayer[],
  sourceId: string | undefined
): LyricClip | undefined {
  const group = getRelatedClips(clips, sourceId);
  if (group.length === 0) return undefined;
  const roles = buildLayerRoleIndex(layers);
  return group.find(clip => roles.get(clip.layerId) === 'primary') ?? group[0];
}

/** Clips that live on a layer declaring `role`. */
export function getClipsByRole(
  clips: LyricClip[],
  layers: LyricLayer[],
  role: LyricLayerRole
): LyricClip[] {
  const layerIds = new Set(layers.filter(layer => layer.role === role).map(layer => layer.id));
  if (layerIds.size === 0) return [];
  return clips.filter(clip => layerIds.has(clip.layerId));
}

/** Layers declaring `role`, in timeline order. */
export function getLayersByRole(layers: LyricLayer[], role: LyricLayerRole): LyricLayer[] {
  return layers.filter(layer => layer.role === role).sort((a, b) => a.order - b.order);
}

export function buildLayerRoleIndex(layers: LyricLayer[]): Map<string, LyricLayerRole | undefined> {
  return new Map(layers.map(layer => [layer.id, layer.role]));
}

// --------------------------------------------------------------------------- //
// Derived lines (translations, romanizations)
// --------------------------------------------------------------------------- //

export interface CreateDerivedClipOptions {
  /** Layer the new clip lands on. Must differ from the source clip's layer. */
  layerId: string;
  /** Text for the derived line. May be empty while a translation is pending. */
  text: string;
  /** Explicit id. Generated from the source clip when omitted. */
  id?: string;
}

/**
 * Build the translation/romanization counterpart of a clip.
 *
 * Timing and identity are inherited verbatim: a translation of a line is that
 * line, so it starts and ends with it and shares its `sourceId`. It is a copy
 * at one instant, not a live link — from here on the two clips are independent
 * timeline objects, and moving one never moves the other. That is deliberate:
 * a hidden sync would silently overwrite deliberate manual re-timing.
 *
 * Visual metadata is NOT inherited. The derived clip takes its layer's
 * defaults, which is what makes a translation render as a translation instead
 * of as a second lead vocal.
 */
export function createDerivedClip(
  source: LyricClip,
  options: CreateDerivedClipOptions
): LyricClip {
  return {
    id: options.id ?? `${source.id}--${options.layerId}`,
    text: options.text,
    startTime: source.startTime,
    endTime: source.endTime,
    layerId: options.layerId,
    sourceId: source.sourceId ?? source.id,
    sourceIndex: source.sourceIndex,
    lyricSourceId: source.lyricSourceId,
    createdBy: 'import',
    sourceTextHash: hashLyricText(source.text),
    transitionIn: source.transitionIn,
    transitionOut: source.transitionOut,
    position: 'center'
  };
}

/**
 * Whether a derived clip's text no longer matches the primary line it was
 * produced from.
 *
 * Computed, never stored: a clip is stale because its fingerprint disagrees
 * with the current primary text, so undoing the edit that caused it makes the
 * clip fresh again with nothing to clean up. A clip with no fingerprint was
 * written by hand and is never reported stale — the author owns that text.
 */
export function isDerivedClipStale(clip: LyricClip, primary: LyricClip | undefined): boolean {
  if (!clip.sourceTextHash || !primary) return false;
  if (primary.id === clip.id) return false;
  return clip.sourceTextHash !== hashLyricText(primary.text);
}

export interface StaleDerivedClip {
  clip: LyricClip;
  primary: LyricClip;
  layer: LyricLayer | undefined;
}

/**
 * Every derived clip in the project whose primary line has moved on.
 *
 * This is what the UI offers a `Retranslate` button for. It reports; it does
 * not act. Regenerating text is always an explicit user decision, because a
 * translation the author hand-corrected is real work that an automatic pass
 * would throw away.
 */
export function findStaleDerivedClips(
  clips: LyricClip[],
  layers: LyricLayer[]
): StaleDerivedClip[] {
  const roles = buildLayerRoleIndex(layers);
  const layerById = new Map(layers.map(layer => [layer.id, layer]));
  const groups = groupClipsByLineKey(clips);
  const stale: StaleDerivedClip[] = [];

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const primary = group.find(clip => roles.get(clip.layerId) === 'primary') ?? group[0];
    if (!primary) continue;
    for (const clip of group) {
      if (clip.id === primary.id) continue;
      if (!isDerivedTextRole(roles.get(clip.layerId))) continue;
      if (!isDerivedClipStale(clip, primary)) continue;
      stale.push({ clip, primary, layer: layerById.get(clip.layerId) });
    }
  }
  return stale;
}

/** Mark a derived clip as matching `primaryText` again, after a retranslation. */
export function markDerivedClipFresh(clip: LyricClip, primaryText: string): LyricClip {
  return { ...clip, sourceTextHash: hashLyricText(primaryText) };
}

// --------------------------------------------------------------------------- //
// Repair
// --------------------------------------------------------------------------- //

/**
 * Repair `sourceId` on clips produced by a bridge that used it as a *pointer*
 * instead of as a shared identity.
 *
 * The transcriptor bridge (schema v2) writes the main clip's whisper segment
 * number as its `sourceId` — shared by every line cut out of that segment,
 * so it does not identify a line — and writes the parent clip's *id* as the
 * translation's `sourceId`. Neither layer ends up with a key the other can be
 * found by, which is exactly what `getRelatedClips` needs.
 *
 * This rewrites both sides onto one key per line. Two rules, in order:
 *
 *  1. A `sourceId` that names another clip's id is a pointer. Parent and child
 *     both take the parent's line key.
 *  2. A `sourceId` shared by several clips *on one layer* is a group label
 *     (a segment), not a line. Those clips fall back to their own ids.
 *
 * A `sourceId` that already identifies one line per layer — everything tap-sync
 * writes, and every project a user has synced by hand — matches neither rule
 * and is returned untouched. This is why the repair is safe to run on import:
 * it only ever fires on shapes that are already broken.
 */
export function reconcileClipLineIdentity(clips: LyricClip[]): LyricClip[] {
  if (clips.length === 0) return clips;

  const byId = new Map(clips.map(clip => [clip.id, clip]));

  // Rule 2 detection: which sourceIds repeat within a single layer?
  // Counted through a nested map rather than a concatenated string key: layer
  // ids and source ids are author-supplied, so any separator we picked could
  // legitimately appear inside one of them.
  const perLayer = new Map<string, Map<string, number>>();
  const ambiguous = new Set<string>();
  for (const clip of clips) {
    if (!clip.sourceId) continue;
    let counts = perLayer.get(clip.layerId);
    if (!counts) {
      counts = new Map<string, number>();
      perLayer.set(clip.layerId, counts);
    }
    const seenTimes = (counts.get(clip.sourceId) ?? 0) + 1;
    counts.set(clip.sourceId, seenTimes);
    if (seenTimes > 1) ambiguous.add(clip.sourceId);
  }

  /**
   * The line key a clip should end up with, resolving pointer chains.
   *
   * A clip that never had a `sourceId` keeps not having one: it is unlinked,
   * and writing its own id in would add data the author never authored.
   * `resolveClipLineKey` already treats such a clip as a group of one.
   */
  const resolve = (clip: LyricClip, seen: Set<string>): string | undefined => {
    if (!clip.sourceId) return undefined;
    const pointer = byId.get(clip.sourceId);
    if (pointer && pointer.id !== clip.id && !seen.has(pointer.id)) {
      seen.add(pointer.id);
      return resolve(pointer, seen) ?? pointer.id;
    }
    return ambiguous.has(clip.sourceId) ? clip.id : clip.sourceId;
  };

  let changed = false;
  const repaired = clips.map(clip => {
    const sourceId = resolve(clip, new Set([clip.id]));
    if (sourceId === clip.sourceId) return clip;
    changed = true;
    return { ...clip, sourceId };
  });
  return changed ? repaired : clips;
}

/**
 * Attach `sourceTextHash` to derived clips that came in without one, so an
 * imported project can report staleness from the moment it is opened rather
 * than only after the first edit made inside Lyrixa.
 */
export function seedDerivedTextHashes(
  clips: LyricClip[],
  layers: LyricLayer[]
): LyricClip[] {
  const roles = buildLayerRoleIndex(layers);
  if (![...roles.values()].some(isDerivedTextRole)) return clips;

  const groups = groupClipsByLineKey(clips);
  const hashByClipId = new Map<string, string>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const primary = group.find(clip => roles.get(clip.layerId) === 'primary') ?? group[0];
    if (!primary) continue;
    const hash = hashLyricText(primary.text);
    for (const clip of group) {
      if (clip.id === primary.id || clip.sourceTextHash) continue;
      if (!isDerivedTextRole(roles.get(clip.layerId))) continue;
      hashByClipId.set(clip.id, hash);
    }
  }
  if (hashByClipId.size === 0) return clips;
  return clips.map(clip => {
    const hash = hashByClipId.get(clip.id);
    return hash ? { ...clip, sourceTextHash: hash } : clip;
  });
}

function compareClipsForDisplay(a: LyricClip, b: LyricClip): number {
  if (a.startTime !== b.startTime) return a.startTime - b.startTime;
  return a.layerId.localeCompare(b.layerId);
}
