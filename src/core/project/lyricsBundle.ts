import type { LyricClip } from '../types/clip';
import type { LyricLayer } from '../types/layer';
import type { LyrixaProject } from '../types/project';
import type {
  ClipProgressIndicatorConfig,
  LyricAnimationConfig,
  LyricFxConfig,
  LyricVisualStyle
} from '../types/render';
import {
  normalizeClips,
  normalizeLayers,
  stripRuntimeTextureUrls
} from './serialization';
import {
  resolveLyricAnimationConfig,
  resolveLyricFxConfig,
  resolveLyricVisualStyle,
  resolveProgressIndicatorConfig
} from '../render/resolveVisualStyle';

/**
 * Lyrics bundle export format.
 *
 * This is the cross-app contract that LiveWallpaper (and any other renderer)
 * imports. It is intentionally smaller than the full `.lyrixa.json` project
 * envelope: no audio bytes, no UI preferences, no transient runtime state.
 *
 * The bundle exports `sourceTrack` so the consumer can rebind to its own
 * local copy of the audio without sharing a project id with Lyrixa. Layer
 * ids stay stable (`layer-main`, `layer-backing`, `layer-fx`) so the
 * consumer can attach renderer-specific behavior to known channels.
 *
 * Versioning: bumps require a code-side migration on the consumer.
 * Unknown fields MUST be ignored, not rejected — that's how new authoring
 * features (e.g. word-sync) ship without breaking older renderers.
 */

export const LYRICS_BUNDLE_APP = 'Lyrixa';
export const LYRICS_BUNDLE_KIND = 'lyrics-bundle';
export const LYRICS_BUNDLE_SCHEMA_VERSION = 1;

export interface LyricsBundleSourceTrack {
  fileName: string;
  /** Master track duration in milliseconds (integer). */
  durationMs: number;
  /** Stable per-file key for cross-app matching, when known. */
  fileKey?: string;
  sizeBytes?: number;
  lastModified?: number;
}

export interface LyricsBundleProject {
  /** Authoring source. Not authoritative for the renderer — clips/layers are. */
  rawLyricsText: string;
  normalizedLyrics: string[];
  layers: LyricLayer[];
  clips: LyricClip[];
  styleConfig: LyricVisualStyle;
  animationConfig: LyricAnimationConfig;
  fxConfig: LyricFxConfig;
  progressIndicatorConfig: ClipProgressIndicatorConfig;
}

export interface LyricsBundleEnvelope {
  schemaVersion: typeof LYRICS_BUNDLE_SCHEMA_VERSION;
  app: typeof LYRICS_BUNDLE_APP;
  exportKind: typeof LYRICS_BUNDLE_KIND;
  exportedAt: string;
  /** Author-side label for the export. Display-only. */
  projectName: string;
  sourceTrack: LyricsBundleSourceTrack | null;
  project: LyricsBundleProject;
}

export function createLyricsBundleEnvelope(project: LyrixaProject): LyricsBundleEnvelope {
  const stripped = stripRuntimeTextureUrls(project);
  const master = stripped.audioTracks.master;
  const sourceTrack: LyricsBundleSourceTrack | null = master
    ? {
        fileName: master.fileName,
        durationMs: Math.round((master.duration ?? 0) * 1000),
        fileKey: master.fileKey,
        sizeBytes: master.sizeBytes,
        lastModified: master.lastModified
      }
    : null;

  return {
    schemaVersion: LYRICS_BUNDLE_SCHEMA_VERSION,
    app: LYRICS_BUNDLE_APP,
    exportKind: LYRICS_BUNDLE_KIND,
    exportedAt: new Date().toISOString(),
    projectName: project.name,
    sourceTrack,
    project: {
      rawLyricsText: stripped.rawLyricsText,
      normalizedLyrics: stripped.normalizedLyrics,
      layers: stripped.layers,
      clips: stripped.clips,
      styleConfig: stripped.styleConfig,
      animationConfig: stripped.animationConfig,
      fxConfig: stripped.fxConfig,
      progressIndicatorConfig: stripped.progressIndicatorConfig
    }
  };
}

export interface ParsedLyricsBundle {
  envelope: LyricsBundleEnvelope;
  /** Project fragment ready to be merged onto an existing LyrixaProject. */
  fragment: LyricsBundleProject;
  sourceTrack: LyricsBundleSourceTrack | null;
}

/**
 * Validate and normalize a raw bundle payload. Throws on schema mismatch.
 * The returned `fragment` is NOT a full LyrixaProject — callers decide how
 * to merge it (replace project, replace lyrics-only, etc.).
 */
export function parseLyricsBundleEnvelope(raw: unknown): ParsedLyricsBundle {
  if (!isObject(raw)) throw new Error('Invalid lyrics bundle file.');
  if (raw.app !== LYRICS_BUNDLE_APP) {
    throw new Error('This file is not a Lyrixa lyrics bundle.');
  }
  if (raw.exportKind !== LYRICS_BUNDLE_KIND) {
    throw new Error('This file is not a Lyrixa lyrics bundle (wrong export kind).');
  }
  if (raw.schemaVersion !== LYRICS_BUNDLE_SCHEMA_VERSION) {
    throw new Error(`Unsupported lyrics bundle version: ${String(raw.schemaVersion)}`);
  }
  if (!isObject(raw.project)) {
    throw new Error('Lyrics bundle is missing its project payload.');
  }

  const projectRaw = raw.project as Partial<LyricsBundleProject>;
  const fragment: LyricsBundleProject = {
    rawLyricsText: typeof projectRaw.rawLyricsText === 'string' ? projectRaw.rawLyricsText : '',
    normalizedLyrics: Array.isArray(projectRaw.normalizedLyrics)
      ? projectRaw.normalizedLyrics.filter((l): l is string => typeof l === 'string')
      : [],
    layers: normalizeLayers(projectRaw.layers),
    clips: normalizeClips(projectRaw.clips),
    styleConfig: resolveLyricVisualStyle(projectRaw.styleConfig),
    animationConfig: resolveLyricAnimationConfig(projectRaw.animationConfig),
    fxConfig: resolveLyricFxConfig(projectRaw.fxConfig),
    progressIndicatorConfig: resolveProgressIndicatorConfig(projectRaw.progressIndicatorConfig)
  };

  const sourceTrackRaw = isObject(raw.sourceTrack) ? raw.sourceTrack : null;
  const sourceTrack: LyricsBundleSourceTrack | null = sourceTrackRaw
    ? {
        fileName: typeof sourceTrackRaw.fileName === 'string' ? sourceTrackRaw.fileName : '',
        durationMs: toFiniteNumber(sourceTrackRaw.durationMs, 0),
        fileKey: typeof sourceTrackRaw.fileKey === 'string' ? sourceTrackRaw.fileKey : undefined,
        sizeBytes: toOptionalNumber(sourceTrackRaw.sizeBytes),
        lastModified: toOptionalNumber(sourceTrackRaw.lastModified)
      }
    : null;

  const envelope: LyricsBundleEnvelope = {
    schemaVersion: LYRICS_BUNDLE_SCHEMA_VERSION,
    app: LYRICS_BUNDLE_APP,
    exportKind: LYRICS_BUNDLE_KIND,
    exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : new Date().toISOString(),
    projectName: typeof raw.projectName === 'string' ? raw.projectName : 'Imported lyrics',
    sourceTrack,
    project: fragment
  };

  return { envelope, fragment, sourceTrack };
}

/**
 * Apply a parsed bundle onto an existing project. Replaces lyrics, layers,
 * clips, and the project-level style/animation/fx defaults. Audio tracks
 * are preserved — the consumer is expected to keep its own audio binding.
 */
export function mergeLyricsBundleIntoProject(
  base: LyrixaProject,
  parsed: ParsedLyricsBundle
): LyrixaProject {
  return {
    ...base,
    rawLyricsText: parsed.fragment.rawLyricsText,
    normalizedLyrics: parsed.fragment.normalizedLyrics,
    layers: parsed.fragment.layers,
    clips: parsed.fragment.clips,
    styleConfig: parsed.fragment.styleConfig,
    animationConfig: parsed.fragment.animationConfig,
    fxConfig: parsed.fragment.fxConfig,
    progressIndicatorConfig: parsed.fragment.progressIndicatorConfig
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toFiniteNumber(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toOptionalNumber(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}
