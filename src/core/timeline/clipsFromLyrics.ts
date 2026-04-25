import type { LyricClip, ClipPositionPreset, ClipTransition } from '../types/clip';
import { MIN_CLIP_DURATION } from '../types/clip';
import { MAIN_LAYER_ID } from '../types/layer';
import type { VocalActivitySegment } from '../types/audio';
import {
  durationForLine,
  durationFromVocalSegment
} from './durationStrategies';
import type {
  ClipDurationStrategy,
  DurationStrategyContext
} from './durationStrategies';
export type { ClipDurationStrategy } from './durationStrategies';

export interface CreateClipsFromLyricsOptions {
  /** Layer id every generated clip should land on. Defaults to the main layer. */
  layerId?: string;
  /** Default visible duration assigned to every generated clip. Default: 2.5s. */
  defaultDuration?: number;
  /** Hard floor on per-clip duration (still subject to MIN_CLIP_DURATION). */
  minDuration?: number;
  /** Hard ceiling on per-clip duration. */
  maxDuration?: number;
  /** Master timeline duration. When set, clips are clamped/truncated to fit. */
  trackDuration?: number;
  /** Time the very first clip should start at. Default: 0. */
  startTime?: number;
  /** Optional gap between consecutive clips, in seconds. Default: 0. */
  gap?: number;
  /** How clip durations are decided. Default: 'fixed'. */
  strategy?: ClipDurationStrategy;
  /**
   * Vocal segments. Required for the `vocal-energy` strategy to actually
   * change behavior; otherwise ignored.
   */
  vocalActivity?: VocalActivitySegment[];
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
 * Build LyricClips from already-normalized lyric lines.
 *
 * - `fixed` and `line-length-weighted` strategies lay clips out sequentially
 *   from `startTime`, never overlapping themselves.
 * - `vocal-energy` strategy maps line[i] → vocalActivity[i] and uses the
 *   segment's window directly. Lines without a segment fall back to
 *   line-length-weighted duration appended after the last placed clip.
 *
 * Pure: no React, DOM, or persistence side effects.
 */
export function createClipsFromNormalizedLyrics(
  lines: string[],
  options: CreateClipsFromLyricsOptions = {}
): LyricClip[] {
  const {
    layerId = MAIN_LAYER_ID,
    defaultDuration = 2.5,
    minDuration = 1.0,
    maxDuration = 6.0,
    trackDuration,
    startTime = 0,
    gap = 0,
    strategy = 'fixed',
    vocalActivity,
    transitionIn = 'fade',
    transitionOut = 'fade',
    position = 'center',
    styleId,
    idPrefix = 'clip'
  } = options;

  if (lines.length === 0) return [];

  const ctx: DurationStrategyContext = {
    defaultDuration,
    minDuration: Math.max(MIN_CLIP_DURATION, minDuration),
    maxDuration: Math.max(maxDuration, minDuration + MIN_CLIP_DURATION),
    trackDuration
  };

  const useVocals =
    strategy === 'vocal-energy' && vocalActivity && vocalActivity.length > 0;

  const clips: LyricClip[] = [];
  let cursor = Math.max(0, startTime);

  for (let i = 0; i < lines.length; i++) {
    const text = (lines[i] ?? '').trim();

    let clipStart: number;
    let clipEnd: number;

    if (useVocals) {
      const seg = vocalActivity![i];
      if (seg) {
        const window = durationFromVocalSegment(seg, ctx);
        clipStart = Math.max(window.startTime, cursor);
        clipEnd = Math.max(clipStart + ctx.minDuration, window.endTime);
      } else {
        clipStart = cursor;
        clipEnd = clipStart + durationForLine('line-length-weighted', text, ctx);
      }
    } else {
      clipStart = cursor;
      clipEnd = clipStart + durationForLine(strategy, text, ctx);
    }

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
