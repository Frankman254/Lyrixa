import type { LyricClip } from '../types/clip';
import { MIN_CLIP_DURATION } from '../types/clip';

/**
 * Tap-to-sync timing engine (pure).
 *
 * The user plays the master track and presses one key on each lyric line as it
 * is sung. Each tap stamps the current playback time onto the next pending clip
 * and closes the previous clip at that same instant, so lines stay contiguous.
 *
 * Clips are addressed in their array order *within a layer* — that order is the
 * line order produced by `createClipsFromNormalizedLyrics`, so cursor `i` always
 * maps to lyric line `i`.
 */

export interface TapOptions {
  /**
   * Visible duration handed to the just-tapped clip until the next tap closes
   * it. Also the duration the final line keeps. Seconds.
   */
  provisionalDuration?: number;
  /** Floor on any clip window. Defaults to MIN_CLIP_DURATION. */
  minDuration?: number;
  /** Master track length, so clips never run past the end of the song. */
  trackDuration?: number;
}

export interface TapResult {
  clips: LyricClip[];
  nextCursor: number;
  /** True when the cursor reached the end and there was nothing left to tap. */
  done: boolean;
}

/** Clips belonging to `layerId`, in stable line order. */
export function orderedLayerClips(clips: LyricClip[], layerId: string): LyricClip[] {
  return clips.filter(c => c.layerId === layerId);
}

/**
 * Stamp `time` onto the clip at `cursorIndex` (within `layerId`) and close the
 * previous clip at that time. Returns a new clips array and the advanced cursor.
 *
 * No-op (other than reporting `done`) when the cursor is past the last clip.
 */
export function applyTapAtTime(
  clips: LyricClip[],
  layerId: string,
  cursorIndex: number,
  time: number,
  options: TapOptions = {}
): TapResult {
  const {
    provisionalDuration = 3,
    minDuration = MIN_CLIP_DURATION,
    trackDuration
  } = options;

  const targets = orderedLayerClips(clips, layerId);
  if (cursorIndex < 0 || cursorIndex >= targets.length) {
    return { clips, nextCursor: Math.min(cursorIndex, targets.length), done: true };
  }

  const current = targets[cursorIndex]!;
  const previous = cursorIndex > 0 ? targets[cursorIndex - 1]! : null;

  // Keep monotonic: a tap can never land before the previous line's start.
  let start = Math.max(0, time);
  if (previous && start <= previous.startTime) {
    start = previous.startTime + minDuration;
  }

  const cap = trackDuration != null ? Math.max(start + minDuration, trackDuration) : Infinity;
  let end = Math.min(start + provisionalDuration, cap);
  if (end - start < minDuration) end = start + minDuration;

  const prevEnd = previous ? Math.max(previous.startTime + minDuration, start) : 0;

  const patched = clips.map(clip => {
    if (clip.id === current.id) {
      return { ...clip, startTime: start, endTime: end };
    }
    if (previous && clip.id === previous.id) {
      return { ...clip, endTime: prevEnd };
    }
    return clip;
  });

  return {
    clips: patched,
    nextCursor: cursorIndex + 1,
    done: cursorIndex + 1 >= targets.length
  };
}

/**
 * Reset every clip on `layerId` to a parked, un-timed state at t=0 so the lane
 * starts clean for a fresh tap-sync pass. Text and all other metadata are kept.
 */
export function parkLayerClips(clips: LyricClip[], layerId: string): LyricClip[] {
  return clips.map(clip =>
    clip.layerId === layerId
      ? { ...clip, startTime: 0, endTime: MIN_CLIP_DURATION }
      : clip
  );
}

/** Shift every clip on `layerId` by `deltaSeconds`, clamped to >= 0. */
export function nudgeLayerTiming(
  clips: LyricClip[],
  layerId: string,
  deltaSeconds: number
): LyricClip[] {
  if (deltaSeconds === 0) return clips;
  return clips.map(clip => {
    if (clip.layerId !== layerId) return clip;
    const duration = clip.endTime - clip.startTime;
    const start = Math.max(0, clip.startTime + deltaSeconds);
    return { ...clip, startTime: start, endTime: start + duration };
  });
}
