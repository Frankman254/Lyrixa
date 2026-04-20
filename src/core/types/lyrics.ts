/**
 * Represents a single timed word for future Karaoke visualization.
 */
export interface KaraokeWord {
  /** The text fragment or word */
  text: string;
  /** Start time of the word in seconds */
  startTime: number;
  /** Duration of the word in seconds */
  duration: number;
}

/**
 * Represents an individual lyric line with its timestamp, text, and optional karaoke breakdown.
 */
export interface LyricLine {
  /** Text content of the lyric line (can be empty string for instrumental breaks) */
  text: string;
  /** Start time of this line in seconds */
  startTime: number;
  /** 
   * Placeholder array for word-level sync parsing.
   * If populated, it indicates karaoke mode is available.
   */
  words?: KaraokeWord[];
}

/**
 * Representation of the fully parsed LRC text mapping metadata and lines.
 */
export interface ParsedLrc {
  /** A chronologically sorted array of lyric elements */
  lines: LyricLine[];
  /** 
   * Known properties often located at the top of the LRC: 
   * e.g. title (ti), artist (ar), album (al), length (length)
   */
  metadata: Record<string, string>;
}
