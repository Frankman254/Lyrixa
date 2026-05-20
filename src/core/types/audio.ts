/**
 * A single amplitude sample on the master timeline.
 * Used by the waveform visualizer. The shape is identical for real (decoded)
 * peaks and mock-generated peaks so both paths share the same render code.
 */
export interface AudioPeak {
  /** Seconds on the master timeline. */
  time: number;
  /** 0..1 normalized amplitude. */
  amplitude: number;
}

/** Role of an audio file inside a project. The master track is what plays. */
export type AudioChannelRole = 'master';

/**
 * One audio file bound to a project. The master channel is what plays.
 */
export interface AudioChannel {
  fileName: string;
  duration: number;
  /** Transient. Present only while the original File is in memory. */
  objectUrl?: string;
  /** Decoded peaks. Falls back to mock waveform when absent. */
  waveformPeaks?: AudioPeak[];
  /**
   * Stable identity for cross-app matching. Lyrixa exports this in the
   * lyrics-bundle so a renderer (e.g. LiveWallpaper) can rebind the bundle
   * to its own local copy of the audio without using Lyrixa's project id.
   * Not used by Lyrixa internally for anything else.
   */
  fileKey?: string;
  sizeBytes?: number;
  /** Epoch ms — taken from File.lastModified at load time. */
  lastModified?: number;
}

/**
 * Build a stable per-file key from the File-level metadata available at
 * load time. Format `${name}::${size}::${lastModified}` — collisions are
 * acceptable because the renderer also matches on fileName + duration.
 */
export function buildAudioFileKey(
  fileName: string,
  sizeBytes: number,
  lastModified: number
): string {
  return `${fileName}::${sizeBytes}::${lastModified}`;
}

/**
 * Audio channels owned by a project. `master` is the playable track.
 */
export interface ProjectAudioTracks {
  master: AudioChannel | null;
}

export function createEmptyAudioTracks(): ProjectAudioTracks {
  return { master: null };
}

/**
 * Which frequency band / mix to emphasize in the waveform display lane.
 * 'auto' picks the best available source automatically.
 */
export type AudioBandMode =
  | 'auto'
  | 'full-mix'
  | 'vocals'
  | 'instrumental'
  | 'bass'
  | 'kick'
  | 'hihat';

/**
 * A computed analysis pass for a specific band mode.
 * Stored ephemerally — not persisted to project JSON.
 */
export interface AudioAnalysisTrack {
  mode: AudioBandMode;
  peaks: AudioPeak[];
  /** Where the data came from: offline band extraction or heuristic estimate. */
  source: 'master' | 'estimated';
}
