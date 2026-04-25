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

/**
 * A region of the timeline where vocal energy is present.
 * Produced by analyzing the peaks of an isolated vocals stem (or any
 * audio file) and used to estimate clip durations.
 */
export interface VocalActivitySegment {
  /** Inclusive start in seconds. */
  startTime: number;
  /** Inclusive end in seconds. */
  endTime: number;
  /** Average normalized amplitude across the segment, 0..1. */
  energy: number;
}

/** Role of an audio file inside a project. */
export type AudioChannelRole = 'master' | 'vocals';

/**
 * One audio file bound to a project. The master channel is what plays;
 * the optional vocals channel is used for analysis and timing assistance.
 */
export interface AudioChannel {
  fileName: string;
  duration: number;
  /** Transient. Present only while the original File is in memory. */
  objectUrl?: string;
  /** Decoded peaks. Falls back to mock waveform when absent. */
  waveformPeaks?: AudioPeak[];
  /** Set on vocals channels by the activity detector. Empty otherwise. */
  vocalActivity?: VocalActivitySegment[];
}

/**
 * Audio channels owned by a project. `master` is the playable track.
 * `vocals` is optional helper input for clip-duration estimation.
 */
export interface ProjectAudioTracks {
  master: AudioChannel | null;
  vocals?: AudioChannel | null;
}

export function createEmptyAudioTracks(): ProjectAudioTracks {
  return { master: null, vocals: null };
}
