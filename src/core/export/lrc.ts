import type { ExportCue } from './cues';
import { formatLrcTime } from './timecode';

/** Gaps shorter than this are not worth a blank line (≈ two LRC ticks). */
const MIN_GAP_SECONDS = 0.02;

export interface LrcHeader {
  title?: string;
  /** Track length in seconds. */
  length?: number;
}

/**
 * Line-synced LRC. Each cue becomes `[mm:ss.xx]text`; a silence between two
 * cues (or after the last one) is closed with an empty `[mm:ss.xx]` line so
 * players clear the text instead of holding it through an instrumental.
 *
 * With `enhanced`, cues carrying word timings get A2 word tags:
 * `[00:12.00]<00:12.00>first <00:12.40>word <00:13.10>` — the last tag marks
 * where the final word ends. Cues without words fall back to plain lines.
 */
export function toLrc(cues: ExportCue[], header: LrcHeader, enhanced: boolean): string {
  const out: string[] = [];
  if (header.title) out.push(`[ti:${header.title.replace(/[[\]\r\n]/g, ' ').trim()}]`);
  if (header.length && header.length > 0) out.push(`[length:${formatLrcTime(header.length).slice(0, 5)}]`);
  out.push('[re:Lyrixa]');
  if (cues.length > 0) out.push('');

  cues.forEach((cue, index) => {
    const body = enhanced && cue.words ? wordTags(cue) : cue.text.replace(/\n/g, ' ');
    out.push(`[${formatLrcTime(cue.startTime)}]${body}`);
    const next = cues[index + 1];
    if (!next || next.startTime - cue.endTime >= MIN_GAP_SECONDS) {
      out.push(`[${formatLrcTime(cue.endTime)}]`);
    }
  });

  return out.join('\n') + '\n';
}

function wordTags(cue: ExportCue): string {
  const words = cue.words!;
  const tagged = words.map(word => `<${formatLrcTime(word.startTime)}>${word.text}`).join(' ');
  return `${tagged} <${formatLrcTime(words[words.length - 1]!.endTime)}>`;
}
