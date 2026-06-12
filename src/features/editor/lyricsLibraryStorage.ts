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

/** Keep at most this many archived versions per source. */
const BACKUP_LIMIT_PER_SOURCE = 5;

/**
 * Archive a copy of a lyric source that is about to be overwritten.
 *
 * The library mirror of a source shares its id, so replacing the text in the
 * project silently replaces the library copy too — this snapshot, stored under
 * a derived id, is what survives a bad import. Oldest backups are pruned past
 * BACKUP_LIMIT_PER_SOURCE.
 */
export function archiveLyricsBackup(source: LyricSource): LyricSource[] {
  if (!source.rawText.trim()) return loadLyricsLibrary();
  const library = loadLyricsLibrary();
  const prefix = `${source.id}::backup-`;
  const backups = library
    .filter(item => item.id.startsWith(prefix))
    .sort((a, b) => (a.updatedAt ?? '').localeCompare(b.updatedAt ?? ''));
  const excess = backups.length - (BACKUP_LIMIT_PER_SOURCE - 1);
  const dropIds = new Set(excess > 0 ? backups.slice(0, excess).map(item => item.id) : []);

  const now = new Date();
  const backup: LyricSource = {
    ...source,
    id: `${prefix}${now.getTime()}`,
    title: `${source.title} (backup ${formatBackupStamp(now)})`,
    updatedAt: now.toISOString()
  };
  const next = [...library.filter(item => !dropIds.has(item.id)), backup]
    .sort((a, b) => a.title.localeCompare(b.title));
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* Keep project editing available if localStorage quota is unavailable. */
  }
  return next;
}

function formatBackupStamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
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
