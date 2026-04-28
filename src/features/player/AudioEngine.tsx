import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';

export interface AudioEngineRef {
  /** Set the underlying <audio>'s currentTime. */
  seekTo: (time: number) => void;
  /** Read the underlying <audio>'s currentTime, or 0 when not mounted yet. */
  getCurrentTime: () => number;
  /** Web Audio AnalyserNode for waveform/spectrum visualizers. */
  getAnalyser: () => AnalyserNode | null;
}

interface AudioEngineProps {
  audioUrl: string;
  isPlaying: boolean;
  /** Position to restore when the underlying audio source URL changes. */
  sourceSyncTime?: number;
  /** Optional ~4Hz tick from the <audio> element. Use rAF for smooth playhead. */
  onTimeUpdate?: (time: number) => void;
  onDurationChange: (duration: number) => void;
  onEnded: () => void;
}

export const AudioEngine = forwardRef<AudioEngineRef, AudioEngineProps>(({
  audioUrl,
  isPlaying,
  sourceSyncTime = 0,
  onTimeUpdate,
  onDurationChange,
  onEnded
}, ref) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const sourceSyncTimeRef = useRef(sourceSyncTime);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const isConnectedRef = useRef(false);

  useEffect(() => {
    sourceSyncTimeRef.current = sourceSyncTime;
  }, [sourceSyncTime]);

  const initWebAudio = () => {
    if (!audioCtxRef.current) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      audioCtxRef.current = new AudioCtx();
      analyserRef.current = audioCtxRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
    }

    if (audioRef.current && !isConnectedRef.current && audioCtxRef.current && analyserRef.current) {
      const source = audioCtxRef.current.createMediaElementSource(audioRef.current);
      source.connect(analyserRef.current);
      analyserRef.current.connect(audioCtxRef.current.destination);
      isConnectedRef.current = true;
    }
  };

  useImperativeHandle(ref, () => ({
    seekTo: (time: number) => {
      if (audioRef.current) {
        audioRef.current.currentTime = time;
        onTimeUpdate?.(time);
      }
    },
    getCurrentTime: () => audioRef.current?.currentTime ?? 0,
    getAnalyser: () => analyserRef.current
  }));

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const applySyncTime = () => {
      const max = Number.isFinite(audio.duration) ? Math.max(0, audio.duration - 0.05) : sourceSyncTimeRef.current;
      audio.currentTime = Math.max(0, Math.min(sourceSyncTimeRef.current, max));
      onTimeUpdate?.(audio.currentTime);
    };

    if (audio.readyState >= 1) {
      applySyncTime();
      return;
    }

    audio.addEventListener('loadedmetadata', applySyncTime, { once: true });
    return () => audio.removeEventListener('loadedmetadata', applySyncTime);
  }, [audioUrl, onTimeUpdate]);

  useEffect(() => {
    if (audioRef.current) {
      if (isPlaying) {
        initWebAudio();
        if (audioCtxRef.current?.state === 'suspended') {
          audioCtxRef.current.resume();
        }
        audioRef.current.play().catch(e => console.warn('Audio play failed:', e));
      } else {
        audioRef.current.pause();
      }
    }
  }, [audioUrl, isPlaying]);

  const handleTimeUpdate = () => {
    if (audioRef.current && onTimeUpdate) {
      onTimeUpdate(audioRef.current.currentTime);
    }
  };

  return (
    <audio
      crossOrigin="anonymous"
      ref={audioRef}
      src={audioUrl}
      onTimeUpdate={handleTimeUpdate}
      onLoadedMetadata={() => {
        if (audioRef.current) {
          const max = Number.isFinite(audioRef.current.duration)
            ? Math.max(0, audioRef.current.duration - 0.05)
            : sourceSyncTimeRef.current;
          audioRef.current.currentTime = Math.max(0, Math.min(sourceSyncTimeRef.current, max));
          onDurationChange(audioRef.current.duration);
        }
      }}
      onEnded={onEnded}
      style={{ display: 'none' }}
    />
  );
});

AudioEngine.displayName = 'AudioEngine';
