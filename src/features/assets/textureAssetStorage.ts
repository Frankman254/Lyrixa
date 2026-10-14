import {
  LYRIXA_DB_STORES,
  openLyrixaDatabase,
  withLyrixaStore
} from '../storage/lyrixaDatabase';

const STORE_TEXTURES = LYRIXA_DB_STORES.textureAssets;

export interface StoredTextureAsset {
  blob: Blob;
  fileName: string;
  storedAt: number;
}

function textureKey(projectId: string, textureId: string): string {
  return `${projectId}:texture:${textureId}`;
}

function isAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDB(): Promise<IDBDatabase> {
  return openLyrixaDatabase();
}

function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  if (!isAvailable()) return Promise.reject(new Error('IndexedDB is not available'));
  return withLyrixaStore(STORE_TEXTURES, mode, fn);
}

export async function putTextureAsset(
  projectId: string,
  textureId: string,
  blob: Blob,
  fileName: string
): Promise<void> {
  await withStore('readwrite', store =>
    store.put({ blob, fileName, storedAt: Date.now() }, textureKey(projectId, textureId))
  );
}

export async function getTextureAsset(
  projectId: string,
  textureId: string
): Promise<StoredTextureAsset | null> {
  try {
    const result = await withStore<StoredTextureAsset | undefined>('readonly', store =>
      store.get(textureKey(projectId, textureId)) as IDBRequest<StoredTextureAsset | undefined>
    );
    return result ?? null;
  } catch {
    return null;
  }
}

export async function deleteTextureAsset(projectId: string, textureId: string): Promise<void> {
  try {
    await withStore('readwrite', store => store.delete(textureKey(projectId, textureId)));
  } catch {
    /* ignore */
  }
}

export async function deleteAllProjectTextures(projectId: string): Promise<void> {
  try {
    if (!isAvailable()) return;
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_TEXTURES, 'readwrite');
      const store = tx.objectStore(STORE_TEXTURES);
      const cursor = store.openCursor();
      cursor.onsuccess = () => {
        const current = cursor.result;
        if (!current) return;
        if (typeof current.key === 'string' && current.key.startsWith(`${projectId}:texture:`)) {
          current.delete();
        }
        current.continue();
      };
      cursor.onerror = () => reject(cursor.error);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* ignore */
  }
}
