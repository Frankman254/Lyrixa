export const LYRIXA_DB_NAME = 'lyrixa';
export const LYRIXA_DB_VERSION = 4;

export const LYRIXA_DB_STORES = {
  audio: 'audio',
  audioLibraryMetadata: 'audio-library-metadata',
  textureAssets: 'texture-assets',
  vibrixAuthoring: 'vibrix-authoring'
} as const;

export type LyrixaDatabaseStore =
  (typeof LYRIXA_DB_STORES)[keyof typeof LYRIXA_DB_STORES];

export function openLyrixaDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not available'));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(LYRIXA_DB_NAME, LYRIXA_DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      for (const storeName of Object.values(LYRIXA_DB_STORES)) {
        if (!database.objectStoreNames.contains(storeName)) {
          database.createObjectStore(storeName);
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
  });
}

export function withLyrixaStore<T>(
  storeName: LyrixaDatabaseStore,
  mode: IDBTransactionMode,
  requestFor: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openLyrixaDatabase().then(database =>
    new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(storeName, mode);
      const request = requestFor(transaction.objectStore(storeName));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      transaction.onerror = () => reject(transaction.error);
    })
  );
}
