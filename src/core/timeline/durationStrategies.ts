import type { VocalActivitySegment } from '../types/audio';

/**
 * How a clip's duration is decided when generating clips from lyric lines.
 *
 * - `fixed`                 — every clip gets the same default duration.
 * - `line-length-weighted`  — short text → short clip, long text → long clip.
 * - `vocal-energy`          — the i-th clip uses the i-th vocal segment's window.
 *                             Falls back to the line-length strategy when no
 *                             segment exists for that index.
 */
export type ClipDurationStrategy = 'fixed' | 'line-length-weighted' | 'vocal-energy';

export interface DurationStrategyContext {
  defaultDuration: number;
  minDuration: number;
  maxDuration: number;
  /** Optional cap so clips never run past the end of the song. */
  trackDuration?: number;
}

/**
 * Pick a duration (in seconds) for a single lyric line.
 *
 * For `vocal-energy`, prefer `durationFromVocalSegment` when a segment is
 * available — this helper is the fallback path.
 */
export function durationForLine(
  strategy: ClipDurationStrategy,
  line: string,
  ctx: DurationStrategyContext
): number {
  switch (strategy) {
    case 'fixed':
      return clampDuration(ctx.defaultDuration, ctx);
    case 'line-length-weighted':
      return clampDuration(durationFromLineLength(line, ctx), ctx);
    case 'vocal-energy':
      // Without a segment we degrade to length-weighted — better than fixed
      // because long lines still get more on-screen time.
      return clampDuration(durationFromLineLength(line, ctx), ctx);
  }
}

/**
 * Word-count weighted duration model.
 *
 * Anchors:
 *   - <= 2 words → minDuration
 *   - >= 14 words → maxDuration
 *   - linear interpolation between
 *
 * Word counts work better than character counts for lyrics because all-caps
 * shouts and short interjections shouldn't be over-stretched.
 */
export function durationFromLineLength(
  line: string,
  ctx: DurationStrategyContext
): number {
  const words = line.trim().split(/\s+/).filter(Boolean).length;
  const t = clamp01((words - 2) / 12);
  return ctx.minDuration + t * (ctx.maxDuration - ctx.minDuration);
}

/**
 * Use a vocal segment as the clip window. Returns clamped {start, end}.
 *
 * Caller is responsible for using these on the right line index — this
 * helper does not know about lists.
 */
export function durationFromVocalSegment(
  segment: VocalActivitySegment,
  ctx: DurationStrategyContext
): { startTime: number; endTime: number } {
  const start = Math.max(0, segment.startTime);
  const rawEnd = segment.endTime;
  const minEnd = start + ctx.minDuration;
  const maxEnd = start + ctx.maxDuration;
  let end = Math.max(minEnd, Math.min(maxEnd, rawEnd));
  if (ctx.trackDuration != null) end = Math.min(end, ctx.trackDuration);
  if (end - start < ctx.minDuration) end = start + ctx.minDuration;
  return { startTime: start, endTime: end };
}

function clampDuration(value: number, ctx: DurationStrategyContext): number {
  return Math.max(ctx.minDuration, Math.min(ctx.maxDuration, value));
}

function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  return Math.max(0, Math.min(1, v));
}
