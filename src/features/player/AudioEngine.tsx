import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';

/** Refs expuestas hacia componentes padres */
export interface AudioEngineRef {
  /** Permite al componente padre cambiar el tiempo de reproducción manualmente */
  seekTo: (time: number) => void;
  /** Obtiene la instancia del Web Audio AnalyserNode para dibujar espectros/ondas visuales */
  getAnalyser: () => AnalyserNode | null;
}

interface AudioEngineProps {
  /** La URL del archivo de audio cargado */
  audioUrl: string;
  /** Estado que controla si el <audio> debe reproducirse o pausarse */
  isPlaying: boolean;
  /** Aviso de que el tiempo cambió (ya no a 60FPS para evitar trabar el navegador, usa el default ~4Hz) */
  onTimeUpdate: (time: number) => void;
  /** Nos avisa cuánto dura la canción en total, usualmente disponible al cargar metadatos */
  onDurationChange: (duration: number) => void;
  /** Se dispara cuando la canción llega al final */
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
  
  // Nodos de análisis Web Audio (FL Studio vibes)
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const isConnectedRef = useRef(false);

  // Inicialización Lazy del Contexto de Audio
  const initWebAudio = () => {
    if (!audioCtxRef.current) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      audioCtxRef.current = new AudioCtx();
      analyserRef.current = audioCtxRef.current.createAnalyser();
      analyserRef.current.fftSize = 256; // Frecuencias para visualizador de espectro
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
        onTimeUpdate(time);
      }
    },
    getAnalyser: () => analyserRef.current
  }));

  /** 
   * Control de Play / Pausa basado en props
   */
  useEffect(() => {
    if (audioRef.current) {
      if (isPlaying) {
        initWebAudio();
        // Asegurarse de que el contexto esté activo (browser autoplay policies)
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
    if (audioRef.current && isPlaying) {
      onTimeUpdate(audioRef.current.currentTime);
    }
  };

  return (
    <audio 
      crossOrigin="anonymous" /* Necessario para Web Audio API en algunos entornos locales */
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
