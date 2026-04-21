/**
 * Representa una línea individual de la letra (lyrics) que ya ha sido sincronizada con un tiempo específico.
 * Es el resultado final después de presionar la barra espaciadora en el modo "SyncRecorder".
 */
export interface SyncedLine {
  /** El texto de la letra o verso. Ejemplo: "Never gonna give you up" */
  text: string;
  /** El tiempo exacto en segundos donde debe comenzar a mostrarse esta línea. Ejemplo: 12.45 */
  startTime: number;
}

/**
 * Objeto de estado global para todo el proceso de sincronización.
 * Contiene tanto el texto crudo (sin sincronizar) ingresado por el usuario,
 * como los datos ya sincronizados, y el archivo de audio.
 */
export interface SyncSession {
  /** 
   * URL local generada (Object URL) que apunta al archivo MP3 cargado por el usuario.
   * Se usa en el <audio> tag para reproducir la canción sin subirla a un servidor.
   */
  audioUrl: string | null;
  /** El nombre del archivo cargado (por ej. "MiCancion.mp3") para agregarlo a los metadatos al exportar. */
  trackName: string;
  /** 
   * Arreglo con todas las líneas de texto originales separadas por enter (\n).
   * Estas son las líneas "por hacer".
   */
  rawLines: string[];
  /** 
   * Arreglo con las líneas que el usuario ya "selló" (stamp) con un tiempo.
   * Conforme avanzas, este arreglo crece y 'pendingLineIndex' avanza.
   */
  syncedLines: SyncedLine[];
  /** 
   * Índice (número) que indica qué línea de 'rawLines' es la siguiente en recibir un tiempo.
   * Si es 0, significa que la próxima vez que presiones Espacio, se sincronizará la línea 0.
   */
  pendingLineIndex: number;
}

/**
 * Función de utilidad para generar un estado inicial vacío de SyncSession.
 * Se usa al arrancar la app o cuando quieres reiniciar todo el proceso.
 */
export function createInitialSyncSession(): SyncSession {
  return {
    audioUrl: null, // Aún no hay audio
    trackName: '',
    rawLines: [], // Aún no hay texto pegado
    syncedLines: [], // Nada sincronizado
    pendingLineIndex: 0 // Empezamos desde la línea 0
  };
}
