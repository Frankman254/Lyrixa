import type { LyricClip } from '../types/clip';
import type { LyrixaProject } from '../types/project';
import { normalizeLyricsText } from '../lyrics/normalize';
import { getLyricSourceStartTime } from '../lyrics/lyricSourceLibrary';
import {
  createTapSyncSourceId,
  findNextUnpublishedLineIndex,
  findTapSyncResumeTime,
  orderedLayerClips
} from './tapSync';
import type { TapSyncLine } from './tapSync';

/**
 * What a sync session works through, and where it picks up.
 *
 * Sync progress is never stored on its own: it is re-derived from
 * `project.clips` every time a session starts or switches layer/source. That
 * is what lets the Sync window be closed, the page reloaded or the layer
 * changed without losing the author's place.
 */
export interface SyncQueue {
  layerId: string;
  /** The lines to time, in order, each carrying its stable `sourceId`. */
  lines: TapSyncLine[];
  /**
   * `project.clips` with source identity attached to clips that already
   * render one of `lines` but predate line identity. The same reference as
   * `project.clips` when nothing needed attaching.
   */
  clips: LyricClip[];
  /** First line not yet published on the layer (`lines.length` when done). */
  cursorIndex: number;
  /** Where playback should resume: after the last published line, else the source start. */
  resumeTime: number;
  /**
   * Text to seed `rawLyricsText` with, when the project has no lyrics at all
   * and the lines had to be recovered from existing clips. Null otherwise.
   */
  seedRawLyricsText: string | null;
}

/**
 * Build the queue for syncing `layerId`.
 *
 * Lines come from the project's lyric sources (`sourceFilterId` null = every
 * source, in order). A project with no lyric text at all falls back to the
 * text of existing clips — preferring `layerId`, else the layer carrying the
 * most text — so imported timings can still be re-synced.
 */
export function buildSyncQueue(
  project: LyrixaProject,
  layerId: string,
  sourceFilterId: string | null
): SyncQueue {
  const lines = buildSyncLines(project, layerId, sourceFilterId);
  const clips = attachSourceIdentity(project.clips, layerId, lines);
  const seedRawLyricsText =
    project.rawLyricsText.trim().length === 0 && project.lyricSources.length === 0 && lines.length > 0
      ? lines.map(line => line.text).join('\n')
      : null;

  return {
    layerId,
    lines,
    clips,
    cursorIndex: findNextUnpublishedLineIndex(lines, clips, layerId),
    resumeTime: findTapSyncResumeTime(lines, clips, layerId, getLyricSourceStartTime(project, sourceFilterId)),
    seedRawLyricsText
  };
}

/** True when the project holds lyric text, in sources or as a raw paste. */
export function hasProjectLyricLines(project: LyrixaProject): boolean {
  return listProjectLyricLines(project, null).length > 0;
}

/**
 * True when syncing `layerId` would have lines to work through: project
 * lyrics, or existing clip text to recover them from.
 */
export function hasSyncableLyrics(project: LyrixaProject, layerId: string | null): boolean {
  if (!layerId) return false;
  return hasProjectLyricLines(project) || findBestTextClips(project, layerId).length > 0;
}

// ── internals ────────────────────────────────────────────────────────────

function buildSyncLines(
  project: LyrixaProject,
  layerId: string,
  sourceFilterId: string | null
): TapSyncLine[] {
  const layerClips = orderedLayerClips(project.clips, layerId);
  const fallbackClips = findBestTextClips(project, layerId);
  const projectLines = listProjectLyricLines(project, sourceFilterId);
  const sourceLines = projectLines.length > 0
    ? projectLines
    : sourceFilterId
      ? []
      : fallbackClips.map((clip, index) => ({
          text: clip.text,
          sourceIndex: index,
          sourceId: clip.sourceId ?? createTapSyncSourceId(index, clip.text),
          lyricSourceId: clip.lyricSourceId
        }));

  return sourceLines.map((line, index) => {
    const sameTextAtIndex = layerClips[index]?.text.trim() === line.text.trim()
      ? layerClips[index]
      : undefined;
    const existing = layerClips.find(clip => clip.sourceId === line.sourceId) ?? sameTextAtIndex;
    return {
      sourceIndex: line.sourceIndex,
      sourceId: line.sourceId,
      lyricSourceId: line.lyricSourceId,
      text: line.text,
      template: existing ?? fallbackClips[index]
    };
  });
}

function listProjectLyricLines(project: LyrixaProject, sourceFilterId: string | null): TapSyncLine[] {
  const allSources = [...(project.lyricSources ?? [])]
    .filter(source => source.normalizedLines.length > 0 || source.rawText.trim().length > 0)
    .sort((a, b) => a.order - b.order);
  const sources = sourceFilterId
    ? allSources.filter(source => source.id === sourceFilterId)
    : allSources;

  if (sources.length === 0) {
    // The combined rawLyricsText is only a fallback when no specific
    // source was asked for.
    if (sourceFilterId) return [];
    return normalizeLyricsText(project.rawLyricsText).lines.map((text, index) => ({
      sourceIndex: index,
      sourceId: createTapSyncSourceId(index, text),
      text
    }));
  }

  return sources.flatMap(source => {
    const lines = source.normalizedLines.length > 0
      ? source.normalizedLines
      : normalizeLyricsText(source.rawText).lines;
    return lines.map((text, index) => ({
      sourceIndex: index,
      sourceId: createTapSyncSourceId(index, text, source.id),
      lyricSourceId: source.id,
      text
    }));
  });
}

/** Clips with text on `preferredLayerId`, else on the layer carrying the most text. */
function findBestTextClips(project: LyrixaProject, preferredLayerId: string): LyricClip[] {
  const withText = (layerId: string) =>
    orderedLayerClips(project.clips, layerId).filter(clip => clip.text.trim().length > 0);

  const preferred = withText(preferredLayerId);
  if (preferred.length > 0) return preferred;

  let best: LyricClip[] = [];
  for (const layer of project.layers) {
    const candidate = withText(layer.id);
    if (candidate.length > best.length) best = candidate;
  }
  return best;
}

/**
 * Give clips that already render a queued line that line's identity, matched
 * by `sourceId` first and by same text at the same index second.
 */
function attachSourceIdentity(clips: LyricClip[], layerId: string, lines: TapSyncLine[]): LyricClip[] {
  const layerClips = orderedLayerClips(clips, layerId);
  const patches = new Map<string, Partial<LyricClip>>();

  for (const line of lines) {
    const sameSource = layerClips.find(clip => clip.sourceId === line.sourceId);
    const sameTextAtIndex = layerClips[line.sourceIndex]?.text.trim() === line.text.trim()
      ? layerClips[line.sourceIndex]
      : undefined;
    const clip = sameSource ?? sameTextAtIndex;
    if (!clip) continue;
    if (
      clip.sourceId === line.sourceId &&
      clip.sourceIndex === line.sourceIndex &&
      clip.lyricSourceId === line.lyricSourceId &&
      clip.createdBy
    ) {
      continue;
    }
    patches.set(clip.id, {
      sourceId: line.sourceId,
      sourceIndex: line.sourceIndex,
      lyricSourceId: line.lyricSourceId,
      createdBy: clip.createdBy ?? 'import'
    });
  }

  if (patches.size === 0) return clips;
  return clips.map(clip => {
    const patch = patches.get(clip.id);
    return patch ? { ...clip, ...patch } : clip;
  });
}
