import { useCallback, useEffect, useRef, useState } from 'react';
import type { AudioChannel } from '../../core/types/audio';
import type { AudioEngineRef } from '../player/AudioEngine';

interface UsePlaybackControllerArgs {
  projectId: string;
  initialTime: number;
  activeAudioChannel?: AudioChannel | null;
  onCurrentTimeCommit: (time: number) => void;
}

const PLAYBACK_UI_FPS = 24;
const PLAYBACK_UI_FRAME_MS = 1000 / PLAYBACK_UI_FPS;

export function usePlaybackController({
  projectId,
  initialTime,
  activeAudioChannel,
  onCurrentTimeCommit
}: UsePlaybackControllerArgs) {
  const audioEngineRef = useRef<AudioEngineRef>(null);
  const rafRef = useRef<number | null>(null);
  const lastUiFrameRef = useRef(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackState, setPlaybackState] = useState(() => ({
    projectId,
    time: initialTime
  }));
  const playbackTime = playbackState.projectId === projectId ? playbackState.time : initialTime;

  const setPlaybackTime = useCallback((time: number) => {
    setPlaybackState({ projectId, time });
  }, [projectId]);

  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }
    const tick = () => {
      const t = audioEngineRef.current?.getCurrentTime() ?? 0;
      const now = performance.now();
      if (now - lastUiFrameRef.current >= PLAYBACK_UI_FRAME_MS) {
        lastUiFrameRef.current = now;
        setPlaybackTime(t);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    lastUiFrameRef.current = 0;
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [isPlaying, setPlaybackTime]);

  useEffect(() => {
    if (isPlaying) return;
    onCurrentTimeCommit(playbackTime);
    // Persist last position only when play/pause state moves to paused.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  const handleSeek = useCallback((time: number) => {
    setPlaybackTime(time);
    onCurrentTimeCommit(time);
    audioEngineRef.current?.seekTo(time);
  }, [onCurrentTimeCommit, setPlaybackTime]);

  const handlePlayToggle = useCallback(() => {
    if (!activeAudioChannel?.objectUrl) return;
    setIsPlaying(p => !p);
  }, [activeAudioChannel?.objectUrl]);

  return {
    audioEngineRef,
    isPlaying,
    setIsPlaying,
    playbackTime,
    setPlaybackTime,
    handleSeek,
    handlePlayToggle
  };
}
