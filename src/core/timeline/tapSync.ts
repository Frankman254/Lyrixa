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
 * The lyric source (`TapSyncLine[]`) is the single source of truth for what to
 * time; each line carries a stable source identity. Timing a line writes or
 * updates one real clip in `project.clips` for the selected layer, so sync never
 * keeps a private clip copy that can diverge from the timeline.
 */

export interface TapOptions {
  /** Floor on any clip window. Defaults to MIN_CLIP_DURATION. */
  minDuration?: number;
  /** Master track length, so clips never run past the end of the song. */
  trackDuration?: number;
}

export interface TapSyncLine {
  sourceIndex: number;
  sourceId: string;
  lyricSourceId?: string;
  text: string;
  /** Optional source clip whose visual metadata should be preserved. */
  template?: LyricClip;
}

export function createTapSyncSourceId(index: number, text: string, namespace = 'lyric'): string {
  const normalized = text.trim().replace(/\s+/g, ' ');
  let hash = 5381;
  for (let i = 0; i < normalized.length; i += 1) {
    hash = ((hash << 5) + hash) ^ normalized.charCodeAt(i);
  }
  return `${namespace}-${index}-${(hash >>> 0).toString(36)}`;
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
  const clip = findTapSyncClip(clips, layerId, line);
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
    id: tapSyncClipId(layerId, line),
    text: line.text.trim(),
    startTime,
    endTime,
    layerId,
    sourceIndex: line.sourceIndex,
    sourceId: line.sourceId,
    lyricSourceId: line.lyricSourceId,
    createdBy: 'tap-sync',
    transitionIn: template?.transitionIn ?? 'fade',
    transitionOut: template?.transitionOut ?? 'fade',
    position: template?.position ?? 'center',
    muted: line.text.trim().length === 0
  };
}

export function tapSyncClipId(layerId: string, line: TapSyncLine): string {
  return `tap-${layerId}-${line.sourceId.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

export function findTapSyncClip(
  clips: LyricClip[],
  layerId: string,
  line: TapSyncLine
): LyricClip | undefined {
  return clips.find(clip => clip.layerId === layerId && clip.sourceId === line.sourceId);
}

/**
 * Publish a source line into the destination layer and stamp its start.
 * Does not require pending clips to already exist on the timeline; sync can
 * build the destination layer line by line.
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
  const current = findTapSyncClip(clips, layerId, line);
  if (current) {
    let replaced = false;
    return clips.flatMap(clip => {
      if (clip.layerId === layerId && clip.sourceId === line.sourceId) {
        if (replaced) return [];
        replaced = true;
        return [nextClip];
      }
      return [clip];
    });
  }
  return [...clips, nextClip];
}

/** Update the end time of a line that has already been published. */
export function publishLineEnd(
  clips: LyricClip[],
  layerId: string,
  line: TapSyncLine,
  time: number,
  options: TapOptions = {}
): LyricClip[] {
  const { minDuration = MIN_CLIP_DURATION, trackDuration } = options;
  const current = findTapSyncClip(clips, layerId, line);
  if (!current) return clips;

  let end = Math.max(current.startTime + minDuration, time);
  if (trackDuration != null) end = Math.min(end, trackDuration);
  if (end - current.startTime < minDuration) end = current.startTime + minDuration;

  const muted = current.text.trim().length === 0;
  return clips.map(clip =>
    clip.id === current.id ? { ...clip, endTime: end, muted } : clip
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
