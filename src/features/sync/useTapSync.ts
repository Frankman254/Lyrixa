import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LyricClip } from '../../core/types/clip';
import type { TapSyncLine } from '../../core/timeline/tapSync';
import {
  findNextUnpublishedLineIndex,
  findTapSyncClip,
  nudgeLayerTiming,
  publishLineEnd,
  publishLineStart
} from '../../core/timeline/tapSync';
import { syncDebug } from './syncDebug';

type ClipUpdate = LyricClip[] | ((previous: LyricClip[]) => LyricClip[]);

interface UndoEntry {
  previousClips: LyricClip[];
  cursor: number;
  sourceId: string;
  layerId: string;
  releaseTime: number;
}

interface UseTapSyncArgs {
  /** Only when true does the hook listen to the keyboard. */
  enabled: boolean;
  clips: LyricClip[];
  lines: TapSyncLine[];
  layerId: string | null;
  initialCursorIndex?: number;
  trackDuration?: number;
  /** Live playback position in seconds (driven by the rAF transport). */
  playbackTime: number;
  onClipsChange: (clips: ClipUpdate) => void;
  onPlayToggle: () => void;
  onSeek: (time: number) => void;
}

export interface UseTapSyncResult {
  cursorIndex: number;
  total: number;
  done: boolean;
  canUndo: boolean;
  isHolding: boolean;
  lastCreatedClipId: string | null;
  lastCommittedTime: number | null;
  /** Key-down / pointer-down: start timing the current line. */
  holdStart: () => void;
  /** Key-up / pointer-up: end the current line and advance. */
  holdEnd: () => void;
  undo: () => void;
  stepBack: () => void;
  reset: () => void;
  nudge: (deltaSeconds: number) => void;
  jumpToCursorTime: () => void;
}

const NUDGE_KEY_STEP = 0.05;

/**
 * Drives hold-to-sync mode: hold one key (Space) while a lyric line is sung and
 * release it when the line ends. The hook writes only to project.clips via the
 * same clip updater used by normal timeline editing.
 */
export function useTapSync({
  enabled,
  clips,
  lines,
  layerId,
  initialCursorIndex = 0,
  trackDuration,
  playbackTime,
  onClipsChange,
  onPlayToggle,
  onSeek
}: UseTapSyncArgs): UseTapSyncResult {
  const [cursorIndex, setCursorIndex] = useState(initialCursorIndex);
  const [canUndo, setCanUndo] = useState(false);
  const [isHolding, setIsHolding] = useState(false);
  const [lastCreatedClipId, setLastCreatedClipId] = useState<string | null>(null);
  const [lastCommittedTime, setLastCommittedTime] = useState<number | null>(null);
  const historyRef = useRef<UndoEntry[]>([]);
  const holdingRef = useRef(false);

  const total = useMemo(
    () => (layerId ? lines.length : 0),
    [layerId, lines.length]
  );

  // Keep the latest values reachable from the one-shot keyboard listener.
  const latest = useRef({ clips, lines, layerId, playbackTime, trackDuration, cursorIndex });
  useEffect(() => {
    latest.current = { clips, lines, layerId, playbackTime, trackDuration, cursorIndex };
  });

  const commitClips = useCallback((
    update: (previous: LyricClip[]) => LyricClip[],
    context: {
      layerId?: string | null;
      lastChangedClip?: (clips: LyricClip[]) => LyricClip | undefined;
    } = {}
  ) => {
    const projected = update(latest.current.clips);
    latest.current = { ...latest.current, clips: projected };
    onClipsChange((previous: LyricClip[]) => update(previous));

    const selectedLayerId = context.layerId ?? latest.current.layerId;
    syncDebug('SYNC_COMMIT_CLIPS', {
      totalClips: projected.length,
      clipsInSelectedLayer: selectedLayerId
        ? projected.filter(clip => clip.layerId === selectedLayerId).length
        : 0,
      lastChangedClip: context.lastChangedClip?.(projected) ?? null
    });
  }, [onClipsChange]);

  // While Space is held, stretch the current clip to the live playhead so the
  // real timeline card grows frame by frame.
  useEffect(() => {
    if (!holdingRef.current) return;
    const {
      lines: source,
      layerId: lid,
      playbackTime: t,
      trackDuration: dur,
      cursorIndex: cur
    } = latest.current;
    if (!lid) return;
    const line = source[cur];
    if (!line) return;
    commitClips(
      previous => publishLineEnd(previous, lid, line, t, { trackDuration: dur }),
      { layerId: lid, lastChangedClip: next => findTapSyncClip(next, lid, line) }
    );
  }, [playbackTime, commitClips]);

  // Reset cursor/history whenever the target layer, source lines, or sync mode changes.
  useEffect(() => {
    setCursorIndex(initialCursorIndex);
    historyRef.current = [];
    setCanUndo(false);
    holdingRef.current = false;
    setIsHolding(false);
    setLastCreatedClipId(null);
    setLastCommittedTime(null);
    latest.current = { ...latest.current, cursorIndex: initialCursorIndex };
  }, [enabled, initialCursorIndex, layerId, lines]);

  const holdStart = useCallback(() => {
    if (!enabled || holdingRef.current) return;
    const {
      clips: currentClips,
      lines: source,
      layerId: lid,
      playbackTime: t,
      trackDuration: dur,
      cursorIndex: cur
    } = latest.current;
    const line = source[cur];

    syncDebug('SYNC_KEYDOWN', {
      enabled,
      selectedLayerId: lid,
      cursorIndex: cur,
      currentLineText: line?.text ?? null,
      playbackTime: t,
      clipsCountBefore: currentClips.length
    });

    if (!lid || !line) return;

    holdingRef.current = true;
    setIsHolding(true);
    historyRef.current.push({
      previousClips: currentClips,
      cursor: cur,
      sourceId: line.sourceId,
      layerId: lid,
      releaseTime: t
    });
    if (historyRef.current.length > 200) historyRef.current.shift();
    setCanUndo(true);

    const projected = publishLineStart(currentClips, lid, line, t, { trackDuration: dur });
    const created = findTapSyncClip(projected, lid, line);
    setLastCreatedClipId(created?.id ?? null);
    syncDebug('SYNC_PUBLISH_START', {
      createdClipId: created?.id ?? null,
      clipLayerId: created?.layerId ?? null,
      clipText: created?.text ?? null,
      startTime: created?.startTime ?? null,
      endTime: created?.endTime ?? null,
      muted: created?.muted ?? null,
      clipsCountAfter: projected.length
    });

    commitClips(
      previous => publishLineStart(previous, lid, line, t, { trackDuration: dur }),
      { layerId: lid, lastChangedClip: next => findTapSyncClip(next, lid, line) }
    );
  }, [commitClips, enabled]);

  const holdEnd = useCallback(() => {
    if (!holdingRef.current) return;
    holdingRef.current = false;
    setIsHolding(false);
    const {
      clips: currentClips,
      lines: source,
      layerId: lid,
      playbackTime: t,
      trackDuration: dur,
      cursorIndex: cur
    } = latest.current;
    if (!lid) return;
    const line = source[cur];
    if (!line) return;

    const nextClips = publishLineEnd(currentClips, lid, line, t, { trackDuration: dur });
    const committed = findTapSyncClip(nextClips, lid, line);
    const releaseTime = committed?.endTime ?? t;
    const lastEntry = historyRef.current[historyRef.current.length - 1];
    if (lastEntry?.sourceId === line.sourceId && lastEntry.layerId === lid) {
      lastEntry.releaseTime = releaseTime;
    }
    setLastCommittedTime(releaseTime);

    commitClips(
      previous => publishLineEnd(previous, lid, line, t, { trackDuration: dur }),
      { layerId: lid, lastChangedClip: next => findTapSyncClip(next, lid, line) }
    );
    const nextCursor = findNextUnpublishedLineIndex(source, nextClips, lid, cur + 1);
    latest.current = { ...latest.current, cursorIndex: nextCursor };
    setCursorIndex(nextCursor);
  }, [commitClips]);

  const undo = useCallback(() => {
    const prev = historyRef.current.pop();
    if (!prev) return;
    holdingRef.current = false;
    setIsHolding(false);
    const removedLine = latest.current.lines.find(line => line.sourceId === prev.sourceId)
      ?? latest.current.lines[prev.cursor];
    const removedClip = removedLine
      ? findTapSyncClip(latest.current.clips, prev.layerId, removedLine)
      : undefined;

    commitClips(
      () => prev.previousClips,
      { layerId: prev.layerId, lastChangedClip: () => removedClip }
    );
    latest.current = { ...latest.current, cursorIndex: prev.cursor };
    setCursorIndex(prev.cursor);
    setCanUndo(historyRef.current.length > 0);
    setLastCommittedTime(prev.releaseTime);
    if (removedClip) setLastCreatedClipId(removedClip.id);
    onSeek(prev.releaseTime);
  }, [commitClips, onSeek]);

  const stepBack = useCallback(() => {
    setCursorIndex(i => {
      const next = Math.max(0, i - 1);
      latest.current = { ...latest.current, cursorIndex: next };
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    historyRef.current = [];
    holdingRef.current = false;
    setIsHolding(false);
    setCanUndo(false);
    setLastCreatedClipId(null);
    setLastCommittedTime(null);
    latest.current = { ...latest.current, cursorIndex: initialCursorIndex };
    setCursorIndex(initialCursorIndex);
  }, [initialCursorIndex]);

  const nudge = useCallback((deltaSeconds: number) => {
    const { clips: currentClips, layerId: lid } = latest.current;
    if (!lid) return;
    const projected = nudgeLayerTiming(currentClips, lid, deltaSeconds);
    commitClips(
      previous => nudgeLayerTiming(previous, lid, deltaSeconds),
      { layerId: lid, lastChangedClip: () => projected.find(clip => clip.layerId === lid) }
    );
  }, [commitClips]);

  const jumpToCursorTime = useCallback(() => {
    const { clips: currentClips, lines: source, layerId: lid, cursorIndex: cur } = latest.current;
    if (!lid) return;
    const currentLine = source[cur] ?? source[cur - 1];
    const clip = currentLine ? findTapSyncClip(currentClips, lid, currentLine) : null;
    if (clip) onSeek(clip.startTime);
  }, [onSeek]);

  // Keyboard: active only in sync mode, ignored while typing in a field.
  useEffect(() => {
    if (!enabled) return;
    const isField = (el: EventTarget | null) =>
      el instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);

    const onKeyDown = (e: KeyboardEvent) => {
      if (isField(e.target)) return;
      switch (e.key) {
        case ' ':
          e.preventDefault();
          if (e.repeat) return; // ignore auto-repeat while held
          holdStart();
          break;
        case 'Backspace':
          e.preventDefault();
          undo();
          break;
        case 'p':
        case 'k':
          e.preventDefault();
          onPlayToggle();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (e.shiftKey) stepBack();
          else nudge(-NUDGE_KEY_STEP);
          break;
        case 'ArrowRight':
          e.preventDefault();
          nudge(NUDGE_KEY_STEP);
          break;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        e.preventDefault();
        holdEnd();
      }
    };

    // A blur mid-hold (alt-tab, etc.) should close the line cleanly.
    const onBlur = () => holdEnd();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [enabled, holdStart, holdEnd, undo, stepBack, nudge, onPlayToggle]);

  const done = cursorIndex >= total && total > 0;

  return {
    cursorIndex,
    total,
    done,
    canUndo,
    isHolding,
    lastCreatedClipId,
    lastCommittedTime,
    holdStart,
    holdEnd,
    undo,
    stepBack,
    reset,
    nudge,
    jumpToCursorTime
  };
}
