/**
 * Timestamp spellings for the standard lyric formats.
 *
 * Every formatter rounds the whole value to its format's resolution first and
 * only then splits it into fields, so 59.999s becomes `01:00.00` in LRC and
 * never `00:60.00`.
 */

/** LRC: `mm:ss.xx` (centiseconds). Minutes keep growing past 59 — LRC has no hour field. */
export function formatLrcTime(seconds: number): string {
  const centis = Math.round(safe(seconds) * 100);
  const minutes = Math.floor(centis / 6000);
  const secs = Math.floor((centis % 6000) / 100);
  const cs = centis % 100;
  return `${pad(minutes, 2)}:${pad(secs, 2)}.${pad(cs, 2)}`;
}

/** SRT: `hh:mm:ss,mmm` (comma before milliseconds). */
export function formatSrtTime(seconds: number): string {
  return formatClockMs(seconds, ',');
}

/** WebVTT: `hh:mm:ss.mmm` (dot before milliseconds). */
export function formatVttTime(seconds: number): string {
  return formatClockMs(seconds, '.');
}

function formatClockMs(seconds: number, separator: string): string {
  const totalMs = Math.round(safe(seconds) * 1000);
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const secs = Math.floor((totalMs % 60_000) / 1000);
  const ms = totalMs % 1000;
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(secs, 2)}${separator}${pad(ms, 3)}`;
}

function safe(seconds: number): number {
  return Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}
