import type {
  CompositionCueV2,
  CompositionTrackV2,
  StoredCompositionV2,
  VibrixTimelineKind
} from './types';

export interface SustainedCueSpan {
  cue: CompositionCueV2;
  endTimeMs: number;
}

/** Scene and Image are the primary visual tracks; granular overrides follow. */
export const TRACK_KIND_ORDER: Record<VibrixTimelineKind, number> = {
  scene: 0,
  image: 1,
  spectrum: 2,
  'spectrum-second': 3,
  looks: 4,
  particles: 5,
  rain: 6,
  lights: 7,
  'camera-fx': 8,
  logo: 9,
  'track-title': 10,
  'background-zoom': 11
};

export function sortCompositionTracksForTimeline(
  tracks: CompositionTrackV2[]
): CompositionTrackV2[] {
  return [...tracks].sort((left, right) =>
    TRACK_KIND_ORDER[left.kind] - TRACK_KIND_ORDER[right.kind] ||
    left.order - right.order ||
    left.id.localeCompare(right.id)
  );
}

/**
 * v2 cues are sustained states. Their visible end is the next cut in the same
 * track, or the end of the audio when there is no following cue.
 */
export function deriveSustainedCueSpans(
  score: StoredCompositionV2,
  trackId: string,
  audioDurationMs: number
): SustainedCueSpan[] {
  const timelineEndMs = Math.max(0, Math.round(audioDurationMs));
  const cues = score.cues
    .filter(cue => cue.trackId === trackId)
    .sort((left, right) =>
      left.startTimeMs - right.startTimeMs ||
      right.priority - left.priority ||
      left.id.localeCompare(right.id)
    );

  return cues.map((cue, index) => ({
    cue,
    endTimeMs: Math.max(
      cue.startTimeMs,
      cues[index + 1]?.startTimeMs ?? timelineEndMs
    )
  }));
}

export function snapAndClampStartTimeMs(
  requestedStartTimeMs: number,
  audioDurationMs: number,
  snapMs = 0
): number {
  const snappedStartTimeMs = snapMs > 0
    ? Math.round(requestedStartTimeMs / snapMs) * snapMs
    : Math.round(requestedStartTimeMs);
  return Math.min(
    Math.max(0, snappedStartTimeMs),
    Math.max(0, Math.round(audioDurationMs))
  );
}

export function moveSustainedCue(
  score: StoredCompositionV2,
  cueId: string,
  requestedStartTimeMs: number,
  audioDurationMs: number,
  snapMs = 0
): StoredCompositionV2 {
  const startTimeMs = snapAndClampStartTimeMs(requestedStartTimeMs, audioDurationMs, snapMs);

  return {
    ...score,
    cues: score.cues.map(cue => cue.id === cueId ? { ...cue, startTimeMs } : cue)
  };
}
