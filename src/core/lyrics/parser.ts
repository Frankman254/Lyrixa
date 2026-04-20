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
  const metaRegex = /\[([a-zA-Z]+):([^\]]+)\]/;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]?.trim();
    if (!rawLine) continue;

    // Check for metadata
    const metaMatch = metaRegex.exec(rawLine);
    if (metaMatch && !timeRegex.test(rawLine)) {
      metadata[metaMatch[1]] = metaMatch[2]?.trim() || '';
      continue;
    }

    // Extract time tags and text
    // A single line could technically have multiple tags (e.g., repeating chorus)
    // We will extract all tags and duplicate the line text for each timestamp.
    
    let match;
    const timestamps: number[] = [];
    
    // We need to reset lastIndex because we use the global flag 'g' locally for exec
    timeRegex.lastIndex = 0; 
    let lastMatchEnd = 0;

    while ((match = timeRegex.exec(rawLine)) !== null) {
      const minutes = parseInt(match[1] || '0', 10);
      const seconds = parseFloat(match[2] || '0');
      timestamps.push(minutes * 60 + seconds);
      lastMatchEnd = match.index + match[0].length;
    }

    if (timestamps.length > 0) {
      // The text is whatever follows the last time tag
      const text = rawLine.substring(lastMatchEnd).trim();
      
      timestamps.forEach(time => {
        parsedLines.push({
          startTime: time,
          text: text
        });
      });
    }
  }

  // Sort lines by timestamp since multiple tags could have been out of typical order
  parsedLines.sort((a, b) => a.startTime - b.startTime);

  return {
    lines: parsedLines,
    metadata
  };
}
