const DB_NAME = 'lyrixa';
const DB_VERSION = 2;
const STORE_TEXTURES = 'texture-assets';

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
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('audio')) db.createObjectStore('audio');
      if (!db.objectStoreNames.contains(STORE_TEXTURES)) db.createObjectStore(STORE_TEXTURES);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}

function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  if (!isAvailable()) return Promise.reject(new Error('IndexedDB is not available'));
  return openDB().then(db =>
    new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE_TEXTURES, mode);
      const store = tx.objectStore(STORE_TEXTURES);
      const req = fn(store);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      tx.onerror = () => reject(tx.error);
    })
  );
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
