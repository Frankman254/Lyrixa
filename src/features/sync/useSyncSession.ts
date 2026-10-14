import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LyrixaProject } from '../../core/types/project';
import type { TapSyncLine } from '../../core/timeline/tapSync';
import { buildSyncQueue, hasProjectLyricLines, hasSyncableLyrics } from '../../core/timeline/syncQueue';
import { findActiveLyricSource, getLyricSourceStartTime } from '../../core/lyrics/lyricSourceLibrary';
import type { ClipUpdate } from '../editor/useLyrixaProject';
import { useTapSync } from './useTapSync';
import type { UseTapSyncResult } from './useTapSync';

interface UseSyncSessionArgs {
  /** Whether the editor is in Sync mode. Entering/leaving it starts/ends the session. */
  active: boolean;
  /** Ask the editor to enter or leave Sync mode. */
  onActiveChange: (active: boolean) => void;
  project: LyrixaProject;
  /** The layer selected in the editor; sync targets it unless the session picked another. */
  selectedLayerId: string | null;
  onSelectLayer: (layerId: string) => void;
  setClips: (next: ClipUpdate) => void;
  setRawLyricsText: (text: string) => void;
  setActiveLyricSource: (id: string) => void;
  /** Master audio is loaded and playable. */
  audioReady: boolean;
  trackDuration?: number;
  playbackTime: number;
  onPlayToggle: () => void;
  onPause: () => void;
  onSeek: (time: number) => void;
  /** Scroll the timeline to `time` (used whenever the session jumps). */
  onFocusTime: (time: number) => void;
}

export interface SyncSession {
  active: boolean;
  /** Sync can start: audio is loaded and the target layer has lines to time. */
  canSync: boolean;
  /** The project holds lyric text (sources or a raw paste). */
  hasLyrics: boolean;
  layerId: string | null;
  layerName: string;
  /** Selected lyric source; null streams every source in order. */
  sourceId: string | null;
  lines: TapSyncLine[];
  /** Playback rate while syncing. */
  speed: number;
  /** The hold-to-time engine for the current queue. */
  tap: UseTapSyncResult;
  toggle: () => void;
  setSpeed: (speed: number) => void;
  /** Retarget the session to another layer and jump to its resume point. */
  setLayer: (layerId: string) => void;
  /** Retarget the session to another source (null = all) and jump to its resume point. */
  setSource: (sourceId: string | null) => void;
  /** Clear every clip on the target layer and start again from the source start. */
  restart: () => void;
}

/**
 * One sync session: which layer and source are being timed, the queue of
 * lines, and where to resume. The queue itself is computed by the pure
 * `buildSyncQueue`; this hook only holds the session's choices and wires the
 * hold-to-time engine to playback.
 */
export function useSyncSession({
  active,
  onActiveChange,
  project,
  selectedLayerId,
  onSelectLayer,
  setClips,
  setRawLyricsText,
  setActiveLyricSource,
  audioReady,
  trackDuration,
  playbackTime,
  onPlayToggle,
  onPause,
  onSeek,
  onFocusTime
}: UseSyncSessionArgs): SyncSession {
  const [speed, setSpeed] = useState(1);
  const [lines, setLines] = useState<TapSyncLine[]>([]);
  const [initialCursor, setInitialCursor] = useState(0);
  const [targetLayerId, setTargetLayerId] = useState<string | null>(null);
  /** When null, sync streams every project lyric source in order. */
  const [chosenSourceId, setChosenSourceId] = useState<string | null>(null);
  // Guards the enter/exit side effects so the mode switcher and the "Sync
  // lyrics" button share one idempotent path.
  const enteredRef = useRef(false);

  const activeLayerId = selectedLayerId ?? project.layers[0]?.id ?? null;
  const layerId = active ? targetLayerId ?? activeLayerId : activeLayerId;
  const layerName = project.layers.find(layer => layer.id === layerId)?.name ?? 'Lyrics';
  const activeSourceId = findActiveLyricSource(project)?.id ?? null;
  const sourceId = project.lyricMode === 'single' ? activeSourceId : chosenSourceId;

  const hasLyrics = useMemo(() => hasProjectLyricLines(project), [project]);
  const canSync = useMemo(
    () => audioReady && hasSyncableLyrics(project, layerId),
    [audioReady, layerId, project]
  );

  const tap = useTapSync({
    enabled: active,
    clips: project.clips,
    lines,
    layerId,
    initialCursorIndex: initialCursor,
    trackDuration,
    playbackTime,
    onClipsChange: setClips,
    onPlayToggle,
    onSeek
  });

  const jumpTo = useCallback((time: number) => {
    onSeek(time);
    onFocusTime(time);
  }, [onFocusTime, onSeek]);

  /** Load the queue for `nextLayerId` and return where playback should resume. */
  const startLayer = useCallback((nextLayerId: string, nextSourceId: string | null): number => {
    const queue = buildSyncQueue(project, nextLayerId, nextSourceId);
    if (queue.seedRawLyricsText !== null) setRawLyricsText(queue.seedRawLyricsText);
    if (queue.clips !== project.clips) setClips(queue.clips);
    setLines(queue.lines);
    setInitialCursor(queue.cursorIndex);
    setTargetLayerId(nextLayerId);
    onSelectLayer(nextLayerId);
    tap.reset(queue.cursorIndex);
    return queue.resumeTime;
  }, [onSelectLayer, project, setClips, setRawLyricsText, tap]);

  const enter = useCallback(() => {
    if (enteredRef.current) return;
    enteredRef.current = true;
    // Default to the project's active source so a single set of lyrics needs
    // no choice; keep an earlier multi-mode choice while it still exists.
    const chosenStillExists = chosenSourceId == null ||
      project.lyricSources.some(source => source.id === chosenSourceId);
    const initialSourceId = project.lyricMode === 'multi' && chosenStillExists
      ? chosenSourceId ?? activeSourceId
      : activeSourceId;
    setChosenSourceId(initialSourceId);
    const initialLayerId = targetLayerId ?? activeLayerId;
    const resumeTime = initialLayerId
      ? startLayer(initialLayerId, initialSourceId)
      : getLyricSourceStartTime(project, initialSourceId);
    onPause();
    jumpTo(resumeTime);
  }, [activeLayerId, activeSourceId, chosenSourceId, jumpTo, onPause, project, startLayer, targetLayerId]);

  const exit = useCallback(() => {
    if (!enteredRef.current) return;
    enteredRef.current = false;
    setSpeed(1);
    setLines([]);
    setInitialCursor(0);
    setTargetLayerId(null);
  }, []);

  useEffect(() => {
    if (active) enter();
    else exit();
  }, [active, enter, exit]);

  const toggle = useCallback(() => onActiveChange(!active), [active, onActiveChange]);

  const setLayer = useCallback((nextLayerId: string) => {
    jumpTo(startLayer(nextLayerId, sourceId));
  }, [jumpTo, sourceId, startLayer]);

  const setSource = useCallback((nextSourceId: string | null) => {
    setChosenSourceId(nextSourceId);
    if (nextSourceId) setActiveLyricSource(nextSourceId);
    // Re-queue against the new source so the cursor lands on its first
    // untimed line. Clips synced from other sources stay put — they are
    // keyed by their own sourceId.
    if (targetLayerId) {
      jumpTo(startLayer(targetLayerId, nextSourceId));
      return;
    }
    jumpTo(getLyricSourceStartTime(project, nextSourceId));
  }, [jumpTo, project, setActiveLyricSource, startLayer, targetLayerId]);

  const restart = useCallback(() => {
    if (layerId) setClips(previous => previous.filter(clip => clip.layerId !== layerId));
    setInitialCursor(0);
    tap.reset();
    jumpTo(getLyricSourceStartTime(project, sourceId));
  }, [jumpTo, layerId, project, setClips, sourceId, tap]);

  return {
    active,
    canSync,
    hasLyrics,
    layerId,
    layerName,
    sourceId,
    lines,
    speed,
    tap,
    toggle,
    setSpeed,
    setLayer,
    setSource,
    restart
  };
}
