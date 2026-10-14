import type { LyricClip } from '../types/clip';
import type { LyricProjectMode, LyricSource, LyrixaProject } from '../types/project';
import { normalizeLyricsText } from './normalize';
import type { NormalizeLyricsOptions } from './normalize';
import { createTapSyncSourceId, orderedLayerClips } from '../timeline/tapSync';

/**
 * The project's lyric sources, as one module.
 *
 * Every function takes a project and returns the next one (the same reference
 * when nothing changed), so the hook that owns React state is a thin adapter
 * and every rule here runs under Vitest without a DOM.
 *
 * The invariant this module exists to keep: `rawLyricsText` and
 * `normalizedLyrics` are always the concatenation of `lyricSources` sorted by
 * `order`. It is derived in exactly one place — `withLyricSources` — so no
 * caller can forget it or spell it differently.
 *
 * None of these functions touch clips except `recoverLyricSourceFromLayer`,
 * which only re-labels existing clips. Lyric imports are source-only: placing
 * clips on a layer is the Sync flow's job.
 */

export interface UpsertLyricSourceOptions {
  /** Normalization options forwarded to normalizeLyricsText. */
  normalizeOptions?: NormalizeLyricsOptions;
  /** Replace the target source, or add a new one (`add` only applies in multi mode). */
  sourceMode?: 'replace-active' | 'add';
  sourceTitle?: string;
  sourceStartTime?: number;
  /** Explicit existing source to edit. Defaults to the active source. */
  sourceId?: string;
}

export interface UpsertLyricSourceResult {
  project: LyrixaProject;
  /**
   * The source as it was before this call, when the call overwrote non-empty
   * text with different text. The device library mirrors sources by id, so
   * this is the only copy of the outgoing text — callers should archive it.
   */
  replaced: LyricSource | null;
}

/** The source an edit should target: the explicit id, else the active one, else the first. */
export function findActiveLyricSource(
  project: LyrixaProject,
  sourceId?: string | null
): LyricSource | null {
  const sources = project.lyricSources ?? [];
  return (sourceId ? sources.find(source => source.id === sourceId) : undefined)
    ?? sources.find(source => source.id === project.activeLyricSourceId)
    ?? sources[0]
    ?? null;
}

/**
 * Where a source starts on the master track. With `sourceId` null, the
 * active source is used; an unknown id starts at 0.
 */
export function getLyricSourceStartTime(project: LyrixaProject, sourceId: string | null): number {
  const source = sourceId
    ? project.lyricSources.find(item => item.id === sourceId)
    : findActiveLyricSource(project);
  const startTime = source?.startTime ?? 0;
  return Number.isFinite(startTime) ? Math.max(0, startTime) : 0;
}

/**
 * Create or replace a lyric source from pasted text, and make it active.
 *
 * In single mode, or when `sourceMode` is `replace-active`, the target source
 * (explicit id → active → first) is replaced in place: it keeps its id, order,
 * creation date and audio assignments. A new source is created when there is
 * none yet, or in multi mode with `sourceMode: 'add'`.
 */
export function upsertLyricSource(
  project: LyrixaProject,
  rawText: string,
  options: UpsertLyricSourceOptions = {}
): UpsertLyricSourceResult {
  const { normalizeOptions, sourceMode = 'replace-active', sourceTitle, sourceStartTime, sourceId } = options;
  const { lines } = normalizeLyricsText(rawText, normalizeOptions);
  const sources = project.lyricSources ?? [];
  const target = findActiveLyricSource(project, sourceId);
  const adding = !target || (project.lyricMode === 'multi' && sourceMode === 'add');
  const now = new Date().toISOString();

  const startTime = typeof sourceStartTime === 'number' && Number.isFinite(sourceStartTime)
    ? Math.max(0, sourceStartTime)
    : adding ? 0 : target.startTime ?? 0;

  const nextSource: LyricSource = adding
    ? {
        id: createLyricSourceId(),
        title: sourceTitle?.trim() || `Lyrics ${sources.length + 1}`,
        rawText,
        normalizedLines: lines,
        startTime,
        audioFileKeys: masterAudioKeys(project),
        order: nextOrder(sources),
        createdAt: now,
        updatedAt: now
      }
    : {
        ...target,
        title: sourceTitle?.trim() || target.title || 'Lyrics 1',
        rawText,
        normalizedLines: lines,
        startTime,
        audioFileKeys: target.audioFileKeys ?? [],
        updatedAt: now
      };

  const replaced = !adding && target.rawText.trim().length > 0 && target.rawText !== rawText
    ? target
    : null;
  const nextSources = adding
    ? [...sources, nextSource]
    : sources.map(source => source.id === nextSource.id ? nextSource : source);

  return {
    project: { ...withLyricSources(project, nextSources), activeLyricSourceId: nextSource.id },
    replaced
  };
}

/**
 * Drop a source from the project. Clips already timed from it stay on their
 * layers — they are independent timing artifacts the author may still want.
 */
export function removeLyricSource(project: LyrixaProject, id: string): LyrixaProject {
  if (!hasSource(project, id)) return project;
  const next = withLyricSources(project, project.lyricSources.filter(source => source.id !== id));
  return {
    ...next,
    activeLyricSourceId: project.activeLyricSourceId === id
      ? next.lyricSources[0]?.id
      : project.activeLyricSourceId
  };
}

/**
 * Link a source from the device library into the project and make it active.
 * Already linked → it just becomes active.
 */
export function attachLyricSource(project: LyrixaProject, source: LyricSource): LyrixaProject {
  if (hasSource(project, source.id)) {
    return project.activeLyricSourceId === source.id
      ? project
      : { ...project, activeLyricSourceId: source.id };
  }
  const next = withLyricSources(project, [
    ...project.lyricSources,
    { ...source, order: nextOrder(project.lyricSources) }
  ]);
  return { ...promoteToMulti(next), activeLyricSourceId: source.id };
}

/**
 * Rescue for accidental imports: rebuild a new source from the visible clips
 * already timed on one layer, and re-label those clips so Sync recognises
 * them as published lines of that source. Timings are never touched.
 */
export function recoverLyricSourceFromLayer(project: LyrixaProject, layerId: string): LyrixaProject {
  const layer = project.layers.find(item => item.id === layerId);
  if (!layer) return project;

  const clips = orderedLayerClips(project.clips, layerId)
    .filter(clip => !clip.muted && clip.text.trim().length > 0);
  if (clips.length === 0) return project;

  const rawText = clips.map(clip => clip.text.trim()).join('\n');
  const { lines } = normalizeLyricsText(rawText);
  if (lines.length === 0) return project;

  const now = new Date().toISOString();
  const id = createLyricSourceId();
  const recovered: LyricSource = {
    id,
    title: `Recovered from ${layer.name}`,
    rawText,
    normalizedLines: lines,
    startTime: Math.max(0, clips[0]?.startTime ?? 0),
    audioFileKeys: masterAudioKeys(project),
    order: nextOrder(project.lyricSources),
    createdAt: now,
    updatedAt: now
  };

  const patches = new Map<string, Partial<LyricClip>>();
  clips.forEach((clip, index) => {
    const text = lines[index] ?? clip.text.trim();
    patches.set(clip.id, {
      sourceIndex: index,
      sourceId: createTapSyncSourceId(index, text, id),
      lyricSourceId: id,
      createdBy: clip.createdBy ?? 'tap-sync'
    });
  });

  const next = withLyricSources(project, [...project.lyricSources, recovered]);
  return {
    ...promoteToMulti(next),
    activeLyricSourceId: id,
    clips: project.clips.map(clip => {
      const patch = patches.get(clip.id);
      return patch ? { ...clip, ...patch } : clip;
    })
  };
}

export function setActiveLyricSource(project: LyrixaProject, id: string): LyrixaProject {
  if (!hasSource(project, id) || project.activeLyricSourceId === id) return project;
  return { ...project, activeLyricSourceId: id };
}

export function setLyricMode(project: LyrixaProject, mode: LyricProjectMode): LyrixaProject {
  return {
    ...project,
    lyricMode: mode,
    activeLyricSourceId: project.activeLyricSourceId ?? project.lyricSources[0]?.id
  };
}

/** Rename a source. Blank titles are ignored. */
export function setLyricSourceTitle(project: LyrixaProject, id: string, title: string): LyrixaProject {
  const trimmed = title.trim();
  if (!trimmed) return project;
  return patchSource(project, id, { title: trimmed });
}

/** Set where a source starts on the master track, in seconds (clamped at 0). */
export function setLyricSourceStartTime(project: LyrixaProject, id: string, startTime: number): LyrixaProject {
  return patchSource(project, id, { startTime: Math.max(0, Number.isFinite(startTime) ? startTime : 0) });
}

/** Assign or unassign a device-library audio file to a source. */
export function setLyricSourceAudioAssignment(
  project: LyrixaProject,
  id: string,
  fileKey: string,
  assigned: boolean
): LyrixaProject {
  if (!fileKey) return project;
  const source = project.lyricSources.find(item => item.id === id);
  if (!source) return project;
  const keys = new Set(source.audioFileKeys ?? []);
  if (assigned) keys.add(fileKey);
  else keys.delete(fileKey);
  return patchSource(project, id, { audioFileKeys: [...keys] });
}

// ── internals ────────────────────────────────────────────────────────────

/** The single place `rawLyricsText` / `normalizedLyrics` are derived. */
function withLyricSources(project: LyrixaProject, sources: LyricSource[]): LyrixaProject {
  const sorted = [...sources].sort((a, b) => a.order - b.order);
  return {
    ...project,
    lyricSources: sorted,
    rawLyricsText: sorted.map(source => source.rawText.trim()).filter(Boolean).join('\n\n'),
    normalizedLyrics: sorted.flatMap(source => source.normalizedLines)
  };
}

function patchSource(project: LyrixaProject, id: string, patch: Partial<LyricSource>): LyrixaProject {
  if (!hasSource(project, id)) return project;
  const now = new Date().toISOString();
  return {
    ...project,
    lyricSources: project.lyricSources.map(source =>
      source.id === id ? { ...source, ...patch, updatedAt: now } : source
    )
  };
}

function promoteToMulti(project: LyrixaProject): LyrixaProject {
  return project.lyricSources.length > 1 && project.lyricMode !== 'multi'
    ? { ...project, lyricMode: 'multi' }
    : project;
}

function hasSource(project: LyrixaProject, id: string): boolean {
  return (project.lyricSources ?? []).some(source => source.id === id);
}

function nextOrder(sources: LyricSource[]): number {
  return Math.max(-1, ...sources.map(source => source.order)) + 1;
}

function masterAudioKeys(project: LyrixaProject): string[] {
  const key = project.audioTracks.master?.fileKey;
  return key ? [key] : [];
}

function createLyricSourceId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `lyrics-${crypto.randomUUID()}`;
  }
  return `lyrics-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
