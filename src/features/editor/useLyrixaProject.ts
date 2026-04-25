import { useCallback, useEffect, useRef, useState } from 'react';
import type { LyrixaProject, LyrixaTrack } from '../../core/types/project';
import type { LyricClip } from '../../core/types/clip';
import type { LyricLayer } from '../../core/types/layer';
import type { LyricVisualStyle, RenderMode } from '../../core/types/render';
import { MAIN_LAYER_ID } from '../../core/types/layer';
import { normalizeLyricsText } from '../../core/lyrics/normalize';
import type { NormalizeLyricsOptions } from '../../core/lyrics/normalize';
import {
  createEmptyProject,
  loadProject,
  saveProject
} from './projectPersistence';

const AUTOSAVE_DEBOUNCE_MS = 400;

export type SaveStatus = 'idle' | 'pending' | 'saved';

export interface ApplyLyricsOptions {
  /** Default duration (seconds) assigned to each clip when timing can't be preserved. */
  defaultDuration?: number;
  /** When true, reuse existing clip timing for lines at the same index. */
  preserveExistingTiming?: boolean;
  /** Layer id to place the new clips on. Defaults to the main lyrics layer. */
  layerId?: string;
  /** Normalization options forwarded to normalizeLyricsText. */
  normalizeOptions?: NormalizeLyricsOptions;
}

export interface UseLyrixaProjectResult {
  project: LyrixaProject;
  saveStatus: SaveStatus;
  audioNeedsReload: boolean;

  setProjectName: (name: string) => void;
  loadAudioFile: (file: File) => Promise<void>;
  removeAudio: () => void;

  setRawLyricsText: (text: string) => void;
  applyLyrics: (rawText: string, options?: ApplyLyricsOptions) => void;

  setClips: (next: LyricClip[]) => void;
  updateClip: (clipId: string, patch: Partial<LyricClip>) => void;
  setLayers: (next: LyricLayer[]) => void;
  setStyleConfig: (next: LyricVisualStyle) => void;
  setCurrentTime: (time: number) => void;
  setRenderMode: (mode: RenderMode) => void;
  setDuration: (seconds: number) => void;

  resetProject: () => void;
}

/**
 * Single source of truth for the editor. Owns the LyrixaProject, persists it
 * to localStorage (minus ObjectURLs), and exposes narrow mutators.
 */
export function useLyrixaProject(): UseLyrixaProjectResult {
  const [hydrated] = useState(() => loadProject());
  const [project, setProject] = useState<LyrixaProject>(hydrated.project);
  const [audioNeedsReload, setAudioNeedsReload] = useState(hydrated.audioNeedsReload);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');

  const saveTimerRef = useRef<number | null>(null);
  const skipNextSaveRef = useRef(true);

  // Debounced autosave. Skips the very first render (hydrated state doesn't need re-saving).
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

  // Flash the "Saved" chip back to idle after a short hold.
  useEffect(() => {
    if (saveStatus !== 'saved') return;
    const t = window.setTimeout(() => setSaveStatus('idle'), 1500);
    return () => window.clearTimeout(t);
  }, [saveStatus]);

  const setProjectName = useCallback((name: string) => {
    setProject(p => ({ ...p, name }));
  }, []);

  const loadAudioFile = useCallback(async (file: File) => {
    const objectUrl = URL.createObjectURL(file);
    const duration = await readAudioDuration(file).catch(() => 0);
    setProject(p => {
      // Revoke any previous transient URL before swapping.
      if (p.track?.objectUrl) URL.revokeObjectURL(p.track.objectUrl);
      const track: LyrixaTrack = {
        fileName: file.name,
        objectUrl,
        duration,
        waveformPeaks: undefined
      };
      return { ...p, track };
    });
    setAudioNeedsReload(false);
  }, []);

  const removeAudio = useCallback(() => {
    setProject(p => {
      if (p.track?.objectUrl) URL.revokeObjectURL(p.track.objectUrl);
      return { ...p, track: null };
    });
    setAudioNeedsReload(false);
  }, []);

  const setDuration = useCallback((seconds: number) => {
    setProject(p => {
      if (!p.track) return p;
      if (p.track.duration === seconds) return p;
      return { ...p, track: { ...p.track, duration: seconds } };
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
      normalizeOptions
    } = options;

    const { lines } = normalizeLyricsText(rawText, normalizeOptions);

    setProject(p => {
      const existingLayerClips = p.clips
        .filter(c => c.layerId === layerId)
        .sort((a, b) => a.startTime - b.startTime);

      const trackDuration = p.track?.duration;
      const nextClips: LyricClip[] = lines.map((text, index) => {
        const reused = preserveExistingTiming ? existingLayerClips[index] : undefined;
        if (reused) {
          return { ...reused, text };
        }
        const prev = existingLayerClips[index - 1];
        const startTime = prev
          ? prev.endTime
          : existingLayerClips[existingLayerClips.length - 1]?.endTime ?? 0;
        const endTime = trackDuration != null
          ? Math.min(startTime + defaultDuration, trackDuration)
          : startTime + defaultDuration;
        return {
          id: `clip-${Date.now()}-${index}`,
          text,
          startTime,
          endTime: Math.max(startTime + 0.25, endTime),
          layerId,
          transitionIn: 'fade',
          transitionOut: 'fade',
          position: 'center'
        };
      });

      // If we ended up with fewer lines than before, we drop the tail — that is
      // the natural user intent when shortening a lyrics paste.
      // Clips on other layers are left untouched.
      const otherClips = p.clips.filter(c => c.layerId !== layerId);

      // If the user erases all lyrics, fall back to regenerating from the
      // sorted syncedLinesToClips helper to keep behaviour consistent.
      const clips = lines.length === 0
        ? otherClips
        : [...otherClips, ...nextClips];

      return {
        ...p,
        rawLyricsText: rawText,
        normalizedLyrics: lines,
        clips
      };
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

  const resetProject = useCallback(() => {
    setProject(p => {
      if (p.track?.objectUrl) URL.revokeObjectURL(p.track.objectUrl);
      return createEmptyProject();
    });
    setAudioNeedsReload(false);
  }, []);

  return {
    project,
    saveStatus,
    audioNeedsReload,
    setProjectName,
    loadAudioFile,
    removeAudio,
    setRawLyricsText,
    applyLyrics,
    setClips,
    updateClip,
    setLayers,
    setStyleConfig,
    setCurrentTime,
    setRenderMode,
    setDuration,
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
