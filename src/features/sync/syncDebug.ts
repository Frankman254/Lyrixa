export function isSyncDebugEnabled(): boolean {
  if (!import.meta.env.DEV) return false;
  try {
    return window.localStorage.getItem('lyrixa_debug_sync') === '1';
  } catch {
    return false;
  }
}

export function syncDebug(label: string, payload: unknown): void {
  if (!isSyncDebugEnabled()) return;
  console.info(label, payload);
}
