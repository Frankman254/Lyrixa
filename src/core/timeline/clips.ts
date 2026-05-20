import type { LyricClip } from '../types/clip';
import { MIN_CLIP_DURATION, isClipActiveAt } from '../types/clip';

/** Returns every clip whose [start, end] window contains `time`. */
export function resolveActiveClips(clips: LyricClip[], time: number): LyricClip[] {
  return clips.filter(c => isClipActiveAt(c, time));
}

/** Convenience: group clips by layer id for rendering and ordering. */
export function groupClipsByLayer(clips: LyricClip[]): Map<string, LyricClip[]> {
  const map = new Map<string, LyricClip[]>();
  for (const clip of clips) {
    const list = map.get(clip.layerId);
    if (list) list.push(clip);
    else map.set(clip.layerId, [clip]);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.startTime - b.startTime);
  }
  return map;
}

/** Snap a time value to the nearest multiple of `gridSeconds`. */
export function snapToGrid(time: number, gridSeconds: number): number {
  if (gridSeconds <= 0) return time;
  return Math.round(time / gridSeconds) * gridSeconds;
}

/** Clamp a number into [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Immutable helpers that produce adjusted clip copies. UI drag/resize code
 * should funnel through these so invariants (min duration, bounds) stay local.
 */

export interface ClipAdjustOptions {
  minDuration?: number;
  trackDuration?: number;
  snap?: number;
}

export function moveClip(
  clip: LyricClip,
  deltaSeconds: number,
  opts: ClipAdjustOptions = {}
): LyricClip {
  const { trackDuration, snap = 0 } = opts;
  const duration = clip.endTime - clip.startTime;
  let nextStart = clip.startTime + deltaSeconds;
  if (snap > 0) nextStart = snapToGrid(nextStart, snap);
  nextStart = Math.max(0, nextStart);
  if (trackDuration != null) {
    nextStart = Math.min(nextStart, Math.max(0, trackDuration - duration));
  }
  return {
    ...clip,
    startTime: nextStart,
    endTime: nextStart + duration
  };
}

export function resizeClipStart(
  clip: LyricClip,
  nextStart: number,
  opts: ClipAdjustOptions = {}
): LyricClip {
  const { minDuration = MIN_CLIP_DURATION, snap = 0 } = opts;
  let start = snap > 0 ? snapToGrid(nextStart, snap) : nextStart;
  start = Math.max(0, start);
  start = Math.min(start, clip.endTime - minDuration);
  return { ...clip, startTime: start };
}

export function resizeClipEnd(
  clip: LyricClip,
  nextEnd: number,
  opts: ClipAdjustOptions = {}
): LyricClip {
  const { minDuration = MIN_CLIP_DURATION, trackDuration, snap = 0 } = opts;
  let end = snap > 0 ? snapToGrid(nextEnd, snap) : nextEnd;
  end = Math.max(clip.startTime + minDuration, end);
  if (trackDuration != null) end = Math.min(end, trackDuration);
  return { ...clip, endTime: end };
}

/**
 * Time ↔ pixel helpers for the DAW-style editor.
 * `pxPerSecond` is the single zoom knob: larger = wider clips.
 */

export function timeToPx(time: number, pxPerSecond: number): number {
  return time * pxPerSecond;
}

export function pxToTime(px: number, pxPerSecond: number): number {
  return pxPerSecond > 0 ? px / pxPerSecond : 0;
}

/**
 * Choose a ruler tick interval that keeps labels ~60px apart at the current zoom.
 * Picks from a human-friendly set so the ruler never shows "every 3.7 seconds".
 */
export function chooseTickInterval(pxPerSecond: number, targetPx = 60): number {
  const candidates = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
  for (const c of candidates) {
    if (c * pxPerSecond >= targetPx) return c;
  }
  return candidates[candidates.length - 1]!;
}

/** Format a time value (seconds) as m:ss or m:ss.t depending on scale. */
export function formatTimecode(seconds: number, showMillis = false): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (showMillis) {
    return `${m}:${s.toFixed(2).padStart(5, '0')}`;
  }
  return `${m}:${Math.floor(s).toString().padStart(2, '0')}`;
}
