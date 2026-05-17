import type { ChangeEvent, RefObject } from 'react';
import type { AudioChannel, AudioChannelRole } from '../../core/types/audio';
import type { SaveStatus, VocalExtractionStatus } from './useLyrixaProject';
import { ACCENT_OPTIONS } from '../../shared/theme/useAccentTheme';
import type { AccentName } from '../../shared/theme/useAccentTheme';
import { EditorHiddenFileInputs } from './EditorHiddenFileInputs';
import { EditorPlaybackControls } from './EditorPlaybackControls';

const SAVE_LABEL: Record<SaveStatus, string> = {
  idle: 'Saved',
  pending: 'Saving…',
  saved: 'Saved'
};

const SAVE_TONE: Record<SaveStatus, 'live' | 'dirty' | 'idle'> = {
  idle: 'live',
  pending: 'dirty',
  saved: 'live'
};

interface EditorTopBarProps {
  projectName: string;
  nameEditing: boolean;
  draftName: string;
  masterChannel: AudioChannel | null;
  vocalsChannel: AudioChannel | null;
  playbackMode: 'master' | 'vocals';
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  saveStatus: SaveStatus;
  vocalExtractionStatus: VocalExtractionStatus;
  vocalsAnalysisReady: boolean;
  canGenerateTimings: boolean;
  previewOpen: boolean;
  transparentPreviewOpen: boolean;
  miniPreviewVisible: boolean;
  accent: AccentName;
  masterFileInputRef: RefObject<HTMLInputElement | null>;
  vocalsFileInputRef: RefObject<HTMLInputElement | null>;
  projectImportInputRef: RefObject<HTMLInputElement | null>;
  lyricsBundleImportInputRef: RefObject<HTMLInputElement | null>;
  onDraftNameChange: (value: string) => void;
  onStartNameEdit: () => void;
  onCommitName: () => void;
  onCancelNameEdit: () => void;
  onOpenMasterPicker: () => void;
  onOpenVocalsPicker: () => void;
  onOpenProjectImportPicker: () => void;
  onOpenLyricsBundleImportPicker: () => void;
  onAudioFileSelected: (role: AudioChannelRole) => (e: ChangeEvent<HTMLInputElement>) => void;
  onProjectFileSelected: (e: ChangeEvent<HTMLInputElement>) => void;
  onLyricsBundleFileSelected: (e: ChangeEvent<HTMLInputElement>) => void;
  onExtractVocals: () => void;
  onRemoveVocals: () => void;
  onOpenLyricsImport: () => void;
  onExportProject: () => void;
  onExportLyricsBundle: () => void;
  onRegenerateFromVocals: (options?: { layerId?: string; minDuration?: number; maxDuration?: number }) => void;
  onTogglePreview: () => void;
  onOpenOverlay: () => void;
  onShowMiniPreview: () => void;
  onPlaybackModeChange: (mode: 'master' | 'vocals') => void;
  onPlayToggle: () => void;
  onSeek: (time: number) => void;
  onResetProject: () => void;
  onAccentChange: (next: AccentName) => void;
}

export function EditorTopBar({
  projectName,
  nameEditing,
  draftName,
  masterChannel,
  vocalsChannel,
  playbackMode,
  isPlaying,
  currentTime,
  duration,
  saveStatus,
  vocalExtractionStatus,
  vocalsAnalysisReady,
  canGenerateTimings,
  previewOpen,
  transparentPreviewOpen,
  miniPreviewVisible,
  accent,
  masterFileInputRef,
  vocalsFileInputRef,
  projectImportInputRef,
  lyricsBundleImportInputRef,
  onDraftNameChange,
  onStartNameEdit,
  onCommitName,
  onCancelNameEdit,
  onOpenMasterPicker,
  onOpenVocalsPicker,
  onOpenProjectImportPicker,
  onOpenLyricsBundleImportPicker,
  onAudioFileSelected,
  onProjectFileSelected,
  onLyricsBundleFileSelected,
  onExtractVocals,
  onRemoveVocals,
  onOpenLyricsImport,
  onExportProject,
  onExportLyricsBundle,
  onRegenerateFromVocals,
  onTogglePreview,
  onOpenOverlay,
  onShowMiniPreview,
  onPlaybackModeChange,
  onPlayToggle,
  onSeek,
  onResetProject,
  onAccentChange
}: EditorTopBarProps) {
  const saveTone = SAVE_TONE[saveStatus];
  const masterLabel = masterChannel?.fileName ?? 'No master loaded';
  const masterDuration = masterChannel ? formatDuration(masterChannel.duration) : '—:—';

  return (
    <header className="transport">
      <div className="brand">
        <span className="brand-mark">L</span>
        <span className="brand-text">Lyrixa</span>
      </div>

      <div className="tr-divider" />

      {nameEditing ? (
        <input
          className="tr-name-input"
          autoFocus
          value={draftName}
          onChange={(e) => onDraftNameChange(e.target.value)}
          onBlur={onCommitName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onCommitName();
            else if (e.key === 'Escape') onCancelNameEdit();
          }}
        />
      ) : (
        <button className="tr-name" onClick={onStartNameEdit} title="Rename project">
          {projectName}
        </button>
      )}

      <div className="tr-divider" />

      <button
        className="song-chip"
        onClick={onOpenMasterPicker}
        title={masterChannel ? `Master track: ${masterChannel.fileName}` : 'Load the main audio file'}
      >
        <span className="song-chip-icon" aria-hidden>♪</span>
        <span className="title">{masterLabel}</span>
        <span className="duration mono">{masterDuration}</span>
      </button>

      <button
        className="tr-btn"
        onClick={onExtractVocals}
        disabled={!masterChannel?.objectUrl || vocalExtractionStatus === 'extracting'}
        title="Isolate a vocals stem from the master track"
      >
        {vocalExtractionStatus === 'extracting' ? 'Isolating…' : vocalsChannel ? '↻ Isolate vocals' : '✦ Isolate vocals'}
      </button>
      <button
        className="tr-btn ghost"
        onClick={onOpenVocalsPicker}
        title="Upload a clean isolated vocals stem"
      >
        Upload stem
      </button>
      {vocalsChannel && (
        <button className="tr-btn ghost icon-only" onClick={onRemoveVocals} title="Remove vocals stem">✕</button>
      )}

      <div className="tr-divider" />

      <EditorPlaybackControls
        isPlaying={isPlaying}
        currentTime={currentTime}
        duration={duration}
        enabled={!!masterChannel?.objectUrl}
        onPlayToggle={onPlayToggle}
        onSeek={onSeek}
      />

      <div className="tr-divider" />

      {vocalsAnalysisReady && canGenerateTimings && (
        <button
          className="tr-btn primary"
          onClick={() => onRegenerateFromVocals()}
          title="Use detected vocal activity regions to retime all lyric clips."
        >
          ⟲ Generate timings from vocals
        </button>
      )}
      <button className="tr-btn" onClick={onOpenLyricsImport} title="Paste or import lyrics text">
        Import lyrics
      </button>

      <div className="transport-spacer" />

      {vocalsAnalysisReady && (
        <div className="stem-indicator">
          <span className="dot" />
          Vocals stem active
        </div>
      )}
      {vocalsChannel && !vocalsAnalysisReady && (
        <div className="stem-indicator analyzing">
          <span className="dot" />
          Analyzing vocals…
        </div>
      )}
      {vocalExtractionStatus === 'failed' && (
        <div className="stem-indicator error">
          <span className="dot" />
          Vocal isolation failed
        </div>
      )}

      <div className={`save-status ${saveTone}`}>
        <span className="dot" />
        {SAVE_LABEL[saveStatus]}
      </div>

      {vocalsChannel?.objectUrl && (
        <div className="tr-group" role="tablist" aria-label="Playback source">
          <button
            className={`tr-btn small ${playbackMode === 'master' ? 'active' : ''}`}
            onClick={() => onPlaybackModeChange('master')}
            title="Listen to the original master track"
          >
            Master
          </button>
          <button
            className={`tr-btn small ${playbackMode === 'vocals' ? 'active' : ''}`}
            onClick={() => onPlaybackModeChange('vocals')}
            title="Listen to the isolated vocals helper"
          >
            Vocals
          </button>
        </div>
      )}

      <div className="tr-group">
        <button className="tr-btn small" onClick={onOpenProjectImportPicker} title="Import a .lyrixa.json project">
          Import
        </button>
        <button className="tr-btn small" onClick={onExportProject} title="Export the full Lyrixa project">
          Export
        </button>
        <button
          className="tr-btn small"
          onClick={onExportLyricsBundle}
          title="Export the cross-app lyrics bundle (.lyrixa-lyrics.json)"
        >
          Bundle
        </button>
        <button
          className="tr-btn small ghost"
          onClick={onOpenLyricsBundleImportPicker}
          title="Import a .lyrixa-lyrics.json bundle"
        >
          ⤓
        </button>
      </div>

      <div className="tr-group">
        <button
          className={`tr-btn small ${previewOpen ? 'active' : ''}`}
          onClick={onTogglePreview}
          title="Toggle the large preview overlay"
        >
          {previewOpen ? '✕ Preview' : '◉ Preview'}
        </button>
        <button
          className={`tr-btn small ${transparentPreviewOpen ? 'active' : ''}`}
          onClick={onOpenOverlay}
          title="Open the transparent overlay preview"
        >
          ⧉
        </button>
        {!miniPreviewVisible && !previewOpen && (
          <button className="tr-btn small" onClick={onShowMiniPreview} title="Show the floating preview">
            ◳
          </button>
        )}
      </div>

      <label className="accent-picker" title="Accent color">
        <span aria-hidden style={{ background: 'var(--accent)' }} />
        <select
          value={accent}
          onChange={(e) => onAccentChange(e.target.value as AccentName)}
        >
          {ACCENT_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>

      <button className="tr-btn danger" onClick={onResetProject} title="Discard project and start a new one">
        New
      </button>

      <EditorHiddenFileInputs
        masterFileInputRef={masterFileInputRef}
        vocalsFileInputRef={vocalsFileInputRef}
        projectImportInputRef={projectImportInputRef}
        lyricsBundleImportInputRef={lyricsBundleImportInputRef}
        onAudioFileSelected={onAudioFileSelected}
        onProjectFileSelected={onProjectFileSelected}
        onLyricsBundleFileSelected={onLyricsBundleFileSelected}
      />
    </header>
  );
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
