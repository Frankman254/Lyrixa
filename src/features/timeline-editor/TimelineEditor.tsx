import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LyricClip as LyricClipModel, ClipPositionPreset } from '../../core/types/clip';
import type { LyricLayer } from '../../core/types/layer';
import type { AudioPeak, AudioChannel, AudioBandMode } from '../../core/types/audio';
import {
  moveClip,
  resizeClipStart,
  resizeClipEnd,
  pxToTime
} from '../../core/timeline/clips';
import { resolveDroppedLayerId } from '../../core/timeline/clipsFromLyrics';
import {
  shiftClips,
  getSelectableClips,
  getClipsAfterTime,
  getSelectionBounds
} from '../../core/timeline/clipSelection';
import { TimelinePlayhead } from './TimelinePlayhead';
import { TimelineAudioLanes } from './TimelineAudioLanes';
import { TimelineLayerList } from './TimelineLayerList';
import { TimelineMinimap } from './TimelineMinimap';
import { TimelineSelectionToolbar } from './TimelineSelectionToolbar';
import { TimelineToolbar } from './TimelineToolbar';
import { useTimelineBandPeaks } from './useTimelineBandPeaks';
import type { ClipPointerModifiers, DragMode } from './LyricClip';
import {
  clampZoom,
  getTimelinePointerTime,
  pxPerSecondForRange,
  scrollLeftForCenteredTime,
  TRACK_HEADER_WIDTH
} from './timelineMath';
import './TimelineEditor.css';

interface TimelineEditorProps {
  clips: LyricClipModel[];
  layers: LyricLayer[];
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  trackName: string;
  masterChannel?: AudioChannel | null;
  peaks?: AudioPeak[];
  embedded?: boolean;
  /** When true, the timeline's global keyboard shortcuts are suspended (e.g. during tap-sync). */
  disableShortcuts?: boolean;
  /** Async callback to extract frequency-filtered peaks for a given band mode. */
  onExtractBandPeaks?: (mode: AudioBandMode) => Promise<AudioPeak[] | null>;
  onClipsChange: (next: LyricClipModel[]) => void;
  onLayersChange: (next: LyricLayer[]) => void;
  onSeek: (time: number) => void;
  onPlayToggle: () => void;
  onSelectionChange?: (selection: { clipId: string | null; layerId: string | null }) => void;
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
const RULER_HEIGHT = 28;

export function TimelineEditor({
  clips,
  layers,
  currentTime,
  duration,
  isPlaying,
  trackName,
  masterChannel,
  peaks,
  embedded = false,
  disableShortcuts = false,
  onExtractBandPeaks,
  onClipsChange,
  onLayersChange,
  onSeek,
  onPlayToggle,
  onSelectionChange,
  onExit
}: TimelineEditorProps) {
  const [pxPerSecond, setPxPerSecond] = useState(60);
  const [selectedClipIds, setSelectedClipIds] = useState<Set<string>>(() => new Set());
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [snapSeconds, setSnapSeconds] = useState(0);
  const [hoveredLayerId, setHoveredLayerId] = useState<string | null>(null);
  const [offsetInput, setOffsetInput] = useState<string>('0');
  /** Which frequency band to emphasize in the master waveform. */
  const [bandMode, setBandMode] = useState<AudioBandMode>(() => {
    try { return (localStorage.getItem('lyrixa_band_mode') as AudioBandMode | null) ?? 'auto'; }
    catch { return 'auto'; }
  });
  const [scrollMetrics, setScrollMetrics] = useState({ scrollLeft: 0, clientWidth: 0 });
  const [minimapVisible, setMinimapVisible] = useState(true);

  const scrollRef = useRef<HTMLDivElement>(null);
  const laneContainerRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const clipsRef = useRef<LyricClipModel[]>(clips);
  const layersRef = useRef<LyricLayer[]>(layers);
  const laneRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const selectedIdsRef = useRef<Set<string>>(selectedClipIds);
  const snapRef = useRef(snapSeconds);
  // Stable ref so the keyboard handler can call onPlayToggle without stale closure.
  const onPlayToggleRef = useRef(onPlayToggle);
  useEffect(() => { onPlayToggleRef.current = onPlayToggle; }, [onPlayToggle]);
  // Suspend timeline shortcuts while another mode (tap-sync) owns the keyboard.
  const disableShortcutsRef = useRef(disableShortcuts);
  useEffect(() => { disableShortcutsRef.current = disableShortcuts; }, [disableShortcuts]);

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
  const effectiveSelectedLayerId =
    selectedLayerId && layers.some(layer => layer.id === selectedLayerId)
      ? selectedLayerId
      : sortedLayers[0]?.id ?? null;

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

  const audioRowHeights = MASTER_WAVEFORM_HEIGHT;
  const totalTracksHeight = layers.length * TRACK_HEIGHT;
  const playheadHeight = RULER_HEIGHT + audioRowHeights + totalTracksHeight;

  const selectionBounds = useMemo(
    () => getSelectionBounds(clips, selectedClipIds),
    [clips, selectedClipIds]
  );

  // Track scroll metrics so the minimap viewport rect stays in sync.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setScrollMetrics({ scrollLeft: el.scrollLeft, clientWidth: el.clientWidth });
    update();
    el.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, []);

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

  const fitSong = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const next = pxPerSecondForRange(0, effectiveDuration, el.clientWidth, headerWidth, 24);
    setPxPerSecond(next);
    el.scrollLeft = 0;
  }, [effectiveDuration, headerWidth]);

  const fitSelection = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const bounds = getSelectionBounds(clipsRef.current, selectedIdsRef.current);
    if (!bounds || bounds.span <= 0) return;
    const padding = Math.max(0.25, bounds.span * 0.15);
    const start = Math.max(0, bounds.startTime - padding);
    const end = Math.min(effectiveDuration, bounds.endTime + padding);
    const next = pxPerSecondForRange(start, end, el.clientWidth, headerWidth, 24);
    setPxPerSecond(next);
    // Scroll so the selection sits inside the lane.
    requestAnimationFrame(() => {
      const target = el;
      if (!target) return;
      target.scrollLeft = Math.max(0, start * next);
    });
  }, [effectiveDuration, headerWidth]);

  const centerPlayhead = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = scrollLeftForCenteredTime(currentTime, pxPerSecond, el.clientWidth, headerWidth);
  }, [currentTime, pxPerSecond, headerWidth]);

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
      setSelectedLayerId(clip.layerId);

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

  const handleLayerPositionChange = useCallback(
    (layerId: string, preset: ClipPositionPreset) => {
      onLayersChange(
        layersRef.current.map(l =>
          l.id === layerId
            ? { ...l, renderSettings: { ...l.renderSettings, positionPreset: preset } }
            : l
        )
      );
    },
    [onLayersChange]
  );

  // Inspector only when exactly one clip is selected.
  const selectedClip = useMemo(() => {
    if (selectedClipIds.size !== 1) return null;
    const onlyId = selectedClipIds.values().next().value as string | undefined;
    return onlyId ? clips.find(c => c.id === onlyId) ?? null : null;
  }, [selectedClipIds, clips]);

  useEffect(() => {
    onSelectionChange?.({
      clipId: selectedClip?.id ?? null,
      layerId: effectiveSelectedLayerId
    });
  }, [effectiveSelectedLayerId, onSelectionChange, selectedClip?.id]);

  // ── Keyboard shortcuts ─────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (disableShortcutsRef.current) return;
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

      // Space = play / pause (most important transport shortcut)
      if (e.code === 'Space') {
        e.preventDefault();
        onPlayToggleRef.current();
        return;
      }

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

  const {
    displayPeaks,
    bandPeaks,
    bandPeaksLoading,
    masterIsMock
  } = useTimelineBandPeaks({
    bandMode,
    masterChannel,
    fallbackPeaks: peaks,
    onExtractBandPeaks
  });

  // ── Lyrics Offset ──────────────────────────────────────────────
  const applyOffsetInput = () => {
    const value = parseFloat(offsetInput);
    if (!Number.isFinite(value) || value === 0) return;
    offsetAllUnlocked(value);
    setOffsetInput('0');
  };

  const hasSelection = selectedClipIds.size > 0;

  return (
    <div className="timeline-editor">
      <TimelineToolbar
        embedded={embedded}
        trackName={trackName}
        currentTime={currentTime}
        duration={effectiveDuration}
        isPlaying={isPlaying}
        pxPerSecond={pxPerSecond}
        masterChannel={masterChannel}
        bandMode={bandMode}
        snapSeconds={snapSeconds}
        onPlayToggle={onPlayToggle}
        onZoomOut={zoomOut}
        onZoomIn={zoomIn}
        onFitSong={fitSong}
        onFitSelection={fitSelection}
        onCenterPlayhead={centerPlayhead}
        fitSelectionEnabled={selectedClipIds.size > 0}
        onBandModeChange={(next) => {
          setBandMode(next);
          try { localStorage.setItem('lyrixa_band_mode', next); } catch { /* ignore */ }
        }}
        onSnapSecondsChange={setSnapSeconds}
        onExit={onExit}
      />

      <TimelineSelectionToolbar
        hasSelection={hasSelection}
        selectionBounds={selectionBounds}
        offsetInput={offsetInput}
        onSelectAll={selectAll}
        onSelectAfterPlayhead={selectAfterPlayhead}
        onClearSelection={clearSelection}
        onNudgeSelected={nudgeSelected}
        onOffsetInputChange={setOffsetInput}
        onApplyOffsetInput={applyOffsetInput}
        onOffsetAllUnlocked={offsetAllUnlocked}
      />

      {minimapVisible && (
        <TimelineMinimap
          duration={effectiveDuration}
          clips={clips}
          layers={layers}
          pxPerSecond={pxPerSecond}
          scrollLeft={scrollMetrics.scrollLeft}
          viewportPx={scrollMetrics.clientWidth}
          headerPx={headerWidth}
          currentTime={currentTime}
          onSeek={onSeek}
          onScrollTo={(left) => {
            const el = scrollRef.current;
            if (el) el.scrollLeft = left;
          }}
        />
      )}
      <button
        type="button"
        className="tl-btn small ghost"
        style={{ alignSelf: 'flex-end', margin: '4px 12px' }}
        onClick={() => setMinimapVisible(v => !v)}
        title="Toggle minimap overview"
      >
        {minimapVisible ? 'Hide minimap' : 'Show minimap'}
      </button>

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
          <TimelineAudioLanes
            duration={effectiveDuration}
            pxPerSecond={pxPerSecond}
            laneWidth={laneWidth}
            rulerHeight={RULER_HEIGHT}
            masterHeight={MASTER_WAVEFORM_HEIGHT}
            bandMode={bandMode}
            bandPeaksLoading={bandPeaksLoading}
            masterChannel={masterChannel}
            displayPeaks={displayPeaks}
            bandPeaks={bandPeaks}
            masterIsMock={masterIsMock}
            onRulerClick={handleRulerClick}
            onLaneClick={handleSeekClick}
          />

          <div className="tl-tracks" onClick={handleLaneBackgroundClick}>
            <TimelineLayerList
              layers={sortedLayers}
              clipsByLayer={clipsByLayer}
              pxPerSecond={pxPerSecond}
              duration={effectiveDuration}
              trackHeight={TRACK_HEIGHT}
              selectedClipIds={selectedClipIds}
              selectedLayerId={effectiveSelectedLayerId}
              hoveredLayerId={hoveredLayerId}
              setLaneRef={setLaneRef}
              onClipPointerDown={handleClipPointerDown}
              onLayerToggleVisible={toggleLayerVisible}
              onLayerToggleLocked={toggleLayerLocked}
              onLayerPositionChange={handleLayerPositionChange}
              onLayerSelect={setSelectedLayerId}
            />
          </div>

          <TimelinePlayhead
            currentTime={currentTime}
            pxPerSecond={pxPerSecond}
            height={playheadHeight}
            offsetLeft={headerWidth}
          />
        </div>
      </div>

    </div>
  );
}
