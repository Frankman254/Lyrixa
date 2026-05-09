import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { LyricClip } from '../../core/types/clip';
import type { LyricLayer } from '../../core/types/layer';

interface TimelineMinimapProps {
  duration: number;
  clips: ReadonlyArray<LyricClip>;
  layers: ReadonlyArray<LyricLayer>;
  /** Current px/second of the main timeline. Drives the viewport rect width. */
  pxPerSecond: number;
  /** Live scroll-left of the main timeline scroll container. */
  scrollLeft: number;
  /** Visible inner width of the main timeline scroll container (px). */
  viewportPx: number;
  /** Width of the main timeline's sticky header column (subtracted from viewport). */
  headerPx: number;
  currentTime: number;
  /** Seek the playhead to a given time in seconds. */
  onSeek: (time: number) => void;
  /** Pan the main timeline so its lane scrollLeft matches the requested px. */
  onScrollTo: (scrollLeftPx: number) => void;
}

const MINIMAP_HEIGHT = 48;
const PLAYHEAD_W = 1;

/**
 * Compact horizontal overview of the whole song. Useful for long mixes
 * where the main timeline is zoomed in and the user loses context.
 *
 * Click anywhere on the minimap to seek. Click-and-drag inside the
 * viewport rect to pan the main timeline.
 */
export function TimelineMinimap({
  duration,
  clips,
  layers,
  pxPerSecond,
  scrollLeft,
  viewportPx,
  headerPx,
  currentTime,
  onSeek,
  onScrollTo
}: TimelineMinimapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const dragStateRef = useRef<{ pointerId: number; offsetTime: number } | null>(null);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const safeDuration = Math.max(1, duration);
  const pxPerSec = width / safeDuration;
  const visibleSeconds = pxPerSecond > 0 && viewportPx > headerPx
    ? (viewportPx - headerPx) / pxPerSecond
    : safeDuration;
  const viewportStartTime = pxPerSecond > 0 ? scrollLeft / pxPerSecond : 0;
  const rectLeft = viewportStartTime * pxPerSec;
  const rectWidth = Math.min(width - rectLeft, Math.max(8, visibleSeconds * pxPerSec));

  const sortedLayers = [...layers].sort((a, b) => a.order - b.order);
  const layerCount = Math.max(1, sortedLayers.length);
  const trackHeight = (MINIMAP_HEIGHT - 8) / layerCount;

  const layerOrder = new Map(sortedLayers.map((layer, idx) => [layer.id, idx] as const));
  const layerColor = new Map(sortedLayers.map(layer => [layer.id, layer.color] as const));

  const timeFromClientX = useCallback(
    (clientX: number): number => {
      const el = containerRef.current;
      if (!el || width <= 0) return 0;
      const rect = el.getBoundingClientRect();
      const x = clientX - rect.left;
      return Math.max(0, Math.min(safeDuration, (x / width) * safeDuration));
    },
    [safeDuration, width]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const time = timeFromClientX(e.clientX);
    const isInsideRect = time >= viewportStartTime && time <= viewportStartTime + visibleSeconds;
    if (isInsideRect) {
      // Begin pan-drag.
      dragStateRef.current = { pointerId: e.pointerId, offsetTime: time - viewportStartTime };
      try { containerRef.current?.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      return;
    }
    // Outside viewport rect = seek.
    onSeek(time);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const state = dragStateRef.current;
    if (!state || state.pointerId !== e.pointerId) return;
    const time = timeFromClientX(e.clientX);
    const targetStart = Math.max(0, Math.min(safeDuration - visibleSeconds, time - state.offsetTime));
    onScrollTo(targetStart * pxPerSecond);
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const state = dragStateRef.current;
    if (!state || state.pointerId !== e.pointerId) return;
    dragStateRef.current = null;
    try { containerRef.current?.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  };

  // Reset drag if duration changes underfoot.
  useEffect(() => {
    if (!dragStateRef.current) return;
    dragStateRef.current = null;
  }, [duration]);

  const playheadX = currentTime * pxPerSec;

  return (
    <div
      ref={containerRef}
      className="tl-minimap"
      style={{ height: MINIMAP_HEIGHT }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div className="tl-minimap-tracks" style={{ paddingTop: 4, paddingBottom: 4 }}>
        {sortedLayers.map((layer, idx) => (
          <div
            key={layer.id}
            className="tl-minimap-track"
            style={{
              top: 4 + idx * trackHeight,
              height: Math.max(2, trackHeight - 2)
            }}
          />
        ))}
        {clips.map(clip => {
          const order = layerOrder.get(clip.layerId) ?? 0;
          const left = clip.startTime * pxPerSec;
          const w = Math.max(1, (clip.endTime - clip.startTime) * pxPerSec);
          return (
            <div
              key={clip.id}
              className="tl-minimap-clip"
              style={{
                left,
                width: w,
                top: 4 + order * trackHeight,
                height: Math.max(2, trackHeight - 2),
                background: layerColor.get(clip.layerId) ?? '#5a5fcf'
              }}
            />
          );
        })}
      </div>
      <div
        className="tl-minimap-viewport"
        style={{ left: rectLeft, width: rectWidth }}
      />
      <div
        className="tl-minimap-playhead"
        style={{ left: playheadX, width: PLAYHEAD_W }}
      />
    </div>
  );
}
