import { useCallback, useEffect, useRef, useState } from 'react';
import { readRequestedJobId } from '../../core/bridge/bridgeConfig';
import { TranscriptorBridgeError } from '../../core/bridge/transcriptorClient';
import type { TranscriptorClient } from '../../core/bridge/transcriptorClient';
import type { LyrixaProject } from '../../core/types/project';
import type { AudioChannelRole } from '../../core/types/audio';

/**
 * `Open in Lyrixa`.
 *
 * Transcriptor links to `?job=<id>`; this hook turns that into an open project
 * with its audio already loaded and the waveform already building. That is the
 * entire point of the integration — it removes "download file, open Lyrixa,
 * find file, import, find audio" and leaves "click, edit".
 *
 * Two rules shape everything here:
 *
 *  1. It runs at most once per job id. Re-opening a project the user has since
 *     edited would throw away their work on a re-render.
 *  2. Audio failing does not fail the import. A project you can edit without
 *     sound is far more useful than no project, so the two steps report
 *     separately and the user is told which one degraded.
 */

export type TranscriptorJobPhase =
  | 'idle'
  | 'loading-project'
  | 'loading-audio'
  | 'ready'
  | 'failed';

export interface TranscriptorJobState {
  jobId: string | null;
  phase: TranscriptorJobPhase;
  /** Set when the project could not be loaded at all. */
  error: string | null;
  /** Set when the project loaded but its audio did not. */
  audioWarning: string | null;
}

export interface UseTranscriptorJobArgs {
  client: TranscriptorClient;
  importProject: (project: LyrixaProject) => void;
  loadAudioFile: (file: File, role?: AudioChannelRole) => Promise<void>;
  onProjectImported?: (project: LyrixaProject) => void;
  /** Overrides `window.location.href`. Tests pass an explicit URL. */
  href?: string;
  /** Off by default in tests; the app turns it on. */
  enabled?: boolean;
}

const INITIAL: TranscriptorJobState = {
  jobId: null,
  phase: 'idle',
  error: null,
  audioWarning: null
};

export function useTranscriptorJob({
  client,
  importProject,
  loadAudioFile,
  onProjectImported,
  href,
  enabled = true
}: UseTranscriptorJobArgs): TranscriptorJobState & { dismiss: () => void } {
  const [state, setState] = useState<TranscriptorJobState>(INITIAL);
  // Which job ids this session already attempted. Guards against React's
  // double-invoked effects in StrictMode as well as ordinary re-renders.
  const attempted = useRef<Set<string>>(new Set());

  // Read through refs so a new callback identity from the parent cannot
  // re-trigger an import that already ran. Updated after commit, never during
  // render, so a render React throws away cannot leave a stale callback behind.
  const importRef = useRef(importProject);
  const loadAudioRef = useRef(loadAudioFile);
  const importedRef = useRef(onProjectImported);
  useEffect(() => {
    importRef.current = importProject;
    loadAudioRef.current = loadAudioFile;
    importedRef.current = onProjectImported;
  });

  const dismiss = useCallback(() => {
    setState(current => ({ ...current, error: null, audioWarning: null }));
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const jobId = readRequestedJobId(href);
    if (!jobId || attempted.current.has(jobId)) return;
    attempted.current.add(jobId);

    let cancelled = false;
    setState({ jobId, phase: 'loading-project', error: null, audioWarning: null });

    void (async () => {
      let project: LyrixaProject;
      try {
        project = await client.getProject(jobId);
      } catch (error) {
        if (cancelled) return;
        setState({
          jobId,
          phase: 'failed',
          error: describeBridgeError(error, jobId),
          audioWarning: null
        });
        return;
      }
      if (cancelled) return;

      importRef.current(project);
      importedRef.current?.(project);
      setState({ jobId, phase: 'loading-audio', error: null, audioWarning: null });

      try {
        const audio = await client.getAudio(jobId);
        if (cancelled) return;
        // Handed to the ordinary audio path: the same File the user would have
        // picked from disk, so persistence, peaks, and the library all behave
        // identically whether the audio arrived by bridge or by file picker.
        const file = new File([audio.blob], audio.fileName, {
          type: audio.mimeType || audio.blob.type || 'audio/mpeg'
        });
        await loadAudioRef.current(file, 'master');
        if (cancelled) return;
        setState({ jobId, phase: 'ready', error: null, audioWarning: null });
      } catch (error) {
        if (cancelled) return;
        setState({
          jobId,
          phase: 'ready',
          error: null,
          audioWarning: `${describeBridgeError(error, jobId)} Load the audio file manually to keep editing with sound.`
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [client, enabled, href]);

  return { ...state, dismiss };
}

function describeBridgeError(error: unknown, jobId: string): string {
  if (error instanceof TranscriptorBridgeError) {
    switch (error.reason) {
      case 'offline':
        return 'Transcriptor is not running, so this link could not be opened.';
      case 'not-found':
        return `Transcriptor no longer has job "${jobId}".`;
      case 'unsupported':
      case 'invalid':
        return error.message;
    }
  }
  return error instanceof Error ? error.message : 'Could not open the Transcriptor job.';
}
