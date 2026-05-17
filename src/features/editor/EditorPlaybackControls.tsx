interface EditorPlaybackControlsProps {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  enabled: boolean;
  onPlayToggle: () => void;
  onSeek: (time: number) => void;
}

export function EditorPlaybackControls({
  isPlaying,
  currentTime,
  duration,
  enabled,
  onPlayToggle,
  onSeek
}: EditorPlaybackControlsProps) {
  return (
    <div className="playback-cluster">
      <button
        className="tr-btn ghost icon-only"
        onClick={() => onSeek(0)}
        title="Back to start"
        disabled={!enabled}
      >
        ⏮
      </button>
      <button
        className={`play-btn ${isPlaying ? 'playing' : ''}`}
        onClick={onPlayToggle}
        title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
        disabled={!enabled}
      >
        {isPlaying ? '⏸' : '▶'}
      </button>
      <button
        className="tr-btn ghost icon-only"
        onClick={() => onSeek(Math.max(0, duration - 0.01))}
        title="Skip to end"
        disabled={!enabled}
      >
        ⏭
      </button>
      <span className="time-readout">
        <span className="mono">{formatTimecode(currentTime)}</span>
        <span className="total mono"> / {formatTimecode(duration)}</span>
      </span>
    </div>
  );
}

/** mm:ss.cs — high-precision timecode for the playback time readout. */
function formatTimecode(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00.00';
  const m = Math.floor(seconds / 60);
  const rest = seconds - m * 60;
  return `${m}:${rest.toFixed(2).padStart(5, '0')}`;
}
