import { useCallback, useEffect, useRef, useState } from 'react';
import type { AudioChannel } from '../../core/types/audio';
import type { AudioEngineRef } from '../player/AudioEngine';

interface UsePlaybackControllerArgs {
  projectId: string;
  initialTime: number;
  activeAudioChannel?: AudioChannel | null;
  onCurrentTimeCommit: (time: number) => void;
}

export function usePlaybackController({
  projectId,
  initialTime,
  activeAudioChannel,
  onCurrentTimeCommit
}: UsePlaybackControllerArgs) {
  const audioEngineRef = useRef<AudioEngineRef>(null);
  const rafRef = useRef<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(initialTime);

  useEffect(() => {
    setPlaybackTime(initialTime);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }
    const tick = () => {
      const t = audioEngineRef.current?.getCurrentTime() ?? 0;
      setPlaybackTime(t);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [isPlaying]);

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
  }, [onCurrentTimeCommit]);

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
