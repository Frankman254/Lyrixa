import type { LyricLayer } from '../../core/types/layer';
import type { LyricClip as LyricClipModel, ClipPositionPreset } from '../../core/types/clip';
import { LyricClip } from './LyricClip';
import { ClipTextEditor } from './ClipTextEditor';
import { timeToPx } from '../../core/timeline/clips';
import { clipDuration } from '../../core/types/clip';
import type { ClipPointerModifiers, DragMode } from './LyricClip';

const POSITION_OPTIONS: { value: ClipPositionPreset; label: string }[] = [
  { value: 'center',       label: 'Center'       },
  { value: 'top',          label: 'Top'          },
  { value: 'bottom',       label: 'Bottom'       },
  { value: 'top-left',     label: 'Top left'     },
  { value: 'top-right',    label: 'Top right'    },
  { value: 'bottom-left',  label: 'Bottom left'  },
  { value: 'bottom-right', label: 'Bottom right' }
];

interface LyricTrackProps {
  layer: LyricLayer;
  clips: LyricClipModel[];
  pxPerSecond: number;
  duration: number;
  trackHeight: number;
  selectedClipIds: ReadonlySet<string>;
  selectedLayer?: boolean;
  /** True when a drag is currently hovering this lane and a drop here is legal. */
  isDropTarget?: boolean;
  /** Inclusive time window for virtualization (already includes overscan).
   *  When omitted, every clip is rendered (backwards compatible). */
  renderStartTime?: number;
  renderEndTime?: number;
  laneRef?: (el: HTMLDivElement | null) => void;
  onClipPointerDown: (
    clipId: string,
    mode: DragMode,
    pointerId: number,
    clientX: number,
    modifiers: ClipPointerModifiers
  ) => void;
  /** Keyboard activation of a clip (Enter / Space). */
  onClipKeyboardSelect: (clipId: string) => void;
  /** Clip whose text is open for typing, if it lives on this layer. */
  editingClipId?: string | null;
  onClipTextCommit: (clipId: string, text: string) => void;
  onClipEditCancel: (clipId: string) => void;
  /** Double-click on empty lane space: add a block there. */
  onLaneDoubleClick: (layerId: string, clientX: number) => void;
  onLayerToggleVisible: (layerId: string) => void;
  onLayerToggleLocked: (layerId: string) => void;
  onLayerPositionChange: (layerId: string, preset: ClipPositionPreset) => void;
  onLayerSelect: (layerId: string) => void;
}

export function LyricTrack({
  layer,
  clips,
  pxPerSecond,
  duration,
  trackHeight,
  selectedClipIds,
  selectedLayer = false,
  isDropTarget = false,
  renderStartTime,
  renderEndTime,
  laneRef,
  onClipPointerDown,
  onClipKeyboardSelect,
  editingClipId = null,
  onClipTextCommit,
  onClipEditCancel,
  onLaneDoubleClick,
  onLayerToggleVisible,
  onLayerToggleLocked,
  onLayerPositionChange,
  onLayerSelect
}: LyricTrackProps) {
  const totalWidth = Math.max(duration, 1) * pxPerSecond;
  // Virtualize: only mount clips that overlap the visible window (caller already
  // included overscan). Drag/selection still work because the clips array in
  // parent state is full; we only filter rendering.
  const visibleClips = (renderStartTime != null && renderEndTime != null)
    ? clips.filter(c => c.endTime >= renderStartTime && c.startTime <= renderEndTime)
    : clips;
  const trackClass = [
    'tl-track',
    layer.locked ? 'locked' : '',
    layer.visible ? '' : 'hidden',
    isDropTarget ? 'drop-target' : '',
    selectedLayer ? 'selected-layer' : ''
  ].filter(Boolean).join(' ');

  const currentPos = layer.renderSettings?.positionPreset ?? 'center';
  const editingClip = editingClipId
    ? clips.find(c => c.id === editingClipId) ?? null
    : null;

  return (
    <div className={trackClass}>
      <div
        className="tl-track-header"
        style={{ borderLeftColor: layer.color }}
        onClick={() => onLayerSelect(layer.id)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          e.stopPropagation();
          onLayerSelect(layer.id);
        }}
        role="button"
        tabIndex={0}
      >
        <div className="tl-track-title">
          <span className="tl-track-swatch" style={{ background: layer.color }} />
          <span className="tl-track-name">{layer.name}</span>
        </div>
        <div className="tl-track-actions">
          <select
            className="tl-track-pos-select"
            value={currentPos}
            title="Layer position in preview"
            onChange={(e) => onLayerPositionChange(layer.id, e.target.value as ClipPositionPreset)}
            onClick={(e) => e.stopPropagation()}
          >
            {POSITION_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
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
        onDoubleClick={(e) => {
          if (layer.locked || (e.target as HTMLElement).closest('.tl-clip')) return;
          onLaneDoubleClick(layer.id, e.clientX);
        }}
      >
        {visibleClips.map(clip => (
          <LyricClip
            key={clip.id}
            clip={clip}
            pxPerSecond={pxPerSecond}
            layerColor={layer.color}
            selected={selectedClipIds.has(clip.id)}
            locked={layer.locked}
            onPointerDown={onClipPointerDown}
            onKeyboardSelect={onClipKeyboardSelect}
          />
        ))}
        {editingClip && (
          <ClipTextEditor
            key={editingClip.id}
            initialText={editingClip.text}
            left={timeToPx(editingClip.startTime, pxPerSecond)}
            width={timeToPx(clipDuration(editingClip), pxPerSecond)}
            onCommit={(text) => onClipTextCommit(editingClip.id, text)}
            onCancel={() => onClipEditCancel(editingClip.id)}
          />
        )}
      </div>
    </div>
  );
}
