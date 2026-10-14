import type { AudioChannelRole, AudioLibraryAsset } from '../../core/types/audio';
import {
  LYRIXA_DB_STORES,
  withLyrixaStore
} from '../storage/lyrixaDatabase';

/**
 * IndexedDB-backed storage for project audio files.
 *
 * Audio blobs are too large for localStorage. localStorage holds the lightweight
 * project JSON (lyrics, clips, layers, style); the actual files live here.
 *
 * Project bindings are keyed by `${projectId}:${role}`. Device-library blobs
 * are keyed by `library:${fileKey}` and metadata has its own small store so
 * listing the library never reads large audio blobs into React state.
 */

const STORE_AUDIO = LYRIXA_DB_STORES.audio;
const STORE_AUDIO_LIBRARY_METADATA = LYRIXA_DB_STORES.audioLibraryMetadata;

export interface StoredAudio {
  blob: Blob;
  fileName: string;
  duration: number;
  storedAt: number;
  /** File-level metadata captured at load time. Used by lyrics-bundle export. */
  sizeBytes?: number;
  lastModified?: number;
  fileKey?: string;
  mimeType?: string;
}

export function shouldPersistAudioBlob(blob: Blob, durationSeconds: number): boolean {
  void durationSeconds;
  // Audio bytes live in IndexedDB, not localStorage. IndexedDB can handle long
  // mixes far better than localStorage, so Lyrixa should attempt persistence
  // for any real audio file and let the browser quota system be the authority.
  if (blob.size <= 0) return false;
  return shouldPersistAudioMetadata(blob.size, durationSeconds);
}

export function shouldPersistAudioMetadata(
  sizeBytes: number | undefined,
  durationSeconds: number | undefined
): boolean {
  void sizeBytes;
  void durationSeconds;
  // Metadata is tiny and should always remain in the project JSON so reload can
  // attempt IndexedDB restoration and show a precise reload prompt if quota was
  // unavailable.
  return true;
}

function audioKey(projectId: string, role: AudioChannelRole): string {
  return `${projectId}:${role}`;
}

function libraryAudioKey(fileKey: string): string {
  return `library:${fileKey}`;
}

function isAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  if (!isAvailable()) return Promise.reject(new Error('IndexedDB is not available in this environment'));
  return withLyrixaStore(STORE_AUDIO, mode, fn);
}

function withMetadataStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  if (!isAvailable()) {
    return Promise.reject(new Error('IndexedDB is not available in this environment'));
  }
  return withLyrixaStore(STORE_AUDIO_LIBRARY_METADATA, mode, fn);
}

export async function putAudio(
  projectId: string,
  role: AudioChannelRole,
  file: Blob,
  fileName: string,
  duration: number,
  meta?: { sizeBytes?: number; lastModified?: number; fileKey?: string }
): Promise<void> {
  const record: StoredAudio = {
    blob: file,
    fileName,
    duration,
    storedAt: Date.now(),
    sizeBytes: meta?.sizeBytes,
    lastModified: meta?.lastModified,
    fileKey: meta?.fileKey,
    mimeType: file.type || undefined
  };
  await requestPersistentBrowserStorage();
  await withStore('readwrite', store => store.put(record, audioKey(projectId, role)));
  if (record.fileKey) {
    await withStore('readwrite', store => store.put(record, libraryAudioKey(record.fileKey!)));
    await withMetadataStore('readwrite', store => store.put(toLibraryAsset(record), record.fileKey!));
  }
}

/** Save an audio blob into the device library without binding it to a project. */
export async function putLibraryAudio(record: StoredAudio): Promise<void> {
  if (!record.fileKey) throw new Error('Audio library records require a fileKey');
  await requestPersistentBrowserStorage();
  await withStore('readwrite', store => store.put(record, libraryAudioKey(record.fileKey!)));
  await withMetadataStore('readwrite', store => store.put(toLibraryAsset(record), record.fileKey!));
}

/** Resolve a reusable audio blob independently of the project that first loaded it. */
export async function getLibraryAudio(fileKey: string): Promise<StoredAudio | null> {
  if (!fileKey) return null;
  try {
    return await withStore<StoredAudio | undefined>('readonly', store =>
      store.get(libraryAudioKey(fileKey)) as IDBRequest<StoredAudio | undefined>
    ) ?? null;
  } catch {
    return null;
  }
}

/** List lightweight metadata only; large blobs never enter React state. */
export async function listLibraryAudio(): Promise<AudioLibraryAsset[]> {
  try {
    const records = await withMetadataStore<AudioLibraryAsset[]>('readonly', store =>
      store.getAll() as IDBRequest<AudioLibraryAsset[]>
    );
    return records.sort((a, b) => a.fileName.localeCompare(b.fileName));
  } catch {
    return [];
  }
}

function toLibraryAsset(record: StoredAudio): AudioLibraryAsset {
  return {
    fileKey: record.fileKey!,
    fileName: record.fileName,
    duration: record.duration,
    sizeBytes: record.sizeBytes,
    lastModified: record.lastModified,
    mimeType: record.mimeType
  };
}

export async function getAudio(
  projectId: string,
  role: AudioChannelRole
): Promise<StoredAudio | null> {
  try {
    const result = await withStore<StoredAudio | undefined>('readonly', store =>
      store.get(audioKey(projectId, role)) as IDBRequest<StoredAudio | undefined>
    );
    if (result) return result;

    // Legacy fallback: pre-role records were stored under the bare project id.
    if (role === 'master') {
      const legacy = await withStore<StoredAudio | undefined>('readonly', store =>
        store.get(projectId) as IDBRequest<StoredAudio | undefined>
      );
      if (legacy) {
        // Re-key under the new compound key so the fallback only fires once.
        try {
          await withStore('readwrite', store => store.put(legacy, audioKey(projectId, 'master')));
          await withStore('readwrite', store => store.delete(projectId));
        } catch {
          /* if migration write fails the next read just hits the fallback again */
        }
        return legacy;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export async function deleteAudio(
  projectId: string,
  role: AudioChannelRole
): Promise<void> {
  try {
    await withStore('readwrite', store => store.delete(audioKey(projectId, role)));
    if (role === 'master') {
      // Also tidy any legacy bare-id record left behind.
      await withStore('readwrite', store => store.delete(projectId));
    }
  } catch {
    /* swallow — caller doesn't care if the record didn't exist */
  }
}

export async function deleteAllProjectAudio(projectId: string): Promise<void> {
  await deleteAudio(projectId, 'master');
  // Tidy any legacy vocals-stem blob left by older project versions.
  try {
    await withStore('readwrite', store => store.delete(`${projectId}:vocals`));
  } catch {
    /* ignore — no legacy record */
  }
}

export function audioStorageAvailable(): boolean {
  return isAvailable();
}

async function requestPersistentBrowserStorage(): Promise<void> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return;
    await navigator.storage.persist();
  } catch {
    /* best-effort only; IndexedDB still works without persistent quota */
  }
}
