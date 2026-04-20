export interface LyricLine {
  /** Text content of the lyric line */
  text: string;
  /** Start time in seconds */
  startTime: number;
}

export interface ParsedLrc {
  /** The list of processed lyric lines */
  lines: LyricLine[];
  /** Optional metadata properties found in the LRC */
  metadata: Record<string, string>;
}

export interface KaraokeWord {
  text: string;
  startTime: number;
  duration: number;
}
