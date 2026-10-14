import type { LyricLayer } from '../types/layer';
import type { LyrixaProject } from '../types/project';
import { collectCues } from './cues';
import { toLrc } from './lrc';
import { toSrt, toTxt, toVtt } from './subtitles';

/**
 * Standard lyric/subtitle exports.
 *
 * One entry point, `exportLyrics`, turns one layer of a project into text in
 * a format other players understand. These files carry timing and text only:
 * no style, no FX, no audio — the `.lyrixa-lyrics.json` bundle is still the
 * format for Vibrix.
 */
export type LyricExportFormat = 'lrc' | 'lrc-enhanced' | 'srt' | 'vtt' | 'txt';

export interface LyricExportFormatInfo {
  format: LyricExportFormat;
  label: string;
  extension: string;
  mimeType: string;
  /** One line for menus. */
  description: string;
}

export interface LyricExportOptions {
  format: LyricExportFormat;
  /** Layer to export. Defaults to `defaultExportLayerId(project)`. */
  layerId?: string;
}

export interface LyricExportResult {
  fileName: string;
  mimeType: string;
  text: string;
  /** Number of lines written — 0 means the file has no timed text. */
  cueCount: number;
}

const FORMATS: readonly LyricExportFormatInfo[] = [
  { format: 'lrc', label: 'LRC', extension: 'lrc', mimeType: 'text/plain;charset=utf-8', description: 'Line-synced lyrics for music players' },
  { format: 'lrc-enhanced', label: 'Enhanced LRC', extension: 'lrc', mimeType: 'text/plain;charset=utf-8', description: 'LRC with word timings where available' },
  { format: 'srt', label: 'SRT', extension: 'srt', mimeType: 'application/x-subrip;charset=utf-8', description: 'Subtitles for video editors' },
  { format: 'vtt', label: 'WebVTT', extension: 'vtt', mimeType: 'text/vtt;charset=utf-8', description: 'Subtitles for the web' },
  { format: 'txt', label: 'Plain text', extension: 'txt', mimeType: 'text/plain;charset=utf-8', description: 'Lyrics only, one line per clip' }
];

export function listLyricExportFormats(): readonly LyricExportFormatInfo[] {
  return FORMATS;
}

/**
 * The layer an export picks when none is named: the primary layer, else the
 * top-most layer with text, else the top-most layer. Null for a project with
 * no layers.
 */
export function defaultExportLayerId(project: LyrixaProject): string | null {
  const layers = [...project.layers].sort((a, b) => a.order - b.order);
  const primary = layers.find(layer => layer.role === 'primary');
  if (primary) return primary.id;
  const withText = layers.find(layer =>
    project.clips.some(clip => clip.layerId === layer.id && !clip.muted && clip.text.trim().length > 0)
  );
  return (withText ?? layers[0])?.id ?? null;
}

export function exportLyrics(project: LyrixaProject, options: LyricExportOptions): LyricExportResult {
  const info = FORMATS.find(entry => entry.format === options.format);
  if (!info) throw new Error(`Unknown lyric export format: ${String(options.format)}`);

  const defaultLayerId = defaultExportLayerId(project);
  const layerId = options.layerId ?? defaultLayerId;
  const layer = project.layers.find(entry => entry.id === layerId);
  if (!layer) throw new Error('Choose a layer to export.');

  const cues = collectCues(project, layer.id);
  const text = (() => {
    switch (info.format) {
      case 'lrc':
      case 'lrc-enhanced':
        return toLrc(
          cues,
          { title: project.name.trim() || undefined, length: project.audioTracks.master?.duration },
          info.format === 'lrc-enhanced'
        );
      case 'srt': return toSrt(cues);
      case 'vtt': return toVtt(cues);
      case 'txt': return toTxt(cues);
    }
  })();

  return {
    fileName: buildFileName(project, layer, layer.id === defaultLayerId, info.extension),
    mimeType: info.mimeType,
    text,
    cueCount: cues.length
  };
}

/** `Song.lrc`, or `Song.es.lrc` / `Song.Romaji.lrc` for a non-default layer. */
function buildFileName(project: LyrixaProject, layer: LyricLayer, isDefault: boolean, extension: string): string {
  const stem = safeFileStem(project.name) || 'lyrixa-lyrics';
  const tag = isDefault ? '' : safeFileStem(layer.language ?? '') || safeFileStem(layer.name);
  return tag ? `${stem}.${tag}.${extension}` : `${stem}.${extension}`;
}

/** Keeps letters of any script (a Japanese title stays Japanese), digits, `-` and `_`. */
function safeFileStem(name: string): string {
  return name.trim().replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}
