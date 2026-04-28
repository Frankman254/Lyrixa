import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { LyricClip as LyricClipModel, ClipPositionPreset } from '../../core/types/clip';
import type { LyricLayer, LyricLayerType } from '../../core/types/layer';
import type { AudioPeak, AudioChannel, AudioBandMode } from '../../core/types/audio';
import type { LyricActiveAnimationPreset, LyricFxPreset, LyricTransitionPreset } from '../../core/types/render';
import {
  DEFAULT_CLIP_PROGRESS_INDICATOR,
  DEFAULT_LYRIC_ANIMATION,
  DEFAULT_LYRIC_FX,
  DEFAULT_LYRIC_STYLE,
  resolveClipProgressIndicator,
  resolveLyricAnimation,
  resolveLyricFx,
  resolveLyricStyle
} from '../../core/types/render';
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
import { FloatingPanel } from '../../shared/components/FloatingPanel';
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
  /** Already-decoded peaks from the vocals stem. Used for vocals + instrumental band modes. */
  vocalsBandPeaks?: AudioPeak[] | null;
  /** Async callback to extract frequency-filtered peaks for a given band mode. */
  onExtractBandPeaks?: (mode: AudioBandMode) => Promise<AudioPeak[] | null>;
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

const BAND_MODE_COLORS: Record<AudioBandMode, string> = {
  'auto':         '#53c2f0',
  'full-mix':     '#53c2f0',
  'vocals':       '#5fc88e',
  'instrumental': '#e6a86a',
  'bass':         '#e65e8f',
  'kick':         '#e55252',
  'hihat':        '#a88ee6',
};

function getBandBadge(
  mode: AudioBandMode,
  source: 'master' | 'vocals-stem' | 'estimated',
  loading: boolean,
  hasMasterFile: boolean
): string | undefined {
  if (loading) return 'analyzing…';
  switch (mode) {
    case 'auto':
    case 'full-mix':
      return hasMasterFile ? undefined : 'mock';
    case 'vocals':
      return source === 'vocals-stem' ? 'Vocals Stem' : 'Est. Vocals';
    case 'instrumental':
      return source === 'master' ? 'Instrumental ≈' : 'Est. Instrumental';
    case 'bass':    return 'Bass Band';
    case 'kick':    return 'Kick Band';
    case 'hihat':   return 'Hi-Hat Band';
  }
}

function subtractPeaks(master: AudioPeak[], vocals: AudioPeak[]): AudioPeak[] {
  return master.map((p, i) => ({
    time: p.time,
    amplitude: Math.max(0, p.amplitude - (vocals[i]?.amplitude ?? 0) * 0.8)
  }));
}

const NUDGE_STEPS = [-1, -0.5, -0.1, 0.1, 0.5, 1];
const OFFSET_STEPS = [-1, -0.5, -0.1, 0.1, 0.5, 1];
const LAYER_TYPE_OPTIONS: { value: LyricLayerType; label: string }[] = [
  { value: 'lyrics', label: 'Lyrics' },
  { value: 'backing', label: 'Backing' },
  { value: 'fx', label: 'FX' },
  { value: 'annotation', label: 'Annotation' }
];
const TRANSITION_OPTIONS: { value: LyricTransitionPreset; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'fade', label: 'Fade in' },
  { value: 'slide-up', label: 'Slide up' },
  { value: 'scale-in', label: 'Scale in' },
  { value: 'blur-in', label: 'Blur in' },
  { value: 'glitch-in', label: 'Glitch in' },
  { value: 'fade-out', label: 'Fade out' },
  { value: 'blur-out', label: 'Blur out' },
  { value: 'glitch-out', label: 'Glitch out' }
];
const ACTIVE_ANIMATION_OPTIONS: { value: LyricActiveAnimationPreset; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'pulse', label: 'Pulse' },
  { value: 'glow-pulse', label: 'Glow pulse' },
  { value: 'breathing', label: 'Breathing' },
  { value: 'shake-light', label: 'Shake light' },
  { value: 'wave', label: 'Wave' },
  { value: 'flicker', label: 'Flicker' }
];
const FX_OPTIONS: { value: LyricFxPreset; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'neon-glow', label: 'Neon glow' },
  { value: 'soft-bloom', label: 'Soft bloom' },
  { value: 'prism-shader', label: 'Prism shader' },
  { value: 'liquid-shimmer', label: 'Liquid shimmer' },
  { value: 'heat-haze', label: 'Heat haze' },
  { value: 'rgb-shift', label: 'RGB shift' },
  { value: 'glitch', label: 'Glitch' },
  { value: 'scanline', label: 'Scanline' },
  { value: 'blur-flicker', label: 'Blur flicker' },
  { value: 'shadow-trail', label: 'Shadow trail' },
  { value: 'energy-pulse', label: 'Energy pulse' }
];

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
  vocalsBandPeaks,
  onExtractBandPeaks,
  onClipsChange,
  onLayersChange,
  onSeek,
  onPlayToggle,
  onExit
}: TimelineEditorProps) {
  const [pxPerSecond, setPxPerSecond] = useState(60);
  const [selectedClipIds, setSelectedClipIds] = useState<Set<string>>(() => new Set());
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [snapSeconds, setSnapSeconds] = useState(0);
  const [hoveredLayerId, setHoveredLayerId] = useState<string | null>(null);
  const [offsetInput, setOffsetInput] = useState<string>('0');
  /** Which audio waveform rows to display. */
  const [waveformView, setWaveformView] = useState<'master' | 'vocals' | 'both'>('both');
  /** Which frequency band to emphasize in the master waveform. */
  const [bandMode, setBandMode] = useState<AudioBandMode>(() => {
    try { return (localStorage.getItem('lyrixa_band_mode') as AudioBandMode | null) ?? 'auto'; }
    catch { return 'auto'; }
  });
  const [bandPeaks, setBandPeaks] = useState<AudioPeak[] | null>(null);
  const [bandPeaksLoading, setBandPeaksLoading] = useState(false);
  const [bandPeaksSource, setBandPeaksSource] = useState<'master' | 'vocals-stem' | 'estimated'>('master');

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

  useEffect(() => {
    if (selectedLayerId && layers.some(layer => layer.id === selectedLayerId)) return;
    setSelectedLayerId(sortedLayers[0]?.id ?? null);
  }, [layers, selectedLayerId, sortedLayers]);

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

  const selectedClipLayer = useMemo(
    () => selectedClip ? layers.find(l => l.id === selectedClip.layerId) ?? null : null,
    [layers, selectedClip]
  );

  const selectedLayer = useMemo(
    () => selectedLayerId ? layers.find(l => l.id === selectedLayerId) ?? null : null,
    [layers, selectedLayerId]
  );

  const updateSelectedClip = (patch: Partial<LyricClipModel>) => {
    if (!selectedClip) return;
    onClipsChange(
      clips.map(c => (c.id === selectedClip.id ? { ...c, ...patch } : c))
    );
  };

  const updateSelectedLayer = (patch: Partial<LyricLayer>) => {
    if (!selectedLayer) return;
    onLayersChange(
      layers.map(l => (l.id === selectedLayer.id ? { ...l, ...patch } : l))
    );
  };

  const updateSelectedLayerRenderSettings = (patch: Partial<NonNullable<LyricLayer['renderSettings']>>) => {
    if (!selectedLayer) return;
    updateSelectedLayer({
      renderSettings: {
        positionPreset: selectedLayer.renderSettings?.positionPreset ?? 'center',
        ...selectedLayer.renderSettings,
        ...patch
      }
    });
  };

  const updateClipStyleOverride = (patch: Partial<NonNullable<LyricClipModel['styleOverride']>>) => {
    if (!selectedClip) return;
    updateSelectedClip({
      styleOverride: { ...(selectedClip.styleOverride ?? {}), ...patch }
    });
  };

  const updateLayerStyle = (patch: NonNullable<LyricLayer['style']>) => {
    if (!selectedLayer) return;
    updateSelectedLayer({
      styleDefaults: { ...(selectedLayer.styleDefaults ?? selectedLayer.style ?? {}), ...patch }
    });
  };

  const updateClipAnimationOverride = (patch: Partial<NonNullable<LyricClipModel['animationOverride']>>) => {
    if (!selectedClip) return;
    updateSelectedClip({
      animationOverride: { ...(selectedClip.animationOverride ?? {}), ...patch }
    });
  };

  const updateLayerAnimation = (patch: NonNullable<LyricLayer['animation']>) => {
    if (!selectedLayer) return;
    updateSelectedLayer({
      animationDefaults: { ...(selectedLayer.animationDefaults ?? selectedLayer.animation ?? {}), ...patch }
    });
  };

  const updateClipFxOverride = (patch: Partial<NonNullable<LyricClipModel['fxOverride']>>) => {
    if (!selectedClip) return;
    updateSelectedClip({
      fxOverride: { ...(selectedClip.fxOverride ?? {}), ...patch }
    });
  };

  const updateClipProgressOverride = (patch: Partial<NonNullable<LyricClipModel['progressIndicatorOverride']>>) => {
    if (!selectedClip) return;
    updateSelectedClip({
      progressIndicatorOverride: { ...(selectedClip.progressIndicatorOverride ?? {}), ...patch }
    });
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

  // ── Band Mode peak extraction ──────────────────────────────────
  const masterPeaks = masterChannel?.waveformPeaks ?? peaks;

  useEffect(() => {
    if (bandMode === 'auto' || bandMode === 'full-mix') {
      setBandPeaks(null);
      setBandPeaksSource('master');
      setBandPeaksLoading(false);
      return;
    }

    // Vocals — prefer real stem, fall back to offline estimation.
    if (bandMode === 'vocals' && vocalsBandPeaks && vocalsBandPeaks.length > 0) {
      setBandPeaks(vocalsBandPeaks);
      setBandPeaksSource('vocals-stem');
      setBandPeaksLoading(false);
      return;
    }

    // Instrumental — subtract vocals stem from master when both are decoded.
    if (
      bandMode === 'instrumental' &&
      vocalsBandPeaks && vocalsBandPeaks.length > 0 &&
      masterPeaks && masterPeaks.length > 0
    ) {
      setBandPeaks(subtractPeaks(masterPeaks, vocalsBandPeaks));
      setBandPeaksSource('master');
      setBandPeaksLoading(false);
      return;
    }

    if (!onExtractBandPeaks) {
      setBandPeaks(null);
      setBandPeaksLoading(false);
      return;
    }

    let cancelled = false;
    setBandPeaksLoading(true);
    onExtractBandPeaks(bandMode)
      .then(extracted => {
        if (cancelled) return;
        setBandPeaks(extracted ?? null);
        const isEstimated = bandMode === 'vocals' || bandMode === 'instrumental';
        setBandPeaksSource(isEstimated ? 'estimated' : 'master');
      })
      .catch(() => { if (!cancelled) setBandPeaks(null); })
      .finally(() => { if (!cancelled) setBandPeaksLoading(false); });

    return () => { cancelled = true; };
  // masterPeaks?.length ensures re-run once master audio is decoded.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bandMode, masterChannel?.fileName, vocalsBandPeaks, onExtractBandPeaks, masterPeaks?.length]);

  // ── Lyrics Offset ──────────────────────────────────────────────
  const applyOffsetInput = () => {
    const value = parseFloat(offsetInput);
    if (!Number.isFinite(value) || value === 0) return;
    offsetAllUnlocked(value);
    setOffsetInput('0');
  };

  const masterIsMock = !masterPeaks || masterPeaks.length === 0;
  const displayPeaks = (bandMode === 'auto' || bandMode === 'full-mix')
    ? masterPeaks
    : (bandPeaks ?? masterPeaks);
  const hasSelection = selectedClipIds.size > 0;
  const inspectorStyle = selectedClip
    ? resolveLyricStyle(DEFAULT_LYRIC_STYLE, selectedClipLayer?.styleDefaults ?? selectedClipLayer?.style, selectedClip.styleOverride)
    : DEFAULT_LYRIC_STYLE;
  const inspectorLayerStyle = selectedLayer
    ? resolveLyricStyle(DEFAULT_LYRIC_STYLE, selectedLayer.styleDefaults ?? selectedLayer.style)
    : DEFAULT_LYRIC_STYLE;
  const inspectorAnimation = selectedClip
    ? resolveLyricAnimation(DEFAULT_LYRIC_ANIMATION, selectedClipLayer?.animationDefaults ?? selectedClipLayer?.animation, {
        ...selectedClip.animationOverride,
        transitionIn: selectedClip.transitionIn,
        transitionOut: selectedClip.transitionOut
      })
    : DEFAULT_LYRIC_ANIMATION;
  const inspectorFx = selectedClip
    ? resolveLyricFx(DEFAULT_LYRIC_FX, selectedClipLayer?.fxDefaults ?? selectedClipLayer?.fx, selectedClip.fxOverride)
    : DEFAULT_LYRIC_FX;
  const inspectorLayerFx = selectedLayer
    ? resolveLyricFx(DEFAULT_LYRIC_FX, selectedLayer.fxDefaults ?? selectedLayer.fx)
    : DEFAULT_LYRIC_FX;
  const inspectorProgress = selectedClip
    ? resolveClipProgressIndicator(
        DEFAULT_CLIP_PROGRESS_INDICATOR,
        selectedClipLayer?.progressIndicatorDefaults ?? selectedClipLayer?.progressIndicator,
        selectedClip.progressIndicatorOverride
      )
    : DEFAULT_CLIP_PROGRESS_INDICATOR;

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
          <button
            className={`tl-btn tl-play-btn ${isPlaying ? 'active' : ''}`}
            onClick={onPlayToggle}
            title="Play / Pause  (Space)"
          >
            {isPlaying ? '⏸' : '▶'}
          </button>
          <div className="tl-zoom">
            <button className="tl-btn small" onClick={zoomOut} title="Zoom out">−</button>
            <span className="tl-zoom-value">{Math.round(pxPerSecond)} px/s</span>
            <button className="tl-btn small" onClick={zoomIn} title="Zoom in">+</button>
          </div>
          {masterChannel && (
            <label className="tl-snap">
              Band
              <select
                value={bandMode}
                onChange={(e) => {
                  const next = e.target.value as AudioBandMode;
                  setBandMode(next);
                  try { localStorage.setItem('lyrixa_band_mode', next); } catch { /* ignore */ }
                }}
                title="Waveform band mode — which frequency range to emphasize in the master lane"
              >
                <option value="auto">Auto</option>
                <option value="full-mix">Full Mix</option>
                <option value="vocals">Vocals</option>
                <option value="instrumental">Instrumental</option>
                <option value="bass">Bass</option>
                <option value="kick">Kick</option>
                <option value="hihat">Hi-Hat</option>
              </select>
            </label>
          )}
          {(masterChannel || vocalsChannel) && (
            <label className="tl-snap">
              Waves
              <select
                value={waveformView}
                onChange={(e) => setWaveformView(e.target.value as typeof waveformView)}
                title="Which waveform rows to show"
              >
                <option value="both">Both</option>
                <option value="master">Master</option>
                {vocalsChannel && <option value="vocals">Vocals</option>}
              </select>
            </label>
          )}
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

          {(waveformView === 'master' || waveformView === 'both') && (
            <TimelineAudioTrack
              title="Master track"
              color={BAND_MODE_COLORS[bandMode]}
              duration={effectiveDuration}
              pxPerSecond={pxPerSecond}
              height={MASTER_WAVEFORM_HEIGHT}
              peaks={displayPeaks}
              badge={getBandBadge(bandMode, bandPeaksSource, bandPeaksLoading, !!masterChannel?.fileName)}
              mockFallback={masterIsMock && !bandPeaks && !bandPeaksLoading}
              onLaneClick={handleSeekClick}
            />
          )}

          {vocalsChannel && (waveformView === 'vocals' || waveformView === 'both') && (
            <TimelineAudioTrack
              title="Vocals stem"
              color="#5fc88e"
              duration={effectiveDuration}
              pxPerSecond={pxPerSecond}
              height={VOCALS_WAVEFORM_HEIGHT}
              peaks={vocalsChannel.waveformPeaks}
              vocalActivity={vocalsChannel.vocalActivity}
              badge={
                vocalsChannel.vocalActivity?.length
                  ? `${vocalsChannel.vocalActivity.length} vocal segments`
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
                selectedLayer={selectedLayerId === layer.id}
                isDropTarget={hoveredLayerId === layer.id}
                laneRef={setLaneRef(layer.id)}
                onClipPointerDown={handleClipPointerDown}
                onLayerToggleVisible={toggleLayerVisible}
                onLayerToggleLocked={toggleLayerLocked}
                onLayerPositionChange={handleLayerPositionChange}
                onLayerSelect={setSelectedLayerId}
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
        <FloatingPanel
          storageKey="lyrixa_clip_inspector_pos"
          defaultPosition={{ x: window.innerWidth - 310, y: 120 }}
          width={290}
          title="Clip inspector"
          onClose={() => setSelectedClipIds(new Set())}
        >
          <div className="tl-inspector-body">
            <InspectorSection title="Text" defaultOpen>
              <label>Text<textarea className="form-control form-input" rows={2} value={selectedClip.text} onChange={(e) => updateSelectedClip({ text: e.target.value })} /></label>
            </InspectorSection>

            <InspectorSection title="Timing" defaultOpen>
              <div className="tl-inspector-row">
                <label>
                  Start
                  <input className="form-control form-input" type="number" step="0.01" min={0} value={Number(selectedClip.startTime.toFixed(2))} onChange={(e) => {
                    const next = parseFloat(e.target.value);
                    if (!Number.isFinite(next)) return;
                    updateSelectedClip({ startTime: Math.max(0, Math.min(selectedClip.endTime - 0.25, next)) });
                  }} />
                </label>
                <label>
                  End
                  <input className="form-control form-input" type="number" step="0.01" min={0} value={Number(selectedClip.endTime.toFixed(2))} onChange={(e) => {
                    const next = parseFloat(e.target.value);
                    if (!Number.isFinite(next)) return;
                    updateSelectedClip({ endTime: Math.max(selectedClip.startTime + 0.25, next) });
                  }} />
                </label>
              </div>
            </InspectorSection>

            <InspectorSection title="Layer" defaultOpen>
              <label>
                Assigned layer
                <select className="form-control form-select" value={selectedClip.layerId} onChange={(e) => {
                  updateSelectedClip({ layerId: e.target.value });
                  setSelectedLayerId(e.target.value);
                }}>
                  {layers.map(l => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </label>
            </InspectorSection>

            <InspectorSection title="Position">
              <label>
                Position override
                <select className="form-control form-select" value={selectedClip.position ?? 'center'} onChange={(e) => updateSelectedClip({ position: e.target.value as ClipPositionPreset })}>
                  <option value="center">Layer default</option>
                  <option value="top">Top</option>
                  <option value="bottom">Bottom</option>
                  <option value="top-left">Top left</option>
                  <option value="top-right">Top right</option>
                  <option value="bottom-left">Bottom left</option>
                  <option value="bottom-right">Bottom right</option>
                </select>
              </label>
            </InspectorSection>

            <InspectorSection title="Style">
              <label className="tl-inline-check"><input type="checkbox" checked={!!selectedClip.styleOverride} onChange={(e) => updateSelectedClip({ styleOverride: e.target.checked ? {} : undefined })} />Override layer style</label>
              {selectedClip.styleOverride && (
                <>
                  <div className="tl-inspector-row">
                    <label>Font size<input className="form-control form-input" type="number" step="0.1" min={0.5} value={parseFloat(inspectorStyle.fontSize) || 2.5} onChange={(e) => updateClipStyleOverride({ fontSize: `${e.target.value}rem` })} /></label>
                    <label>Text color<input className="form-color" type="color" value={toColorInput(inspectorStyle.textColor)} onChange={(e) => updateClipStyleOverride({ textColor: e.target.value, activeTextColor: e.target.value })} /></label>
                  </div>
                  <label>Opacity<input className="form-range" type="range" min={0} max={1} step={0.05} value={inspectorStyle.opacity} onChange={(e) => updateClipStyleOverride({ opacity: parseFloat(e.target.value) })} /></label>
                  <label>Glow intensity<input className="form-range" type="range" min={0} max={2} step={0.05} value={inspectorStyle.glowIntensity} onChange={(e) => updateClipStyleOverride({ glowIntensity: parseFloat(e.target.value) })} /></label>
                  <label>Blur amount<input className="form-range" type="range" min={0} max={16} step={0.5} value={inspectorStyle.blurAmount} onChange={(e) => updateClipStyleOverride({ blurAmount: parseFloat(e.target.value) })} /></label>
                  <div className="tl-inspector-row">
                    <label>Outline width<input className="form-control form-input" type="number" min={0} max={8} step={0.25} value={inspectorStyle.strokeWidth} onChange={(e) => updateClipStyleOverride({ strokeWidth: parseFloat(e.target.value) || 0 })} /></label>
                    <label>Outline color<input className="form-color" type="color" value={toColorInput(inspectorStyle.strokeColor)} onChange={(e) => updateClipStyleOverride({ strokeColor: e.target.value })} /></label>
                  </div>
                </>
              )}
            </InspectorSection>

            <InspectorSection title="Animation">
              <label className="tl-inline-check"><input type="checkbox" checked={!!selectedClip.animationOverride} onChange={(e) => updateSelectedClip({ animationOverride: e.target.checked ? {} : undefined })} />Override layer animation</label>
              <div className="tl-inspector-row">
                <label>
                  In
                  <select className="form-control form-select" value={selectedClip.transitionIn} onChange={(e) => updateSelectedClip({ transitionIn: e.target.value as LyricClipModel['transitionIn'] })}>
                    {TRANSITION_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Out
                  <select className="form-control form-select" value={selectedClip.transitionOut} onChange={(e) => updateSelectedClip({ transitionOut: e.target.value as LyricClipModel['transitionOut'] })}>
                    {TRANSITION_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </label>
              </div>
              {selectedClip.animationOverride && (
                <label>Active animation<select className="form-control form-select" value={inspectorAnimation.activeAnimation} onChange={(e) => updateClipAnimationOverride({ activeAnimation: e.target.value as LyricActiveAnimationPreset })}>{ACTIVE_ANIMATION_OPTIONS.map(o => (<option key={o.value} value={o.value}>{o.label}</option>))}</select></label>
              )}
            </InspectorSection>

            <InspectorSection title="FX">
              <label className="tl-inline-check"><input type="checkbox" checked={!!selectedClip.fxOverride} onChange={(e) => updateSelectedClip({ fxOverride: e.target.checked ? {} : undefined })} />Override layer FX</label>
              {selectedClip.fxOverride && (
                <>
                  <label>FX preset<select className="form-control form-select" value={inspectorFx.preset} onChange={(e) => {
                    const preset = e.target.value as LyricFxPreset;
                    updateClipFxOverride({ preset, enabled: preset !== 'none' });
                  }}>{FX_OPTIONS.map(o => (<option key={o.value} value={o.value}>{o.label}</option>))}</select></label>
                  <label>FX intensity<input className="form-range" type="range" min={0} max={2} step={0.05} value={inspectorFx.intensity} onChange={(e) => updateClipFxOverride({ intensity: parseFloat(e.target.value), enabled: inspectorFx.preset !== 'none' })} /></label>
                </>
              )}
              <label className="tl-inline-check"><input type="checkbox" checked={!!selectedClip.progressIndicatorOverride} onChange={(e) => updateSelectedClip({ progressIndicatorOverride: e.target.checked ? { enabled: true } : undefined })} />Override progress dot</label>
              {selectedClip.progressIndicatorOverride && (
                <label className="tl-inline-check"><input type="checkbox" checked={inspectorProgress.enabled} onChange={(e) => updateClipProgressOverride({ enabled: e.target.checked })} />Show clip progress dot</label>
              )}
            </InspectorSection>

            <InspectorSection title="Advanced">
              <div className="tl-inspector-row">
                <label className="tl-inline-check">
                  <input
                    type="checkbox"
                    checked={!!selectedClip.muted}
                    onChange={(e) => updateSelectedClip({ muted: e.target.checked })}
                  />
                  Mute
                </label>
                <label className="tl-inline-check">
                  <input
                    type="checkbox"
                    checked={!!selectedClip.locked}
                    onChange={(e) => updateSelectedClip({ locked: e.target.checked })}
                  />
                  Lock
                </label>
              </div>
              <button
                className="tl-btn small ghost"
                onClick={() => updateSelectedClip({
                  styleOverride: undefined,
                  animationOverride: undefined,
                  fxOverride: undefined,
                  progressIndicatorOverride: undefined
                })}
              >
                Clear clip overrides
              </button>
            </InspectorSection>
          </div>
        </FloatingPanel>
      )}

      {selectedLayer && (
        <FloatingPanel
          storageKey="lyrixa_layer_inspector_pos"
          defaultPosition={{ x: window.innerWidth - 620, y: 120 }}
          width={300}
          title="Layer inspector"
          onClose={() => setSelectedLayerId(null)}
        >
          <div className="tl-inspector-body">
            <InspectorSection title="Layer" defaultOpen>
              <label>Layer type<select className="form-control form-select" value={selectedLayer.layerType} onChange={(e) => updateSelectedLayer({ layerType: e.target.value as LyricLayerType })}>{LAYER_TYPE_OPTIONS.map(o => (<option key={o.value} value={o.value}>{o.label}</option>))}</select></label>
              <div className="tl-inspector-row">
                <label className="tl-inline-check"><input type="checkbox" checked={selectedLayer.visible} onChange={(e) => updateSelectedLayer({ visible: e.target.checked })} />Visible</label>
                <label className="tl-inline-check"><input type="checkbox" checked={selectedLayer.locked} onChange={(e) => updateSelectedLayer({ locked: e.target.checked })} />Locked</label>
              </div>
              <label>Z-index<input className="form-control form-input" type="number" step="1" value={selectedLayer.renderSettings?.zIndex ?? 0} onChange={(e) => {
                const next = parseInt(e.target.value, 10);
                if (Number.isFinite(next)) updateSelectedLayerRenderSettings({ zIndex: next });
              }} /></label>
            </InspectorSection>

            <InspectorSection title="Position" defaultOpen>
              <label>Default position<select className="form-control form-select" value={selectedLayer.renderSettings?.positionPreset ?? 'center'} onChange={(e) => updateSelectedLayerRenderSettings({ positionPreset: e.target.value as ClipPositionPreset })}>
                <option value="center">Center</option>
                <option value="top">Top</option>
                <option value="bottom">Bottom</option>
                <option value="top-left">Top left</option>
                <option value="top-right">Top right</option>
                <option value="bottom-left">Bottom left</option>
                <option value="bottom-right">Bottom right</option>
              </select></label>
            </InspectorSection>

            <InspectorSection title="Style" defaultOpen>
              <div className="tl-inspector-row">
                <label>Font size<input className="form-control form-input" type="number" step="0.1" min={0.5} value={parseFloat(inspectorLayerStyle.fontSize) || 2.5} onChange={(e) => updateLayerStyle({ fontSize: `${e.target.value}rem` })} /></label>
                <label>Text color<input className="form-color" type="color" value={toColorInput(inspectorLayerStyle.textColor)} onChange={(e) => updateLayerStyle({ textColor: e.target.value, activeTextColor: e.target.value })} /></label>
              </div>
              <label>Opacity<input className="form-range" type="range" min={0} max={1} step={0.05} value={inspectorLayerStyle.opacity} onChange={(e) => updateLayerStyle({ opacity: parseFloat(e.target.value) })} /></label>
              <label>Glow intensity<input className="form-range" type="range" min={0} max={2} step={0.05} value={inspectorLayerStyle.glowIntensity} onChange={(e) => updateLayerStyle({ glowIntensity: parseFloat(e.target.value) })} /></label>
              <label>Blur amount<input className="form-range" type="range" min={0} max={16} step={0.5} value={inspectorLayerStyle.blurAmount} onChange={(e) => updateLayerStyle({ blurAmount: parseFloat(e.target.value) })} /></label>
              <div className="tl-inspector-row">
                <label>Outline width<input className="form-control form-input" type="number" min={0} max={8} step={0.25} value={inspectorLayerStyle.strokeWidth} onChange={(e) => updateLayerStyle({ strokeWidth: parseFloat(e.target.value) || 0 })} /></label>
                <label>Outline color<input className="form-color" type="color" value={toColorInput(inspectorLayerStyle.strokeColor)} onChange={(e) => updateLayerStyle({ strokeColor: e.target.value })} /></label>
              </div>
            </InspectorSection>

            <InspectorSection title="Animation">
              <label>Default active animation<select className="form-control form-select" value={resolveLyricAnimation(DEFAULT_LYRIC_ANIMATION, selectedLayer.animationDefaults ?? selectedLayer.animation).activeAnimation} onChange={(e) => updateLayerAnimation({ activeAnimation: e.target.value as LyricActiveAnimationPreset })}>{ACTIVE_ANIMATION_OPTIONS.map(o => (<option key={o.value} value={o.value}>{o.label}</option>))}</select></label>
              <div className="tl-inspector-row">
                <label>In<select className="form-control form-select" value={resolveLyricAnimation(DEFAULT_LYRIC_ANIMATION, selectedLayer.animationDefaults ?? selectedLayer.animation).transitionIn} onChange={(e) => updateLayerAnimation({ transitionIn: e.target.value as LyricTransitionPreset })}>{TRANSITION_OPTIONS.map(o => (<option key={o.value} value={o.value}>{o.label}</option>))}</select></label>
                <label>Out<select className="form-control form-select" value={resolveLyricAnimation(DEFAULT_LYRIC_ANIMATION, selectedLayer.animationDefaults ?? selectedLayer.animation).transitionOut} onChange={(e) => updateLayerAnimation({ transitionOut: e.target.value as LyricTransitionPreset })}>{TRANSITION_OPTIONS.map(o => (<option key={o.value} value={o.value}>{o.label}</option>))}</select></label>
              </div>
            </InspectorSection>

            <InspectorSection title="FX">
              <label>Default FX<select className="form-control form-select" value={inspectorLayerFx.preset} onChange={(e) => {
                const preset = e.target.value as LyricFxPreset;
                updateSelectedLayer({ fxDefaults: { ...(selectedLayer.fxDefaults ?? selectedLayer.fx ?? {}), preset, enabled: preset !== 'none' } });
              }}>{FX_OPTIONS.map(o => (<option key={o.value} value={o.value}>{o.label}</option>))}</select></label>
              <label>FX intensity<input className="form-range" type="range" min={0} max={2} step={0.05} value={inspectorLayerFx.intensity} onChange={(e) => updateSelectedLayer({ fxDefaults: { ...(selectedLayer.fxDefaults ?? selectedLayer.fx ?? {}), intensity: parseFloat(e.target.value), enabled: inspectorLayerFx.preset !== 'none' } })} /></label>
              <label className="tl-inline-check"><input type="checkbox" checked={resolveClipProgressIndicator(DEFAULT_CLIP_PROGRESS_INDICATOR, selectedLayer.progressIndicatorDefaults ?? selectedLayer.progressIndicator).enabled} onChange={(e) => updateSelectedLayer({ progressIndicatorDefaults: { ...(selectedLayer.progressIndicatorDefaults ?? selectedLayer.progressIndicator ?? {}), enabled: e.target.checked } })} />Show progress dot by default</label>
            </InspectorSection>
          </div>
        </FloatingPanel>
      )}
    </div>
  );
}

function InspectorSection({
  title,
  defaultOpen = false,
  children
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="tl-inspector-section">
      <button
        type="button"
        className="tl-inspector-section-toggle"
        onClick={() => setOpen(value => !value)}
      >
        <span>{title}</span>
        <span aria-hidden>{open ? 'v' : '>'}</span>
      </button>
      {open && <div className="tl-inspector-section-body">{children}</div>}
    </section>
  );
}

function toColorInput(color: string): string {
  if (/^#[0-9a-f]{6}$/i.test(color)) return color;
  if (/^#[0-9a-f]{3}$/i.test(color)) {
    const [, r, g, b] = color.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i) ?? [];
    return r && g && b ? `#${r}${r}${g}${g}${b}${b}` : '#ffffff';
  }
  return '#ffffff';
}
