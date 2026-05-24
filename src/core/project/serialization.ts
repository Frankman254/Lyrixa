import type { AudioChannel, ProjectAudioTracks } from '../types/audio';
import type { LyricClip } from '../types/clip';
import { createDefaultLayers, DEFAULT_LAYER_AUDIO_REACTIVE } from '../types/layer';
import type {
  LyricLayer,
  LyricLayerAudioReactive,
  LyricLayerAudioReactiveTarget,
  LyricLayerAudioReactiveTargets
} from '../types/layer';
import { normalizeLyricsText } from '../lyrics/normalize';
import type { LyricSource, LyrixaProject } from '../types/project';
import { DEFAULT_LYRIC_ANIMATION } from '../types/render';
import {
  normalizePartialLyricVisualStyle,
  resolveLyricAnimationConfig,
  resolveLyricFxConfig,
  resolveLyricVisualStyle,
  resolveProgressIndicatorConfig
} from '../render/resolveVisualStyle';

export const LYRX_EXPORT_APP = 'Lyrixa';
export const LYRX_EXPORT_SCHEMA_VERSION = 1;

type SerializableAudioChannel = Omit<AudioChannel, 'objectUrl'>;

export interface LyrixaExportEnvelope {
  schemaVersion: number;
  app: typeof LYRX_EXPORT_APP;
  exportedAt: string;
  project: Omit<LyrixaProject, 'audioTracks'> & {
    audioTracks: {
      master: SerializableAudioChannel | null;
    };
    uiPreferences?: {
      bandMode?: string;
    };
  };
}

export function createProjectExportEnvelope(
  project: LyrixaProject,
  uiPreferences: LyrixaExportEnvelope['project']['uiPreferences'] = {}
): LyrixaExportEnvelope {
  return {
    schemaVersion: LYRX_EXPORT_SCHEMA_VERSION,
    app: LYRX_EXPORT_APP,
    exportedAt: new Date().toISOString(),
    project: {
      ...stripRuntimeTextureUrls(normalizeProject(project)),
      audioTracks: {
        master: stripObjectUrl(project.audioTracks.master)
      },
      uiPreferences
    }
  };
}

export function parseProjectExportEnvelope(raw: unknown): LyrixaProject {
  if (!isObject(raw)) throw new Error('Invalid Lyrixa project file.');
  if (raw.app !== LYRX_EXPORT_APP) throw new Error('This file is not a Lyrixa project.');
  if (raw.schemaVersion !== 1) throw new Error('Unsupported Lyrixa project version.');
  if (!isObject(raw.project)) throw new Error('Lyrixa project payload is missing.');
  return normalizeProject(raw.project as Partial<LyrixaProject>);
}

export function normalizeProject(input: Partial<LyrixaProject>): LyrixaProject {
  const emptyId = `imported-${Date.now()}`;
  const audioTracks = normalizeAudioTracks(input.audioTracks);
  const lyricSources = normalizeLyricSources(
    input.lyricSources,
    input.rawLyricsText,
    input.normalizedLyrics
  );
  const activeLyricSourceId =
    typeof input.activeLyricSourceId === 'string' &&
    lyricSources.some(source => source.id === input.activeLyricSourceId)
      ? input.activeLyricSourceId
      : lyricSources[0]?.id;
  return {
    id: typeof input.id === 'string' && input.id ? input.id : emptyId,
    name: typeof input.name === 'string' && input.name ? input.name : 'Imported Project',
    lyricMode: input.lyricMode === 'multi' || input.lyricMode === 'single'
      ? input.lyricMode
      : lyricSources.length > 1
        ? 'multi'
        : 'single',
    audioTracks,
    rawLyricsText: input.rawLyricsText ?? '',
    normalizedLyrics: Array.isArray(input.normalizedLyrics) ? input.normalizedLyrics : [],
    lyricSources,
    activeLyricSourceId,
    layers: normalizeLayers(input.layers),
    clips: normalizeClips(input.clips),
    styleConfig: resolveLyricVisualStyle(input.styleConfig),
    animationConfig: resolveLyricAnimationConfig(input.animationConfig),
    fxConfig: resolveLyricFxConfig(input.fxConfig),
    progressIndicatorConfig: resolveProgressIndicatorConfig(input.progressIndicatorConfig),
    currentTime: Number.isFinite(input.currentTime) ? input.currentTime! : 0,
    renderMode: input.renderMode ?? 'editor'
  };
}

export function normalizeLyricSources(
  sources: LyricSource[] | undefined,
  rawLyricsText = '',
  normalizedLyrics: string[] | undefined = undefined
): LyricSource[] {
  if (Array.isArray(sources) && sources.length > 0) {
    return sources
      .map((source, index) => {
        const rawText = typeof source.rawText === 'string' ? source.rawText : '';
        const normalizedLines = Array.isArray(source.normalizedLines)
          ? source.normalizedLines
          : normalizeLyricsText(rawText).lines;
        const now = new Date(0).toISOString();
        return {
          id: typeof source.id === 'string' && source.id ? source.id : `lyrics-${index + 1}`,
          title: typeof source.title === 'string' && source.title ? source.title : `Lyrics ${index + 1}`,
          rawText,
          normalizedLines,
          startTime: clampNumber(source.startTime, 0, Number.POSITIVE_INFINITY, 0),
          order: Number.isFinite(source.order) ? source.order : index,
          createdAt: typeof source.createdAt === 'string' ? source.createdAt : now,
          updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : now
        };
      })
      .sort((a, b) => a.order - b.order);
  }

  const rawText = rawLyricsText.trim();
  if (!rawText) return [];
  return [{
    id: 'lyrics-main',
    title: 'Lyrics 1',
    rawText: rawLyricsText,
    normalizedLines: Array.isArray(normalizedLyrics) && normalizedLyrics.length > 0
      ? normalizedLyrics
      : normalizeLyricsText(rawLyricsText).lines,
    startTime: 0,
    order: 0,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString()
  }];
}

export function normalizeLayers(layers: LyricLayer[] | undefined): LyricLayer[] {
  const defaults = createDefaultLayers();
  const byId = new Map(defaults.map(layer => [layer.id, layer]));
  const source = layers?.length ? layers : defaults;

  return source.map((layer, index) => {
    const fallback = byId.get(layer.id);
    const styleDefaults = normalizePartialLyricVisualStyle(
      layer.styleDefaults ?? layer.style ?? fallback?.styleDefaults ?? fallback?.style
    );
    const animationDefaults = layer.animationDefaults ?? layer.animation ?? fallback?.animationDefaults ?? fallback?.animation;
    const fxDefaults = layer.fxDefaults ?? layer.fx ?? fallback?.fxDefaults ?? fallback?.fx;
    const progressIndicatorDefaults =
      layer.progressIndicatorDefaults ??
      layer.progressIndicator ??
      fallback?.progressIndicatorDefaults ??
      fallback?.progressIndicator;

    return {
      ...fallback,
      ...layer,
      layerType: layer.layerType ?? fallback?.layerType ?? 'lyrics',
      order: layer.order ?? fallback?.order ?? index,
      visible: layer.visible ?? true,
      locked: layer.locked ?? false,
      renderSettings: {
        ...fallback?.renderSettings,
        ...layer.renderSettings,
        positionPreset: layer.renderSettings?.positionPreset ?? fallback?.renderSettings?.positionPreset ?? 'center'
      },
      styleDefaults,
      animationDefaults,
      fxDefaults,
      progressIndicatorDefaults,
      audioReactive: normalizeAudioReactive(layer.audioReactive),
      style: undefined,
      animation: undefined,
      fx: undefined,
      progressIndicator: undefined
    };
  });
}

/**
 * Normalize a partially-supplied `audioReactive` into a fully-typed config.
 * Returns `undefined` when the input is absent so layers without reactivity
 * stay clean in the persisted JSON.
 */
export function normalizeAudioReactive(
  input: Partial<LyricLayerAudioReactive> | undefined
): LyricLayerAudioReactive | undefined {
  if (!input) return undefined;
  const targets = normalizeAudioReactiveTargets(input.targets);
  // Older projects used a 'vocals-stem' source that no longer exists.
  const source =
    input.source === 'master' || input.source === 'estimated'
      ? input.source
      : DEFAULT_LAYER_AUDIO_REACTIVE.source;
  return {
    enabled: input.enabled ?? DEFAULT_LAYER_AUDIO_REACTIVE.enabled,
    source,
    bandMode: input.bandMode ?? DEFAULT_LAYER_AUDIO_REACTIVE.bandMode,
    responseMode: input.responseMode ?? DEFAULT_LAYER_AUDIO_REACTIVE.responseMode,
    attackMs: clampNumber(input.attackMs, 0, 4000, DEFAULT_LAYER_AUDIO_REACTIVE.attackMs),
    releaseMs: clampNumber(input.releaseMs, 0, 4000, DEFAULT_LAYER_AUDIO_REACTIVE.releaseMs),
    threshold: clampNumber(input.threshold, 0, 1, DEFAULT_LAYER_AUDIO_REACTIVE.threshold),
    softness: clampNumber(input.softness, 0, 1, DEFAULT_LAYER_AUDIO_REACTIVE.softness),
    invert: input.invert ?? DEFAULT_LAYER_AUDIO_REACTIVE.invert,
    targets
  };
}

function normalizeAudioReactiveTargets(
  raw: Partial<LyricLayerAudioReactiveTargets> | undefined
): LyricLayerAudioReactiveTargets {
  if (!raw) return {};
  const out: LyricLayerAudioReactiveTargets = {};
  for (const key of ['opacity', 'blur', 'glowIntensity', 'scale', 'offsetY'] as const) {
    const target = raw[key];
    if (!target) continue;
    out[key] = normalizeAudioReactiveTarget(target);
  }
  return out;
}

function normalizeAudioReactiveTarget(
  raw: Partial<LyricLayerAudioReactiveTarget>
): LyricLayerAudioReactiveTarget {
  return {
    amount: clampNumber(raw.amount, -4, 4, 1),
    min: typeof raw.min === 'number' && Number.isFinite(raw.min) ? raw.min : 0,
    max: typeof raw.max === 'number' && Number.isFinite(raw.max) ? raw.max : 1
  };
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export function normalizeClips(clips: LyricClip[] | undefined): LyricClip[] {
  return (clips ?? []).map(clip => ({
    ...clip,
    styleOverride: normalizePartialLyricVisualStyle(clip.styleOverride),
    transitionIn: clip.transitionIn ?? DEFAULT_LYRIC_ANIMATION.transitionIn,
    transitionOut: clip.transitionOut ?? DEFAULT_LYRIC_ANIMATION.transitionOut,
    position: clip.position ?? 'center'
  }));
}

function normalizeAudioTracks(audioTracks: ProjectAudioTracks | undefined): ProjectAudioTracks {
  // Older projects may carry a `vocals` channel; it is intentionally dropped.
  return {
    master: stripObjectUrl(audioTracks?.master)
  };
}

function stripObjectUrl(channel: AudioChannel | null | undefined): SerializableAudioChannel | null {
  if (!channel) return null;
  const { objectUrl: _objectUrl, ...rest } = channel;
  void _objectUrl;
  return rest;
}

export function stripRuntimeTextureUrls(project: LyrixaProject): LyrixaProject {
  return {
    ...project,
    styleConfig: stripStyleTextureUrl(project.styleConfig),
    layers: project.layers.map(layer => ({
      ...layer,
      styleDefaults: layer.styleDefaults ? stripStyleTextureUrl(layer.styleDefaults) : layer.styleDefaults
    })),
    clips: project.clips.map(clip => ({
      ...clip,
      styleOverride: clip.styleOverride ? stripStyleTextureUrl(clip.styleOverride) : clip.styleOverride
    }))
  };
}

export function stripStyleTextureUrl<T extends Partial<import('../types/render').LyricVisualStyle>>(style: T): T {
  const imageTexture = style.textFill?.imageTexture;
  if (!imageTexture?.objectUrl) return style;
  return {
    ...style,
    textFill: {
      ...style.textFill,
      imageTexture: {
        ...imageTexture,
        objectUrl: undefined
      }
    }
  } as T;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
