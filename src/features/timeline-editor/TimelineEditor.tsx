import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LyricClip as LyricClipModel } from '../../core/types/clip';
import type { LyricLayer } from '../../core/types/layer';
import type { AudioPeak, AudioChannel } from '../../core/types/audio';
import {
  moveClip,
  resizeClipStart,
  resizeClipEnd,
  pxToTime,
  formatTimecode
} from '../../core/timeline/clips';
import { resolveDroppedLayerId } from '../../core/timeline/clipsFromLyrics';
import { LyricTrack } from './LyricTrack';
import { TimelineRuler } from './TimelineRuler';
import { TimelinePlayhead } from './TimelinePlayhead';
import { TimelineTrackHeader } from './TimelineTrackHeader';
import { TimelineAudioTrack } from './TimelineAudioTrack';
import type { DragMode } from './LyricClip';
import { clampZoom, clientXToTime, TRACK_HEADER_WIDTH } from './timelineMath';
import './TimelineEditor.css';

interface TimelineEditorProps {
  clips: LyricClipModel[];
  layers: LyricLayer[];
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  trackName: string;
  /** Master audio channel — drives the primary waveform. */
  masterChannel?: AudioChannel | null;
  /** Optional vocals channel — shown as a second audio row when present. */
  vocalsChannel?: AudioChannel | null;
  /** Backwards-compat: if no masterChannel is provided, use this peak array. */
  peaks?: AudioPeak[];
  /** When true, the timeline's own chrome (title, track chip, exit button) is hidden. */
  embedded?: boolean;
  onClipsChange: (next: LyricClipModel[]) => void;
  onLayersChange: (next: LyricLayer[]) => void;
  onSeek: (time: number) => void;
  onPlayToggle: () => void;
  onExit?: () => void;
}

interface DragState {
  clipId: string;
  mode: DragMode;
  pointerId: number;
  initialClientX: number;
  initialClip: LyricClipModel;
}

const TRACK_HEIGHT = 64;
const MASTER_WAVEFORM_HEIGHT = 96;
const VOCALS_WAVEFORM_HEIGHT = 72;
const RULER_HEIGHT = 28;

export function TimelineEditor({
  clips,
  layers,
  currentTime,
  duration,
  isPlaying,
  trackName,
  masterChannel,
  vocalsChannel,
  peaks,
  embedded = false,
  onClipsChange,
  onLayersChange,
  onSeek,
  onPlayToggle,
  onExit
}: TimelineEditorProps) {
  const [pxPerSecond, setPxPerSecond] = useState(60);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [snapSeconds, setSnapSeconds] = useState(0);
  const [hoveredLayerId, setHoveredLayerId] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const laneContainerRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const clipsRef = useRef<LyricClipModel[]>(clips);
  const layersRef = useRef<LyricLayer[]>(layers);
  const laneRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    clipsRef.current = clips;
  }, [clips]);

  useEffect(() => {
    layersRef.current = layers;
  }, [layers]);

  const setLaneRef = useCallback(
    (layerId: string) => (el: HTMLDivElement | null) => {
      if (el) laneRefs.current.set(layerId, el);
      else laneRefs.current.delete(layerId);
    },
    []
  );

  const findLayerAtY = useCallback((clientY: number): string | null => {
    for (const [layerId, el] of laneRefs.current) {
      const rect = el.getBoundingClientRect();
      if (clientY >= rect.top && clientY <= rect.bottom) return layerId;
    }
    return null;
  }, []);

  const effectiveDuration = Math.max(duration, 30);
  const laneWidth = effectiveDuration * pxPerSecond;
  const headerWidth = TRACK_HEADER_WIDTH;
  const totalLaneContainerWidth = laneWidth + headerWidth;

  const sortedLayers = useMemo(
    () => [...layers].sort((a, b) => a.order - b.order),
    [layers]
  );

  const clipsByLayer = useMemo(() => {
    const map = new Map<string, LyricClipModel[]>();
    for (const layer of layers) map.set(layer.id, []);
    for (const clip of clips) {
      const list = map.get(clip.layerId);
      if (list) list.push(clip);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.startTime - b.startTime);
    }
    return map;
  }, [clips, layers]);

  const audioRowHeights =
    (masterChannel ? MASTER_WAVEFORM_HEIGHT : MASTER_WAVEFORM_HEIGHT) +
    (vocalsChannel ? VOCALS_WAVEFORM_HEIGHT : 0);
  const totalTracksHeight = layers.length * TRACK_HEIGHT;
  const playheadHeight = RULER_HEIGHT + audioRowHeights + totalTracksHeight;

  // Auto-follow playhead while playing.
  useEffect(() => {
    if (!isPlaying) return;
    const el = scrollRef.current;
    if (!el) return;
    const playheadPx = headerWidth + currentTime * pxPerSecond;
    const viewportStart = el.scrollLeft;
    const viewportEnd = viewportStart + el.clientWidth;
    if (playheadPx < viewportStart + headerWidth + 40 || playheadPx > viewportEnd - 80) {
      el.scrollLeft = Math.max(0, playheadPx - el.clientWidth / 2);
    }
  }, [currentTime, pxPerSecond, isPlaying, headerWidth]);

  const zoomIn = () => setPxPerSecond(p => clampZoom(p * 1.4));
  const zoomOut = () => setPxPerSecond(p => clampZoom(p / 1.4));

  const handleRulerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = laneContainerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const time = clientXToTime(e.clientX, rect, {
      pxPerSecond,
      scrollLeft: scrollRef.current?.scrollLeft ?? 0,
      headerOffset: headerWidth
    });
    onSeek(Math.max(0, Math.min(effectiveDuration, time)));
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      setPxPerSecond(p => clampZoom(p * factor));
    }
  };

  const handleDragStart = useCallback(
    (clipId: string, mode: DragMode, pointerId: number, clientX: number) => {
      const clip = clipsRef.current.find(c => c.id === clipId);
      if (!clip) return;
      dragStateRef.current = {
        clipId,
        mode,
        pointerId,
        initialClientX: clientX,
        initialClip: clip
      };
      try {
        laneContainerRef.current?.setPointerCapture(pointerId);
      } catch {
        /* ignore — browsers without capture support */
      }
    },
    []
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const state = dragStateRef.current;
      if (!state || state.pointerId !== e.pointerId) return;
      const deltaPx = e.clientX - state.initialClientX;
      const deltaSec = pxToTime(deltaPx, pxPerSecond);
      const base = state.initialClip;

      let updated: LyricClipModel;
      if (state.mode === 'move') {
        updated = moveClip(base, deltaSec, { trackDuration: effectiveDuration, snap: snapSeconds });
      } else if (state.mode === 'resize-start') {
        updated = resizeClipStart(base, base.startTime + deltaSec, { snap: snapSeconds });
      } else {
        updated = resizeClipEnd(base, base.endTime + deltaSec, {
          trackDuration: effectiveDuration,
          snap: snapSeconds
        });
      }

      const next = clipsRef.current.map(c => (c.id === updated.id ? updated : c));
      onClipsChange(next);

      // Vertical drag-target detection — only for body moves of unlocked clips.
      if (state.mode === 'move' && !base.locked) {
        const layerAtY = findLayerAtY(e.clientY);
        const targetLayer = layerAtY
          ? layersRef.current.find(l => l.id === layerAtY) ?? null
          : null;
        if (
          layerAtY &&
          layerAtY !== base.layerId &&
          targetLayer &&
          !targetLayer.locked
        ) {
          setHoveredLayerId(layerAtY);
        } else {
          setHoveredLayerId(null);
        }
      }
    },
    [pxPerSecond, effectiveDuration, snapSeconds, onClipsChange, findLayerAtY]
  );

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const state = dragStateRef.current;
    if (!state || state.pointerId !== e.pointerId) return;

    if (state.mode === 'move' && hoveredLayerId) {
      const current = clipsRef.current.find(c => c.id === state.clipId);
      if (current) {
        const layerIndex = new Map(
          layersRef.current.map(l => [l.id, { locked: l.locked }] as const)
        );
        const nextLayerId = resolveDroppedLayerId(current, hoveredLayerId, layerIndex);
        if (nextLayerId !== current.layerId) {
          onClipsChange(
            clipsRef.current.map(c =>
              c.id === current.id ? { ...c, layerId: nextLayerId } : c
            )
          );
        }
      }
    }

    setHoveredLayerId(null);
    dragStateRef.current = null;
    try {
      laneContainerRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }, [hoveredLayerId, onClipsChange]);

  const handleLaneBackgroundClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('.tl-clip')) return;
    const rect = laneContainerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const time = clientXToTime(e.clientX, rect, {
      pxPerSecond,
      scrollLeft: scrollRef.current?.scrollLeft ?? 0,
      headerOffset: headerWidth
    });
    onSeek(Math.max(0, Math.min(effectiveDuration, time)));
    setSelectedClipId(null);
  };

  const toggleLayerVisible = (layerId: string) => {
    onLayersChange(
      layers.map(l => (l.id === layerId ? { ...l, visible: !l.visible } : l))
    );
  };

  const toggleLayerLocked = (layerId: string) => {
    onLayersChange(
      layers.map(l => (l.id === layerId ? { ...l, locked: !l.locked } : l))
    );
  };

  const selectedClip = selectedClipId
    ? clips.find(c => c.id === selectedClipId) ?? null
    : null;

  const updateSelectedClip = (patch: Partial<LyricClipModel>) => {
    if (!selectedClip) return;
    onClipsChange(
      clips.map(c => (c.id === selectedClip.id ? { ...c, ...patch } : c))
    );
  };

  const masterPeaks = masterChannel?.waveformPeaks ?? peaks;
  const masterIsMock = !masterPeaks || masterPeaks.length === 0;

  return (
    <div className="timeline-editor">
      <header className="tl-topbar">
        {!embedded && (
          <div className="tl-topbar-left">
            <h2>Timeline Editor</h2>
            <span className="tl-track-chip">{trackName}</span>
          </div>
        )}
        <div className="tl-topbar-center">
          <span className="tl-time">{formatTimecode(currentTime, true)}</span>
          <span className="tl-time-sep">/</span>
          <span className="tl-time muted">{formatTimecode(effectiveDuration)}</span>
        </div>
        <div className="tl-topbar-right">
          <button className="tl-btn" onClick={onPlayToggle}>
            {isPlaying ? '⏸ Pause' : '▶ Play'}
          </button>
          <div className="tl-zoom">
            <button className="tl-btn small" onClick={zoomOut} title="Zoom out">−</button>
            <span className="tl-zoom-value">{Math.round(pxPerSecond)} px/s</span>
            <button className="tl-btn small" onClick={zoomIn} title="Zoom in">+</button>
          </div>
          <label className="tl-snap">
            Snap
            <select
              value={snapSeconds}
              onChange={(e) => setSnapSeconds(parseFloat(e.target.value))}
            >
              <option value={0}>Off</option>
              <option value={0.1}>0.1s</option>
              <option value={0.25}>0.25s</option>
              <option value={0.5}>0.5s</option>
              <option value={1}>1s</option>
            </select>
          </label>
          {onExit && (
            <button className="tl-btn danger" onClick={onExit}>✕ Exit</button>
          )}
        </div>
      </header>

      <div
        className="tl-scroll"
        ref={scrollRef}
        onWheel={handleWheel}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div
          className="tl-lane-container"
          ref={laneContainerRef}
          style={{ width: `${totalLaneContainerWidth}px` }}
        >
          {/* Ruler row uses the same header column so its ticks line up with clips. */}
          <div className="tl-track tl-ruler-row" style={{ height: `${RULER_HEIGHT}px` }}>
            <TimelineTrackHeader title="Time" variant="thin" />
            <div
              className="tl-ruler-wrap"
              style={{ width: `${laneWidth}px`, height: `${RULER_HEIGHT}px` }}
              onClick={handleRulerClick}
            >
              <TimelineRuler duration={effectiveDuration} pxPerSecond={pxPerSecond} />
            </div>
          </div>

          {/* Master audio row. Always rendered so x-alignment is stable. */}
          <TimelineAudioTrack
            title="Pista de audio"
            color="#53c2f0"
            duration={effectiveDuration}
            pxPerSecond={pxPerSecond}
            height={MASTER_WAVEFORM_HEIGHT}
            peaks={masterPeaks}
            badge={masterChannel ? 'master' : undefined}
            mockFallback={masterIsMock}
          />

          {/* Optional vocals row. */}
          {vocalsChannel && (
            <TimelineAudioTrack
              title="Vocals"
              color="#5fc88e"
              duration={effectiveDuration}
              pxPerSecond={pxPerSecond}
              height={VOCALS_WAVEFORM_HEIGHT}
              peaks={vocalsChannel.waveformPeaks}
              vocalActivity={vocalsChannel.vocalActivity}
              badge={
                vocalsChannel.vocalActivity?.length
                  ? `${vocalsChannel.vocalActivity.length} segments`
                  : 'analyzing…'
              }
              mockFallback={!vocalsChannel.waveformPeaks?.length}
            />
          )}

          <div className="tl-tracks" onClick={handleLaneBackgroundClick}>
            {sortedLayers.map(layer => (
              <LyricTrack
                key={layer.id}
                layer={layer}
                clips={clipsByLayer.get(layer.id) ?? []}
                pxPerSecond={pxPerSecond}
                duration={effectiveDuration}
                trackHeight={TRACK_HEIGHT}
                selectedClipId={selectedClipId}
                isDropTarget={hoveredLayerId === layer.id}
                laneRef={setLaneRef(layer.id)}
                onSelectClip={setSelectedClipId}
                onDragStart={handleDragStart}
                onLayerToggleVisible={toggleLayerVisible}
                onLayerToggleLocked={toggleLayerLocked}
              />
            ))}
          </div>

          <TimelinePlayhead
            currentTime={currentTime}
            pxPerSecond={pxPerSecond}
            height={playheadHeight}
            offsetLeft={headerWidth}
          />
        </div>
      </div>

      {selectedClip && (
        <aside className="tl-inspector glass-panel">
          <h3>Clip</h3>
          <label>
            Text
            <textarea
              rows={2}
              value={selectedClip.text}
              onChange={(e) => updateSelectedClip({ text: e.target.value })}
            />
          </label>
          <div className="tl-inspector-row">
            <label>
              Start
              <input
                type="number"
                step="0.01"
                min={0}
                value={Number(selectedClip.startTime.toFixed(2))}
                onChange={(e) => {
                  const next = parseFloat(e.target.value);
                  if (!Number.isFinite(next)) return;
                  updateSelectedClip({
                    startTime: Math.max(0, Math.min(selectedClip.endTime - 0.25, next))
                  });
                }}
              />
            </label>
            <label>
              End
              <input
                type="number"
                step="0.01"
                min={0}
                value={Number(selectedClip.endTime.toFixed(2))}
                onChange={(e) => {
                  const next = parseFloat(e.target.value);
                  if (!Number.isFinite(next)) return;
                  updateSelectedClip({
                    endTime: Math.max(selectedClip.startTime + 0.25, next)
                  });
                }}
              />
            </label>
          </div>
          <label>
            Layer
            <select
              value={selectedClip.layerId}
              onChange={(e) => updateSelectedClip({ layerId: e.target.value })}
            >
              {layers.map(l => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </label>
          <div className="tl-inspector-row">
            <label>
              In
              <select
                value={selectedClip.transitionIn}
                onChange={(e) => updateSelectedClip({ transitionIn: e.target.value as LyricClipModel['transitionIn'] })}
              >
                <option value="none">None</option>
                <option value="fade">Fade</option>
                <option value="slide-up">Slide up</option>
                <option value="slide-down">Slide down</option>
                <option value="zoom-in">Zoom in</option>
                <option value="zoom-out">Zoom out</option>
                <option value="blur-in">Blur in</option>
              </select>
            </label>
            <label>
              Out
              <select
                value={selectedClip.transitionOut}
                onChange={(e) => updateSelectedClip({ transitionOut: e.target.value as LyricClipModel['transitionOut'] })}
              >
                <option value="none">None</option>
                <option value="fade">Fade</option>
                <option value="slide-up">Slide up</option>
                <option value="slide-down">Slide down</option>
                <option value="zoom-in">Zoom in</option>
                <option value="zoom-out">Zoom out</option>
                <option value="blur-in">Blur in</option>
              </select>
            </label>
          </div>
          <div className="tl-inspector-row">
            <label>
              <input
                type="checkbox"
                checked={!!selectedClip.muted}
                onChange={(e) => updateSelectedClip({ muted: e.target.checked })}
              />
              Mute
            </label>
            <label>
              <input
                type="checkbox"
                checked={!!selectedClip.locked}
                onChange={(e) => updateSelectedClip({ locked: e.target.checked })}
              />
              Lock
            </label>
          </div>
        </aside>
      )}
    </div>
  );
}
