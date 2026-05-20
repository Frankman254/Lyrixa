import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LyricClip } from '../../core/types/clip';
import type { TapSyncLine } from '../../core/timeline/tapSync';
import {
  findNextUnpublishedLineIndex,
  nudgeLayerTiming,
  publishLineEnd,
  publishLineStart
} from '../../core/timeline/tapSync';

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
  onClipsChange: (clips: LyricClip[]) => void;
  onPlayToggle: () => void;
  onSeek: (time: number) => void;
}

export interface UseTapSyncResult {
  cursorIndex: number;
  total: number;
  done: boolean;
  canUndo: boolean;
  isHolding: boolean;
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
 * release it when the line ends. Keeps a small undo history so a mistimed line
 * is one keypress away from being fixed.
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
  const historyRef = useRef<{ clips: LyricClip[]; cursor: number }[]>([]);
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

  const commitClips = useCallback((next: LyricClip[]) => {
    latest.current = { ...latest.current, clips: next };
    onClipsChange(next);
  }, [onClipsChange]);

  // While the key is held, stretch the current clip's end to the live playhead
  // so it visibly grows on the timeline. The final end is committed on release.
  useEffect(() => {
    if (!holdingRef.current) return;
    const { clips: c, lines: source, layerId: lid, playbackTime: t, trackDuration: dur, cursorIndex: cur } = latest.current;
    if (!lid) return;
    const line = source[cur];
    if (!line) return;
    commitClips(publishLineEnd(c, line, t, { trackDuration: dur }));
  }, [playbackTime, commitClips]);

  // Reset cursor/history whenever the target layer, source lines, or sync mode changes.
  useEffect(() => {
    setCursorIndex(initialCursorIndex);
    historyRef.current = [];
    setCanUndo(false);
    holdingRef.current = false;
    setIsHolding(false);
    latest.current = { ...latest.current, cursorIndex: initialCursorIndex };
  }, [enabled, initialCursorIndex, layerId, lines]);

  const holdStart = useCallback(() => {
    if (holdingRef.current) return;
    const { clips: c, lines: source, layerId: lid, playbackTime: t, trackDuration: dur, cursorIndex: cur } = latest.current;
    const line = source[cur];
    if (!lid || !line) return;
    holdingRef.current = true;
    setIsHolding(true);
    historyRef.current.push({ clips: c, cursor: cur });
    if (historyRef.current.length > 200) historyRef.current.shift();
    setCanUndo(true);
    commitClips(publishLineStart(c, lid, line, t, { trackDuration: dur }));
  }, [commitClips]);

  const holdEnd = useCallback(() => {
    if (!holdingRef.current) return;
    holdingRef.current = false;
    setIsHolding(false);
    const { clips: c, lines: source, layerId: lid, playbackTime: t, trackDuration: dur, cursorIndex: cur } = latest.current;
    if (!lid) return;
    const line = source[cur];
    if (!line) return;
    const nextClips = publishLineEnd(c, line, t, { trackDuration: dur });
    commitClips(nextClips);
    const nextCursor = lid
      ? findNextUnpublishedLineIndex(source, nextClips, lid, cur + 1)
      : cur + 1;
    latest.current = { ...latest.current, cursorIndex: nextCursor };
    setCursorIndex(nextCursor);
  }, [commitClips]);

  const undo = useCallback(() => {
    const prev = historyRef.current.pop();
    if (!prev) return;
    holdingRef.current = false;
    setIsHolding(false);
    const removedLine = latest.current.lines[prev.cursor];
    const removedClip = removedLine
      ? latest.current.clips.find(clip => clip.id === removedLine.id)
      : null;
    commitClips(prev.clips);
    latest.current = { ...latest.current, cursorIndex: prev.cursor };
    setCursorIndex(prev.cursor);
    setCanUndo(historyRef.current.length > 0);
    if (removedClip) onSeek(removedClip.endTime);
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
    latest.current = { ...latest.current, cursorIndex: initialCursorIndex };
    setCursorIndex(initialCursorIndex);
  }, [initialCursorIndex]);

  const nudge = useCallback((deltaSeconds: number) => {
    const { clips: c, layerId: lid } = latest.current;
    if (!lid) return;
    commitClips(nudgeLayerTiming(c, lid, deltaSeconds));
  }, [commitClips]);

  const jumpToCursorTime = useCallback(() => {
    const { clips: c, lines: source, layerId: lid, cursorIndex: cur } = latest.current;
    if (!lid) return;
    const currentLine = source[cur] ?? source[cur - 1];
    const clip = currentLine ? c.find(item => item.id === currentLine.id) : null;
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
    holdStart,
    holdEnd,
    undo,
    stepBack,
    reset,
    nudge,
    jumpToCursorTime
  };
}
