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
  getClipsInBox,
  getSelectionBounds,
  withLinkedClips
} from '../../core/timeline/clipSelection';
import {
  applyPlayheadEdit,
  insertClipsAt,
  linesFromPastedText,
  mergeClips,
  setClipText,
  type PlayheadEdit
} from '../../core/timeline/clipEditing';
import { duplicateClipSelection } from '../../core/timeline/duplicateClips';
import { TimelinePlayhead } from './TimelinePlayhead';
import { TimelineAudioLanes } from './TimelineAudioLanes';
import { TimelineLayerList } from './TimelineLayerList';
import { TimelineMinimap } from './TimelineMinimap';
import { TimelineSelectionToolbar } from './TimelineSelectionToolbar';
import { TimelineToolbar } from './TimelineToolbar';
import { useTimelineBandPeaks } from './useTimelineBandPeaks';
import { useShortcuts } from '../shortcuts/useShortcuts';
import { syncDebug } from '../sync/syncDebug';
import type { ClipPointerModifiers, DragMode } from './LyricClip';
import type {
  CompositionScore,
  CompositionTrackV2,
  VibrixAuthoringManifest
} from '../../core/composition/types';
import { sortCompositionTracksForTimeline } from '../../core/composition/timeline';
import { CompositionTrackLane } from './CompositionTrackLane';
import { SustainedCompositionTrackLane } from './SustainedCompositionTrackLane';
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
  focusRequest?: { time: number; nonce: number } | null;
  trackName: string;
  masterChannel?: AudioChannel | null;
  peaks?: AudioPeak[];
  embedded?: boolean;
  /** When true, the timeline's global keyboard shortcuts are suspended (e.g. during tap-sync). */
  disableShortcuts?: boolean;
  /** When false, the audio lane stays usable for seeking but skips waveform rendering/extraction. */
  waveformEnabled?: boolean;
  /** True when the master track is too long/large for full waveform analysis. */
  isLongAudio?: boolean;
  /** Async callback to extract frequency-filtered peaks for a given band mode. */
  onExtractBandPeaks?: (mode: AudioBandMode) => Promise<AudioPeak[] | null>;
  onClipsChange: (next: LyricClipModel[]) => void;
  onLayersChange: (next: LyricLayer[]) => void;
  onSeek: (time: number) => void;
  onPlayToggle: () => void;
  onSelectionChange?: (selection: { clipId: string | null; layerId: string | null }) => void;
  composition?: CompositionScore;
  vibrixManifest?: VibrixAuthoringManifest;
  selectedCompositionCueId?: string | null;
  onCompositionChange?: (score: CompositionScore) => void;
  onCompositionSelectionChange?: (cueId: string | null) => void;
}

interface DragState {
  primaryClipId: string;
  mode: DragMode;
  pointerId: number;
  initialClientX: number;
  /** Snapshot of every clip in the active selection at drag start. */
  initialClips: LyricClipModel[];
}

/** In-progress box selection. Coordinates are lane-container pixels, so the
 *  box stays anchored to the content if the view scrolls mid-drag. */
interface MarqueeState {
  pointerId: number;
  startX: number;
  startY: number;
  /** Shift / Cmd / Ctrl: add to the selection instead of replacing it. */
  additive: boolean;
  base: Set<string>;
  /** False until the pointer travels far enough to tell a drag from a click. */
  active: boolean;
}

interface MarqueeRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const MARQUEE_THRESHOLD_PX = 4;
/** Two presses on the same clip this close together open it for typing. A
 *  `dblclick` listener can't do it: a clip press captures the pointer on the
 *  lane container, so the browser retargets the click events there. */
const DOUBLE_PRESS_MS = 400;

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

const TRACK_HEIGHT = 64;
const MASTER_WAVEFORM_HEIGHT = 96;
const RULER_HEIGHT = 28;
const COMPOSITION_GROUP_HEIGHT = 34;

export function TimelineEditor({
  clips,
  layers,
  currentTime,
  duration,
  isPlaying,
  focusRequest,
  trackName,
  masterChannel,
  peaks,
  embedded = false,
  disableShortcuts = false,
  waveformEnabled = true,
  isLongAudio = false,
  onExtractBandPeaks,
  onClipsChange,
  onLayersChange,
  onSeek,
  onPlayToggle,
  onSelectionChange,
  composition,
  vibrixManifest,
  selectedCompositionCueId = null,
  onCompositionChange,
  onCompositionSelectionChange,
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
  const [compositionExpanded, setCompositionExpanded] = useState(true);
  const [editingClipId, setEditingClipId] = useState<string | null>(null);
  const [marquee, setMarquee] = useState<MarqueeRect | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const laneContainerRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const clipsRef = useRef<LyricClipModel[]>(clips);
  const layersRef = useRef<LyricLayer[]>(layers);
  const laneRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const selectedIdsRef = useRef<Set<string>>(selectedClipIds);
  const lastSelectedClipIdRef = useRef<string | null>(null);
  const snapRef = useRef(snapSeconds);
  const marqueeRef = useRef<MarqueeState | null>(null);
  // A box drag ends with a click on the lane; that click must not seek and
  // wipe the selection the box just made.
  const suppressClickRef = useRef(false);
  // A block inserted for typing that the user abandons empty is removed.
  const freshInsertRef = useRef<string | null>(null);
  const lastClipPressRef = useRef<{ clipId: string; at: number } | null>(null);
  // When a double press on a clip opened its editor; the browser's dblclick
  // that follows lands on the lane and must not insert a new block there.
  const clipDoublePressAtRef = useRef(-Infinity);
  const currentTimeRef = useRef(currentTime);
  useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);
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
  useEffect(() => {
    const clipIds = new Set(clips.map(clip => clip.id));
    setSelectedClipIds(previous => {
      const next = new Set(Array.from(previous).filter(id => clipIds.has(id)));
      return next.size === previous.size ? previous : next;
    });
  }, [clips]);

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
  const visibleLaneStartPx = Math.max(0, scrollMetrics.scrollLeft - headerWidth);
  const visibleLaneWidthPx = Math.max(1, scrollMetrics.clientWidth);

  // Visible time window with overscan, for virtualizing lyric clips so projects
  // with thousands of clips don't mount thousands of DOM nodes.
  const visibleStartTime = pxPerSecond > 0 ? visibleLaneStartPx / pxPerSecond : 0;
  const visibleEndTime = pxPerSecond > 0
    ? (visibleLaneStartPx + visibleLaneWidthPx) / pxPerSecond
    : effectiveDuration;
  const overscanSec = Math.max(10, (visibleEndTime - visibleStartTime) * 0.25);
  const renderStartTime = Math.max(0, visibleStartTime - overscanSec);
  const renderEndTime = visibleEndTime + overscanSec;

  const sortedLayers = useMemo(
    () => [...layers].sort((a, b) => a.order - b.order),
    [layers]
  );
  const effectiveSelectedLayerId =
    selectedLayerId && layers.some(layer => layer.id === selectedLayerId)
      ? selectedLayerId
      : sortedLayers[0]?.id ?? null;
  const activeLayerIdRef = useRef(effectiveSelectedLayerId);
  useEffect(() => { activeLayerIdRef.current = effectiveSelectedLayerId; }, [effectiveSelectedLayerId]);

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

  useEffect(() => {
    const groupedByLayer = Object.fromEntries(
      layers.map(layer => [layer.id, clips.filter(clip => clip.layerId === layer.id).length])
    );
    syncDebug('TIMELINE_RECEIVED_CLIPS', {
      totalClips: clips.length,
      groupedByLayer,
      selectedLayerClipCount: effectiveSelectedLayerId
        ? clips.filter(clip => clip.layerId === effectiveSelectedLayerId).length
        : 0
    });
  }, [clips, layers, effectiveSelectedLayerId]);

  const audioRowHeights = MASTER_WAVEFORM_HEIGHT;
  const hasCompositionEditor = Boolean(
    composition && onCompositionChange && onCompositionSelectionChange
  );
  const compositionTrackCount = hasCompositionEditor && compositionExpanded
    ? composition!.tracks.length
    : 0;
  const totalTracksHeight = (layers.length + compositionTrackCount) * TRACK_HEIGHT;
  const compositionGroupHeight = hasCompositionEditor ? COMPOSITION_GROUP_HEIGHT : 0;
  const playheadHeight = RULER_HEIGHT + audioRowHeights + totalTracksHeight + compositionGroupHeight;
  const orderedCompositionTracks = useMemo<CompositionTrackV2[]>(
    () => composition?.schemaVersion === 2
      ? sortCompositionTracksForTimeline(composition.tracks)
      : [],
    [composition]
  );

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

  // Explicit jump/focus requests are used by lyric-source checkpoints so long
  // mixes can jump to a section without manual horizontal scrolling.
  useEffect(() => {
    if (!focusRequest) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = scrollLeftForCenteredTime(
      focusRequest.time,
      pxPerSecond,
      el.clientWidth,
      headerWidth
    );
  }, [focusRequest, pxPerSecond, headerWidth]);

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
  const timeAtClientX = useCallback((clientX: number): number | null => {
    const rect = scrollRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return getTimelinePointerTime({
      clientX,
      scrollContainerRect: rect,
      scrollLeft: scrollRef.current?.scrollLeft ?? 0,
      pxPerSecond,
      headerWidth,
      duration: effectiveDuration
    });
  }, [pxPerSecond, headerWidth, effectiveDuration]);

  const handleSeekClick = useCallback((e: React.MouseEvent) => {
    const time = timeAtClientX(e.clientX);
    if (time != null) onSeek(time);
  }, [timeAtClientX, onSeek]);

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
    lastSelectedClipIdRef.current = null;
  }, []);

  const duplicateSelected = useCallback(() => {
    const selected = selectedIdsRef.current;
    if (selected.size === 0) return;
    const { clips: nextClips, duplicatedIds } = duplicateClipSelection(
      clipsRef.current,
      selected,
      { trackDuration: effectiveDuration }
    );
    if (duplicatedIds.length === 0) return;
    onClipsChange(nextClips);
    const nextSelection = new Set(duplicatedIds);
    setSelectedClipIds(nextSelection);
    lastSelectedClipIdRef.current = duplicatedIds[duplicatedIds.length - 1] ?? null;
    const firstDuplicate = nextClips.find(clip => clip.id === duplicatedIds[0]);
    if (firstDuplicate) setSelectedLayerId(firstDuplicate.layerId);
  }, [effectiveDuration, onClipsChange]);

  const deleteSelected = useCallback(() => {
    const selected = selectedIdsRef.current;
    if (selected.size === 0) return;
    const lockedLayers = new Set(layersRef.current.filter(layer => layer.locked).map(layer => layer.id));
    const nextClips = clipsRef.current.filter(clip =>
      !selected.has(clip.id) || clip.locked || lockedLayers.has(clip.layerId)
    );
    if (nextClips.length === clipsRef.current.length) return;
    onClipsChange(nextClips);
    clearSelection();
  }, [clearSelection, onClipsChange]);

  /** Split / Start / End at the playhead (see `applyPlayheadEdit`). */
  const playheadEdit = useCallback((edit: PlayheadEdit) => {
    const { clips: nextClips, affectedIds } = applyPlayheadEdit(clipsRef.current, layersRef.current, {
      edit,
      time: currentTimeRef.current,
      selectedIds: selectedIdsRef.current,
      activeLayerId: activeLayerIdRef.current,
      idPrefix: `cut-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    });
    if (affectedIds.length === 0) return;
    clipsRef.current = nextClips;
    onClipsChange(nextClips);
    setSelectedClipIds(new Set(affectedIds));
    lastSelectedClipIdRef.current = affectedIds[affectedIds.length - 1] ?? null;
  }, [onClipsChange]);

  const mergeSelected = useCallback(() => {
    const editable = new Set(
      getSelectableClips(clipsRef.current, layersRef.current, { requireVisible: false })
        .filter(clip => selectedIdsRef.current.has(clip.id))
        .map(clip => clip.id)
    );
    const { clips: nextClips, mergedIds } = mergeClips(clipsRef.current, editable);
    if (mergedIds.length === 0) return;
    clipsRef.current = nextClips;
    onClipsChange(nextClips);
    setSelectedClipIds(new Set(mergedIds));
    lastSelectedClipIdRef.current = mergedIds[mergedIds.length - 1] ?? null;
  }, [onClipsChange]);

  const selectLinked = useCallback(() => {
    if (selectedIdsRef.current.size === 0) return;
    setSelectedClipIds(withLinkedClips(clipsRef.current, layersRef.current, selectedIdsRef.current));
  }, []);

  /** Scroll horizontally just enough to show `time` when it is off-screen. */
  const revealTime = useCallback((time: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const px = headerWidth + time * pxPerSecond;
    if (px < el.scrollLeft + headerWidth || px > el.scrollLeft + el.clientWidth - 280) {
      el.scrollLeft = scrollLeftForCenteredTime(time, pxPerSecond, el.clientWidth, headerWidth);
    }
  }, [headerWidth, pxPerSecond]);

  /** Add one block per line on `layerId` from `time`; they arrive selected. */
  const insertBlocks = useCallback((layerId: string, time: number, lines: string[]): string[] => {
    const layer = layersRef.current.find(l => l.id === layerId);
    if (!layer || layer.locked) return [];
    const { clips: nextClips, insertedIds } = insertClipsAt(clipsRef.current, lines, {
      layerId,
      time,
      trackDuration: effectiveDuration,
      idPrefix: `manual-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    });
    if (insertedIds.length === 0) return [];
    clipsRef.current = nextClips;
    onClipsChange(nextClips);
    setSelectedLayerId(layerId);
    setSelectedClipIds(new Set(insertedIds));
    lastSelectedClipIdRef.current = insertedIds[insertedIds.length - 1] ?? null;
    revealTime(time);
    return insertedIds;
  }, [effectiveDuration, onClipsChange, revealTime]);

  const insertBlockForTyping = useCallback((layerId: string | null, time: number) => {
    if (!layerId) return;
    const [id] = insertBlocks(layerId, time, ['']);
    if (!id) return;
    freshInsertRef.current = id;
    setEditingClipId(id);
  }, [insertBlocks]);

  const removeClip = useCallback((clipId: string) => {
    const nextClips = clipsRef.current.filter(clip => clip.id !== clipId);
    if (nextClips.length === clipsRef.current.length) return;
    clipsRef.current = nextClips;
    onClipsChange(nextClips);
  }, [onClipsChange]);

  const commitClipText = useCallback((clipId: string, text: string) => {
    setEditingClipId(null);
    const fresh = freshInsertRef.current === clipId;
    freshInsertRef.current = null;
    const trimmed = text.trim();
    if (fresh && !trimmed) {
      removeClip(clipId);
      return;
    }
    const target = clipsRef.current.find(clip => clip.id === clipId);
    if (!target) return;
    const updated = setClipText(target, trimmed);
    if (updated === target) return;
    const nextClips = clipsRef.current.map(clip => (clip.id === clipId ? updated : clip));
    clipsRef.current = nextClips;
    onClipsChange(nextClips);
  }, [onClipsChange, removeClip]);

  const cancelClipEdit = useCallback((clipId: string) => {
    setEditingClipId(null);
    if (freshInsertRef.current === clipId) removeClip(clipId);
    freshInsertRef.current = null;
  }, [removeClip]);

  const requestClipEdit = useCallback((clipId: string) => {
    const clip = clipsRef.current.find(c => c.id === clipId);
    if (!clip) return;
    setSelectedLayerId(clip.layerId);
    setSelectedClipIds(new Set([clipId]));
    lastSelectedClipIdRef.current = clipId;
    freshInsertRef.current = null;
    setEditingClipId(clipId);
  }, []);

  const handleLaneDoubleClick = useCallback((layerId: string, clientX: number) => {
    if (performance.now() - clipDoublePressAtRef.current < DOUBLE_PRESS_MS) return;
    const time = timeAtClientX(clientX);
    if (time != null) insertBlockForTyping(layerId, time);
  }, [insertBlockForTyping, timeAtClientX]);

  // ── Box selection ──────────────────────────────────────────────
  const handleTracksPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    suppressClickRef.current = false;
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (!target.closest('.tl-track-lane') || target.closest('.tl-clip, .tl-clip-editor')) return;
    const container = laneContainerRef.current?.getBoundingClientRect();
    if (!container) return;
    marqueeRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX - container.left,
      startY: e.clientY - container.top,
      additive: e.shiftKey || e.metaKey || e.ctrlKey,
      base: new Set(selectedIdsRef.current),
      active: false
    };
  };

  const updateMarquee = useCallback((state: MarqueeState, clientX: number, clientY: number) => {
    const containerEl = laneContainerRef.current;
    if (!containerEl) return;
    const container = containerEl.getBoundingClientRect();
    const x = clientX - container.left;
    const y = clientY - container.top;
    if (!state.active) {
      if (Math.hypot(x - state.startX, y - state.startY) < MARQUEE_THRESHOLD_PX) return;
      state.active = true;
      // Capture only once it really is a drag: capturing on pointerdown would
      // retarget the click of a plain seek to the container.
      try { containerEl.setPointerCapture(state.pointerId); } catch { /* ignore */ }
    }
    const left = Math.min(state.startX, x);
    const top = Math.min(state.startY, y);
    const right = Math.max(state.startX, x);
    const bottom = Math.max(state.startY, y);
    setMarquee({ left, top, width: right - left, height: bottom - top });

    const layerIds: string[] = [];
    for (const [layerId, el] of laneRefs.current) {
      const rect = el.getBoundingClientRect();
      const laneTop = rect.top - container.top;
      const laneBottom = rect.bottom - container.top;
      if (laneBottom >= top && laneTop <= bottom) layerIds.push(layerId);
    }
    const toTime = (px: number) => Math.max(0, pxToTime(px - headerWidth, pxPerSecond));
    const hit = getClipsInBox(clipsRef.current, layersRef.current, {
      startTime: toTime(left),
      endTime: toTime(right),
      layerIds
    }).map(clip => clip.id);
    setSelectedClipIds(state.additive ? new Set([...state.base, ...hit]) : new Set(hit));
  }, [headerWidth, pxPerSecond]);

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

      if (mode === 'move' && !modifiers.additive && !modifiers.range) {
        const now = performance.now();
        const last = lastClipPressRef.current;
        if (last && last.clipId === clipId && now - last.at < DOUBLE_PRESS_MS) {
          lastClipPressRef.current = null;
          clipDoublePressAtRef.current = now;
          requestClipEdit(clipId);
          return;
        }
        lastClipPressRef.current = { clipId, at: now };
      }

      if ((modifiers.additive || modifiers.range) && mode === 'move') {
        setSelectedClipIds(prev => {
          if (modifiers.range) {
            const anchorId = lastSelectedClipIdRef.current
              ?? Array.from(prev).find(id => {
                const selected = clipsRef.current.find(c => c.id === id);
                return selected?.layerId === clip.layerId;
              })
              ?? clipId;
            const anchor = clipsRef.current.find(c => c.id === anchorId);
            const layerClips = clipsRef.current
              .filter(c => c.layerId === clip.layerId)
              .sort((a, b) => a.startTime - b.startTime);
            const anchorIndex = anchor ? layerClips.findIndex(c => c.id === anchor.id) : -1;
            const clipIndex = layerClips.findIndex(c => c.id === clipId);
            if (anchorIndex < 0 || clipIndex < 0) {
              lastSelectedClipIdRef.current = clipId;
              return modifiers.additive ? new Set([...prev, clipId]) : new Set([clipId]);
            }
            const [from, to] = anchorIndex <= clipIndex
              ? [anchorIndex, clipIndex]
              : [clipIndex, anchorIndex];
            const rangeIds = layerClips.slice(from, to + 1).map(c => c.id);
            lastSelectedClipIdRef.current = clipId;
            return modifiers.additive ? new Set([...prev, ...rangeIds]) : new Set(rangeIds);
          }

          const next = new Set(prev);
          if (next.has(clipId)) {
            next.delete(clipId);
          } else {
            next.add(clipId);
            lastSelectedClipIdRef.current = clipId;
          }
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
      lastSelectedClipIdRef.current = clipId;

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
    [requestClipEdit]
  );

  // Keyboard activation of a clip (Enter / Space on the focused clip):
  // selects it single and makes its layer active — mirrors a plain click.
  const handleClipKeyboardSelect = useCallback((clipId: string) => {
    const clip = clipsRef.current.find(c => c.id === clipId);
    if (!clip) return;
    setSelectedLayerId(clip.layerId);
    setSelectedClipIds(new Set([clipId]));
    lastSelectedClipIdRef.current = clipId;
  }, []);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const box = marqueeRef.current;
      if (box && box.pointerId === e.pointerId) {
        updateMarquee(box, e.clientX, e.clientY);
        return;
      }
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
    [pxPerSecond, effectiveDuration, snapSeconds, onClipsChange, findLayerAtY, hoveredLayerId, updateMarquee]
  );

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const box = marqueeRef.current;
    if (box && box.pointerId === e.pointerId) {
      marqueeRef.current = null;
      if (box.active) {
        suppressClickRef.current = true;
        setMarquee(null);
        try { laneContainerRef.current?.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      }
      return;
    }
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
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if ((e.target as HTMLElement).closest('.tl-clip, .tl-clip-editor')) return;
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
  // Keys are sourced from the shortcut registry so users can rebind everything
  // from the Shortcuts panel. We still apply context rules locally (selection
  // required for clip nudge, no-typing-in-fields, etc.).
  const { matches } = useShortcuts();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (disableShortcutsRef.current) return;
      const target = e.target as HTMLElement | null;
      if (isEditableTarget(target)) return;

      if (matches(e, 'transport.playPause')) {
        e.preventDefault();
        onPlayToggleRef.current();
        return;
      }

      if (matches(e, 'timeline.selectAll')) {
        e.preventDefault();
        selectAll();
        return;
      }

      if (matches(e, 'timeline.clearSelection')) {
        if (selectedIdsRef.current.size === 0) return;
        e.preventDefault();
        clearSelection();
        return;
      }

      if (matches(e, 'clip.duplicate')) {
        if (selectedIdsRef.current.size === 0) return;
        e.preventDefault();
        duplicateSelected();
        return;
      }

      if (matches(e, 'clip.insert')) {
        e.preventDefault();
        insertBlockForTyping(activeLayerIdRef.current, currentTimeRef.current);
        return;
      }

      if (matches(e, 'clip.editText')) {
        // Enter on a focused button belongs to that button; a focused clip
        // lets it through only once it is selected (see LyricClip).
        if (target?.closest('button, [role="button"]:not(.tl-clip)')) return;
        if (selectedIdsRef.current.size !== 1) return;
        e.preventDefault();
        requestClipEdit(selectedIdsRef.current.values().next().value as string);
        return;
      }

      if (matches(e, 'clip.selectLinked')) {
        if (selectedIdsRef.current.size === 0) return;
        e.preventDefault();
        selectLinked();
        return;
      }

      if (matches(e, 'clip.split')) {
        e.preventDefault();
        playheadEdit('split');
        return;
      }

      if (matches(e, 'clip.trimStart') || matches(e, 'clip.trimEnd')) {
        e.preventDefault();
        playheadEdit(matches(e, 'clip.trimStart') ? 'trimStart' : 'trimEnd');
        return;
      }

      if (matches(e, 'clip.merge')) {
        if (selectedIdsRef.current.size < 2) return;
        e.preventDefault();
        mergeSelected();
        return;
      }

      if (matches(e, 'clip.delete') || e.key === 'Delete') {
        if (selectedIdsRef.current.size === 0) return;
        e.preventDefault();
        deleteSelected();
        return;
      }

      if (selectedIdsRef.current.size === 0) return;

      const isEarlier = matches(e, 'timeline.nudgeEarlier');
      const isLater = matches(e, 'timeline.nudgeLater');
      if (isEarlier || isLater) {
        e.preventDefault();
        const sign = isEarlier ? -1 : 1;
        let magnitude: number;
        if (e.altKey) magnitude = 1;
        else if (e.shiftKey) magnitude = 0.5;
        else magnitude = snapRef.current > 0 ? snapRef.current : 0.1;
        nudgeSelected(sign * magnitude);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [matches, selectAll, clearSelection, deleteSelected, duplicateSelected, nudgeSelected,
    insertBlockForTyping, requestClipEdit, selectLinked, playheadEdit, mergeSelected]);

  // ⌘V / Ctrl+V outside any text field: each pasted line becomes a block on
  // the active layer from the playhead. Inside the inline editor (or any
  // input) the browser pastes as usual.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (disableShortcutsRef.current || isEditableTarget(e.target)) return;
      const lines = linesFromPastedText(e.clipboardData?.getData('text/plain') ?? '');
      const layerId = activeLayerIdRef.current;
      if (lines.length === 0 || !layerId) return;
      e.preventDefault();
      insertBlocks(layerId, currentTimeRef.current, lines);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [insertBlocks]);

  const {
    displayPeaks,
    bandPeaks,
    bandPeaksLoading,
    masterIsMock
  } = useTimelineBandPeaks({
    bandMode,
    masterChannel: waveformEnabled ? masterChannel : null,
    fallbackPeaks: waveformEnabled ? peaks : undefined,
    onExtractBandPeaks: waveformEnabled ? onExtractBandPeaks : undefined
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
        pxPerSecond={pxPerSecond}
        masterChannel={masterChannel}
        bandMode={bandMode}
        bandModeDisabled={isLongAudio || !waveformEnabled}
        snapSeconds={snapSeconds}
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
      />

      <TimelineSelectionToolbar
        hasSelection={hasSelection}
        selectionBounds={selectionBounds}
        offsetInput={offsetInput}
        onSelectAll={selectAll}
        onSelectAfterPlayhead={selectAfterPlayhead}
        onClearSelection={clearSelection}
        onDuplicateSelected={duplicateSelected}
        onDeleteSelected={deleteSelected}
        onSelectLinked={selectLinked}
        onInsertBlock={() => insertBlockForTyping(effectiveSelectedLayerId, currentTime)}
        onEditText={() => {
          const onlyId = selectedClipIds.size === 1
            ? selectedClipIds.values().next().value as string | undefined
            : undefined;
          if (onlyId) requestClipEdit(onlyId);
        }}
        canEditText={selectedClipIds.size === 1}
        onPlayheadEdit={playheadEdit}
        onMergeSelected={mergeSelected}
        canMerge={selectedClipIds.size > 1}
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
            waveformEnabled={waveformEnabled}
            displayPeaks={displayPeaks}
            bandPeaks={bandPeaks}
            masterIsMock={masterIsMock}
            isLongAudio={isLongAudio}
            visibleStartPx={visibleLaneStartPx}
            visibleWidthPx={visibleLaneWidthPx}
            onRulerClick={handleRulerClick}
            onLaneClick={handleSeekClick}
          />

          <div
            className="tl-tracks"
            onClick={handleLaneBackgroundClick}
            onPointerDown={handleTracksPointerDown}
          >
            <TimelineLayerList
              layers={sortedLayers}
              clipsByLayer={clipsByLayer}
              pxPerSecond={pxPerSecond}
              duration={effectiveDuration}
              trackHeight={TRACK_HEIGHT}
              selectedClipIds={selectedClipIds}
              selectedLayerId={effectiveSelectedLayerId}
              hoveredLayerId={hoveredLayerId}
              renderStartTime={renderStartTime}
              renderEndTime={renderEndTime}
              setLaneRef={setLaneRef}
              onClipPointerDown={handleClipPointerDown}
              onClipKeyboardSelect={handleClipKeyboardSelect}
              editingClipId={editingClipId}
              onClipTextCommit={commitClipText}
              onClipEditCancel={cancelClipEdit}
              onLaneDoubleClick={handleLaneDoubleClick}
              onLayerToggleVisible={toggleLayerVisible}
              onLayerToggleLocked={toggleLayerLocked}
              onLayerPositionChange={handleLayerPositionChange}
              onLayerSelect={setSelectedLayerId}
            />
            {hasCompositionEditor && composition && onCompositionChange && onCompositionSelectionChange && (
              <>
                <div className="composition-group" style={{ height: `${COMPOSITION_GROUP_HEIGHT}px` }}>
                  <button
                    type="button"
                    className="composition-group-toggle"
                    aria-expanded={compositionExpanded}
                    onClick={event => {
                      event.stopPropagation();
                      setCompositionExpanded(expanded => !expanded);
                    }}
                  >
                    <span className="composition-group-chevron" aria-hidden="true">
                      {compositionExpanded ? '▾' : '▸'}
                    </span>
                    <span>Visual composition</span>
                    <span className="composition-group-meta">
                      {composition.tracks.length} tracks · score v{composition.schemaVersion}
                    </span>
                  </button>
                </div>
                {compositionExpanded && composition.schemaVersion === 1 && composition.tracks.map(track => (
                  <CompositionTrackLane
                    key={track.id}
                    track={track}
                    score={composition}
                    manifest={vibrixManifest}
                    pxPerSecond={pxPerSecond}
                    duration={effectiveDuration}
                    selectedCueId={selectedCompositionCueId}
                    onScoreChange={onCompositionChange}
                    onSelectCue={onCompositionSelectionChange}
                  />
                ))}
                {compositionExpanded && composition.schemaVersion === 2 && orderedCompositionTracks.map(track => (
                  <SustainedCompositionTrackLane
                    key={track.id}
                    track={track}
                    score={composition}
                    manifest={vibrixManifest}
                    pxPerSecond={pxPerSecond}
                    duration={effectiveDuration}
                    snapSeconds={snapSeconds}
                    selectedCueId={selectedCompositionCueId}
                    onScoreChange={onCompositionChange}
                    onSelectCue={onCompositionSelectionChange}
                  />
                ))}
              </>
            )}
          </div>

          {marquee && (
            <div
              className="tl-marquee"
              style={{
                left: `${marquee.left}px`,
                top: `${marquee.top}px`,
                width: `${marquee.width}px`,
                height: `${marquee.height}px`
              }}
              aria-hidden
            />
          )}

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
