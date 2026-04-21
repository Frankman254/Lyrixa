import { useEffect, useCallback, useState } from 'react';
import type { SyncSession } from '../../core/types/sync';
import './SyncRecorder.css';

interface SyncRecorderProps {
  /** Toda la información de la sesión actual (letras crudas, sincronizadas, etc.) */
  session: SyncSession;
  /** Tiempo actual de la canción, inyectado a 60FPS desde AudioEngine */
  audioTime: number;
  /** Para saber si la música está sonando o pausada */
  isPlaying: boolean;
  /** Función para registrar ('sellar') la línea actual con el tiempo exacto */
  onStampLine: (time: number) => void;
  /** Para cancelar el último registro si el usuario cometió un error */
  onUndoLast: () => void;
  /** Función para alternar entre reproducir y pausar el audio (Play/Pause) */
  onPlayToggle: () => void;
  /** Salir del modo grabador */
  onExitSync: () => void;
}

/**
 * SyncRecorder es el corazón de la herramienta de dictado/sincronización.
 * Permite al usuario escuchar la canción y presionar la barra espaciadora
 * cada vez que se canta la siguiente línea de la letra.
 */
export function SyncRecorder({ 
  session, 
  audioTime, 
  isPlaying, 
  onPlayToggle,
  onStampLine, 
  onUndoLast,
  onExitSync 
}: SyncRecorderProps) {
  
  // Estado simple para mostrar un mensaje de "Copiado exitoso"
  const [copied, setCopied] = useState(false);

  // Derivar líneas pendientes:
  // "pendingLine" es el texto de la línea que el usuario tiene que sincronizar ahora mismo.
  const pendingLine = session.rawLines[session.pendingLineIndex];
  // Si nuestro índice ya superó la cantidad de líneas, ¡terminamos!
  const isFinished = session.pendingLineIndex >= session.rawLines.length;

  /**
   * EFECTO GLOBAL: Escuchar la barra espaciadora.
   * Agregamos un "event listener" al objeto superior (window) para que el
   * usuario pueda presionar Espacio sin importar dónde tenga el foco (click).
   */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        // Previene que la página haga "scroll down" que es el comportamiento por defecto del Espacio en el navegador
        e.preventDefault();
        
        // Sólo permitimos el "sello" si la canción está reproduciendo y aún hay líneas pendientes
        if (isPlaying && !isFinished) {
          onStampLine(audioTime);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown); // Limpieza al desmontar
  }, [isPlaying, isFinished, audioTime, onStampLine]);

  /**
   * Exportación a formato LRC universal.
   * El formato LRC se ve así: [03:12.45]Línea de canción
   */
  const exportLRC = useCallback(() => {
    // Cabeceras estándar de un archivo LRC
    let lrcString = `[ti:${session.trackName}]\n`;
    lrcString += `[by:Lyrixa Sync]\n\n`;

    // Por cada línea sincronizada, calculamos los minutos y segundos para el formato LRC
    session.syncedLines.forEach(line => {
      const mins = Math.floor(line.startTime / 60); // Minutos enteros
      // Segundos sobrantes. toFixed(2) da 2 decimales para precisión (ej: 12.50)
      // padStart(5, '0') asegura el formato "00.00" -> ej: "05.10"
      const secs = (line.startTime % 60).toFixed(2).padStart(5, '0');
      
      // Agregamos la línea text formateada
      lrcString += `[${mins.toString().padStart(2, '0')}:${secs}]${line.text}\n`;
    });

    // Usar la API del portapapeles (clipboard) nativa para copiar automáticamente el resultado
    navigator.clipboard.writeText(lrcString).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000); // Regresamos el botón a su estado normal tras 2 segs
    });
  }, [session]);

  return (
    <div className="sync-recorder-wrapper glass-panel">
      
      <div className="sync-header">
        <h2>Sync Editor</h2>
        <div className="sync-actions">
          <button className="sync-btn primary" onClick={onPlayToggle}>
            {isPlaying ? '⏸ Pause Audio' : '▶ Play Audio'}
          </button>
          <button className="sync-btn" onClick={onUndoLast} disabled={session.syncedLines.length === 0}>
            Undo Last Stamp
          </button>
          <button className="sync-btn primary" onClick={exportLRC}>
            {copied ? 'Copied to Clipboard!' : 'Export LRC'}
          </button>
          <button className="sync-btn danger" onClick={onExitSync}>
            Exit Sync
          </button>
        </div>
      </div>

      <div className="sync-body">
        
        {/* Past synced lines (preview) */}
        <div className="synced-history">
          {session.syncedLines.map((line, idx) => (
            <div key={idx} className="history-line">
              <span className="time-tag">[{line.startTime.toFixed(2)}s]</span>
              <span className="text">{line.text}</span>
            </div>
          ))}
          {/* Auto scroll anchor imitation */}
          <div className="history-fade-out" />
        </div>

        {/* The active target */}
        <div className="sync-target-area">
          {!isFinished ? (
            <>
              <div className="target-label">Next line to stamp:</div>
              <div className="target-line">{pendingLine || "(Empty Line / Instrumental)"}</div>
              
              <button 
                className={`stamp-btn ${isPlaying ? 'pulse' : ''}`}
                onClick={() => isPlaying && onStampLine(audioTime)}
                disabled={!isPlaying}
              >
                {isPlaying ? 'STAMP (Spacebar)' : 'Play audio to stamp'}
              </button>
            </>
          ) : (
            <div className="finished-state">
              <h3>All lines synced!</h3>
              <p>You can export the LRC now or switch to the Player to preview.</p>
            </div>
          )}
        </div>

        {/* Upcoming lines preview */}
        <div className="upcoming-preview">
          {session.rawLines.slice(session.pendingLineIndex + 1, session.pendingLineIndex + 4).map((line, idx) => (
            <div key={idx} className="upcoming-line">{line || "(Empty line / Instrumental)"}</div>
          ))}
          {session.rawLines.length > session.pendingLineIndex + 4 && (
            <div className="upcoming-line faded">... {session.rawLines.length - (session.pendingLineIndex + 4)} more</div>
          )}
        </div>

      </div>
    </div>
  );
}
