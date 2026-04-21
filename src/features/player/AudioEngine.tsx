import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';

/** Refs expuestas hacia componentes padres */
export interface AudioEngineRef {
  /** Permite al componente padre cambiar el tiempo de reproducción manualmente */
  seekTo: (time: number) => void;
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

  useImperativeHandle(ref, () => ({
    seekTo: (time: number) => {
      if (audioRef.current) {
        audioRef.current.currentTime = time;
        onTimeUpdate(time);
      }
    }
  }));

  /** 
   * Control de Play / Pausa basado en props
   */
  useEffect(() => {
    if (audioRef.current) {
      if (isPlaying) {
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
