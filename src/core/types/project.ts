import type { LyricClip } from './clip';
import type { LyricLayer } from './layer';
import type { LyricVisualStyle } from './render';
import type { RenderMode } from './render';
import type { AudioPeak } from './audio';

/**
 * Metadata describing the audio track bound to a project.
 * `objectUrl` is ephemeral — it is created from a File via URL.createObjectURL
 * and does not survive a page reload. Persistence code must not try to save it.
 * `fileName`, `duration`, and `waveformPeaks` are fine to persist.
 */
export interface LyrixaTrack {
  fileName: string;
  /** Transient. Present only while the original File is in memory. */
  objectUrl?: string;
  duration: number;
  waveformPeaks?: AudioPeak[];
}

/**
 * The single source of truth for the editor experience. Every feature
 * reads from and writes to this project via `useLyrixaProject`.
 */
export interface LyrixaProject {
  id: string;
  name: string;
  track: LyrixaTrack | null;
  /** Raw paste from the user, kept verbatim for re-normalization. */
  rawLyricsText: string;
  /** The normalized lines derived from rawLyricsText. */
  normalizedLyrics: string[];
  layers: LyricLayer[];
  clips: LyricClip[];
  styleConfig: LyricVisualStyle;
  currentTime: number;
  renderMode: RenderMode;
}
