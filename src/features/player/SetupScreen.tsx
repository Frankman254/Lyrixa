import { useState } from 'react';
import type { SyncSession } from '../../core/types/sync';
import './SetupScreen.css';

interface SetupScreenProps {
  /** Función que se ejecuta cuando el usuario ha cargado el MP3 y el texto con éxito, pasando la sesión inicial */
  onSessionReady: (session: SyncSession) => void;
  /** Función que se ejecuta si el usuario prefiere usar datos de prueba (Mock) en lugar de subir sus propios archivos */
  onUseMock: () => void;
}

/**
 * Pantalla inicial de configuración.
 * Aquí el usuario selecciona su archivo de audio (MP3) y pega el texto crudo de las letras.
 * Una vez enviados estos 2 datos, construimos un objeto `SyncSession` para arrancar el grabador.
 */
export function SetupScreen({ onSessionReady, onUseMock }: SetupScreenProps) {
  // Estado local para guardar temporalmente el archivo y el texto ingresados
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [rawText, setRawText] = useState('');

  /**
   * Procesa la entrada del usuario cuando hace clic en "Start Sync Editor".
   */
  const handleStart = () => {
    // Si falta el audio o el texto está vacío, no hacemos nada
    if (!audioFile || !rawText.trim()) return;

    // 1. Dividir el texto por párrafos (separando por un doble Enter o línea en blanco)
    const rawLines = rawText
      .split(/\n\s*\n/)
      .map(chunk => chunk.trim()) // Quita espacios vacíos al principio o final del bloque
      .filter(chunk => chunk.length > 0); // Ignora bloques que estén completamente vacíos

    // 2. Construir la sesión global que entenderá el resto de la app
    const session: SyncSession = {
      audioUrl: URL.createObjectURL(audioFile), // Crea un link temporal local para el <audio>
      trackName: audioFile.name, // Guarda el nombre original del MP3
      rawLines, // Letras divididas
      syncedLines: [], // Empieza vacío
      pendingLineIndex: 0 // Inicia desde la primera línea
    };

    // 3. Pasar la sesión al componente padre (App.tsx)
    onSessionReady(session);
  };


  return (
    <div className="setup-screen-container">
      <div className="setup-card glass-panel">
        <h1>Lyrixa Sync Setup</h1>
        <p className="subtitle">Upload your media and lyrics to begin programming the timeline.</p>
        
        <div className="setup-form">
          <div className="form-group">
            <label>1. Select Audio Track (.mp3)</label>
            <input 
              type="file" 
              accept="audio/mp3, audio/mpeg, audio/wav, audio/ogg"
              onChange={(e) => setAudioFile(e.target.files?.[0] || null)}
              className="file-input"
            />
          </div>

          <div className="form-group">
            <label>2. Paste Raw Lyrics</label>
            <textarea 
              placeholder="Paste the song lyrics here... Each line will be parsed as a separate timestamp event."
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              className="lyrics-textarea"
            />
          </div>

          <button 
            className="start-btn" 
            disabled={!audioFile || !rawText.trim()}
            onClick={handleStart}
          >
            Start Sync Editor
          </button>
        </div>

        <div className="mock-fallback">
          <span className="divider">OR</span>
          <button className="hollow-btn" onClick={onUseMock}>
            Load Demo Track
          </button>
        </div>
      </div>
    </div>
  );
}
