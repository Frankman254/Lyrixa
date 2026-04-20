import type { TimelineEntry, TimelineSnapshot } from '../types/timeline';

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
      activeEntry: null
    };
  }

  let newActiveIndex = -1;

  // Simple binary search could be used here for massive files, but linear search
  // or backward scan works well for lyrics since they are typically < 100 entries.
  // We use sequential search to find the last entry whose startTime <= currentTime
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

  return {
    currentTime,
    activeIndex: newActiveIndex,
    previousIndex: targetPreviousIndex,
    activeEntry: newActiveIndex >= 0 ? entries[newActiveIndex]! : null
  };
}
