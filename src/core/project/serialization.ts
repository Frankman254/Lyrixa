import type { AudioChannel, ProjectAudioTracks } from '../types/audio';
import type { LyricClip } from '../types/clip';
import { createDefaultLayers } from '../types/layer';
import type { LyricLayer } from '../types/layer';
import type { LyrixaProject } from '../types/project';
import {
  DEFAULT_LYRIC_ANIMATION,
  resolveClipProgressIndicator,
  resolveLyricAnimation,
  resolveLyricFx,
} from '../types/render';
import {
  normalizePartialLyricVisualStyle,
  resolveLyricVisualStyle
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
      vocals?: SerializableAudioChannel | null;
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
        master: stripObjectUrl(project.audioTracks.master),
        vocals: stripObjectUrl(project.audioTracks.vocals)
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
  return {
    id: typeof input.id === 'string' && input.id ? input.id : emptyId,
    name: typeof input.name === 'string' && input.name ? input.name : 'Imported Project',
    audioTracks,
    rawLyricsText: input.rawLyricsText ?? '',
    normalizedLyrics: Array.isArray(input.normalizedLyrics) ? input.normalizedLyrics : [],
    layers: normalizeLayers(input.layers),
    clips: normalizeClips(input.clips),
    styleConfig: resolveLyricVisualStyle(input.styleConfig),
    animationConfig: resolveLyricAnimation(input.animationConfig),
    fxConfig: resolveLyricFx(input.fxConfig),
    progressIndicatorConfig: resolveClipProgressIndicator(input.progressIndicatorConfig),
    currentTime: Number.isFinite(input.currentTime) ? input.currentTime! : 0,
    renderMode: input.renderMode ?? 'editor'
  };
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
      style: undefined,
      animation: undefined,
      fx: undefined,
      progressIndicator: undefined
    };
  });
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
  return {
    master: stripObjectUrl(audioTracks?.master),
    vocals: stripObjectUrl(audioTracks?.vocals)
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
