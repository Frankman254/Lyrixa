
export interface TimelineEntry<T> {
  id: string;
  startTime: number;
  data: T;
}

export interface TimelineSnapshot<T> {
  /** The current running time in seconds */
  currentTime: number;
  /** The active index in the timeline entries, or -1 if none */
  activeIndex: number;
  /** The previously active index, useful for animations */
  previousIndex: number;
  /** The actual active entry if one exists */
  activeEntry: TimelineEntry<T> | null;
}
