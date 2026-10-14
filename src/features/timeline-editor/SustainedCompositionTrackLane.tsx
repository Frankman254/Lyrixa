import { useRef } from 'react';
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import {
  deriveSustainedCueSpans,
  moveSustainedCue
} from '../../core/composition/timeline';
import { resolveCueDependencyStatus } from '../../core/composition/slotStatus';
import type {
  CompositionCueV2,
  CompositionTrackV2,
  StoredCompositionV2,
  VibrixAuthoringManifest
} from '../../core/composition/types';

interface SustainedCompositionTrackLaneProps {
  track: CompositionTrackV2;
  score: StoredCompositionV2;
  manifest?: VibrixAuthoringManifest;
  pxPerSecond: number;
  duration: number;
  snapSeconds: number;
  selectedCueId: string | null;
  onScoreChange: (score: StoredCompositionV2) => void;
  onSelectCue: (cueId: string | null) => void;
}

interface CueDragState {
  pointerId: number;
  clientX: number;
  cue: CompositionCueV2;
}

export function SustainedCompositionTrackLane({
  track,
  score,
  manifest,
  pxPerSecond,
  duration,
  snapSeconds,
  selectedCueId,
  onScoreChange,
  onSelectCue
}: SustainedCompositionTrackLaneProps) {
  const dragRef = useRef<CueDragState | null>(null);
  const durationMs = Math.round(Math.max(duration, 0) * 1000);
  const laneWidth = Math.max(duration, 1) * pxPerSecond;
  const spans = deriveSustainedCueSpans(score, track.id, durationMs);

  const beginDrag = (event: ReactPointerEvent<HTMLDivElement>, cue: CompositionCueV2) => {
    if (track.locked) return;
    event.stopPropagation();
    onSelectCue(cue.id);
    dragRef.current = { pointerId: event.pointerId, clientX: event.clientX, cue };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const continueDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaMs = ((event.clientX - drag.clientX) / pxPerSecond) * 1000;
    onScoreChange(moveSustainedCue(
      score,
      drag.cue.id,
      drag.cue.startTimeMs + deltaMs,
      durationMs,
      Math.round(snapSeconds * 1000)
    ));
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* already released */ }
  };

  const selectWithKeyboard = (event: KeyboardEvent<HTMLDivElement>, cueId: string) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onSelectCue(cueId);
  };

  return (
    <div className={`tl-track composition-track ${track.locked ? 'locked' : ''} ${track.enabled ? '' : 'hidden'}`}>
      <div className="tl-track-header composition-track-header">
        <div className="tl-track-title">
          <span className={`tl-track-swatch composition-swatch composition-swatch-${track.kind}`} />
          <span className="tl-track-name">{track.name}</span>
        </div>
        <span className="composition-track-count">{spans.length} cuts</span>
      </div>
      <div
        className="tl-track-lane composition-track-lane"
        style={{ width: `${laneWidth}px`, height: '64px' }}
        onClick={() => onSelectCue(null)}
      >
        {spans.map(({ cue, endTimeMs }) => {
          const resolution = resolveCueDependencyStatus(cue, manifest);
          const status = resolution.status;
          const label = cue.target.kind === 'inherit'
            ? 'Inherit from Scene'
            : resolution.slot?.name ?? resolution.image?.name ?? cue.target.id;
          return (
            <div
              key={cue.id}
              className={`tl-clip composition-cue composition-cue-sustained ${selectedCueId === cue.id ? 'selected' : ''} ${status} ${cue.enabled ? '' : 'disabled'}`}
              style={{
                left: `${(cue.startTimeMs / 1000) * pxPerSecond}px`,
                width: `${Math.max(6, ((endTimeMs - cue.startTimeMs) / 1000) * pxPerSecond)}px`,
                '--clip-color': track.kind === 'image' ? '#8f7ee7' : '#e4a84d'
              } as React.CSSProperties}
              onPointerDown={event => beginDrag(event, cue)}
              onPointerMove={continueDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onKeyDown={event => selectWithKeyboard(event, cue.id)}
              role="button"
              tabIndex={0}
              aria-label={`${label}, cut at ${cue.startTimeMs} milliseconds`}
            >
              <div className="tl-clip-body">
                <span className="tl-clip-text">{label}</span>
                <span className="tl-clip-meta">
                  {status === 'current' || status === 'inherit'
                    ? `${cue.startTimeMs} ms`
                    : status === 'updated'
                      ? 'Updated in Vibrix'
                      : status === 'empty'
                        ? 'Empty in Vibrix'
                        : status === 'disabled'
                          ? 'Disabled in Vibrix'
                          : 'Missing in Vibrix'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
