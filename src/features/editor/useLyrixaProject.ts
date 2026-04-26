import { useCallback, useEffect, useRef, useState } from 'react';
import type { LyrixaProject } from '../../core/types/project';
import type { LyricClip } from '../../core/types/clip';
import type { LyricLayer } from '../../core/types/layer';
import type { LyricVisualStyle, RenderMode } from '../../core/types/render';
import type {
  AudioChannel,
  AudioChannelRole
} from '../../core/types/audio';
import { MAIN_LAYER_ID } from '../../core/types/layer';
import { normalizeLyricsText } from '../../core/lyrics/normalize';
import type { NormalizeLyricsOptions } from '../../core/lyrics/normalize';
import { createClipsFromNormalizedLyrics } from '../../core/timeline/clipsFromLyrics';
import type { ClipDurationStrategy } from '../../core/timeline/durationStrategies';
import { detectVocalActivity } from '../../core/audio/vocalActivity';
import {
  createEmptyProject,
  loadProject,
  saveProject
} from './projectPersistence';
import {
  putAudio,
  getAudio,
  deleteAudio,
  deleteAllProjectAudio
} from './audioBlobStorage';
import { extractPeaksFromBlob } from './peakExtraction';

const AUTOSAVE_DEBOUNCE_MS = 400;

export type SaveStatus = 'idle' | 'pending' | 'saved';

export interface ApplyLyricsOptions {
  /** Default duration in seconds. Used by `fixed` and as fallback. */
  defaultDuration?: number;
  /** When true, reuse existing clip timing for lines at the same index. */
  preserveExistingTiming?: boolean;
  /** Layer id to place the new clips on. Defaults to the main lyrics layer. */
  layerId?: string;
  /** Normalization options forwarded to normalizeLyricsText. */
  normalizeOptions?: NormalizeLyricsOptions;
  /** How clip durations are decided. Default: `fixed`. */
  strategy?: ClipDurationStrategy;
  minDuration?: number;
  maxDuration?: number;
}

export interface UseLyrixaProjectResult {
  project: LyrixaProject;
  saveStatus: SaveStatus;
  audioNeedsReload: boolean;

  setProjectName: (name: string) => void;
  loadAudioFile: (file: File, role?: AudioChannelRole) => Promise<void>;
  removeAudio: (role?: AudioChannelRole) => Promise<void>;
  /** Returns the in-memory Blob for a loaded audio channel, or null if unavailable. */
  getAudioBlob: (role: AudioChannelRole) => Blob | null;

  setRawLyricsText: (text: string) => void;
  applyLyrics: (rawText: string, options?: ApplyLyricsOptions) => void;
  /**
   * Re-run clip generation against the existing rawLyricsText using the
   * vocals stem's detected activity. Caller passes a layer id to target.
   * No-op when the vocals stem or its activity is missing.
   */
  regenerateFromVocals: (options?: {
    layerId?: string;
    minDuration?: number;
    maxDuration?: number;
  }) => void;

  setClips: (next: LyricClip[]) => void;
  updateClip: (clipId: string, patch: Partial<LyricClip>) => void;
  setLayers: (next: LyricLayer[]) => void;
  setStyleConfig: (next: LyricVisualStyle) => void;
  setCurrentTime: (time: number) => void;
  setRenderMode: (mode: RenderMode) => void;
  setMasterDuration: (seconds: number) => void;

  resetProject: () => Promise<void>;
}

/**
 * Single source of truth for the editor.
 *
 * Owns the LyrixaProject in memory, persists JSON to localStorage, and
 * persists audio blobs (master + vocals) to IndexedDB.
 */
export function useLyrixaProject(): UseLyrixaProjectResult {
  const [hydrated] = useState(() => loadProject());
  const [project, setProject] = useState<LyrixaProject>(hydrated.project);
  const [audioNeedsReload, setAudioNeedsReload] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');

  const saveTimerRef = useRef<number | null>(null);
  const skipNextSaveRef = useRef(true);

  // In-memory blobs for the current project — used by band peak extraction.
  const blobsRef = useRef<{ master: Blob | null; vocals: Blob | null }>({ master: null, vocals: null });

  const projectIdRef = useRef(project.id);
  useEffect(() => {
    projectIdRef.current = project.id;
  }, [project.id]);

  // Track latest objectUrls so we can revoke them on unmount.
  const objectUrlsRef = useRef<{ master: string | null; vocals: string | null }>({
    master: null,
    vocals: null
  });
  useEffect(() => {
    objectUrlsRef.current = {
      master: project.audioTracks.master?.objectUrl ?? null,
      vocals: project.audioTracks.vocals?.objectUrl ?? null
    };
  }, [project.audioTracks.master?.objectUrl, project.audioTracks.vocals?.objectUrl]);

  // Restore audio blobs from IndexedDB on mount, one role at a time.
  useEffect(() => {
    let cancelled = false;
    const initial = hydrated.project;

    const restore = async (role: AudioChannelRole, channel: AudioChannel | null | undefined) => {
      if (!channel) return;
      const stored = await getAudio(initial.id, role).catch(() => null);
      if (cancelled) return;
      if (!stored) {
        if (role === 'master') setAudioNeedsReload(true);
        return;
      }
      blobsRef.current[role] = stored.blob;
      const url = URL.createObjectURL(stored.blob);
      setProject(p => {
        const current = p.audioTracks[role];
        if (!current) return p;
        if (current.objectUrl) URL.revokeObjectURL(current.objectUrl);
        const updated: AudioChannel = {
          ...current,
          objectUrl: url,
          duration: stored.duration || current.duration,
          fileName: stored.fileName || current.fileName
        };
        return {
          ...p,
          audioTracks: { ...p.audioTracks, [role]: updated }
        };
      });
      // Re-extract peaks if missing — keeps mock fallback honest.
      if (!channel.waveformPeaks || channel.waveformPeaks.length === 0) {
        extractAndApplyPeaks(stored.blob, role);
      }
    };

    restore('master', initial.audioTracks.master);
    restore('vocals', initial.audioTracks.vocals);

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Revoke all ObjectURLs when the shell unmounts.
  useEffect(() => {
    return () => {
      const { master, vocals } = objectUrlsRef.current;
      if (master) URL.revokeObjectURL(master);
      if (vocals) URL.revokeObjectURL(vocals);
    };
  }, []);

  // Debounced autosave (lightweight JSON only).
  useEffect(() => {
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    setSaveStatus('pending');
    if (saveTimerRef.current != null) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => {
      saveProject(project);
      setSaveStatus('saved');
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimerRef.current != null) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [project]);

  useEffect(() => {
    if (saveStatus !== 'saved') return;
    const t = window.setTimeout(() => setSaveStatus('idle'), 1500);
    return () => window.clearTimeout(t);
  }, [saveStatus]);

  const setProjectName = useCallback((name: string) => {
    setProject(p => ({ ...p, name }));
  }, []);

  /**
   * Apply newly-decoded peaks to the right channel. For vocals, also
   * computes the activity segment list so the strategy picker can use it.
   */
  const applyChannelPeaks = useCallback(
    (role: AudioChannelRole, peaks: import('../../core/types/audio').AudioPeak[]) => {
      setProject(p => {
        const current = p.audioTracks[role];
        if (!current) return p;
        const next: AudioChannel = { ...current, waveformPeaks: peaks };
        if (role === 'vocals') {
          next.vocalActivity = detectVocalActivity(peaks);
        }
        return {
          ...p,
          audioTracks: { ...p.audioTracks, [role]: next }
        };
      });
    },
    []
  );

  const extractAndApplyPeaks = useCallback(
    (blob: Blob, role: AudioChannelRole) => {
      // Fire and forget — decoding is async but UI must not block on it.
      extractPeaksFromBlob(blob, { peaksPerSecond: 25 })
        .then(peaks => {
          if (peaks && peaks.length > 0) applyChannelPeaks(role, peaks);
        })
        .catch(() => {/* mock waveform stays in place */});
    },
    [applyChannelPeaks]
  );

  const loadAudioFile = useCallback(async (file: File, role: AudioChannelRole = 'master') => {
    const objectUrl = URL.createObjectURL(file);
    blobsRef.current[role] = file;
    const duration = await readAudioDuration(file).catch(() => 0);

    setProject(p => {
      const previous = p.audioTracks[role];
      if (previous?.objectUrl) URL.revokeObjectURL(previous.objectUrl);
      const channel: AudioChannel = {
        fileName: file.name,
        objectUrl,
        duration,
        waveformPeaks: undefined,
        vocalActivity: undefined
      };
      return {
        ...p,
        audioTracks: { ...p.audioTracks, [role]: channel }
      };
    });
    if (role === 'master') setAudioNeedsReload(false);

    try {
      await putAudio(projectIdRef.current, role, file, file.name, duration);
    } catch (err) {
      console.warn(`[Lyrixa] Could not persist ${role} audio blob:`, err);
    }

    extractAndApplyPeaks(file, role);
  }, [extractAndApplyPeaks]);

  const removeAudio = useCallback(async (role: AudioChannelRole = 'master') => {
    blobsRef.current[role] = null;
    setProject(p => {
      const previous = p.audioTracks[role];
      if (previous?.objectUrl) URL.revokeObjectURL(previous.objectUrl);
      return {
        ...p,
        audioTracks: { ...p.audioTracks, [role]: null }
      };
    });
    if (role === 'master') setAudioNeedsReload(false);
    await deleteAudio(projectIdRef.current, role);
  }, []);

  const setMasterDuration = useCallback((seconds: number) => {
    setProject(p => {
      const master = p.audioTracks.master;
      if (!master) return p;
      if (master.duration === seconds) return p;
      return {
        ...p,
        audioTracks: {
          ...p.audioTracks,
          master: { ...master, duration: seconds }
        }
      };
    });
  }, []);

  const setRawLyricsText = useCallback((text: string) => {
    setProject(p => ({ ...p, rawLyricsText: text }));
  }, []);

  const applyLyrics = useCallback((rawText: string, options: ApplyLyricsOptions = {}) => {
    const {
      defaultDuration = 2.5,
      preserveExistingTiming = true,
      layerId = MAIN_LAYER_ID,
      normalizeOptions,
      strategy = 'fixed',
      minDuration = 1.0,
      maxDuration = 6.0
    } = options;

    const { lines } = normalizeLyricsText(rawText, normalizeOptions);

    setProject(p => {
      const otherClips = p.clips.filter(c => c.layerId !== layerId);

      if (lines.length === 0) {
        return {
          ...p,
          rawLyricsText: rawText,
          normalizedLyrics: lines,
          clips: otherClips
        };
      }

      const trackDuration = p.audioTracks.master?.duration;
      const vocalActivity = p.audioTracks.vocals?.vocalActivity;
      const idPrefix = `clip-${Date.now()}`;

      const existingLayerClips = p.clips
        .filter(c => c.layerId === layerId)
        .sort((a, b) => a.startTime - b.startTime);

      const fresh = createClipsFromNormalizedLyrics(lines, {
        layerId,
        defaultDuration,
        minDuration,
        maxDuration,
        trackDuration,
        strategy,
        vocalActivity,
        idPrefix
      });

      let nextClips: LyricClip[] = fresh;

      if (preserveExistingTiming && existingLayerClips.length > 0 && strategy !== 'vocal-energy') {
        // Reuse existing timing wherever an old clip exists at the same index;
        // append fresh clips for new indexes.
        nextClips = fresh.map((generated, index) => {
          const reused = existingLayerClips[index];
          if (reused) {
            return { ...reused, text: generated.text, muted: generated.muted };
          }
          return generated;
        });
      }

      return {
        ...p,
        rawLyricsText: rawText,
        normalizedLyrics: lines,
        clips: [...otherClips, ...nextClips]
      };
    });
  }, []);

  const regenerateFromVocals = useCallback((opts: { layerId?: string; minDuration?: number; maxDuration?: number } = {}) => {
    const { layerId = MAIN_LAYER_ID, minDuration = 1.0, maxDuration = 6.0 } = opts;
    setProject(p => {
      const vocals = p.audioTracks.vocals;
      if (!vocals?.vocalActivity || vocals.vocalActivity.length === 0) return p;
      if (p.normalizedLyrics.length === 0) return p;

      const fresh = createClipsFromNormalizedLyrics(p.normalizedLyrics, {
        layerId,
        strategy: 'vocal-energy',
        vocalActivity: vocals.vocalActivity,
        trackDuration: p.audioTracks.master?.duration,
        minDuration,
        maxDuration,
        idPrefix: `clip-vox-${Date.now()}`
      });

      const otherClips = p.clips.filter(c => c.layerId !== layerId);
      return { ...p, clips: [...otherClips, ...fresh] };
    });
  }, []);

  const setClips = useCallback((next: LyricClip[]) => {
    setProject(p => ({ ...p, clips: next }));
  }, []);

  const updateClip = useCallback((clipId: string, patch: Partial<LyricClip>) => {
    setProject(p => ({
      ...p,
      clips: p.clips.map(c => (c.id === clipId ? { ...c, ...patch } : c))
    }));
  }, []);

  const setLayers = useCallback((next: LyricLayer[]) => {
    setProject(p => ({ ...p, layers: next }));
  }, []);

  const setStyleConfig = useCallback((next: LyricVisualStyle) => {
    setProject(p => ({ ...p, styleConfig: next }));
  }, []);

  const setCurrentTime = useCallback((time: number) => {
    setProject(p => (p.currentTime === time ? p : { ...p, currentTime: time }));
  }, []);

  const setRenderMode = useCallback((mode: RenderMode) => {
    setProject(p => ({ ...p, renderMode: mode }));
  }, []);

  const getAudioBlob = useCallback(
    (role: AudioChannelRole): Blob | null => blobsRef.current[role],
    []
  );

  const resetProject = useCallback(async () => {
    const oldId = projectIdRef.current;
    blobsRef.current = { master: null, vocals: null };
    setProject(p => {
      const m = p.audioTracks.master?.objectUrl;
      const v = p.audioTracks.vocals?.objectUrl;
      if (m) URL.revokeObjectURL(m);
      if (v) URL.revokeObjectURL(v);
      return createEmptyProject();
    });
    setAudioNeedsReload(false);
    await deleteAllProjectAudio(oldId);
  }, []);

  return {
    project,
    saveStatus,
    audioNeedsReload,
    setProjectName,
    loadAudioFile,
    removeAudio,
    getAudioBlob,
    setRawLyricsText,
    applyLyrics,
    regenerateFromVocals,
    setClips,
    updateClip,
    setLayers,
    setStyleConfig,
    setCurrentTime,
    setRenderMode,
    setMasterDuration,
    resetProject
  };
}

function readAudioDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.src = url;
    audio.addEventListener('loadedmetadata', () => {
      URL.revokeObjectURL(url);
      resolve(audio.duration);
    });
    audio.addEventListener('error', () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Could not read audio metadata for ${file.name}`));
    });
  });
}
