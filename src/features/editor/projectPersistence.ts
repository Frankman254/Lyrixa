import type { LyrixaProject } from '../../core/types/project';
import { createDefaultLayers } from '../../core/types/layer';
import { DEFAULT_LYRIC_STYLE } from '../../core/types/render';

const STORAGE_KEY = 'lyrixa:project:v1';
const SCHEMA_VERSION = 1;

export interface HydratedProject {
  project: LyrixaProject;
  /** True when audio metadata existed but the ObjectURL is gone (expected after reload). */
  audioNeedsReload: boolean;
}

interface PersistedProject extends Omit<LyrixaProject, 'track'> {
  track: (Omit<NonNullable<LyrixaProject['track']>, 'objectUrl'>) | null;
}

interface PersistedEnvelope {
  version: number;
  project: PersistedProject;
}

export function createEmptyProject(): LyrixaProject {
  return {
    id: generateId(),
    name: 'Untitled Project',
    track: null,
    rawLyricsText: '',
    normalizedLyrics: [],
    layers: createDefaultLayers(),
    clips: [],
    styleConfig: { ...DEFAULT_LYRIC_STYLE },
    currentTime: 0,
    renderMode: 'editor'
  };
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Hydrate a project from localStorage. Returns a fresh empty project when:
 *   - storage is unavailable (SSR / private mode)
 *   - nothing has been persisted yet
 *   - the stored envelope is corrupt or from an incompatible version
 */
export function loadProject(): HydratedProject {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { project: createEmptyProject(), audioNeedsReload: false };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { project: createEmptyProject(), audioNeedsReload: false };

    const envelope = JSON.parse(raw) as PersistedEnvelope;
    if (!envelope || envelope.version !== SCHEMA_VERSION || !envelope.project) {
      return { project: createEmptyProject(), audioNeedsReload: false };
    }

    const persistedTrack = envelope.project.track;
    const project: LyrixaProject = {
      ...envelope.project,
      layers: envelope.project.layers?.length
        ? envelope.project.layers
        : createDefaultLayers(),
      styleConfig: envelope.project.styleConfig ?? { ...DEFAULT_LYRIC_STYLE },
      track: persistedTrack
        ? { ...persistedTrack, objectUrl: undefined }
        : null
    };

    return {
      project,
      // Optimistically false. The IndexedDB driver decides for real after it
      // tries to restore the audio blob; the hook flips this when the lookup
      // misses.
      audioNeedsReload: false
    };
  } catch (err) {
    console.warn('[Lyrixa] Failed to hydrate project from localStorage:', err);
    return { project: createEmptyProject(), audioNeedsReload: false };
  }
}

/**
 * Persist the current project. ObjectURLs are stripped because they're
 * only valid for the lifetime of the current page. Audio bytes live in
 * IndexedDB (see audioBlobStorage.ts); this function only writes JSON.
 */
export function saveProject(project: LyrixaProject): void {
  if (typeof window === 'undefined' || !window.localStorage) return;

  const persisted: PersistedProject = {
    ...project,
    track: project.track
      ? {
          fileName: project.track.fileName,
          duration: project.track.duration,
          waveformPeaks: project.track.waveformPeaks
        }
      : null
  };

  const envelope: PersistedEnvelope = {
    version: SCHEMA_VERSION,
    project: persisted
  };

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
  } catch (err) {
    console.warn('[Lyrixa] Failed to persist project:', err);
  }
}

export function clearPersistedProject(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
