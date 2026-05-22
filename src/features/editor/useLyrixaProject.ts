import { useCallback, useEffect, useRef, useState } from 'react';
import type { LyrixaProject } from '../../core/types/project';
import type { LyricClip } from '../../core/types/clip';
import type { LyricLayer } from '../../core/types/layer';
import type {
  ClipProgressIndicatorConfig,
  LyricAnimationConfig,
  LyricFxConfig,
  LyricVisualStyle,
  RenderMode
} from '../../core/types/render';
import type {
  AudioChannel,
  AudioChannelRole
} from '../../core/types/audio';
import { buildAudioFileKey } from '../../core/types/audio';
import { MAIN_LAYER_ID } from '../../core/types/layer';
import { normalizeLyricsText } from '../../core/lyrics/normalize';
import type { NormalizeLyricsOptions } from '../../core/lyrics/normalize';
import { createClipsFromNormalizedLyrics } from '../../core/timeline/clipsFromLyrics';
import type { ClipDurationStrategy } from '../../core/timeline/durationStrategies';
import { createTapSyncSourceId } from '../../core/timeline/tapSync';
import {
  clearLyrixaLocalStorage,
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
import {
  extractPeaksFromBlob,
  shouldExtractRealPeaks
} from './peakExtraction';
import {
  deleteAllProjectTextures,
  getTextureAsset
} from '../assets/textureAssetStorage';

const AUTOSAVE_DEBOUNCE_MS = 400;

export type SaveStatus = 'idle' | 'pending' | 'saved';
export type ClipUpdate = LyricClip[] | ((previous: LyricClip[]) => LyricClip[]);

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
  /** Replace the active lyrics source or add a new ordered source. */
  sourceMode?: 'replace-active' | 'add';
  sourceTitle?: string;
  /** When adding a source, place its generated clips after the last clip on the layer. */
  appendAfterExisting?: boolean;
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

  setClips: (next: ClipUpdate) => void;
  updateClip: (clipId: string, patch: Partial<LyricClip>) => void;
  setLayers: (next: LyricLayer[]) => void;
  setStyleConfig: (next: LyricVisualStyle) => void;
  setAnimationConfig: (next: LyricAnimationConfig) => void;
  setFxConfig: (next: LyricFxConfig) => void;
  setProgressIndicatorConfig: (next: ClipProgressIndicatorConfig) => void;
  setCurrentTime: (time: number) => void;
  setRenderMode: (mode: RenderMode) => void;
  setMasterDuration: (seconds: number) => void;
  importProject: (next: LyrixaProject) => void;

  resetProject: () => Promise<void>;
  hardResetProject: () => Promise<void>;
}

/**
 * Single source of truth for the editor.
 *
 * Owns the LyrixaProject in memory, persists JSON to localStorage, and
 * persists the master audio blob to IndexedDB.
 */
export function useLyrixaProject(): UseLyrixaProjectResult {
  const [hydrated] = useState(() => loadProject());
  const [project, setProject] = useState<LyrixaProject>(hydrated.project);
  const [audioNeedsReload, setAudioNeedsReload] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');

  const saveTimerRef = useRef<number | null>(null);
  const skipNextSaveRef = useRef(true);

  // In-memory blob for the current project — used by band peak extraction.
  const blobsRef = useRef<{ master: Blob | null }>({ master: null });

  const projectIdRef = useRef(project.id);
  useEffect(() => {
    projectIdRef.current = project.id;
  }, [project.id]);

  // Track latest objectUrls so we can revoke them on unmount.
  const objectUrlsRef = useRef<{ master: string | null }>({ master: null });
  const textureObjectUrlsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    objectUrlsRef.current = {
      master: project.audioTracks.master?.objectUrl ?? null
    };
  }, [project.audioTracks.master?.objectUrl]);

  useEffect(() => {
    const nextUrls = collectTextureObjectUrls(project);
    textureObjectUrlsRef.current.forEach(url => {
      if (!nextUrls.has(url)) URL.revokeObjectURL(url);
    });
    textureObjectUrlsRef.current = nextUrls;
  }, [project]);

  useEffect(() => {
    let cancelled = false;
    const restore = async () => {
      const textureIds = collectTextureIds(hydrated.project);
      if (textureIds.length === 0) return;
      const restored = new Map<string, string | null>();
      for (const id of textureIds) {
        const asset = await getTextureAsset(hydrated.project.id, id);
        if (cancelled) return;
        restored.set(id, asset ? URL.createObjectURL(asset.blob) : null);
      }
      setProject(p => applyRestoredTextureUrls(p, restored));
    };
    void restore();
    return () => { cancelled = true; };
  }, [hydrated.project]);

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
          fileName: stored.fileName || current.fileName,
          sizeBytes: stored.sizeBytes ?? current.sizeBytes,
          lastModified: stored.lastModified ?? current.lastModified,
          fileKey: stored.fileKey ?? current.fileKey
        };
        return {
          ...p,
          audioTracks: { ...p.audioTracks, [role]: updated }
        };
      });
      // Re-extract peaks if missing — keeps mock fallback honest.
      if (!channel.waveformPeaks || channel.waveformPeaks.length === 0) {
        extractAndApplyPeaks(stored.blob, role, stored.duration);
      }
    };

    restore('master', initial.audioTracks.master);

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Revoke all ObjectURLs when the shell unmounts.
  useEffect(() => {
    return () => {
      const { master } = objectUrlsRef.current;
      if (master) URL.revokeObjectURL(master);
      textureObjectUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
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

  /** Apply newly-decoded peaks to the master channel. */
  const applyChannelPeaks = useCallback(
    (role: AudioChannelRole, peaks: import('../../core/types/audio').AudioPeak[]) => {
      setProject(p => {
        const current = p.audioTracks[role];
        if (!current) return p;
        const next: AudioChannel = { ...current, waveformPeaks: peaks };
        return {
          ...p,
          audioTracks: { ...p.audioTracks, [role]: next }
        };
      });
    },
    []
  );

  const extractAndApplyPeaks = useCallback(
    (blob: Blob, role: AudioChannelRole, durationSeconds: number) => {
      if (!shouldExtractRealPeaks(blob, durationSeconds)) return;
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
    const sizeBytes = file.size;
    const lastModified = file.lastModified;
    const fileKey = buildAudioFileKey(file.name, sizeBytes, lastModified);

    setProject(p => {
      const previous = p.audioTracks[role];
      if (previous?.objectUrl) URL.revokeObjectURL(previous.objectUrl);
      const channel: AudioChannel = {
        fileName: file.name,
        objectUrl,
        duration,
        waveformPeaks: undefined,
        sizeBytes,
        lastModified,
        fileKey
      };
      return {
        ...p,
        audioTracks: { ...p.audioTracks, [role]: channel }
      };
    });
    if (role === 'master') setAudioNeedsReload(false);

    try {
      await putAudio(projectIdRef.current, role, file, file.name, duration, {
        sizeBytes,
        lastModified,
        fileKey
      });
    } catch (err) {
      console.warn(`[Lyrixa] Could not persist ${role} audio blob:`, err);
    }

    extractAndApplyPeaks(file, role, duration);
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
      maxDuration = 6.0,
      sourceMode = 'replace-active',
      sourceTitle,
      appendAfterExisting = false
    } = options;

    const { lines } = normalizeLyricsText(rawText, normalizeOptions);

    setProject(p => {
      const now = new Date().toISOString();
      const currentSources = p.lyricSources ?? [];
      const activeSource = currentSources.find(source => source.id === p.activeLyricSourceId)
        ?? currentSources[0];
      const addingSource = sourceMode === 'add' || !activeSource;
      const lyricSourceId = addingSource
        ? createLyricSourceId()
        : activeSource.id;
      const nextSource = {
        id: lyricSourceId,
        title: sourceTitle?.trim() || (addingSource ? `Lyrics ${currentSources.length + 1}` : activeSource?.title) || 'Lyrics 1',
        rawText,
        normalizedLines: lines,
        order: addingSource
          ? Math.max(-1, ...currentSources.map(source => source.order)) + 1
          : activeSource.order,
        createdAt: addingSource ? now : activeSource.createdAt,
        updatedAt: now
      };
      const nextSources = addingSource
        ? [...currentSources, nextSource]
        : currentSources.map(source => source.id === lyricSourceId ? nextSource : source);
      const sortedSources = [...nextSources].sort((a, b) => a.order - b.order);
      const combinedRawLyricsText = sortedSources.map(source => source.rawText.trim()).filter(Boolean).join('\n\n');
      const combinedNormalizedLyrics = sortedSources.flatMap(source => source.normalizedLines);
      const hasSourceScopedClips = p.clips.some(c => c.layerId === layerId && c.lyricSourceId);
      const replacingLegacyLayer = !addingSource && !hasSourceScopedClips;
      const otherClips = addingSource
        ? p.clips
        : p.clips.filter(c =>
            c.layerId !== layerId ||
            (!replacingLegacyLayer && c.lyricSourceId !== lyricSourceId)
          );

      if (lines.length === 0) {
        return {
          ...p,
          rawLyricsText: combinedRawLyricsText,
          normalizedLyrics: combinedNormalizedLyrics,
          lyricSources: sortedSources,
          activeLyricSourceId: lyricSourceId,
          clips: otherClips
        };
      }

      const trackDuration = p.audioTracks.master?.duration;
      const idPrefix = `clip-${Date.now()}`;

      const existingLayerClips = p.clips
        .filter(c => c.layerId === layerId)
        .sort((a, b) => a.startTime - b.startTime);
      const appendOffset = addingSource && appendAfterExisting
        ? Math.max(0, ...p.clips.filter(c => c.layerId === layerId).map(c => c.endTime)) + 1
        : 0;

      const fresh = createClipsFromNormalizedLyrics(lines, {
        layerId,
        defaultDuration,
        minDuration,
        maxDuration,
        trackDuration,
        strategy,
        idPrefix
      }).map((clip, index) => ({
        ...clip,
        startTime: clip.startTime + appendOffset,
        endTime: clip.endTime + appendOffset,
        sourceIndex: index,
        sourceId: createTapSyncSourceId(index, clip.text, lyricSourceId),
        lyricSourceId,
        createdBy: 'import' as const
      }));

      let nextClips: LyricClip[] = fresh;

      if (preserveExistingTiming && existingLayerClips.length > 0) {
        // Reuse existing timing wherever an old clip exists at the same index;
        // append fresh clips for new indexes.
        nextClips = fresh.map((generated, index) => {
          const reused = existingLayerClips[index];
          if (reused) {
            return {
              ...reused,
              text: generated.text,
              muted: generated.muted,
              sourceIndex: generated.sourceIndex,
              sourceId: generated.sourceId,
              lyricSourceId,
              createdBy: reused.createdBy ?? 'import'
            };
          }
          return generated;
        });
      }

      return {
        ...p,
        rawLyricsText: combinedRawLyricsText,
        normalizedLyrics: combinedNormalizedLyrics,
        lyricSources: sortedSources,
        activeLyricSourceId: lyricSourceId,
        clips: [...otherClips, ...nextClips]
      };
    });
  }, []);

  const setClips = useCallback((next: ClipUpdate) => {
    setProject(p => ({
      ...p,
      clips: typeof next === 'function' ? next(p.clips) : next
    }));
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

  const setAnimationConfig = useCallback((next: LyricAnimationConfig) => {
    setProject(p => ({ ...p, animationConfig: next }));
  }, []);

  const setFxConfig = useCallback((next: LyricFxConfig) => {
    setProject(p => ({ ...p, fxConfig: next }));
  }, []);

  const setProgressIndicatorConfig = useCallback((next: ClipProgressIndicatorConfig) => {
    setProject(p => ({ ...p, progressIndicatorConfig: next }));
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
    blobsRef.current = { master: null };
    setProject(p => {
      const m = p.audioTracks.master?.objectUrl;
      if (m) URL.revokeObjectURL(m);
      return createEmptyProject();
    });
    setAudioNeedsReload(false);
    await deleteAllProjectAudio(oldId);
  }, []);

  const hardResetProject = useCallback(async () => {
    const oldId = projectIdRef.current;
    if (saveTimerRef.current != null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    blobsRef.current = { master: null };
    setProject(p => {
      const m = p.audioTracks.master?.objectUrl;
      if (m) URL.revokeObjectURL(m);
      collectTextureObjectUrls(p).forEach(url => URL.revokeObjectURL(url));
      return createEmptyProject();
    });
    textureObjectUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    textureObjectUrlsRef.current.clear();
    setAudioNeedsReload(false);
    setSaveStatus('idle');
    clearLyrixaLocalStorage();
    await Promise.all([
      deleteAllProjectAudio(oldId),
      deleteAllProjectTextures(oldId)
    ]);
  }, []);

  const importProject = useCallback((next: LyrixaProject) => {
    blobsRef.current = { master: null };
    setProject(p => {
      const m = p.audioTracks.master?.objectUrl;
      if (m) URL.revokeObjectURL(m);
      return next;
    });
    setAudioNeedsReload(!!next.audioTracks.master);
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
    setClips,
    updateClip,
    setLayers,
    setStyleConfig,
    setAnimationConfig,
    setFxConfig,
    setProgressIndicatorConfig,
    setCurrentTime,
    setRenderMode,
    setMasterDuration,
    importProject,
    resetProject,
    hardResetProject
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

function createLyricSourceId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `lyrics-${crypto.randomUUID()}`;
  }
  return `lyrics-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function collectTextureIds(project: LyrixaProject): string[] {
  const ids = new Set<string>();
  const visit = (style?: Partial<LyricVisualStyle>) => {
    const id = style?.textFill?.imageTexture?.id;
    if (id) ids.add(id);
  };
  visit(project.styleConfig);
  project.layers.forEach(layer => visit(layer.styleDefaults ?? layer.style));
  project.clips.forEach(clip => visit(clip.styleOverride));
  return Array.from(ids);
}

function collectTextureObjectUrls(project: LyrixaProject): Set<string> {
  const urls = new Set<string>();
  const visit = (style?: Partial<LyricVisualStyle>) => {
    const objectUrl = style?.textFill?.imageTexture?.objectUrl;
    if (objectUrl) urls.add(objectUrl);
  };
  visit(project.styleConfig);
  project.layers.forEach(layer => visit(layer.styleDefaults ?? layer.style));
  project.clips.forEach(clip => visit(clip.styleOverride));
  return urls;
}

function applyRestoredTextureUrls(project: LyrixaProject, urls: Map<string, string | null>): LyrixaProject {
  const apply = <T extends Partial<LyricVisualStyle> | undefined>(style: T): T => {
    const texture = style?.textFill?.imageTexture;
    if (!texture || !urls.has(texture.id)) return style;
    const objectUrl = urls.get(texture.id);
    return {
      ...style,
      textFill: {
        ...style.textFill,
        imageTexture: {
          ...texture,
          objectUrl: objectUrl ?? undefined,
          missing: !objectUrl
        }
      }
    } as T;
  };
  return {
    ...project,
    styleConfig: apply(project.styleConfig),
    layers: project.layers.map(layer => ({
      ...layer,
      styleDefaults: apply(layer.styleDefaults)
    })),
    clips: project.clips.map(clip => ({
      ...clip,
      styleOverride: apply(clip.styleOverride)
    }))
  };
}
