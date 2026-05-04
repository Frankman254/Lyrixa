import type { AudioChannel } from '../../core/types/audio';

interface EditorAlertsProps {
  audioNeedsReload: boolean;
  masterChannel: AudioChannel | null;
  vocalsNeedsReload: boolean;
  vocalsChannel: AudioChannel | null | undefined;
  onReloadMaster: () => void;
  onClearMaster: () => void;
  onReloadVocals: () => void;
  onClearVocals: () => void;
}

export function EditorAlerts({
  audioNeedsReload,
  masterChannel,
  vocalsNeedsReload,
  vocalsChannel,
  onReloadMaster,
  onClearMaster,
  onReloadVocals,
  onClearVocals
}: EditorAlertsProps) {
  return (
    <>
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

      {vocalsNeedsReload && vocalsChannel && (
        <div className="ls-reload-banner">
          <span>
            Vocals stem needs to be reloaded:{' '}
            <strong>{vocalsChannel.fileName}</strong>.
          </span>
          <div className="ls-reload-actions">
            <button className="ls-btn small" onClick={onReloadVocals}>Reload vocals stem</button>
            <button className="ls-btn ghost small" onClick={onClearVocals}>Clear</button>
          </div>
        </div>
      )}
    </>
  );
}
