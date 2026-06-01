import type { LyricSource } from '../../core/types/project';

const STORAGE_KEY = 'lyrixa-global:lyrics-library:v1';

/**
 * Lyrics are small text assets, so the device-wide library can live in
 * localStorage. Audio stays in IndexedDB because its blobs are much larger.
 */
export function loadLyricsLibrary(): LyricSource[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isLyricSource);
  } catch {
    return [];
  }
}

export function upsertLyricsLibrary(sources: LyricSource[]): LyricSource[] {
  const byId = new Map(loadLyricsLibrary().map(source => [source.id, source]));
  for (const source of sources) {
    if (!source.id || !source.rawText.trim()) continue;
    byId.set(source.id, source);
  }
  const next = [...byId.values()].sort((a, b) => a.title.localeCompare(b.title));
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* Keep project editing available if localStorage quota is unavailable. */
  }
  return next;
}

function isLyricSource(value: unknown): value is LyricSource {
  if (!value || typeof value !== 'object') return false;
  const source = value as Partial<LyricSource>;
  return (
    typeof source.id === 'string' &&
    typeof source.title === 'string' &&
    typeof source.rawText === 'string' &&
    Array.isArray(source.normalizedLines)
  );
}
