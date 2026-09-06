import type { AudioChannel } from '../../core/types/audio';
import type { TranscriptorJobPhase } from '../bridge/useTranscriptorJob';

interface EditorAlertsProps {
  audioNeedsReload: boolean;
  masterChannel: AudioChannel | null;
  onReloadMaster: () => void;
  onClearMaster: () => void;
  /** Bridge state. All optional: a standalone session passes none of it. */
  transcriptorPhase?: TranscriptorJobPhase;
  transcriptorError?: string | null;
  transcriptorAudioWarning?: string | null;
  onDismissTranscriptorNotice?: () => void;
}

export function EditorAlerts({
  audioNeedsReload,
  masterChannel,
  onReloadMaster,
  onClearMaster,
  transcriptorPhase = 'idle',
  transcriptorError = null,
  transcriptorAudioWarning = null,
  onDismissTranscriptorNotice
}: EditorAlertsProps) {
  const loading = transcriptorPhase === 'loading-project' || transcriptorPhase === 'loading-audio';
  return (
    <>
      {loading && (
        <div className="ls-reload-banner">
          <span>
            {transcriptorPhase === 'loading-project'
              ? 'Opening the project from Transcriptor…'
              : 'Loading the audio from Transcriptor…'}
          </span>
        </div>
      )}

      {transcriptorError && (
        <div className="ls-reload-banner">
          <span>{transcriptorError}</span>
          <div className="ls-reload-actions">
            <button className="ls-btn ghost small" onClick={onDismissTranscriptorNotice}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* The project opened; only its audio did not. Separate banner on
          purpose: the session is usable, and the user needs to know which
          half degraded rather than being told the whole import failed. */}
      {transcriptorAudioWarning && (
        <div className="ls-reload-banner">
          <span>{transcriptorAudioWarning}</span>
          <div className="ls-reload-actions">
            <button className="ls-btn small" onClick={onReloadMaster}>Load audio</button>
            <button className="ls-btn ghost small" onClick={onDismissTranscriptorNotice}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      {audioNeedsReload && masterChannel && !masterChannel.objectUrl && (
        <div className="ls-reload-banner">
          <span>
            Audio file needs to be reloaded:{' '}
            <strong>{masterChannel.fileName}</strong>. Your lyrics and clips are safe.
          </span>
          <div className="ls-reload-actions">
            <button className="ls-btn small" onClick={onReloadMaster}>Reload audio</button>
            <button className="ls-btn ghost small" onClick={onClearMaster}>Clear</button>
          </div>
        </div>
      )}
    </>
  );
}
