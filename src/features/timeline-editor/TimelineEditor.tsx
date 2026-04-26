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
import {
  shiftClips,
  getSelectableClips,
  getClipsAfterTime,
  getSelectionBounds
} from '../../core/timeline/clipSelection';
import { LyricTrack } from './LyricTrack';
import { TimelineRuler } from './TimelineRuler';
import { TimelinePlayhead } from './TimelinePlayhead';
import { TimelineTrackHeader } from './TimelineTrackHeader';
import { TimelineAudioTrack } from './TimelineAudioTrack';
import type { ClipPointerModifiers, DragMode } from './LyricClip';
import { clampZoom, getTimelinePointerTime, TRACK_HEADER_WIDTH } from './timelineMath';
import './TimelineEditor.css';

interface TimelineEditorProps {
  clips: LyricClipModel[];
  layers: LyricLayer[];
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  trackName: string;
  masterChannel?: AudioChannel | null;
  vocalsChannel?: AudioChannel | null;
  peaks?: AudioPeak[];
  embedded?: boolean;
  onClipsChange: (next: LyricClipModel[]) => void;
  onLayersChange: (next: LyricLayer[]) => void;
  onSeek: (time: number) => void;
  onPlayToggle: () => void;
  onExit?: () => void;
}

interface DragState {
  primaryClipId: string;
  mode: DragMode;
  pointerId: number;
  initialClientX: number;
  /** Snapshot of every clip in the active selection at drag start. */
  initialClips: LyricClipModel[];
}

const TRACK_HEIGHT = 64;
const MASTER_WAVEFORM_HEIGHT = 96;
const VOCALS_WAVEFORM_HEIGHT = 72;
const RULER_HEIGHT = 28;

const NUDGE_STEPS = [-1, -0.5, -0.1, 0.1, 0.5, 1];
const OFFSET_STEPS = [-1, -0.5, -0.1, 0.1, 0.5, 1];

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
  const [selectedClipIds, setSelectedClipIds] = useState<Set<string>>(() => new Set());
  const [snapSeconds, setSnapSeconds] = useState(0);
  const [hoveredLayerId, setHoveredLayerId] = useState<string | null>(null);
  const [offsetInput, setOffsetInput] = useState<string>('0');

  const scrollRef = useRef<HTMLDivElement>(null);
  const laneContainerRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const clipsRef = useRef<LyricClipModel[]>(clips);
  const layersRef = useRef<LyricLayer[]>(layers);
  const laneRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const selectedIdsRef = useRef<Set<string>>(selectedClipIds);
  const snapRef = useRef(snapSeconds);

  useEffect(() => { clipsRef.current = clips; }, [clips]);
  useEffect(() => { layersRef.current = layers; }, [layers]);
  useEffect(() => { selectedIdsRef.current = selectedClipIds; }, [selectedClipIds]);
  useEffect(() => { snapRef.current = snapSeconds; }, [snapSeconds]);

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
    MASTER_WAVEFORM_HEIGHT + (vocalsChannel ? VOCALS_WAVEFORM_HEIGHT : 0);
  const totalTracksHeight = layers.length * TRACK_HEIGHT;
  const playheadHeight = RULER_HEIGHT + audioRowHeights + totalTracksHeight;

  const selectionBounds = useMemo(
    () => getSelectionBounds(clips, selectedClipIds),
    [clips, selectedClipIds]
  );

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

  /**
   * Single seek handler shared by the ruler, waveform lane, and track lane.
   * Uses the SCROLL CONTAINER rect (scrollRef) which is stable in viewport
   * coords — see getTimelinePointerTime for the full explanation.
   */
  const handleSeekClick = useCallback((e: React.MouseEvent) => {
    const rect = scrollRef.current?.getBoundingClientRect();
    if (!rect) return;
    const time = getTimelinePointerTime({
      clientX: e.clientX,
      scrollContainerRect: rect,
      scrollLeft: scrollRef.current?.scrollLeft ?? 0,
      pxPerSecond,
      headerWidth,
      duration: effectiveDuration
    });
    onSeek(time);
  }, [pxPerSecond, headerWidth, effectiveDuration, onSeek]);

  const handleRulerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    handleSeekClick(e);
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      setPxPerSecond(p => clampZoom(p * factor));
    }
  };

  // ── Selection actions ──────────────────────────────────────────
  const selectAll = useCallback(() => {
    const ids = getSelectableClips(clipsRef.current, layersRef.current).map(c => c.id);
    setSelectedClipIds(new Set(ids));
  }, []);

  const selectAfterPlayhead = useCallback(() => {
    const ids = getClipsAfterTime(
      clipsRef.current,
      currentTime,
      layersRef.current
    ).map(c => c.id);
    setSelectedClipIds(new Set(ids));
  }, [currentTime]);

  const clearSelection = useCallback(() => {
    setSelectedClipIds(new Set());
  }, []);

  const nudgeSelected = useCallback(
    (delta: number) => {
      const ids = Array.from(selectedIdsRef.current);
      if (ids.length === 0 || delta === 0) return;
      const next = shiftClips(clipsRef.current, ids, delta, {
        trackDuration: effectiveDuration,
        respectLocked: true,
        layers: layersRef.current
      });
      onClipsChange(next);
    },
    [effectiveDuration, onClipsChange]
  );

  const offsetAllUnlocked = useCallback(
    (delta: number) => {
      if (delta === 0) return;
      const ids = getSelectableClips(
        clipsRef.current,
        layersRef.current,
        { requireVisible: false }
      ).map(c => c.id);
      if (ids.length === 0) return;
      const next = shiftClips(clipsRef.current, ids, delta, {
        trackDuration: effectiveDuration,
        respectLocked: true,
        layers: layersRef.current
      });
      onClipsChange(next);
    },
    [effectiveDuration, onClipsChange]
  );

  // ── Pointer-down on a clip: handles both selection and drag-start ──
  const handleClipPointerDown = useCallback(
    (
      clipId: string,
      mode: DragMode,
      pointerId: number,
      clientX: number,
      modifiers: ClipPointerModifiers
    ) => {
      const clip = clipsRef.current.find(c => c.id === clipId);
      if (!clip) return;

      if (modifiers.toggle && mode === 'move') {
        // Toggle selection only — no drag.
        setSelectedClipIds(prev => {
          const next = new Set(prev);
          if (next.has(clipId)) next.delete(clipId);
          else next.add(clipId);
          return next;
        });
        return;
      }

      // Decide the effective selection at the moment of drag-start.
      let effective: Set<string>;
      if (mode === 'move') {
        effective = selectedIdsRef.current.has(clipId)
          ? new Set(selectedIdsRef.current)
          : new Set([clipId]);
      } else {
        // Resize handles always operate on the single clip.
        effective = new Set([clipId]);
      }

      if (
        effective.size !== selectedIdsRef.current.size ||
        Array.from(effective).some(id => !selectedIdsRef.current.has(id))
      ) {
        setSelectedClipIds(effective);
      }

      const initial = clipsRef.current
        .filter(c => effective.has(c.id))
        .map(c => ({ ...c }));

      dragStateRef.current = {
        primaryClipId: clipId,
        mode,
        pointerId,
        initialClientX: clientX,
        initialClips: initial
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

      if (state.mode === 'move') {
        // Group move via shiftClips against the snapshot — no drift.
        const baseline = clipsRef.current.map(c => {
          const init = state.initialClips.find(i => i.id === c.id);
          return init ? init : c;
        });
        const ids = state.initialClips.map(c => c.id);
        const shifted = shiftClips(baseline, ids, deltaSec, {
          trackDuration: effectiveDuration,
          respectLocked: true,
          layers: layersRef.current
        });
        onClipsChange(shifted);

        // Single-clip vertical-layer hover only when dragging exactly one clip.
        if (state.initialClips.length === 1) {
          const base = state.initialClips[0]!;
          if (!base.locked) {
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
        } else if (hoveredLayerId !== null) {
          setHoveredLayerId(null);
        }
        return;
      }

      // Resize paths — single clip only.
      const base = state.initialClips[0]!;
      let updated: LyricClipModel;
      if (state.mode === 'resize-start') {
        updated = resizeClipStart(base, base.startTime + deltaSec, { snap: snapSeconds });
      } else {
        updated = resizeClipEnd(base, base.endTime + deltaSec, {
          trackDuration: effectiveDuration,
          snap: snapSeconds
        });
      }
      // Preserve any other clips that may have been edited mid-drag.
      onClipsChange(
        clipsRef.current.map(c => (c.id === updated.id ? updated : c))
      );
      // Keep moveClip available for future strict-snap moves of single clips.
      void moveClip;
    },
    [pxPerSecond, effectiveDuration, snapSeconds, onClipsChange, findLayerAtY, hoveredLayerId]
  );

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const state = dragStateRef.current;
    if (!state || state.pointerId !== e.pointerId) return;

    if (state.mode === 'move' && state.initialClips.length === 1 && hoveredLayerId) {
      const current = clipsRef.current.find(c => c.id === state.primaryClipId);
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
    handleSeekClick(e);
    setSelectedClipIds(new Set());
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

  // Inspector only when exactly one clip is selected.
  const selectedClip = useMemo(() => {
    if (selectedClipIds.size !== 1) return null;
    const onlyId = selectedClipIds.values().next().value as string | undefined;
    return onlyId ? clips.find(c => c.id === onlyId) ?? null : null;
  }, [selectedClipIds, clips]);

  const updateSelectedClip = (patch: Partial<LyricClipModel>) => {
    if (!selectedClip) return;
    onClipsChange(
      clips.map(c => (c.id === selectedClip.id ? { ...c, ...patch } : c))
    );
  };

  // ── Keyboard shortcuts ─────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        const editable =
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          (target as HTMLElement).isContentEditable;
        if (editable) return;
      }

      const meta = e.metaKey || e.ctrlKey;

      if (meta && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        selectAll();
        return;
      }
      if (e.key === 'Escape') {
        if (selectedIdsRef.current.size === 0) return;
        e.preventDefault();
        clearSelection();
        return;
      }

      if (selectedIdsRef.current.size === 0) return;

      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const sign = e.key === 'ArrowLeft' ? -1 : 1;
        let magnitude: number;
        if (e.altKey) magnitude = 1;
        else if (e.shiftKey) magnitude = 0.5;
        else magnitude = snapRef.current > 0 ? snapRef.current : 0.1;
        nudgeSelected(sign * magnitude);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectAll, clearSelection, nudgeSelected]);

  // ── Lyrics Offset ──────────────────────────────────────────────
  const applyOffsetInput = () => {
    const value = parseFloat(offsetInput);
    if (!Number.isFinite(value) || value === 0) return;
    offsetAllUnlocked(value);
    setOffsetInput('0');
  };

  const masterPeaks = masterChannel?.waveformPeaks ?? peaks;
  const masterIsMock = !masterPeaks || masterPeaks.length === 0;
  const hasSelection = selectedClipIds.size > 0;

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

      {/* Selection toolbar — bulk shifting & alignment. */}
      <div className="tl-selection-bar" role="toolbar" aria-label="Clip selection">
        <div className="tl-sel-group">
          <button className="tl-btn small" onClick={selectAll}>Select all</button>
          <button className="tl-btn small" onClick={selectAfterPlayhead}>
            After playhead
          </button>
          <button
            className="tl-btn small ghost"
            onClick={clearSelection}
            disabled={!hasSelection}
          >
            Clear
          </button>
        </div>

        <div className="tl-sel-stats">
          {selectionBounds ? (
            <>
              <strong>{selectionBounds.count}</strong> clip{selectionBounds.count === 1 ? '' : 's'}
              {' · '}
              <span className="tl-sel-mono">
                {formatTimecode(selectionBounds.startTime, true)}
                {' → '}
                {formatTimecode(selectionBounds.endTime, true)}
              </span>
              {' · span '}
              <span className="tl-sel-mono">
                {selectionBounds.span.toFixed(2)}s
              </span>
            </>
          ) : (
            <span className="muted">No selection</span>
          )}
        </div>

        <div className="tl-sel-group" aria-label="Nudge selected">
          <span className="tl-sel-label">Nudge</span>
          {NUDGE_STEPS.map(step => (
            <button
              key={`nudge-${step}`}
              className="tl-btn small"
              onClick={() => nudgeSelected(step)}
              disabled={!hasSelection}
              title={`Shift selected clips by ${step > 0 ? '+' : ''}${step}s`}
            >
              {step > 0 ? `+${step}` : `${step}`}
            </button>
          ))}
        </div>

        <div className="tl-sel-group tl-sel-offset" aria-label="Lyrics offset">
          <span className="tl-sel-label">Lyrics offset</span>
          <input
            type="number"
            step="0.05"
            value={offsetInput}
            onChange={(e) => setOffsetInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applyOffsetInput();
            }}
            className="tl-sel-offset-input"
            aria-label="Lyrics offset seconds"
          />
          <button
            className="tl-btn small primary"
            onClick={applyOffsetInput}
            title="Shift all unlocked clips by the value above"
          >
            Apply
          </button>
          {OFFSET_STEPS.map(step => (
            <button
              key={`offset-${step}`}
              className="tl-btn small"
              onClick={() => offsetAllUnlocked(step)}
              title={`Shift all unlocked clips by ${step > 0 ? '+' : ''}${step}s`}
            >
              {step > 0 ? `+${step}` : `${step}`}
            </button>
          ))}
        </div>
      </div>

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

          <TimelineAudioTrack
            title="Pista de audio"
            color="#53c2f0"
            duration={effectiveDuration}
            pxPerSecond={pxPerSecond}
            height={MASTER_WAVEFORM_HEIGHT}
            peaks={masterPeaks}
            badge={masterChannel ? 'master' : undefined}
            mockFallback={masterIsMock}
            onLaneClick={handleSeekClick}
          />

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
              onLaneClick={handleSeekClick}
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
                selectedClipIds={selectedClipIds}
                isDropTarget={hoveredLayerId === layer.id}
                laneRef={setLaneRef(layer.id)}
                onClipPointerDown={handleClipPointerDown}
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
