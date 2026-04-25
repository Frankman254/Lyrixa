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
  /** Optional ~4Hz tick from the <audio> element. Use rAF for smooth playhead. */
  onTimeUpdate?: (time: number) => void;
  onDurationChange: (duration: number) => void;
  onEnded: () => void;
}

export const AudioEngine = forwardRef<AudioEngineRef, AudioEngineProps>(({
  audioUrl,
  isPlaying,
  onTimeUpdate,
  onDurationChange,
  onEnded
}, ref) => {
  const audioRef = useRef<HTMLAudioElement>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const isConnectedRef = useRef(false);

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
  }, [isPlaying]);

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
          onDurationChange(audioRef.current.duration);
        }
      }}
      onEnded={onEnded}
      style={{ display: 'none' }}
    />
  );
});

AudioEngine.displayName = 'AudioEngine';
