import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LyricClip } from '../../core/types/clip';
import {
  applyTapAtTime,
  nudgeLayerTiming,
  orderedLayerClips
} from '../../core/timeline/tapSync';

interface UseTapSyncArgs {
  /** Only when true does the hook listen to the keyboard. */
  enabled: boolean;
  clips: LyricClip[];
  layerId: string | null;
  trackDuration?: number;
  /** Live playback position in seconds (driven by the rAF transport). */
  playbackTime: number;
  provisionalDuration?: number;
  onClipsChange: (clips: LyricClip[]) => void;
  onPlayToggle: () => void;
  onSeek: (time: number) => void;
}

export interface UseTapSyncResult {
  cursorIndex: number;
  total: number;
  done: boolean;
  canUndo: boolean;
  tap: () => void;
  undo: () => void;
  stepBack: () => void;
  reset: () => void;
  nudge: (deltaSeconds: number) => void;
  jumpToCursorTime: () => void;
}

const NUDGE_KEY_STEP = 0.05;

/**
 * Drives the tap-to-sync mode: one key (Space) stamps the current playback time
 * onto the next pending lyric line. Keeps a small undo history so a mistimed tap
 * is one keypress away from being fixed.
 */
export function useTapSync({
  enabled,
  clips,
  layerId,
  trackDuration,
  playbackTime,
  provisionalDuration = 3,
  onClipsChange,
  onPlayToggle,
  onSeek
}: UseTapSyncArgs): UseTapSyncResult {
  const [cursorIndex, setCursorIndex] = useState(0);
  const historyRef = useRef<{ clips: LyricClip[]; cursor: number }[]>([]);
  const [canUndo, setCanUndo] = useState(false);

  const total = useMemo(
    () => (layerId ? orderedLayerClips(clips, layerId).length : 0),
    [clips, layerId]
  );

  // Keep the latest values reachable from the one-shot keyboard listener.
  const latest = useRef({ clips, layerId, playbackTime, trackDuration, provisionalDuration, cursorIndex });
  useEffect(() => {
    latest.current = { clips, layerId, playbackTime, trackDuration, provisionalDuration, cursorIndex };
  });

  // Reset cursor/history whenever the target layer changes or sync mode toggles.
  useEffect(() => {
    setCursorIndex(0);
    historyRef.current = [];
    setCanUndo(false);
  }, [layerId, enabled]);

  const tap = useCallback(() => {
    const { clips: c, layerId: lid, playbackTime: t, trackDuration: dur, provisionalDuration: prov, cursorIndex: cur } = latest.current;
    if (!lid) return;
    const result = applyTapAtTime(c, lid, cur, t, {
      provisionalDuration: prov,
      trackDuration: dur
    });
    if (result.nextCursor === cur && result.done) return; // nothing left to tap
    historyRef.current.push({ clips: c, cursor: cur });
    if (historyRef.current.length > 200) historyRef.current.shift();
    setCanUndo(true);
    onClipsChange(result.clips);
    setCursorIndex(result.nextCursor);
  }, [onClipsChange]);

  const undo = useCallback(() => {
    const prev = historyRef.current.pop();
    if (!prev) return;
    onClipsChange(prev.clips);
    setCursorIndex(prev.cursor);
    setCanUndo(historyRef.current.length > 0);
  }, [onClipsChange]);

  const stepBack = useCallback(() => {
    setCursorIndex(i => Math.max(0, i - 1));
  }, []);

  const reset = useCallback(() => {
    historyRef.current = [];
    setCanUndo(false);
    setCursorIndex(0);
  }, []);

  const nudge = useCallback((deltaSeconds: number) => {
    const { clips: c, layerId: lid } = latest.current;
    if (!lid) return;
    onClipsChange(nudgeLayerTiming(c, lid, deltaSeconds));
  }, [onClipsChange]);

  const jumpToCursorTime = useCallback(() => {
    const { clips: c, layerId: lid, cursorIndex: cur } = latest.current;
    if (!lid) return;
    const targets = orderedLayerClips(c, lid);
    const clip = targets[cur] ?? targets[cur - 1];
    if (clip) onSeek(clip.startTime);
  }, [onSeek]);

  // Keyboard: active only in sync mode, ignored while typing in a field.
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          tap();
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
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled, tap, undo, stepBack, nudge, onPlayToggle]);

  const done = cursorIndex >= total && total > 0;

  return {
    cursorIndex,
    total,
    done,
    canUndo,
    tap,
    undo,
    stepBack,
    reset,
    nudge,
    jumpToCursorTime
  };
}
