import type { ExportCue } from './cues';
import { formatSrtTime, formatVttTime } from './timecode';

/** SubRip: numbered blocks, `hh:mm:ss,mmm --> hh:mm:ss,mmm`. */
export function toSrt(cues: ExportCue[]): string {
  return cues
    .map((cue, index) =>
      `${index + 1}\n${formatSrtTime(cue.startTime)} --> ${formatSrtTime(cue.endTime)}\n${cue.text}\n`
    )
    .join('\n');
}

/**
 * WebVTT. Cue text is escaped (`&`, `<`, `>`) because VTT parses markup, and
 * `-->` cannot appear in a cue payload.
 */
export function toVtt(cues: ExportCue[]): string {
  const blocks = cues.map(cue =>
    `${formatVttTime(cue.startTime)} --> ${formatVttTime(cue.endTime)}\n${escapeVtt(cue.text)}\n`
  );
  return ['WEBVTT\n', ...blocks].join('\n');
}

/** Plain text, one cue per line — for a video description or copy/paste. */
export function toTxt(cues: ExportCue[]): string {
  return cues.length > 0 ? cues.map(cue => cue.text).join('\n') + '\n' : '';
}

function escapeVtt(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/--&gt;/g, '→');
}
