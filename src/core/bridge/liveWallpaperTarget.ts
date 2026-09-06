import { createLyricsBundleEnvelope } from '../project/lyricsBundle';
import type { LyricsBundleEnvelope } from '../project/lyricsBundle';
import type { LyrixaProject } from '../types/project';

/**
 * `Send to LiveWallpaper`, as a destination rather than a feature.
 *
 * The point of this file is that the *delivery* of a bundle is separable from
 * the *building* of one. Building is settled: `createLyricsBundleEnvelope` is
 * the contract, and it is the same bytes whether they reach the renderer over
 * HTTP, through a desktop IPC channel, or by the user saving a file. Delivery
 * is not settled — there is no desktop shell yet — so it is an interface with
 * one honest implementation and room for the others.
 *
 * No IPC is implemented here on purpose. Writing a speculative Tauri or
 * Electron channel now would bake in assumptions about a shell that does not
 * exist; an interface with a working file-based fallback does not.
 */

export type LiveWallpaperDeliveryKind = 'download' | 'http';

export interface LiveWallpaperDeliveryResult {
  kind: LiveWallpaperDeliveryKind;
  /** What the UI should tell the user happened. */
  message: string;
  /** Identifier the renderer assigned, when the transport reports one. */
  projectRef?: string;
}

export interface LiveWallpaperTarget {
  readonly name: string;
  /** Whether this target can accept a bundle right now. */
  isAvailable(): Promise<boolean>;
  send(envelope: LyricsBundleEnvelope, project: LyrixaProject): Promise<LiveWallpaperDeliveryResult>;
}

/**
 * Build the payload once, then hand it to whichever target is configured.
 *
 * Keeping this a free function — rather than a method on the target — is what
 * guarantees every transport ships byte-identical content. A transport that
 * built its own payload could quietly drift from the file export, and the
 * whole value of the bundle contract is that it does not.
 */
export async function sendProjectToLiveWallpaper(
  project: LyrixaProject,
  target: LiveWallpaperTarget
): Promise<LiveWallpaperDeliveryResult> {
  const envelope = createLyricsBundleEnvelope(project);
  return target.send(envelope, project);
}

export interface HttpLiveWallpaperTargetOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Deliver to a LiveWallpaper instance that exposes a local receiving endpoint.
 *
 * `POST {base}/api/lyrics-bundle`. If the renderer is not running, or does not
 * serve that route, `isAvailable()` is false and the caller falls back to the
 * file target — the user still gets their bundle, just with one extra step.
 */
export function createHttpLiveWallpaperTarget(
  options: HttpLiveWallpaperTargetOptions
): LiveWallpaperTarget {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const fetchImpl = options.fetchImpl
    ?? (typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : undefined);
  const timeoutMs = options.timeoutMs ?? 10_000;

  const request = async (path: string, init: RequestInit = {}): Promise<Response> => {
    if (!fetchImpl) throw new Error('No fetch implementation available.');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetchImpl(`${baseUrl}${path}`, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  };

  return {
    name: 'LiveWallpaper',

    async isAvailable() {
      try {
        const response = await request('/api/lyrics-bundle', { method: 'OPTIONS' });
        return response.status !== 404;
      } catch {
        return false;
      }
    },

    async send(envelope) {
      const response = await request('/api/lyrics-bundle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(envelope)
      });
      if (!response.ok) {
        throw new Error(`LiveWallpaper refused the bundle (${response.status}).`);
      }
      const payload: unknown = await response.json().catch(() => null);
      const projectRef =
        typeof payload === 'object' && payload !== null
          ? asString((payload as Record<string, unknown>).projectId)
          : undefined;
      return {
        kind: 'http',
        message: 'Sent to LiveWallpaper.',
        projectRef
      };
    }
  };
}

export interface FileLiveWallpaperTargetOptions {
  /**
   * Injected so the domain layer never touches the DOM. The feature layer
   * passes its own download helper; a desktop shell would pass a real
   * "write this file" call instead, with no change here.
   */
  saveFile: (fileName: string, blob: Blob) => void | Promise<void>;
}

/**
 * The always-available destination: write the bundle out as a file.
 *
 * This is what makes `Send to LiveWallpaper` safe to ship before any bridge
 * exists. It is also the reason Lyrixa stays standalone — the export path a
 * user has today does not become the fallback of a network feature, it stays
 * the thing that always works.
 */
export function createFileLiveWallpaperTarget(
  options: FileLiveWallpaperTargetOptions
): LiveWallpaperTarget {
  return {
    name: 'File export',

    async isAvailable() {
      return true;
    },

    async send(envelope, project) {
      const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' });
      const safeName = sanitizeFileName(project.name) || 'lyrixa-lyrics';
      await options.saveFile(`${safeName}.lyrixa-lyrics.json`, blob);
      return {
        kind: 'download',
        message: 'Lyrics bundle saved. Open it from LiveWallpaper to load the project.'
      };
    }
  };
}

/**
 * Pick the best destination available, preferring a live connection.
 * Falls back to the file target, which never reports unavailable.
 */
export async function resolveLiveWallpaperTarget(
  candidates: LiveWallpaperTarget[]
): Promise<LiveWallpaperTarget> {
  for (const candidate of candidates) {
    if (await candidate.isAvailable()) return candidate;
  }
  const last = candidates[candidates.length - 1];
  if (!last) throw new Error('No LiveWallpaper destination is configured.');
  return last;
}

function sanitizeFileName(name: string): string {
  return name.trim().replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '');
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}
