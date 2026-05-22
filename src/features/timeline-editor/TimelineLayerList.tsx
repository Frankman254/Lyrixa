import { memo, type RefCallback } from 'react';
import type { LyricClip as LyricClipModel, ClipPositionPreset } from '../../core/types/clip';
import type { LyricLayer } from '../../core/types/layer';
import type { ClipPointerModifiers, DragMode } from './LyricClip';
import { LyricTrack } from './LyricTrack';

interface TimelineLayerListProps {
  layers: LyricLayer[];
  clipsByLayer: Map<string, LyricClipModel[]>;
  pxPerSecond: number;
  duration: number;
  trackHeight: number;
  selectedClipIds: Set<string>;
  selectedLayerId: string | null;
  hoveredLayerId: string | null;
  setLaneRef: (layerId: string) => RefCallback<HTMLDivElement>;
  onClipPointerDown: (
    clipId: string,
    mode: DragMode,
    pointerId: number,
    clientX: number,
    modifiers: ClipPointerModifiers
  ) => void;
  onLayerToggleVisible: (layerId: string) => void;
  onLayerToggleLocked: (layerId: string) => void;
  onLayerPositionChange: (layerId: string, preset: ClipPositionPreset) => void;
  onLayerSelect: (layerId: string) => void;
}

export const TimelineLayerList = memo(function TimelineLayerList({
  layers,
  clipsByLayer,
  pxPerSecond,
  duration,
  trackHeight,
  selectedClipIds,
  selectedLayerId,
  hoveredLayerId,
  setLaneRef,
  onClipPointerDown,
  onLayerToggleVisible,
  onLayerToggleLocked,
  onLayerPositionChange,
  onLayerSelect
}: TimelineLayerListProps) {
  return (
    <>
      {layers.map(layer => (
        <LyricTrack
          key={layer.id}
          layer={layer}
          clips={clipsByLayer.get(layer.id) ?? []}
          pxPerSecond={pxPerSecond}
          duration={duration}
          trackHeight={trackHeight}
          selectedClipIds={selectedClipIds}
          selectedLayer={selectedLayerId === layer.id}
          isDropTarget={hoveredLayerId === layer.id}
          laneRef={setLaneRef(layer.id)}
          onClipPointerDown={onClipPointerDown}
          onLayerToggleVisible={onLayerToggleVisible}
          onLayerToggleLocked={onLayerToggleLocked}
          onLayerPositionChange={onLayerPositionChange}
          onLayerSelect={onLayerSelect}
        />
      ))}
    </>
  );
});
