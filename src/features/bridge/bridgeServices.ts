import { resolveBridgeEndpoints } from '../../core/bridge/bridgeConfig';
import type { BridgeEndpoints } from '../../core/bridge/bridgeConfig';
import { TranscriptorClient } from '../../core/bridge/transcriptorClient';
import {
  createFileLiveWallpaperTarget,
  createHttpLiveWallpaperTarget
} from '../../core/bridge/liveWallpaperTarget';
import type { LiveWallpaperTarget } from '../../core/bridge/liveWallpaperTarget';
import {
  createTranscriptorTranslationService,
  createUnavailableTranslationService
} from '../../core/translation/translationService';
import type { TranslationService } from '../../core/translation/translationService';

/**
 * The one place browser globals meet the bridge domain layer.
 *
 * `core/bridge` knows how to talk to the neighbouring apps; it does not know
 * that `window`, `import.meta.env`, or `document` exist. This module supplies
 * those, so moving Lyrixa into Tauri or Electron later means replacing this
 * file and nothing under `core/`.
 */

export interface BridgeServices {
  endpoints: BridgeEndpoints;
  transcriptor: TranscriptorClient;
  translation: TranslationService;
  /** Ordered by preference; the last one always works. */
  liveWallpaperTargets: LiveWallpaperTarget[];
}

export function createBridgeServices(): BridgeServices {
  const endpoints = resolveBridgeEndpoints({
    env: import.meta.env as unknown as Record<string, string | undefined>
  });

  const transcriptor = new TranscriptorClient({ baseUrl: endpoints.transcriptorBaseUrl });

  // Translation is offered only when there is something to ask. With no
  // Transcriptor configured the editor keeps every other capability and simply
  // does not show a Retranslate action — the standalone case, not a failure.
  const translation: TranslationService = endpoints.transcriptorBaseUrl
    ? createTranscriptorTranslationService(transcriptor)
    : createUnavailableTranslationService();

  const liveWallpaperTargets: LiveWallpaperTarget[] = [];
  if (endpoints.liveWallpaperBaseUrl) {
    liveWallpaperTargets.push(
      createHttpLiveWallpaperTarget({ baseUrl: endpoints.liveWallpaperBaseUrl })
    );
  }
  liveWallpaperTargets.push(createFileLiveWallpaperTarget({ saveFile: downloadBlob }));

  return { endpoints, transcriptor, translation, liveWallpaperTargets };
}

function downloadBlob(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
