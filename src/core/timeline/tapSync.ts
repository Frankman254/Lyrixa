import type { LyricClip } from '../types/clip';
import { MIN_CLIP_DURATION } from '../types/clip';

/**
 * Tap-to-sync timing engine (pure) — hold-to-time model.
 *
 * The user plays the master track and, for each lyric line, holds one key down
 * while the line is being sung and releases it when the line ends. Key-down
 * stamps the line's start; key-up stamps its end and advances to the next line.
 * Because both edges are captured per line, real gaps (instrumental breaks)
 * survive and short lines get their true short duration.
 *
 * Clips are addressed in their array order *within a layer* — that order is the
 * line order produced by `createClipsFromNormalizedLyrics`, so cursor `i` always
 * maps to lyric line `i`.
 */

export interface TapOptions {
  /** Floor on any clip window. Defaults to MIN_CLIP_DURATION. */
  minDuration?: number;
  /** Master track length, so clips never run past the end of the song. */
  trackDuration?: number;
}

export interface TapSyncLine {
  id: string;
  text: string;
  /** Optional source clip whose visual metadata should be preserved. */
  template?: LyricClip;
}

/** Clips belonging to `layerId`, in stable line order. */
export function orderedLayerClips(clips: LyricClip[], layerId: string): LyricClip[] {
  return clips.filter(c => c.layerId === layerId);
}

export function isTapSyncLinePublished(
  clips: LyricClip[],
  layerId: string,
  line: TapSyncLine,
  minDuration = MIN_CLIP_DURATION
): boolean {
  const clip = clips.find(item => item.id === line.id && item.layerId === layerId);
  if (!clip) return false;
  if (clip.muted) return false;
  if (clip.text.trim() !== line.text.trim()) return false;
  return clip.endTime - clip.startTime >= minDuration;
}

export function findNextUnpublishedLineIndex(
  lines: TapSyncLine[],
  clips: LyricClip[],
  layerId: string,
  fromIndex = 0
): number {
  for (let i = Math.max(0, fromIndex); i < lines.length; i += 1) {
    if (!isTapSyncLinePublished(clips, layerId, lines[i])) return i;
  }
  return lines.length;
}

function createLineClip(
  line: TapSyncLine,
  layerId: string,
  startTime: number,
  endTime: number
): LyricClip {
  const template = line.template;
  return {
    ...template,
    id: line.id,
    text: line.text.trim(),
    startTime,
    endTime,
    layerId,
    transitionIn: template?.transitionIn ?? 'fade',
    transitionOut: template?.transitionOut ?? 'fade',
    position: template?.position ?? 'center',
    muted: line.text.trim().length === 0
  };
}

/**
 * Begin a line at `time` (key-down): stamp the start of the clip at
 * `cursorIndex` and give it a provisional minimum window until the matching
 * key-up sets its real end. Returns a new clips array (cursor does not advance).
 */
export function setLineStart(
  clips: LyricClip[],
  layerId: string,
  cursorIndex: number,
  time: number,
  options: TapOptions = {}
): LyricClip[] {
  const { minDuration = MIN_CLIP_DURATION, trackDuration } = options;
  const targets = orderedLayerClips(clips, layerId);
  const current = targets[cursorIndex];
  if (!current) return clips;

  const cap = trackDuration != null ? Math.max(0, trackDuration - minDuration) : Infinity;
  const start = Math.min(Math.max(0, time), cap);
  // Timing a line makes it visible again (blank lines stay muted).
  const muted = current.text.trim().length === 0;
  return clips.map(clip =>
    clip.id === current.id
      ? { ...clip, startTime: start, endTime: start + minDuration, muted }
      : clip
  );
}

/**
 * Publish a source line into the destination layer and stamp its start.
 * Unlike `setLineStart`, this does not require pending clips to already exist
 * on the timeline; sync can build the destination layer line by line.
 */
export function publishLineStart(
  clips: LyricClip[],
  layerId: string,
  line: TapSyncLine,
  time: number,
  options: TapOptions = {}
): LyricClip[] {
  const { minDuration = MIN_CLIP_DURATION, trackDuration } = options;
  const cap = trackDuration != null ? Math.max(0, trackDuration - minDuration) : Infinity;
  const start = Math.min(Math.max(0, time), cap);
  const nextClip = createLineClip(line, layerId, start, start + minDuration);
  const found = clips.some(clip => clip.id === line.id);
  if (found) {
    return clips.map(clip => (clip.id === line.id ? nextClip : clip));
  }
  return [...clips, nextClip];
}

/**
 * End a line at `time` (key-up): stamp the end of the clip at `cursorIndex`,
 * clamped to at least `minDuration` after its start. Returns a new clips array;
 * the caller advances the cursor.
 */
export function setLineEnd(
  clips: LyricClip[],
  layerId: string,
  cursorIndex: number,
  time: number,
  options: TapOptions = {}
): LyricClip[] {
  const { minDuration = MIN_CLIP_DURATION, trackDuration } = options;
  const targets = orderedLayerClips(clips, layerId);
  const current = targets[cursorIndex];
  if (!current) return clips;

  let end = Math.max(current.startTime + minDuration, time);
  if (trackDuration != null) end = Math.min(end, trackDuration);
  if (end - current.startTime < minDuration) end = current.startTime + minDuration;

  // Ending a line should keep the same visibility rule as starting it. This
  // makes live stretch updates safe even if they run from a parked snapshot.
  const muted = current.text.trim().length === 0;
  return clips.map(clip =>
    clip.id === current.id ? { ...clip, endTime: end, muted } : clip
  );
}

/** Update the end time of a line that has already been published. */
export function publishLineEnd(
  clips: LyricClip[],
  line: TapSyncLine,
  time: number,
  options: TapOptions = {}
): LyricClip[] {
  const { minDuration = MIN_CLIP_DURATION, trackDuration } = options;
  const current = clips.find(clip => clip.id === line.id);
  if (!current) return clips;

  let end = Math.max(current.startTime + minDuration, time);
  if (trackDuration != null) end = Math.min(end, trackDuration);
  if (end - current.startTime < minDuration) end = current.startTime + minDuration;

  const muted = current.text.trim().length === 0;
  return clips.map(clip =>
    clip.id === current.id ? { ...clip, endTime: end, muted } : clip
  );
}

/**
 * Reset every clip on `layerId` to a parked, un-timed state at t=0 so the lane
 * starts clean for a fresh sync pass. Parked clips are muted so they don't all
 * pile onto the live preview at once — each becomes visible when it's timed.
 * Text and all other metadata are kept.
 */
export function parkLayerClips(clips: LyricClip[], layerId: string): LyricClip[] {
  return clips.map(clip =>
    clip.layerId === layerId
      ? { ...clip, startTime: 0, endTime: MIN_CLIP_DURATION, muted: true }
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
