import type { AudioChannel } from '../../core/types/audio';

interface EditorAlertsProps {
  audioNeedsReload: boolean;
  masterChannel: AudioChannel | null;
  onReloadMaster: () => void;
  onClearMaster: () => void;
}

export function EditorAlerts({
  audioNeedsReload,
  masterChannel,
  onReloadMaster,
  onClearMaster
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
    </>
  );
}
