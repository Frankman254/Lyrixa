/**
 * IndexedDB-backed storage for the active project's audio file.
 *
 * Audio blobs are too large for localStorage. localStorage holds the lightweight
 * project JSON (lyrics, clips, layers, style) and references the audio by
 * project id. The blob itself lives here.
 *
 * Each record is keyed by the LyrixaProject's `id`. There is currently one
 * audio per project. The schema has room to grow (multiple stems, alternate
 * masters) by adding stores in onupgradeneeded with a higher DB_VERSION.
 */

const DB_NAME = 'lyrixa';
const DB_VERSION = 1;
const STORE_AUDIO = 'audio';

export interface StoredAudio {
  blob: Blob;
  fileName: string;
  duration: number;
  /** When the file was put into IDB. Useful for future cleanup of orphaned blobs. */
  storedAt: number;
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
  await withStore('readwrite', store => store.put(record, projectId));
}

export async function getAudio(projectId: string): Promise<StoredAudio | null> {
  try {
    const result = await withStore<StoredAudio | undefined>('readonly', store =>
      store.get(projectId) as IDBRequest<StoredAudio | undefined>
    );
    return result ?? null;
  } catch {
    return null;
  }
}

export async function deleteAudio(projectId: string): Promise<void> {
  try {
    await withStore('readwrite', store => store.delete(projectId));
  } catch {
    /* swallow — caller doesn't care if the record didn't exist */
  }
}

export function audioStorageAvailable(): boolean {
  return isAvailable();
}
