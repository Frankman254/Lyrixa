import type { AudioPeak, VocalActivitySegment } from '../types/audio';

export interface DetectVocalActivityOptions {
  /** Amplitude threshold (0..1) above which a sample counts as vocal. */
  threshold?: number;
  /** Minimum segment length, in seconds. Smaller segments are dropped as noise. */
  minDuration?: number;
  /** Gap between candidate segments small enough to merge into one. */
  mergeGap?: number;
  /** Optional ceiling per segment. Long activity is split into chunks of this size. */
  maxDuration?: number;
}

/**
 * Detect vocal activity from a peak array.
 *
 * Strategy:
 *  1. Walk peaks; mark contiguous regions where amplitude >= threshold.
 *  2. Merge segments separated by gaps shorter than `mergeGap`.
 *  3. Drop segments shorter than `minDuration`.
 *  4. Optionally split very long segments into pieces no longer than `maxDuration`.
 *
 * Pure: no DOM, no React, no audio decoding — operates only on numbers.
 */
export function detectVocalActivity(
  peaks: AudioPeak[],
  options: DetectVocalActivityOptions = {}
): VocalActivitySegment[] {
  const {
    threshold = 0.18,
    minDuration = 0.35,
    mergeGap = 0.25,
    maxDuration
  } = options;

  if (peaks.length === 0) return [];

  const raw: VocalActivitySegment[] = [];
  let inActive = false;
  let segStart = 0;
  let energySum = 0;
  let energyCount = 0;

  for (let i = 0; i < peaks.length; i++) {
    const p = peaks[i]!;
    const above = p.amplitude >= threshold;
    if (above) {
      if (!inActive) {
        inActive = true;
        segStart = p.time;
        energySum = 0;
        energyCount = 0;
      }
      energySum += p.amplitude;
      energyCount++;
    } else if (inActive) {
      const segEnd = peaks[i - 1]?.time ?? p.time;
      raw.push({
        startTime: segStart,
        endTime: segEnd,
        energy: energyCount > 0 ? energySum / energyCount : 0
      });
      inActive = false;
    }
  }
  if (inActive) {
    const last = peaks[peaks.length - 1]!;
    raw.push({
      startTime: segStart,
      endTime: last.time,
      energy: energyCount > 0 ? energySum / energyCount : 0
    });
  }

  // Merge close segments.
  const merged: VocalActivitySegment[] = [];
  for (const seg of raw) {
    const prev = merged[merged.length - 1];
    if (prev && seg.startTime - prev.endTime <= mergeGap) {
      prev.endTime = seg.endTime;
      prev.energy = Math.max(prev.energy, seg.energy);
    } else {
      merged.push({ ...seg });
    }
  }

  // Drop tiny noise.
  const filtered = merged.filter(s => s.endTime - s.startTime >= minDuration);

  if (maxDuration == null || maxDuration <= 0) return filtered;

  // Split very long segments.
  const split: VocalActivitySegment[] = [];
  for (const seg of filtered) {
    const len = seg.endTime - seg.startTime;
    if (len <= maxDuration) {
      split.push(seg);
      continue;
    }
    const pieces = Math.ceil(len / maxDuration);
    const pieceLen = len / pieces;
    for (let k = 0; k < pieces; k++) {
      split.push({
        startTime: seg.startTime + k * pieceLen,
        endTime: seg.startTime + (k + 1) * pieceLen,
        energy: seg.energy
      });
    }
  }
  return split;
}

/**
 * Sequentially zip lyric lines onto detected vocal segments.
 *
 * If there are more lines than segments, the tail lines come back with
 * `segment: null` and the caller can fall back to a fixed/length-weighted
 * duration. If there are more segments than lines, extras are simply
 * ignored — the lyrics list bounds the result.
 */
export function mapLinesToVocalSegments(
  lines: string[],
  segments: VocalActivitySegment[]
): Array<{ line: string; segment: VocalActivitySegment | null }> {
  return lines.map((line, i) => ({ line, segment: segments[i] ?? null }));
}
