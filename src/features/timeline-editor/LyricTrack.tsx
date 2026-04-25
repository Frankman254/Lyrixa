import type { LyricLayer } from '../../core/types/layer';
import type { LyricClip as LyricClipModel } from '../../core/types/clip';
import { LyricClip } from './LyricClip';
import type { ClipPointerModifiers, DragMode } from './LyricClip';

interface LyricTrackProps {
  layer: LyricLayer;
  clips: LyricClipModel[];
  pxPerSecond: number;
  duration: number;
  trackHeight: number;
  selectedClipIds: ReadonlySet<string>;
  /** True when a drag is currently hovering this lane and a drop here is legal. */
  isDropTarget?: boolean;
  laneRef?: (el: HTMLDivElement | null) => void;
  onClipPointerDown: (
    clipId: string,
    mode: DragMode,
    pointerId: number,
    clientX: number,
    modifiers: ClipPointerModifiers
  ) => void;
  onLayerToggleVisible: (layerId: string) => void;
  onLayerToggleLocked: (layerId: string) => void;
}

export function LyricTrack({
  layer,
  clips,
  pxPerSecond,
  duration,
  trackHeight,
  selectedClipIds,
  isDropTarget = false,
  laneRef,
  onClipPointerDown,
  onLayerToggleVisible,
  onLayerToggleLocked
}: LyricTrackProps) {
  const totalWidth = Math.max(duration, 1) * pxPerSecond;
  const trackClass = [
    'tl-track',
    layer.locked ? 'locked' : '',
    layer.visible ? '' : 'hidden',
    isDropTarget ? 'drop-target' : ''
  ].filter(Boolean).join(' ');

  return (
    <div className={trackClass}>
      <div className="tl-track-header" style={{ borderLeftColor: layer.color }}>
        <div className="tl-track-title">
          <span className="tl-track-swatch" style={{ background: layer.color }} />
          <span className="tl-track-name">{layer.name}</span>
        </div>
        <div className="tl-track-actions">
          <button
            className={`tl-track-btn ${layer.visible ? 'on' : ''}`}
            onClick={() => onLayerToggleVisible(layer.id)}
            title={layer.visible ? 'Hide layer' : 'Show layer'}
          >
            {layer.visible ? '●' : '○'}
          </button>
          <button
            className={`tl-track-btn ${layer.locked ? 'on' : ''}`}
            onClick={() => onLayerToggleLocked(layer.id)}
            title={layer.locked ? 'Unlock layer' : 'Lock layer'}
          >
            {layer.locked ? '🔒' : '🔓'}
          </button>
        </div>
      </div>

      <div
        className="tl-track-lane"
        ref={laneRef}
        data-layer-id={layer.id}
        style={{ width: `${totalWidth}px`, height: `${trackHeight}px` }}
      >
        {clips.map(clip => (
          <LyricClip
            key={clip.id}
            clip={clip}
            pxPerSecond={pxPerSecond}
            layerColor={layer.color}
            selected={selectedClipIds.has(clip.id)}
            locked={layer.locked}
            onPointerDown={onClipPointerDown}
          />
        ))}
      </div>
    </div>
  );
}
