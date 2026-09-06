/**
 * Where the neighbouring apps live.
 *
 * Lyrixa is a standalone editor that *may* be running next to a Transcriptor
 * service and a LiveWallpaper renderer. It must never assume it is. Every
 * address is resolved here, from sources in priority order, so no component
 * ever contains a host or a port — which is also what lets the same build run
 * unchanged inside Tauri, Electron, or a plain browser tab.
 *
 * Resolution order, most specific first:
 *
 *   1. an explicit override passed by the caller (tests, embedding shell);
 *   2. the URL: `?transcriptor=…` — how a desktop shell hands over an address;
 *   3. localStorage — what the user configured, once;
 *   4. build-time env (`VITE_TRANSCRIPTOR_URL`);
 *   5. the default, a same-origin path served by the dev proxy.
 *
 * The default is a *path*, not `http://localhost:8000`. A same-origin path
 * needs no CORS grant from the Transcriptor server and keeps working when the
 * app is packaged behind a custom scheme.
 */

export const TRANSCRIPTOR_BASE_URL_STORAGE_KEY = 'lyrixa_transcriptor_base_url';
export const LIVEWALLPAPER_BASE_URL_STORAGE_KEY = 'lyrixa_livewallpaper_base_url';

/** Same-origin prefix the Vite dev server proxies to the local Transcriptor. */
export const DEFAULT_TRANSCRIPTOR_BASE_URL = '/transcriptor';

export interface BridgeEndpoints {
  transcriptorBaseUrl: string;
  /** Absent when no renderer address is configured — the common case. */
  liveWallpaperBaseUrl?: string;
}

export interface ResolveBridgeEndpointsInput {
  /** Full location the app was opened with. */
  href?: string;
  /** Injected so the resolver stays testable and non-throwing. */
  storage?: Pick<Storage, 'getItem'> | null;
  env?: Record<string, string | undefined>;
  overrides?: Partial<BridgeEndpoints>;
}

export function resolveBridgeEndpoints(
  input: ResolveBridgeEndpointsInput = {}
): BridgeEndpoints {
  const params = readSearchParams(input.href);
  const env = input.env ?? {};

  const transcriptorBaseUrl =
    input.overrides?.transcriptorBaseUrl ??
    firstNonEmpty(
      params?.get('transcriptor'),
      readStorage(input.storage, TRANSCRIPTOR_BASE_URL_STORAGE_KEY),
      env.VITE_TRANSCRIPTOR_URL,
      DEFAULT_TRANSCRIPTOR_BASE_URL
    );

  const liveWallpaperBaseUrl =
    input.overrides?.liveWallpaperBaseUrl ??
    firstNonEmpty(
      params?.get('livewallpaper'),
      readStorage(input.storage, LIVEWALLPAPER_BASE_URL_STORAGE_KEY),
      env.VITE_LIVEWALLPAPER_URL
    );

  return {
    transcriptorBaseUrl: stripTrailingSlash(transcriptorBaseUrl ?? DEFAULT_TRANSCRIPTOR_BASE_URL),
    liveWallpaperBaseUrl: liveWallpaperBaseUrl
      ? stripTrailingSlash(liveWallpaperBaseUrl)
      : undefined
  };
}

/**
 * The Transcriptor job id this session was opened for, if any.
 *
 * `?job=<id>` is the whole handshake: Transcriptor's "Open in Lyrixa" button
 * only has to build a URL, which works identically from a browser, from a
 * desktop shell, and from a link in a chat window.
 */
export function readRequestedJobId(href?: string): string | null {
  const params = readSearchParams(href);
  const raw = params?.get('job')?.trim();
  if (!raw) return null;
  // Job ids come from a URL and are pasted into a path. Anything outside this
  // set is not a job id, and refusing it here means the client can never be
  // talked into requesting `../` on the Transcriptor's filesystem.
  return /^[A-Za-z0-9_-]{1,128}$/.test(raw) ? raw : null;
}

function readSearchParams(href: string | undefined): URLSearchParams | null {
  const target = href ?? (typeof window !== 'undefined' ? window.location?.href : undefined);
  if (!target) return null;
  try {
    return new URL(target, 'http://localhost').searchParams;
  } catch {
    return null;
  }
}

function readStorage(
  storage: Pick<Storage, 'getItem'> | null | undefined,
  key: string
): string | undefined {
  const target =
    storage === null
      ? null
      : storage ?? (typeof window !== 'undefined' ? safeLocalStorage() : null);
  if (!target) return undefined;
  try {
    return target.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

function safeLocalStorage(): Pick<Storage, 'getItem'> | null {
  try {
    return window.localStorage;
  } catch {
    // Private-mode browsers throw on access, not on read.
    return null;
  }
}

function firstNonEmpty(...values: (string | null | undefined)[]): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

function stripTrailingSlash(value: string): string {
  return value.length > 1 ? value.replace(/\/+$/, '') : value;
}
