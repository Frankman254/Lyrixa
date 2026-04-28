import type { LyrixaProject, LyrixaTrack } from '../../core/types/project';
import type { AudioChannel, ProjectAudioTracks } from '../../core/types/audio';
import { createEmptyAudioTracks } from '../../core/types/audio';
import { createDefaultLayers } from '../../core/types/layer';
import {
  normalizeClips,
  normalizeLayers,
  normalizeProject,
  stripRuntimeTextureUrls
} from '../../core/project/serialization';
import {
  DEFAULT_CLIP_PROGRESS_INDICATOR,
  DEFAULT_LYRIC_ANIMATION,
  DEFAULT_LYRIC_FX,
  DEFAULT_LYRIC_STYLE,
  resolveClipProgressIndicator,
  resolveLyricAnimation,
  resolveLyricFx
} from '../../core/types/render';
import { resolveLyricVisualStyle } from '../../core/render/resolveVisualStyle';

const STORAGE_KEY = 'lyrixa:project:v1';
const SCHEMA_VERSION = 3;

export interface HydratedProject {
  project: LyrixaProject;
  /**
   * Always false at hydration time — IndexedDB drives the real value.
   * Kept on the result for parity with previous callers.
   */
  audioNeedsReload: boolean;
}

/**
 * Persisted shape strips ObjectURLs from every audio channel; those URLs
 * are recreated at runtime from IndexedDB blobs.
 */
type PersistedAudioChannel = Omit<AudioChannel, 'objectUrl'>;
interface PersistedAudioTracks {
  master: PersistedAudioChannel | null;
  vocals?: PersistedAudioChannel | null;
}

interface PersistedProject extends Omit<LyrixaProject, 'audioTracks'> {
  audioTracks: PersistedAudioTracks;
}

interface PersistedEnvelope {
  version: number;
  project: PersistedProject;
}

/**
 * Legacy v1 envelopes carried a single `track` field instead of `audioTracks`.
 * This shape exists only so the migration code can read it cleanly.
 */
interface LegacyV1Project {
  id: string;
  name: string;
  track?: (Omit<LyrixaTrack, 'objectUrl'>) | null;
  rawLyricsText: string;
  normalizedLyrics: string[];
  layers?: LyrixaProject['layers'];
  clips: LyrixaProject['clips'];
  styleConfig?: LyrixaProject['styleConfig'];
  animationConfig?: LyrixaProject['animationConfig'];
  fxConfig?: LyrixaProject['fxConfig'];
  progressIndicatorConfig?: LyrixaProject['progressIndicatorConfig'];
  currentTime: number;
  renderMode: LyrixaProject['renderMode'];
}

export function createEmptyProject(): LyrixaProject {
  return {
    id: generateId(),
    name: 'Untitled Project',
    audioTracks: createEmptyAudioTracks(),
    rawLyricsText: '',
    normalizedLyrics: [],
    layers: createDefaultLayers(),
    clips: [],
    styleConfig: { ...DEFAULT_LYRIC_STYLE },
    animationConfig: { ...DEFAULT_LYRIC_ANIMATION },
    fxConfig: { ...DEFAULT_LYRIC_FX },
    progressIndicatorConfig: { ...DEFAULT_CLIP_PROGRESS_INDICATOR },
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

function stripObjectUrls(channel: AudioChannel | null | undefined): PersistedAudioChannel | null {
  if (!channel) return null;
  const { objectUrl: _omit, ...rest } = channel;
  void _omit;
  return rest;
}

/**
 * Hydrate a project from localStorage. Returns a fresh empty project when
 * storage is unavailable, nothing was persisted, or the envelope is corrupt.
 *
 * Handles v1 (legacy `track` field) by migrating it onto `audioTracks.master`.
 */
export function loadProject(): HydratedProject {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { project: createEmptyProject(), audioNeedsReload: false };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { project: createEmptyProject(), audioNeedsReload: false };

    const envelope = JSON.parse(raw) as PersistedEnvelope | { version?: number; project?: unknown };
    if (!envelope || !envelope.project) {
      return { project: createEmptyProject(), audioNeedsReload: false };
    }

    if (envelope.version === SCHEMA_VERSION || envelope.version === 2) {
      const v2 = envelope as PersistedEnvelope;
      return {
        project: rehydrateV2(v2.project),
        audioNeedsReload: false
      };
    }

    // v1 migration path.
    if (envelope.version === 1 || envelope.version == null) {
      const v1 = envelope.project as LegacyV1Project;
      return {
        project: migrateV1(v1),
        audioNeedsReload: false
      };
    }

    // Unknown future version — start fresh rather than crash.
    return { project: createEmptyProject(), audioNeedsReload: false };
  } catch (err) {
    console.warn('[Lyrixa] Failed to hydrate project from localStorage:', err);
    return { project: createEmptyProject(), audioNeedsReload: false };
  }
}

function rehydrateV2(persisted: PersistedProject): LyrixaProject {
  return normalizeProject({
    ...persisted,
    audioTracks: {
      master: persisted.audioTracks?.master
        ? { ...persisted.audioTracks.master, objectUrl: undefined }
        : null,
      vocals: persisted.audioTracks?.vocals
        ? { ...persisted.audioTracks.vocals, objectUrl: undefined }
        : null
    }
  });
}

function migrateV1(legacy: LegacyV1Project): LyrixaProject {
  const audioTracks: ProjectAudioTracks = {
    master: legacy.track
      ? {
          fileName: legacy.track.fileName,
          duration: legacy.track.duration,
          waveformPeaks: legacy.track.waveformPeaks
        }
      : null,
    vocals: null
  };
  return {
    id: legacy.id,
    name: legacy.name,
    audioTracks,
    rawLyricsText: legacy.rawLyricsText ?? '',
    normalizedLyrics: legacy.normalizedLyrics ?? [],
    layers: normalizeLayers(legacy.layers),
    clips: normalizeClips(legacy.clips),
    styleConfig: resolveLyricVisualStyle(legacy.styleConfig),
    animationConfig: resolveLyricAnimation(legacy.animationConfig),
    fxConfig: resolveLyricFx(legacy.fxConfig),
    progressIndicatorConfig: resolveClipProgressIndicator(legacy.progressIndicatorConfig),
    currentTime: legacy.currentTime ?? 0,
    renderMode: legacy.renderMode ?? 'editor'
  };
}

/**
 * Persist the current project. ObjectURLs are stripped because they only
 * live for the current page; audio bytes go to IndexedDB instead.
 */
export function saveProject(project: LyrixaProject): void {
  if (typeof window === 'undefined' || !window.localStorage) return;

  const serializableProject = stripRuntimeTextureUrls(project);
  const persisted: PersistedProject = {
    ...serializableProject,
    audioTracks: {
      master: stripObjectUrls(serializableProject.audioTracks.master),
      vocals: stripObjectUrls(serializableProject.audioTracks.vocals)
    }
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
