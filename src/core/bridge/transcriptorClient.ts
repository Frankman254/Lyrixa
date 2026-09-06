import { parseProjectExportEnvelope } from '../project/serialization';
import type { LyrixaProject } from '../types/project';
import { reconcileClipLineIdentity, seedDerivedTextHashes } from '../timeline/lineIdentity';

/**
 * Read-only client for the local Transcriptor service.
 *
 * Lyrixa is the editor, not the AI: this client only *fetches* work that
 * Transcriptor already produced. It never asks it to transcribe, and it never
 * talks to a model runtime.
 *
 * `fetch` is injected rather than imported so the domain layer holds no
 * browser dependency — the same client runs in a test, in a webview, and
 * under a desktop shell's own networking.
 *
 * Every call is allowed to fail. Transcriptor not running is the normal state
 * of a standalone Lyrixa session, so failures are typed and reported, never
 * thrown as surprises into a render path.
 */

export type TranscriptorFailureReason =
  /** Nothing answered. Transcriptor is not running, or is unreachable. */
  | 'offline'
  /** It answered, but has no such job. */
  | 'not-found'
  /** It answered, but this build does not expose what we asked for. */
  | 'unsupported'
  /** It answered with something that is not a Lyrixa project. */
  | 'invalid';

export class TranscriptorBridgeError extends Error {
  readonly reason: TranscriptorFailureReason;
  readonly status?: number;

  constructor(reason: TranscriptorFailureReason, message: string, status?: number) {
    super(message);
    this.name = 'TranscriptorBridgeError';
    this.reason = reason;
    this.status = status;
  }
}

export interface TranscriptorJobSummary {
  id: string;
  title: string;
  /** Seconds. 0 when the service did not report one. */
  duration: number;
  status: string;
  /** File name of the audio Transcriptor holds for this job, when it has one. */
  audioFileName?: string;
  /** File name of the exported `.lyrixa.json`, when the job produced one. */
  projectFileName?: string;
  /** Language Transcriptor detected, when it reported one. */
  language?: string;
}

export interface TranscriptorAudioPayload {
  blob: Blob;
  fileName: string;
  mimeType?: string;
}

export interface TranscriptorClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  /** Abort a request that hangs. Defaults to 20s. */
  timeoutMs?: number;
}

export class TranscriptorClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: TranscriptorClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    const injected = options.fetchImpl
      ?? (typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : undefined);
    if (!injected) {
      throw new Error('TranscriptorClient requires a fetch implementation.');
    }
    this.fetchImpl = injected;
    this.timeoutMs = options.timeoutMs ?? 20_000;
  }

  /** Cheap liveness probe. Never throws — the answer is the boolean. */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await this.request('/api/info');
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * What Transcriptor knows about one job.
   *
   * The response shape is the service's saved-job record; we read only the
   * fields we need and tolerate everything else, so Transcriptor can keep
   * evolving its record without breaking the editor.
   */
  async getJob(jobId: string): Promise<TranscriptorJobSummary> {
    const response = await this.request(`/api/jobs/${encodeURIComponent(jobId)}`);
    if (response.status === 404) {
      throw new TranscriptorBridgeError('not-found', `Transcriptor has no job "${jobId}".`, 404);
    }
    if (!response.ok) {
      // 502/503/504 come from the dev proxy when nothing is listening on the
      // other side, so they mean the same thing to the user as a failed
      // connection: Transcriptor is not running.
      const gateway = response.status >= 502 && response.status <= 504;
      throw new TranscriptorBridgeError(
        gateway ? 'offline' : 'unsupported',
        gateway
          ? 'Transcriptor is not running.'
          : `Transcriptor returned ${response.status} for job "${jobId}".`,
        response.status
      );
    }
    const raw: unknown = await response.json().catch(() => null);
    if (!isRecord(raw)) {
      throw new TranscriptorBridgeError('invalid', 'Transcriptor returned an unreadable job record.');
    }
    const files = isRecord(raw.files) ? raw.files : {};
    return {
      id: asString(raw.id) ?? jobId,
      title: asString(raw.title) ?? jobId,
      duration: asFiniteNumber(raw.duration) ?? 0,
      status: asString(raw.status) ?? 'unknown',
      audioFileName: fileEntryName(files.audio),
      projectFileName: fileEntryName(files.lyrixa),
      language: asString(isRecord(raw.settings) ? raw.settings.language : undefined)
    };
  }

  /**
   * The job's Lyrixa project, ready to open.
   *
   * Two routes are tried, in order:
   *
   *  1. `GET /api/jobs/{id}/lyrixa` — the dedicated endpoint this integration
   *     is specified against, and the one a future Transcriptor should serve;
   *  2. the job record's `files.lyrixa`, downloaded from `/download/{id}/{name}`.
   *
   * Route 2 is what today's Transcriptor actually supports, so the fallback is
   * the working path rather than a safety net — the editor is useful against
   * the service that exists, and gets faster against the one that is coming.
   */
  async getProject(jobId: string): Promise<LyrixaProject> {
    const direct = await this.tryDirectProject(jobId);
    if (direct) return direct;

    const job = await this.getJob(jobId);
    if (!job.projectFileName) {
      throw new TranscriptorBridgeError(
        'unsupported',
        `Job "${job.title}" has no Lyrixa export yet. Finish the transcription in Transcriptor first.`
      );
    }
    const response = await this.request(
      `/download/${encodeURIComponent(jobId)}/${encodeURIComponent(job.projectFileName)}`
    );
    if (!response.ok) {
      throw new TranscriptorBridgeError(
        response.status === 404 ? 'not-found' : 'unsupported',
        `Could not download the Lyrixa export for job "${jobId}".`,
        response.status
      );
    }
    return this.parseProject(await response.json().catch(() => null));
  }

  /**
   * The job's source audio.
   *
   * Same two-route shape as `getProject`. The blob is returned to the caller,
   * which turns it into a `File` and hands it to the normal audio-loading
   * path — the bridge gets no private audio pipeline of its own.
   */
  async getAudio(jobId: string): Promise<TranscriptorAudioPayload> {
    const direct = await this.request(`/api/jobs/${encodeURIComponent(jobId)}/audio`)
      .catch(() => null);
    if (direct?.ok) {
      return toAudioPayload(await direct.blob(), direct, `${jobId}.mp3`);
    }

    const job = await this.getJob(jobId);
    if (!job.audioFileName) {
      throw new TranscriptorBridgeError(
        'unsupported',
        `Transcriptor kept no audio file for job "${job.title}".`
      );
    }
    const response = await this.request(
      `/download/${encodeURIComponent(jobId)}/${encodeURIComponent(job.audioFileName)}`
    );
    if (!response.ok) {
      throw new TranscriptorBridgeError(
        response.status === 404 ? 'not-found' : 'unsupported',
        `Could not download the audio for job "${jobId}".`,
        response.status
      );
    }
    return toAudioPayload(await response.blob(), response, job.audioFileName);
  }

  /** Shared by the client and the translation service. */
  async postJson(path: string, body: unknown): Promise<Response> {
    return this.request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  }

  private async tryDirectProject(jobId: string): Promise<LyrixaProject | null> {
    let response: Response;
    try {
      response = await this.request(`/api/jobs/${encodeURIComponent(jobId)}/lyrixa`);
    } catch {
      // Unreachable service: let the caller's next call produce one clear
      // 'offline' error instead of two competing ones.
      return null;
    }
    if (!response.ok) return null;
    const raw: unknown = await response.json().catch(() => null);
    if (!isRecord(raw)) return null;
    return this.parseProject(raw);
  }

  /**
   * Parse a Transcriptor envelope through Lyrixa's own project parser.
   *
   * The bridge gets no privileged path into the project model: a file
   * delivered over HTTP is validated exactly like one picked from disk. The
   * two repairs applied afterwards are the ones only the bridge shape needs —
   * see `reconcileClipLineIdentity` for why its `sourceId`s must be rewritten.
   */
  private parseProject(raw: unknown): LyrixaProject {
    let project: LyrixaProject;
    try {
      project = parseProjectExportEnvelope(raw);
    } catch (error) {
      throw new TranscriptorBridgeError(
        'invalid',
        error instanceof Error ? error.message : 'Transcriptor returned an unreadable project.'
      );
    }
    const clips = seedDerivedTextHashes(
      reconcileClipLineIdentity(project.clips),
      project.layers
    );
    return { ...project, clips };
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Raced rather than left to the abort signal alone. `fetchImpl` is
    // injected — a desktop shell's implementation is not obliged to honour an
    // AbortSignal, and a hung bridge call must never hold the editor.
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error('timeout'));
      }, this.timeoutMs);
    });
    try {
      return await Promise.race([
        this.fetchImpl(`${this.baseUrl}${path}`, { ...init, signal: controller.signal }),
        deadline
      ]);
    } catch {
      // Includes the timeout abort: from the editor's point of view a service
      // that does not answer in time is a service that is not there.
      throw new TranscriptorBridgeError(
        'offline',
        `Transcriptor is not reachable at ${this.baseUrl}.`
      );
    } finally {
      clearTimeout(timer);
    }
  }
}

function toAudioPayload(
  blob: Blob,
  response: Response,
  fallbackName: string
): TranscriptorAudioPayload {
  const disposition = response.headers?.get?.('content-disposition') ?? '';
  const fileName = parseContentDispositionFileName(disposition) ?? fallbackName;
  const mimeType = response.headers?.get?.('content-type') ?? blob.type ?? undefined;
  return { blob, fileName, mimeType: mimeType || undefined };
}

function parseContentDispositionFileName(value: string): string | undefined {
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(value);
  if (encoded?.[1]) {
    try {
      return decodeURIComponent(encoded[1]);
    } catch {
      /* fall through to the plain form */
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(value);
  return plain?.[1];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function asFiniteNumber(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * A `files` entry is either a plain name or `{ name, url }` — the record
 * carries both shapes, and the caller only ever needs the name.
 */
function fileEntryName(value: unknown): string | undefined {
  if (typeof value === 'string') return value || undefined;
  if (isRecord(value)) return asString(value.name);
  return undefined;
}
