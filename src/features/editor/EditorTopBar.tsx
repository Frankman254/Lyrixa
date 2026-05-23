import type { ChangeEvent, RefObject } from 'react';
import type { AudioChannel, AudioChannelRole } from '../../core/types/audio';
import type { SaveStatus } from './useLyrixaProject';
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
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  saveStatus: SaveStatus;
  syncMode: boolean;
  canSync: boolean;
  previewOpen: boolean;
  transparentPreviewOpen: boolean;
  miniPreviewVisible: boolean;
  accent: AccentName;
  masterFileInputRef: RefObject<HTMLInputElement | null>;
  projectImportInputRef: RefObject<HTMLInputElement | null>;
  lyricsBundleImportInputRef: RefObject<HTMLInputElement | null>;
  onDraftNameChange: (value: string) => void;
  onStartNameEdit: () => void;
  onCommitName: () => void;
  onCancelNameEdit: () => void;
  onOpenMasterPicker: () => void;
  onOpenProjectImportPicker: () => void;
  onOpenLyricsBundleImportPicker: () => void;
  onAudioFileSelected: (role: AudioChannelRole) => (e: ChangeEvent<HTMLInputElement>) => void;
  onProjectFileSelected: (e: ChangeEvent<HTMLInputElement>) => void;
  onLyricsBundleFileSelected: (e: ChangeEvent<HTMLInputElement>) => void;
  onOpenLyricsImport: () => void;
  onToggleSync: () => void;
  onExportProject: () => void;
  onExportLyricsBundle: () => void;
  onTogglePreview: () => void;
  onOpenOverlay: () => void;
  onShowMiniPreview: () => void;
  onPlayToggle: () => void;
  onSeek: (time: number) => void;
  onResetProject: () => void;
  onAccentChange: (next: AccentName) => void;
  onOpenShortcuts: () => void;
}

export function EditorTopBar({
  projectName,
  nameEditing,
  draftName,
  masterChannel,
  isPlaying,
  currentTime,
  duration,
  saveStatus,
  syncMode,
  canSync,
  previewOpen,
  transparentPreviewOpen,
  miniPreviewVisible,
  accent,
  masterFileInputRef,
  projectImportInputRef,
  lyricsBundleImportInputRef,
  onDraftNameChange,
  onStartNameEdit,
  onCommitName,
  onCancelNameEdit,
  onOpenMasterPicker,
  onOpenProjectImportPicker,
  onOpenLyricsBundleImportPicker,
  onAudioFileSelected,
  onProjectFileSelected,
  onLyricsBundleFileSelected,
  onOpenLyricsImport,
  onToggleSync,
  onExportProject,
  onExportLyricsBundle,
  onTogglePreview,
  onOpenOverlay,
  onShowMiniPreview,
  onPlayToggle,
  onSeek,
  onResetProject,
  onAccentChange,
  onOpenShortcuts
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

      <button className="tr-btn" onClick={onOpenLyricsImport} title="Paste or import lyrics text">
        Import lyrics
      </button>
      <button
        className={`tr-btn primary ${syncMode ? 'active' : ''}`}
        onClick={onToggleSync}
        disabled={!canSync && !syncMode}
        title={syncMode
          ? 'Exit tap-to-sync mode'
          : canSync
          ? 'Tap-to-sync: play the song and press Space on each line'
          : 'Load audio and import lyrics first'}
      >
        {syncMode ? '✕ Exit sync' : '⊙ Sync lyrics'}
      </button>

      <div className="transport-spacer" />

      <div className={`save-status ${saveTone}`}>
        <span className="dot" />
        {SAVE_LABEL[saveStatus]}
      </div>

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

      <button
        className="tr-btn small"
        onClick={onOpenShortcuts}
        title="Keyboard shortcuts (Shift+?)"
      >
        ⌨ Shortcuts
      </button>

      <button className="tr-btn danger" onClick={onResetProject} title="Delete the current project and clear Lyrixa local data">
        Reset
      </button>

      <EditorHiddenFileInputs
        masterFileInputRef={masterFileInputRef}
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
