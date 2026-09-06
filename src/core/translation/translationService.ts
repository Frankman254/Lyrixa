import type { TranscriptorClient } from '../bridge/transcriptorClient';
import { TranscriptorBridgeError } from '../bridge/transcriptorClient';

/**
 * On-demand translation, one line at a time.
 *
 * Lyrixa does not translate. It asks. Model choice, prompting, routing between
 * languages, and caching all belong to Transcriptor — this file is the port
 * through which the editor requests a single line and nothing more.
 *
 * The unit is deliberately the line: the user edited one lyric, so exactly one
 * lyric is re-translated. Re-running a whole project because a phrase changed
 * would be slow, would burn a local model's time, and would silently overwrite
 * every translation the author had already corrected by hand.
 */

export interface TranslateLineRequest {
  text: string;
  /** BCP-47-ish target code, e.g. `es`. */
  targetLanguage: string;
  /** Source language, when the author knows it. Lets the service skip detection. */
  sourceLanguage?: string;
  /**
   * Neighbouring lines, for context only. The service must translate `text`
   * and return one line — context is what stops a pronoun from losing its
   * referent, not extra material to translate.
   */
  context?: {
    previous?: string;
    next?: string;
  };
}

export interface TranslateLineResult {
  text: string;
  /** Which service produced this, for display. */
  provider: string;
}

export type TranslationUnavailableReason =
  /** No translation service is configured or reachable. */
  | 'offline'
  /** The service is there but has no translator (no local model installed). */
  | 'no-translator'
  /** The service is there but exposes no per-line endpoint. */
  | 'unsupported'
  /** The request itself was rejected (unknown language, empty text). */
  | 'rejected';

export class TranslationUnavailableError extends Error {
  readonly reason: TranslationUnavailableReason;

  constructor(reason: TranslationUnavailableReason, message: string) {
    super(message);
    this.name = 'TranslationUnavailableError';
    this.reason = reason;
  }
}

export interface TranslationService {
  /** Display name, e.g. `Transcriptor`. */
  readonly name: string;
  /**
   * Whether a translation can be attempted right now. UI uses this to disable
   * `Retranslate` instead of offering an action that will fail.
   */
  isAvailable(): Promise<boolean>;
  /** Translate exactly one line. Throws `TranslationUnavailableError`. */
  translateLine(request: TranslateLineRequest): Promise<TranslateLineResult>;
}

/**
 * The service used when there is nothing to talk to.
 *
 * Standalone Lyrixa is a first-class mode, not a degraded one: with no
 * Transcriptor running, translation simply is not offered, and every other
 * part of the editor behaves exactly as it always did. Returning this object
 * rather than `null` keeps the callers free of null checks and makes the
 * disabled state the same code path as the failing one.
 */
export function createUnavailableTranslationService(
  reason: TranslationUnavailableReason = 'offline',
  message = 'No translation service is available. Start Transcriptor to translate lines.'
): TranslationService {
  return {
    name: 'unavailable',
    async isAvailable() {
      return false;
    },
    async translateLine() {
      throw new TranslationUnavailableError(reason, message);
    }
  };
}

/**
 * Translation backed by the local Transcriptor service.
 *
 * The endpoint is `POST /api/translate/line`, which today's Transcriptor does
 * not yet serve — it only exposes a whole-job translation pass. Until it does,
 * `isAvailable()` answers false and the editor hides the action, which is the
 * correct behaviour for a feature whose backend is not there: no broken
 * button, no half-written translations in the project.
 */
export function createTranscriptorTranslationService(
  client: TranscriptorClient
): TranslationService {
  let probed: boolean | undefined;

  return {
    name: 'Transcriptor',

    async isAvailable() {
      if (probed !== undefined) return probed;
      try {
        const response = await client.postJson('/api/translate/line', { probe: true });
        // 404/405 mean this build has no per-line route; anything else means
        // the route exists and merely disliked a probe payload.
        probed = response.status !== 404 && response.status !== 405;
      } catch {
        probed = false;
      }
      return probed;
    },

    async translateLine(request) {
      const text = request.text.trim();
      if (!text) {
        throw new TranslationUnavailableError('rejected', 'There is nothing to translate.');
      }
      if (!request.targetLanguage) {
        throw new TranslationUnavailableError(
          'rejected',
          'This layer has no language set, so there is no target to translate into.'
        );
      }

      let response: Response;
      try {
        response = await client.postJson('/api/translate/line', {
          text,
          target: request.targetLanguage,
          source: request.sourceLanguage,
          context: request.context
        });
      } catch (error) {
        throw new TranslationUnavailableError(
          'offline',
          error instanceof TranscriptorBridgeError
            ? error.message
            : 'Transcriptor is not reachable.'
        );
      }

      if (response.status === 404 || response.status === 405) {
        throw new TranslationUnavailableError(
          'unsupported',
          'This Transcriptor build cannot translate a single line yet.'
        );
      }
      if (response.status === 409) {
        throw new TranslationUnavailableError(
          'no-translator',
          'Transcriptor has no local translator installed.'
        );
      }
      if (!response.ok) {
        throw new TranslationUnavailableError(
          'rejected',
          `Transcriptor refused the translation (${response.status}).`
        );
      }

      const payload: unknown = await response.json().catch(() => null);
      const translated = readTranslatedText(payload);
      if (!translated) {
        throw new TranslationUnavailableError(
          'rejected',
          'Transcriptor returned an empty translation.'
        );
      }
      return { text: translated, provider: 'Transcriptor' };
    }
  };
}

/**
 * Accept the field names a translation endpoint plausibly uses. The contract
 * we asked for is `{ text }`; tolerating `translation` costs one line and
 * removes a whole class of integration mismatch.
 */
function readTranslatedText(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined;
  const record = payload as Record<string, unknown>;
  for (const key of ['text', 'translation', 'translated'] as const) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}
