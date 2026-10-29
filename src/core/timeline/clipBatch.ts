import { MIN_CLIP_DURATION, type LyricClip } from '../types/clip';
import type { LyricLayer } from '../types/layer';
import { resizeClipEnd, resizeClipStart } from './clips';
import { shiftClips, type ShiftClipsOptions } from './clipSelection';

export type ResizeEdge = 'start' | 'end';

export interface ResizeClipSelectionOptions extends ShiftClipsOptions {
  snap?: number;
}

/** Resize every editable selected clip by the same pointer delta. */
export function resizeClipSelection(
  clips: ReadonlyArray<LyricClip>,
  ids: Iterable<string>,
  edge: ResizeEdge,
  deltaSeconds: number,
  options: ResizeClipSelectionOptions = {}
): LyricClip[] {
  const selected = new Set(ids);
  const lockedLayers = new Set((options.layers ?? []).filter(layer => layer.locked).map(layer => layer.id));
  return clips.map(clip => {
    if (!selected.has(clip.id) || clip.locked || lockedLayers.has(clip.layerId)) return clip;
    if (edge === 'start') {
      return resizeClipStart(clip, clip.startTime + deltaSeconds, { snap: options.snap });
    }
    return resizeClipEnd(clip, clip.endTime + deltaSeconds, {
      snap: options.snap,
      trackDuration: options.trackDuration
    });
  });
}

/** Move a selection so its earliest editable clip starts at `targetTime`. */
export function moveClipSelectionStartTo(
  clips: ReadonlyArray<LyricClip>,
  ids: Iterable<string>,
  targetTime: number,
  options: ShiftClipsOptions = {}
): LyricClip[] {
  const selected = new Set(ids);
  const lockedLayers = new Set((options.layers ?? []).filter(layer => layer.locked).map(layer => layer.id));
  const movable = clips.filter(clip =>
    selected.has(clip.id) && !clip.locked && !lockedLayers.has(clip.layerId)
  );
  if (movable.length === 0) return clips.slice();
  const earliest = Math.min(...movable.map(clip => clip.startTime));
  return shiftClips(clips, selected, Math.max(0, targetTime) - earliest, options);
}

export interface CopyTimingResult {
  clips: LyricClip[];
  affectedIds: string[];
}

/**
 * Copy one paragraph's exact timing to its counterparts on other layers.
 * `sourceId` identifies the source line and start-time proximity identifies
 * its occurrence. The latter matters when a chorus is duplicated several
 * times with the same source identity.
 */
export function copyTimingToLinkedClips(
  clips: ReadonlyArray<LyricClip>,
  layers: ReadonlyArray<LyricLayer>,
  anchorId: string,
  startTolerance = 0.05
): CopyTimingResult {
  const anchor = clips.find(clip => clip.id === anchorId);
  if (!anchor) return { clips: clips.slice(), affectedIds: [] };
  const lockedLayers = new Set(layers.filter(layer => layer.locked).map(layer => layer.id));
  const affectedIds: string[] = [];
  const next = clips.map(clip => {
    if (clip.id === anchor.id || clip.layerId === anchor.layerId || clip.locked || lockedLayers.has(clip.layerId)) {
      return clip;
    }
    const startsTogether = Math.abs(clip.startTime - anchor.startTime) <= startTolerance;
    const linked = anchor.sourceId
      ? clip.sourceId === anchor.sourceId && startsTogether
      : !clip.sourceId && startsTogether;
    if (!linked) return clip;
    affectedIds.push(clip.id);
    return {
      ...clip,
      startTime: anchor.startTime,
      endTime: Math.max(anchor.startTime + MIN_CLIP_DURATION, anchor.endTime),
      // Per-word timings belong to the destination's previous interval. Keep
      // the text, but drop stale karaoke timing when adopting another clip's
      // paragraph bounds.
      words: undefined
    };
  });
  return { clips: next, affectedIds };
}

