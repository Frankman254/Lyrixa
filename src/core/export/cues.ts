import type { LyricClip, LyricWord } from '../types/clip';
import type { LyrixaProject } from '../types/project';

/**
 * One timed line, as every lyric format sees it: the clips of one layer,
 * cleaned once so no serializer has to re-decide what counts as a line.
 */
export interface ExportCue {
  /** Trimmed text. May hold several lines; blank lines inside are dropped. */
  text: string;
  startTime: number;
  endTime: number;
  /** Valid word timings, sorted. Absent when the clip had none usable. */
  words?: LyricWord[];
}

/**
 * The cues of `layerId`, sorted by start time.
 *
 * Muted clips, clips with no text and clips with unusable times are left out.
 * Overlaps are kept exactly as authored: exports must match the editor's sync.
 */
export function collectCues(project: LyrixaProject, layerId: string): ExportCue[] {
  return project.clips
    .filter(clip => clip.layerId === layerId && !clip.muted)
    .map(toCue)
    .filter((cue): cue is ExportCue => cue !== null)
    .sort((a, b) => a.startTime - b.startTime || a.endTime - b.endTime);
}

function toCue(clip: LyricClip): ExportCue | null {
  const text = clip.text
    .split(/\r\n|\r|\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .join('\n');
  if (!text) return null;
  if (!Number.isFinite(clip.startTime) || !Number.isFinite(clip.endTime)) return null;
  if (clip.endTime <= clip.startTime) return null;

  const words = cleanWords(clip.words);
  return {
    text,
    startTime: Math.max(0, clip.startTime),
    endTime: clip.endTime,
    ...(words.length > 0 && { words })
  };
}

/** Drop unusable words one by one — a bad word never costs the whole line. */
function cleanWords(words: LyricWord[] | undefined): LyricWord[] {
  if (!Array.isArray(words)) return [];
  return words
    .filter(word =>
      typeof word?.text === 'string' &&
      word.text.trim().length > 0 &&
      Number.isFinite(word.startTime) &&
      Number.isFinite(word.endTime) &&
      word.endTime >= word.startTime
    )
    .map(word => ({ ...word, text: word.text.trim() }))
    .sort((a, b) => a.startTime - b.startTime);
}
