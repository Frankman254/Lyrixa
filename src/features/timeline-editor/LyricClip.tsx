import { useRef, useCallback } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { LyricClip as LyricClipModel } from '../../core/types/clip';
import { clipDuration } from '../../core/types/clip';
import { timeToPx, formatTimecode } from '../../core/timeline/clips';

type DragMode = 'move' | 'resize-start' | 'resize-end';

export interface ClipPointerModifiers {
  /** Cmd / Ctrl was held — caller should toggle this clip in the selection. */
  additive: boolean;
  /** Shift was held — caller should select a range inside this clip's layer. */
  range: boolean;
}

interface LyricClipProps {
  clip: LyricClipModel;
  pxPerSecond: number;
  layerColor: string;
  selected: boolean;
  locked: boolean;
  /**
   * Single entry point for both selection and drag-start. The parent decides
   * whether to extend/range-select or begin a drag.
   */
  onPointerDown: (
    clipId: string,
    mode: DragMode,
    pointerId: number,
    clientX: number,
    modifiers: ClipPointerModifiers
  ) => void;
}

export function LyricClip({
  clip,
  pxPerSecond,
  layerColor,
  selected,
  locked,
  onPointerDown
}: LyricClipProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  const left = timeToPx(clip.startTime, pxPerSecond);
  const width = Math.max(4, timeToPx(clipDuration(clip), pxPerSecond));

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>, mode: DragMode) => {
      if (locked || clip.locked) return;
      e.stopPropagation();
      const modifiers: ClipPointerModifiers = {
        additive: e.metaKey || e.ctrlKey,
        range: e.shiftKey
      };
      onPointerDown(clip.id, mode, e.pointerId, e.clientX, modifiers);
    },
    [clip.id, clip.locked, locked, onPointerDown]
  );

  let classes = 'tl-clip';
  if (selected) classes += ' selected';
  if (clip.muted) classes += ' muted';
  if (clip.locked || locked) classes += ' locked';

  return (
    <div
      ref={rootRef}
      className={classes}
      style={{
        left: `${left}px`,
        width: `${width}px`,
        '--clip-color': layerColor
      } as React.CSSProperties}
      onPointerDown={(e) => handlePointerDown(e, 'move')}
      role="button"
      tabIndex={0}
      aria-label={`Clip ${clip.text || '(blank)'} from ${formatTimecode(clip.startTime, true)} to ${formatTimecode(clip.endTime, true)}`}
    >
      <div
        className="tl-clip-handle tl-clip-handle-start"
        onPointerDown={(e) => handlePointerDown(e, 'resize-start')}
        aria-hidden
      />
      <div className="tl-clip-body">
        <span className="tl-clip-text">{clip.text || '•••'}</span>
        <span className="tl-clip-meta">{formatTimecode(clip.startTime, true)}</span>
      </div>
      <div
        className="tl-clip-handle tl-clip-handle-end"
        onPointerDown={(e) => handlePointerDown(e, 'resize-end')}
        aria-hidden
      />
    </div>
  );
}

export type { DragMode };
