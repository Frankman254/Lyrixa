import {
  manifestFromAuthoringSource,
  parseAuthoringSource
} from '../../core/composition/authoringManifest';
import type { VibrixAuthoringSource } from '../../core/composition/types';
import type { VibrixAuthoringReference } from '../../core/types/project';
import {
  LYRIXA_DB_STORES,
  openLyrixaDatabase,
  withLyrixaStore
} from '../storage/lyrixaDatabase';

interface StoredVibrixAuthoringSource {
  source: VibrixAuthoringSource;
  storedAt: number;
}

function authoringKey(
  projectId: string,
  sourceKind: VibrixAuthoringSource['kind'],
  manifestRevision: string
): string {
  return `${projectId}:vibrix-authoring:${sourceKind}:${manifestRevision}`;
}

export async function putAuthoringSource(
  projectId: string,
  source: VibrixAuthoringSource
): Promise<VibrixAuthoringReference> {
  const manifest = manifestFromAuthoringSource(source);
  const storageKey = authoringKey(projectId, source.kind, manifest.revision);
  await requestPersistentStorage();
  await withLyrixaStore(
    LYRIXA_DB_STORES.vibrixAuthoring,
    'readwrite',
    store => store.put({ source, storedAt: Date.now() } satisfies StoredVibrixAuthoringSource, storageKey)
  );
  return {
    storageKey,
    sourceKind: source.kind,
    manifestRevision: manifest.revision,
    projectName: manifest.projectName,
    slotCount: manifest.slots.length,
    imageCount: manifest.schemaVersion === 2 ? manifest.images.length : 0
  };
}

export async function getAuthoringSource(
  reference: VibrixAuthoringReference
): Promise<VibrixAuthoringSource | null> {
  try {
    const record = await withLyrixaStore<StoredVibrixAuthoringSource | undefined>(
      LYRIXA_DB_STORES.vibrixAuthoring,
      'readonly',
      store => store.get(reference.storageKey) as IDBRequest<StoredVibrixAuthoringSource | undefined>
    );
    if (!record) return null;
    const raw = record.source.kind === 'package'
      ? record.source.package
      : record.source.manifest;
    const parsed = parseAuthoringSource(raw);
    return parsed.ok ? parsed.source : null;
  } catch {
    return null;
  }
}

export async function deleteProjectAuthoringSource(projectId: string): Promise<void> {
  try {
    const database = await openLyrixaDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(LYRIXA_DB_STORES.vibrixAuthoring, 'readwrite');
      const cursorRequest = transaction.objectStore(LYRIXA_DB_STORES.vibrixAuthoring).openCursor();
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) return;
        if (
          typeof cursor.key === 'string' &&
          cursor.key.startsWith(`${projectId}:vibrix-authoring:`)
        ) {
          cursor.delete();
        }
        cursor.continue();
      };
      cursorRequest.onerror = () => reject(cursorRequest.error);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch {
    /* The project can still be reset if IndexedDB is unavailable. */
  }
}

async function requestPersistentStorage(): Promise<void> {
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* Best effort; IndexedDB remains usable without persistent quota. */
  }
}
