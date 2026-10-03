import { useRef } from 'react';
import type { DragEvent, PointerEvent as ReactPointerEvent } from 'react';
import type {
  CompositionCue,
  CompositionScore,
  CompositionTrack,
  VibrixAuthoringManifest
} from '../../core/composition/types';
import { isManifestSlotDraggable } from '../../core/composition/authoringManifest';
import { resolveCueSlotStatus } from '../../core/composition/slotStatus';
import { createCompositionCueId } from '../../core/composition/score';
import { VIBRIX_SLOT_DRAG_TYPE } from '../composition/CompositionCatalog';

interface CompositionTrackLaneProps {
  track: CompositionTrack;
  score: CompositionScore;
  manifest?: VibrixAuthoringManifest;
  pxPerSecond: number;
  duration: number;
  selectedCueId: string | null;
  onScoreChange: (score: CompositionScore) => void;
  onSelectCue: (cueId: string | null) => void;
}

type CueDragMode = 'move' | 'resize-start' | 'resize-end';

interface CueDragState {
  pointerId: number;
  clientX: number;
  cue: CompositionCue;
  mode: CueDragMode;
}

export function CompositionTrackLane({
  track,
  score,
  manifest,
  pxPerSecond,
  duration,
  selectedCueId,
  onScoreChange,
  onSelectCue
}: CompositionTrackLaneProps) {
  const dragRef = useRef<CueDragState | null>(null);
  const laneWidth = Math.max(duration, 1) * pxPerSecond;
  const cues = score.cues.filter(cue => cue.trackId === track.id);

  const patchCue = (cueId: string, patch: Partial<CompositionCue>) => {
    onScoreChange({
      ...score,
      cues: score.cues.map(cue => cue.id === cueId ? { ...cue, ...patch } : cue)
    });
  };

  const beginDrag = (event: ReactPointerEvent<HTMLDivElement>, cue: CompositionCue, mode: CueDragMode) => {
    if (track.locked) return;
    event.stopPropagation();
    onSelectCue(cue.id);
    dragRef.current = { pointerId: event.pointerId, clientX: event.clientX, cue, mode };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const continueDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaMs = Math.round(((event.clientX - drag.clientX) / pxPerSecond) * 1000);
    const durationMs = drag.cue.endTimeMs - drag.cue.startTimeMs;
    if (drag.mode === 'move') {
      const startTimeMs = Math.max(0, drag.cue.startTimeMs + deltaMs);
      patchCue(drag.cue.id, { startTimeMs, endTimeMs: startTimeMs + durationMs });
    } else if (drag.mode === 'resize-start') {
      patchCue(drag.cue.id, {
        startTimeMs: Math.max(0, Math.min(drag.cue.endTimeMs - 1, drag.cue.startTimeMs + deltaMs))
      });
    } else {
      patchCue(drag.cue.id, {
        endTimeMs: Math.max(drag.cue.startTimeMs + 1, drag.cue.endTimeMs + deltaMs)
      });
    }
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* capture already released */ }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const slotId = event.dataTransfer.getData(VIBRIX_SLOT_DRAG_TYPE);
    const slot = manifest?.slots.find(candidate => candidate.id === slotId);
    if (!slot || slot.family !== track.kind || !isManifestSlotDraggable(slot)) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const startTimeMs = Math.max(0, Math.round(((event.clientX - rect.left) / pxPerSecond) * 1000));
    const cue: CompositionCue = {
      id: createCompositionCueId(score, slot.id, startTimeMs),
      trackId: track.id,
      startTimeMs,
      endTimeMs: startTimeMs + 8000,
      target: { kind: 'scene', family: track.kind, slotId: slot.id, slotRevision: slot.revision },
      transition: { type: 'cut', durationMs: 0, easing: 'linear' },
      priority: 0,
      enabled: true
    };
    onScoreChange({ ...score, cues: [...score.cues, cue] });
    onSelectCue(cue.id);
  };

  return (
    <div className={`tl-track composition-track ${track.locked ? 'locked' : ''}`}>
      <div className="tl-track-header composition-track-header">
        <div className="tl-track-title">
          <span className="tl-track-swatch composition-swatch" />
          <span className="tl-track-name">{track.name}</span>
        </div>
        <span className="composition-track-count">{cues.length} cues</span>
      </div>
      <div
        className="tl-track-lane composition-track-lane"
        style={{ width: `${laneWidth}px`, height: '64px' }}
        onClick={() => onSelectCue(null)}
        onDragOver={event => {
          if (event.dataTransfer.types.includes(VIBRIX_SLOT_DRAG_TYPE)) event.preventDefault();
        }}
        onDrop={handleDrop}
      >
        {cues.map(cue => {
          const slot = manifest?.slots.find(candidate => candidate.id === cue.target.slotId);
          const status = resolveCueSlotStatus(cue, manifest).status;
          return (
            <div
              key={cue.id}
              className={`tl-clip composition-cue ${selectedCueId === cue.id ? 'selected' : ''} ${status}`}
              style={{
                left: `${(cue.startTimeMs / 1000) * pxPerSecond}px`,
                width: `${Math.max(6, ((cue.endTimeMs - cue.startTimeMs) / 1000) * pxPerSecond)}px`,
                '--clip-color': '#e4a84d'
              } as React.CSSProperties}
              onPointerDown={event => beginDrag(event, cue, 'move')}
              onPointerMove={continueDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              role="button"
              tabIndex={0}
            >
              <div className="tl-clip-handle tl-clip-handle-start" onPointerDown={event => beginDrag(event, cue, 'resize-start')} />
              <div className="tl-clip-body">
                <span className="tl-clip-text">{slot?.name ?? cue.target.slotId}</span>
                <span className="tl-clip-meta">{status === 'current' ? `${cue.startTimeMs} ms` : status === 'updated' ? 'Updated in Vibrix' : 'Missing in Vibrix'}</span>
              </div>
              <div className="tl-clip-handle tl-clip-handle-end" onPointerDown={event => beginDrag(event, cue, 'resize-end')} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
