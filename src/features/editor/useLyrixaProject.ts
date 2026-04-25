import { useCallback, useEffect, useRef, useState } from 'react';
import type { LyrixaProject, LyrixaTrack } from '../../core/types/project';
import type { LyricClip } from '../../core/types/clip';
import { MIN_CLIP_DURATION } from '../../core/types/clip';
import type { LyricLayer } from '../../core/types/layer';
import type { LyricVisualStyle, RenderMode } from '../../core/types/render';
import { MAIN_LAYER_ID } from '../../core/types/layer';
import { normalizeLyricsText } from '../../core/lyrics/normalize';
import type { NormalizeLyricsOptions } from '../../core/lyrics/normalize';
import { createClipsFromNormalizedLyrics } from '../../core/timeline/clipsFromLyrics';
import {
  createEmptyProject,
  loadProject,
  saveProject
} from './projectPersistence';
import { putAudio, getAudio, deleteAudio } from './audioBlobStorage';

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
  removeAudio: () => Promise<void>;

  setRawLyricsText: (text: string) => void;
  applyLyrics: (rawText: string, options?: ApplyLyricsOptions) => void;

  setClips: (next: LyricClip[]) => void;
  updateClip: (clipId: string, patch: Partial<LyricClip>) => void;
  setLayers: (next: LyricLayer[]) => void;
  setStyleConfig: (next: LyricVisualStyle) => void;
  setCurrentTime: (time: number) => void;
  setRenderMode: (mode: RenderMode) => void;
  setDuration: (seconds: number) => void;

  resetProject: () => Promise<void>;
}

/**
 * Single source of truth for the editor. Owns the LyrixaProject, persists
 * lightweight JSON to localStorage, and the audio blob to IndexedDB.
 */
export function useLyrixaProject(): UseLyrixaProjectResult {
  const [hydrated] = useState(() => loadProject());
  const [project, setProject] = useState<LyrixaProject>(hydrated.project);
  const [audioNeedsReload, setAudioNeedsReload] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');

  const saveTimerRef = useRef<number | null>(null);
  const skipNextSaveRef = useRef(true);

  const projectIdRef = useRef(project.id);
  useEffect(() => {
    projectIdRef.current = project.id;
  }, [project.id]);

  // Track the latest objectUrl so we can revoke it on unmount without going stale.
  const objectUrlRef = useRef<string | null>(null);
  useEffect(() => {
    objectUrlRef.current = project.track?.objectUrl ?? null;
  }, [project.track?.objectUrl]);

  // Try to restore the audio blob from IndexedDB on mount.
  useEffect(() => {
    let cancelled = false;
    if (!hydrated.project.track) return;

    getAudio(hydrated.project.id)
      .then(stored => {
        if (cancelled) return;
        if (!stored) {
          // Project metadata exists but no blob is on disk → must be reloaded.
          setAudioNeedsReload(true);
          return;
        }
        const url = URL.createObjectURL(stored.blob);
        setProject(p => {
          if (!p.track) return p;
          if (p.track.objectUrl) URL.revokeObjectURL(p.track.objectUrl);
          return {
            ...p,
            track: {
              ...p.track,
              objectUrl: url,
              duration: stored.duration || p.track.duration,
              fileName: stored.fileName || p.track.fileName
            }
          };
        });
        setAudioNeedsReload(false);
      })
      .catch(err => {
        console.warn('[Lyrixa] Audio restore failed:', err);
        if (!cancelled) setAudioNeedsReload(true);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Revoke the active ObjectURL when the shell unmounts.
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  // Debounced autosave (lightweight JSON only — no playback ticks here).
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

  const loadAudioFile = useCallback(async (file: File) => {
    const objectUrl = URL.createObjectURL(file);
    const duration = await readAudioDuration(file).catch(() => 0);

    setProject(p => {
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

    try {
      await putAudio(projectIdRef.current, file, file.name, duration);
    } catch (err) {
      console.warn('[Lyrixa] Could not persist audio blob to IndexedDB:', err);
    }
  }, []);

  const removeAudio = useCallback(async () => {
    setProject(p => {
      if (p.track?.objectUrl) URL.revokeObjectURL(p.track.objectUrl);
      return { ...p, track: null };
    });
    setAudioNeedsReload(false);
    await deleteAudio(projectIdRef.current);
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
      const otherClips = p.clips.filter(c => c.layerId !== layerId);

      if (lines.length === 0) {
        return {
          ...p,
          rawLyricsText: rawText,
          normalizedLyrics: lines,
          clips: otherClips
        };
      }

      const trackDuration = p.track?.duration;
      const idPrefix = `clip-${Date.now()}`;

      // Fresh layout when there's nothing to preserve, or the user opted out.
      const existingLayerClips = p.clips
        .filter(c => c.layerId === layerId)
        .sort((a, b) => a.startTime - b.startTime);

      let nextClips: LyricClip[];

      if (!preserveExistingTiming || existingLayerClips.length === 0) {
        nextClips = createClipsFromNormalizedLyrics(lines, {
          layerId,
          defaultDuration,
          trackDuration,
          idPrefix
        });
      } else {
        // Preserve timing for indexes that overlap; append new ones sequentially
        // after the LAST clip we have placed in this layer (using the most
        // recently generated clip, not stale `existingLayerClips`).
        nextClips = [];
        let cursor = existingLayerClips[existingLayerClips.length - 1]!.endTime;

        for (let i = 0; i < lines.length; i++) {
          const text = lines[i] ?? '';
          const reused = existingLayerClips[i];
          if (reused) {
            nextClips.push({ ...reused, text, muted: text.length === 0 });
            continue;
          }
          let clipStart = cursor;
          let clipEnd = clipStart + defaultDuration;
          if (trackDuration != null && clipEnd > trackDuration) {
            clipEnd = trackDuration;
            if (clipEnd - clipStart < MIN_CLIP_DURATION) {
              clipStart = Math.max(0, clipEnd - MIN_CLIP_DURATION);
            }
          }
          if (clipEnd - clipStart < MIN_CLIP_DURATION) {
            clipEnd = clipStart + MIN_CLIP_DURATION;
          }
          nextClips.push({
            id: `${idPrefix}-${i}`,
            text,
            startTime: clipStart,
            endTime: clipEnd,
            layerId,
            transitionIn: 'fade',
            transitionOut: 'fade',
            position: 'center',
            muted: text.length === 0
          });
          cursor = clipEnd;
        }
      }

      return {
        ...p,
        rawLyricsText: rawText,
        normalizedLyrics: lines,
        clips: [...otherClips, ...nextClips]
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

  const resetProject = useCallback(async () => {
    const oldId = projectIdRef.current;
    setProject(p => {
      if (p.track?.objectUrl) URL.revokeObjectURL(p.track.objectUrl);
      return createEmptyProject();
    });
    setAudioNeedsReload(false);
    await deleteAudio(oldId);
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
