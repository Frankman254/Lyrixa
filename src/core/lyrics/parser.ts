import type { LyricLine, ParsedLrc } from '../types/lyrics';

/**
 * Parses an LRC format string into a structured ParsedLrc object.
 * Completely decoupled from React and UI logic.
 */
export function parseLRC(lrcContent: string): ParsedLrc {
  const lines = lrcContent.split('\n');
  const parsedLines: LyricLine[] = [];
  const metadata: Record<string, string> = {};

  // Regex to match timestamps like [00:12.34], [01:22.333], etc.
  const timeRegex = /\[(\d{2,}):(\d{2}(?:\.\d{2,3})?)\]/g;
  // Regex to match metadata tags like [ti:Title]
  const metaRegex = /^\[([a-zA-Z]+):([^\]]*)\]$/;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]?.trim();
    if (!rawLine) continue;

    // Check for metadata first
    const metaMatch = metaRegex.exec(rawLine);
    if (metaMatch && !timeRegex.test(rawLine)) {
      // Normalize casing on metadata key mapping for standard access
      const key = metaMatch[1]!.toLowerCase();
      metadata[key] = metaMatch[2]?.trim() || '';
      continue;
    }

    // Resetting for safety
    timeRegex.lastIndex = 0; 
    let lastMatchEnd = 0;
    
    let match;
    const timestamps: number[] = [];

    // Extract all associated time tags on the current line
    while ((match = timeRegex.exec(rawLine)) !== null) {
      const minutes = parseInt(match[1] || '0', 10);
      const seconds = parseFloat(match[2] || '0');
      timestamps.push(minutes * 60 + seconds);
      lastMatchEnd = match.index + match[0].length;
    }

    if (timestamps.length > 0) {
      // The text is whatever follows the last time tag
      // It can be empty, which is a standardized way of representing instrumental gaps
      const text = rawLine.substring(lastMatchEnd).trim();
      
      timestamps.forEach(time => {
        parsedLines.push({
          startTime: time,
          text: text,
          // Scaffolded word-level placeholder for future processing logic
          // A real karaoke parser would extract `text` further tracking micro-timestamps
          words: undefined
        });
      });
    }
  }

  // Strictly sort lines by timestamp to ensure engine sequential resolving handles correctly
  parsedLines.sort((a, b) => a.startTime - b.startTime);

  return {
    lines: parsedLines,
    metadata
  };
}
