import type { LyricClip } from '../types/clip';
import type { LyricLayer } from '../types/layer';

export interface ShiftClipsOptions {
  /** Hard upper bound on the timeline. Clips can't be pushed past this. */
  trackDuration?: number;
  /** When true (default), locked clips and clips on locked layers stay put. */
  respectLocked?: boolean;
  /** Layer list — required to honour layer-level locks. */
  layers?: ReadonlyArray<LyricLayer>;
}

interface MoveContext {
  movableIds: Set<string>;
  minStart: number;
  maxEnd: number;
}

function lockedLayerSet(layers?: ReadonlyArray<LyricLayer>): Set<string> {
  if (!layers) return new Set();
  const out = new Set<string>();
  for (const l of layers) if (l.locked) out.add(l.id);
  return out;
}

function gatherMovable(
  clips: ReadonlyArray<LyricClip>,
  ids: Iterable<string>,
  respectLocked: boolean,
  lockedLayers: Set<string>
): MoveContext {
  const wanted = new Set(ids);
  let minStart = Number.POSITIVE_INFINITY;
  let maxEnd = Number.NEGATIVE_INFINITY;
  const movableIds = new Set<string>();
  for (const c of clips) {
    if (!wanted.has(c.id)) continue;
    if (respectLocked && (c.locked || lockedLayers.has(c.layerId))) continue;
    movableIds.add(c.id);
    if (c.startTime < minStart) minStart = c.startTime;
    if (c.endTime > maxEnd) maxEnd = c.endTime;
  }
  return { movableIds, minStart, maxEnd };
}

/**
 * Compute the largest delta (in the same direction as `requestedDelta`) that
 * the group can be shifted by without violating timeline bounds.
 *
 * Returns 0 when no clip in the group is movable.
 */
export function clampGroupDelta(
  clips: ReadonlyArray<LyricClip>,
  ids: Iterable<string>,
  requestedDelta: number,
  options: ShiftClipsOptions = {}
): number {
  const { trackDuration, respectLocked = true, layers } = options;
  if (requestedDelta === 0) return 0;
  const ctx = gatherMovable(clips, ids, respectLocked, lockedLayerSet(layers));
  if (ctx.movableIds.size === 0) return 0;

  let delta = requestedDelta;
  if (delta < 0) {
    delta = Math.max(delta, -ctx.minStart);
  } else if (delta > 0 && trackDuration != null) {
    const headroom = trackDuration - ctx.maxEnd;
    delta = Math.min(delta, Math.max(0, headroom));
  }
  // Avoid `-0` slipping through and re-rendering for nothing.
  return delta === 0 ? 0 : delta;
}

/**
 * Shift a group of clips together by `deltaSeconds`.
 *
 * Preserves each clip's duration and the relative spacing inside the group.
 * Honours `locked` clips and clips on locked layers (they stay put). The
 * group as a whole is clamped so no movable clip goes below 0 or past
 * `trackDuration`.
 *
 * Pure: returns a new array; never mutates input clips.
 */
export function shiftClips(
  clips: ReadonlyArray<LyricClip>,
  ids: Iterable<string>,
  deltaSeconds: number,
  options: ShiftClipsOptions = {}
): LyricClip[] {
  const { trackDuration, respectLocked = true, layers } = options;
  const lockedLayers = lockedLayerSet(layers);
  const ctx = gatherMovable(clips, ids, respectLocked, lockedLayers);
  if (ctx.movableIds.size === 0 || deltaSeconds === 0) {
    return clips.slice();
  }

  let delta = deltaSeconds;
  if (delta < 0) {
    delta = Math.max(delta, -ctx.minStart);
  } else if (delta > 0 && trackDuration != null) {
    const headroom = trackDuration - ctx.maxEnd;
    delta = Math.min(delta, Math.max(0, headroom));
  }
  if (delta === 0) return clips.slice();

  return clips.map(c => {
    if (!ctx.movableIds.has(c.id)) return c;
    return {
      ...c,
      startTime: c.startTime + delta,
      endTime: c.endTime + delta
    };
  });
}

/**
 * Clips eligible for selection: not locked, not on a locked layer,
 * and (when `requireVisible` is set) on a visible layer.
 */
export function getSelectableClips(
  clips: ReadonlyArray<LyricClip>,
  layers: ReadonlyArray<LyricLayer>,
  options: { requireVisible?: boolean } = {}
): LyricClip[] {
  const { requireVisible = true } = options;
  const layerById = new Map(layers.map(l => [l.id, l] as const));
  return clips.filter(c => {
    if (c.locked) return false;
    const layer = layerById.get(c.layerId);
    if (!layer) return false;
    if (layer.locked) return false;
    if (requireVisible && !layer.visible) return false;
    return true;
  });
}

/**
 * Selectable clips whose start is at or after `time`.
 *
 * Used by "Select After Playhead" — does not include clips that started
 * before the playhead and only happen to overlap it.
 */
export function getClipsAfterTime(
  clips: ReadonlyArray<LyricClip>,
  time: number,
  layers: ReadonlyArray<LyricLayer>
): LyricClip[] {
  return getSelectableClips(clips, layers).filter(c => c.startTime >= time);
}

export interface SelectionBounds {
  count: number;
  startTime: number;
  endTime: number;
  /** endTime − startTime. */
  span: number;
}

/**
 * Aggregate stats for a clip selection. Returns null when the selection is
 * empty so callers can render a clear "no selection" state.
 */
export function getSelectionBounds(
  clips: ReadonlyArray<LyricClip>,
  ids: Iterable<string>
): SelectionBounds | null {
  const wanted = new Set(ids);
  let startTime = Number.POSITIVE_INFINITY;
  let endTime = Number.NEGATIVE_INFINITY;
  let count = 0;
  for (const c of clips) {
    if (!wanted.has(c.id)) continue;
    count++;
    if (c.startTime < startTime) startTime = c.startTime;
    if (c.endTime > endTime) endTime = c.endTime;
  }
  if (count === 0) return null;
  return { count, startTime, endTime, span: endTime - startTime };
}
