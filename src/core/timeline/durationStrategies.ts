/**
 * How a clip's duration is decided when generating clips from lyric lines.
 *
 * These are quick first-pass estimates; precise timing comes from tap-to-sync.
 *
 * - `fixed`                 — every clip gets the same default duration.
 * - `line-length-weighted`  — short text → short clip, long text → long clip.
 */
export type ClipDurationStrategy = 'fixed' | 'line-length-weighted';

export interface DurationStrategyContext {
  defaultDuration: number;
  minDuration: number;
  maxDuration: number;
  /** Optional cap so clips never run past the end of the song. */
  trackDuration?: number;
}

/**
 * Pick a duration (in seconds) for a single lyric line.
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

function clampDuration(value: number, ctx: DurationStrategyContext): number {
  return Math.max(ctx.minDuration, Math.min(ctx.maxDuration, value));
}

function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  return Math.max(0, Math.min(1, v));
}
