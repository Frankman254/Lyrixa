export type TimelinePhase = 'idle' | 'line-active' | 'instrumental-gap' | 'ended';

export interface TimelineEntry<T> {
  id: string;
  /** The chronological point in time when this entry becomes fundamentally active */
  startTime: number;
  data: T;
}

export interface TimelineSnapshot<T> {
  /** The current chronological time passed into the engine */
  currentTime: number;
  
  /** The index pointing to the most recently started entry (could currently be active or separated by an instrumental-gap) */
  activeIndex: number;
  
  /** The previously active index, useful for transition animations */
  previousIndex: number;
  
  /** The active entry corresponding to the activeIndex. Null if playback hasn't reached the first timestamp. */
  activeEntry: TimelineEntry<T> | null;
  
  /** Reference to the next coming chronological entry. Null if activeIndex is the final item. */
  nextEntry: TimelineEntry<T> | null;
  
  /** 
   * Progress scalar `0.0` through `1.0`.
   * Represents how far along the 'active' line is in its maximum lifecycle duration.
   * Useful for fluid CSS animations mapping interpolation variables.
   */
  progress: number;
  
  /** 
   * The contextual phase of the playback engine relative to the current time and active limits.
   */
  phase: TimelinePhase;
}
