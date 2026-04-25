export interface NormalizeLyricsOptions {
  /** Strip LRC timestamp tags ([00:12.45]) from each line. Default: true. */
  stripTimestamps?: boolean;
  /** Drop lines that are purely bracketed metadata ([ti:...]). Default: true. */
  stripMetadata?: boolean;
  /** Collapse runs of whitespace inside a line to a single space. Default: true. */
  collapseSpaces?: boolean;
  /** Keep completely blank lines in the output as empty strings. Default: false. */
  keepBlankLines?: boolean;
}

export interface NormalizedLyricsResult {
  /** The cleaned text (lines rejoined with a single \n). */
  cleanedText: string;
  /** The cleaned lines. Empty by default — unless `keepBlankLines` is true. */
  lines: string[];
}

const LRC_TIMESTAMP = /\[(\d{1,3}):(\d{2}(?:\.\d{1,3})?)\]/g;
const PURE_METADATA = /^\[[a-zA-Z_]+:[^\]]*\]$/;
const LINE_BREAK = /\r\n|\r|\n/;

/**
 * Clean up a raw block of pasted lyrics into an array of display-ready lines.
 *
 * A single newline between lyric lines is the common internet-paste shape;
 * blank lines between verses is also common. Both must work.
 *
 * Rules:
 * - Normalizes CRLF / CR / LF line breaks.
 * - Trims surrounding whitespace on every line.
 * - Collapses internal runs of whitespace to a single space (opt-out).
 * - Drops lines that become empty after trimming (opt-in to keep them).
 * - Strips LRC timestamp prefixes like `[00:12.45]` from the line start.
 * - Drops lines that are pure metadata tags like `[ti:Title]`.
 */
export function normalizeLyricsText(
  input: string,
  options: NormalizeLyricsOptions = {}
): NormalizedLyricsResult {
  const {
    stripTimestamps = true,
    stripMetadata = true,
    collapseSpaces = true,
    keepBlankLines = false
  } = options;

  if (!input) return { cleanedText: '', lines: [] };

  const rawLines = input.split(LINE_BREAK);
  const out: string[] = [];

  for (const raw of rawLines) {
    let line = raw.trim();

    if (stripMetadata && PURE_METADATA.test(line)) {
      continue;
    }

    if (stripTimestamps) {
      // Replace every timestamp occurrence, not just the leading one —
      // LRC lines can carry multiple timestamps for repeated hooks.
      line = line.replace(LRC_TIMESTAMP, '').trim();
    }

    if (collapseSpaces) {
      line = line.replace(/[\t ]+/g, ' ').trim();
    }

    if (line.length === 0) {
      if (keepBlankLines) out.push('');
      continue;
    }

    out.push(line);
  }

  return {
    cleanedText: out.join('\n'),
    lines: out
  };
}
