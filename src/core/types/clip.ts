import type { LyricVisualStyle } from './render';

/**
 * Named positional presets used by the preview renderer.
 * Keeps the authoring surface simple while leaving room for
 * arbitrary x/y coordinates in future releases.
 */
export type ClipPositionPreset =
  | 'center'
  | 'top'
  | 'bottom'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right';

/** Optional free-form 2D placement in normalized [0..1] viewport coordinates. */
export interface ClipCoordinates {
  x: number;
  y: number;
}

/** Named transition presets applied on clip enter/exit. */
export type ClipTransition =
  | 'none'
  | 'fade'
  | 'slide-up'
  | 'slide-down'
  | 'zoom-in'
  | 'zoom-out'
  | 'blur-in';

/**
 * Authoring unit of the DAW-style timeline editor.
 *
 * A lyric clip owns its timing window (startTime → endTime), the text that
 * should appear during that window, and visual metadata. The internal editor
 * model is clip-based; LRC is only an import/export format.
 */
export interface LyricClip {
  id: string;
  text: string;

  /** Inclusive start in seconds on the master timeline. */
  startTime: number;
  /** Exclusive end in seconds on the master timeline. Always > startTime. */
  endTime: number;

  /** The layer/track this clip lives on. */
  layerId: string;

  /** Reference to a shared style preset. */
  styleId?: string;
  /** Per-clip overrides applied on top of the shared style. */
  styleOverride?: Partial<LyricVisualStyle>;

  transitionIn: ClipTransition;
  transitionOut: ClipTransition;

  /** Named position preset; wins over `coords` when both are present. */
  position: ClipPositionPreset;
  /** Future-proof free-form placement. */
  coords?: ClipCoordinates;

  /** When true, the clip cannot be moved, resized, or deleted. */
  locked?: boolean;
  /** When true, the clip is skipped by the preview renderer. */
  muted?: boolean;
}

/** Minimum duration (in seconds) a clip is allowed to shrink to. */
export const MIN_CLIP_DURATION = 0.25;

/** Convenience: duration in seconds. */
export function clipDuration(clip: LyricClip): number {
  return Math.max(0, clip.endTime - clip.startTime);
}

/** A clip is visible at `time` when time sits inside its [start, end] window. */
export function isClipActiveAt(clip: LyricClip, time: number): boolean {
  if (clip.muted) return false;
  return time >= clip.startTime && time <= clip.endTime;
}
