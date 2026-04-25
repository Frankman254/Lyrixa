import type { LyricClip, ClipPositionPreset, ClipTransition } from '../types/clip';
import { MIN_CLIP_DURATION } from '../types/clip';
import { MAIN_LAYER_ID } from '../types/layer';

export interface CreateClipsFromLyricsOptions {
  /** Layer id every generated clip should land on. Defaults to the main layer. */
  layerId?: string;
  /** Default visible duration assigned to every generated clip. Default: 2.5s. */
  defaultDuration?: number;
  /** Master timeline duration. When set, clips are clamped/truncated to fit. */
  trackDuration?: number;
  /** Time the very first clip should start at. Default: 0. */
  startTime?: number;
  /** Optional gap between consecutive clips, in seconds. Default: 0. */
  gap?: number;
  transitionIn?: ClipTransition;
  transitionOut?: ClipTransition;
  position?: ClipPositionPreset;
  styleId?: string;
  /**
   * Stable id prefix. Generated ids are `${idPrefix}-${index}`.
   * Callers should pass a unique prefix (e.g. one that includes Date.now())
   * when generating multiple batches inside the same project.
   */
  idPrefix?: string;
}

/**
 * Build a list of LyricClips from already-normalized lyric lines.
 *
 * Preserves input order, lays clips out sequentially with `defaultDuration`
 * each, never overlaps clips it created in this call, and clamps the final
 * clip(s) to `trackDuration` if provided.
 *
 * Pure: no React, DOM, or timing side effects.
 */
export function createClipsFromNormalizedLyrics(
  lines: string[],
  options: CreateClipsFromLyricsOptions = {}
): LyricClip[] {
  const {
    layerId = MAIN_LAYER_ID,
    defaultDuration = 2.5,
    trackDuration,
    startTime = 0,
    gap = 0,
    transitionIn = 'fade',
    transitionOut = 'fade',
    position = 'center',
    styleId,
    idPrefix = 'clip'
  } = options;

  if (lines.length === 0) return [];

  const clips: LyricClip[] = [];
  let cursor = Math.max(0, startTime);

  for (let i = 0; i < lines.length; i++) {
    const text = (lines[i] ?? '').trim();

    let clipStart = cursor;
    let clipEnd = clipStart + defaultDuration;

    if (trackDuration != null && clipEnd > trackDuration) {
      clipEnd = trackDuration;
      if (clipStart >= clipEnd) {
        clipStart = Math.max(0, clipEnd - MIN_CLIP_DURATION);
      }
    }

    if (clipEnd - clipStart < MIN_CLIP_DURATION) {
      clipEnd = clipStart + MIN_CLIP_DURATION;
    }

    clips.push({
      id: `${idPrefix}-${i}`,
      text,
      startTime: clipStart,
      endTime: clipEnd,
      layerId,
      styleId,
      transitionIn,
      transitionOut,
      position,
      muted: text.length === 0
    });

    cursor = clipEnd + Math.max(0, gap);
  }

  return clips;
}

/**
 * Decide which layer a clip lands on after a vertical drag.
 *
 * Returns the original layer id when the requested layer is missing or locked.
 * Locked clips never change layer.
 *
 * Pure helper kept in core so the drag-DOM code in features stays thin.
 */
export function resolveDroppedLayerId(
  clip: LyricClip,
  candidateLayerId: string | null,
  layerIndex: ReadonlyMap<string, { locked: boolean }>
): string {
  if (clip.locked) return clip.layerId;
  if (!candidateLayerId) return clip.layerId;
  const target = layerIndex.get(candidateLayerId);
  if (!target) return clip.layerId;
  if (target.locked) return clip.layerId;
  return candidateLayerId;
}
