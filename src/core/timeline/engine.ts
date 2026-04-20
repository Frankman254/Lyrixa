import type { TimelineEntry, TimelineSnapshot, TimelinePhase } from '../types/timeline';

/** Maximum duration in seconds a line should stay strictly 'line-active' without another line occurring */
const MAX_LINE_ACTIVE_DURATION = 3.0;

/**
 * Creates timeline entries from raw data.
 * Useful to convert LyricLines to a TimelineEntry format.
 */
export function createTimelineEntries<T>(
  items: T[], 
  timeExtractor: (item: T) => number,
  idExtractor: (item: T, index: number) => string
): TimelineEntry<T>[] {
  return items.map((item, index) => ({
    id: idExtractor(item, index),
    startTime: timeExtractor(item),
    data: item
  })).sort((a, b) => a.startTime - b.startTime);
}

/**
 * Calculates the active element in a sorted timeline given a specific time.
 * This function handles pure business logic independently from viewing or animating.
 * It natively calculates the logical phase of the engine and the exact 0.0 to 1.0 progression scalar.
 *
 * @param entries A chronologically sorted array of timeline entries.
 * @param currentTime The playback time in seconds.
 * @param previousSnapshot The optional previous snapshot to keep track of `previousIndex` during transitions.
 * @returns A computed snapshot of the timeline at this exact microsecond.
 */
export function computeTimelineSnapshot<T>(
  entries: TimelineEntry<T>[],
  currentTime: number,
  previousSnapshot?: TimelineSnapshot<T>
): TimelineSnapshot<T> {
  
  if (entries.length === 0) {
    return {
      currentTime,
      activeIndex: -1,
      previousIndex: -1,
      activeEntry: null,
      nextEntry: null,
      progress: 0,
      phase: 'idle'
    };
  }

  let newActiveIndex = -1;

  for (let i = 0; i < entries.length; i++) {
    if (entries[i]!.startTime <= currentTime) {
      newActiveIndex = i;
    } else {
      break;
    }
  }

  const prevIndex = previousSnapshot?.activeIndex ?? -1;
  const targetPreviousIndex = 
      newActiveIndex !== prevIndex && prevIndex !== -1 
        ? prevIndex 
        : previousSnapshot?.previousIndex ?? -1;

  // Resolving Upcoming bounds
  if (newActiveIndex === -1) {
    // We are before the very first entry
    return {
      currentTime,
      activeIndex: -1,
      previousIndex: targetPreviousIndex,
      activeEntry: null,
      nextEntry: entries[0] || null,
      progress: 0,
      phase: 'idle'
    };
  }

  const activeEntry = entries[newActiveIndex]!;
  const nextEntry = newActiveIndex + 1 < entries.length ? entries[newActiveIndex + 1]! : null;

  // Calculate Phase & Progress logic bounding
  const nextStartTime = nextEntry ? nextEntry.startTime : Infinity;
  const rawDiff = nextStartTime - activeEntry.startTime;
  const effectiveLineDuration = Math.min(rawDiff, MAX_LINE_ACTIVE_DURATION);

  const timeSinceStart = currentTime - activeEntry.startTime;
  let progress = 0;
  let phase: TimelinePhase = 'idle';

  if (timeSinceStart <= effectiveLineDuration && timeSinceStart >= 0) {
    phase = 'line-active';
    // guard division by zero theoretically
    progress = effectiveLineDuration > 0 ? timeSinceStart / effectiveLineDuration : 1.0;
  } else if (currentTime < nextStartTime && nextEntry !== null) {
    // The active singing window ended, and we are waiting for the next one
    phase = 'instrumental-gap';
    progress = 1.0;
  } else if (nextEntry === null && timeSinceStart > effectiveLineDuration) {
    // The very last sequence has ended its singing duration
    phase = 'ended';
    progress = 1.0;
  }

  return {
    currentTime,
    activeIndex: newActiveIndex,
    previousIndex: targetPreviousIndex,
    activeEntry,
    nextEntry,
    progress: Math.max(0, Math.min(1, progress)), 
    phase
  };
}
