import type { AudioChannelRole } from '../../core/types/audio';

/**
 * IndexedDB-backed storage for project audio files.
 *
 * Audio blobs are too large for localStorage. localStorage holds the lightweight
 * project JSON (lyrics, clips, layers, style); the actual files live here.
 *
 * Records are keyed by `${projectId}:${role}` so a project can hold a master
 * track and an optional vocals stem side by side. Bare-projectId keys from
 * the previous schema are still readable as `master` via a legacy fallback.
 */

const DB_NAME = 'lyrixa';
const DB_VERSION = 2;
const STORE_AUDIO = 'audio';

export interface StoredAudio {
  blob: Blob;
  fileName: string;
  duration: number;
  storedAt: number;
}

function audioKey(projectId: string, role: AudioChannelRole): string {
  return `${projectId}:${role}`;
}

function isAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_AUDIO)) {
        db.createObjectStore(STORE_AUDIO);
      }
      if (!db.objectStoreNames.contains('texture-assets')) {
        db.createObjectStore('texture-assets');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}

function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  if (!isAvailable()) {
    return Promise.reject(new Error('IndexedDB is not available in this environment'));
  }
  return openDB().then(db =>
    new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE_AUDIO, mode);
      const store = tx.objectStore(STORE_AUDIO);
      const req = fn(store);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      tx.onerror = () => reject(tx.error);
    })
  );
}

export async function putAudio(
  projectId: string,
  role: AudioChannelRole,
  file: Blob,
  fileName: string,
  duration: number
): Promise<void> {
  const record: StoredAudio = {
    blob: file,
    fileName,
    duration,
    storedAt: Date.now()
  };
  await withStore('readwrite', store => store.put(record, audioKey(projectId, role)));
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
  await Promise.all([
    deleteAudio(projectId, 'master'),
    deleteAudio(projectId, 'vocals')
  ]);
}

export function audioStorageAvailable(): boolean {
  return isAvailable();
}
