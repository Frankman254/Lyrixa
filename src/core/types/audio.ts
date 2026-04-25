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
