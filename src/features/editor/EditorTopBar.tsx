import { useRef, type ChangeEvent, type RefObject } from 'react';
import type { AudioChannel, AudioChannelRole } from '../../core/types/audio';
import type { SaveStatus } from './useLyrixaProject';
import { ACCENT_OPTIONS } from '../../shared/theme/useAccentTheme';
import type { AccentName } from '../../shared/theme/useAccentTheme';
import { EditorHiddenFileInputs } from './EditorHiddenFileInputs';
import { EditorPlaybackControls } from './EditorPlaybackControls';
import type { EditorMode } from './useEditorMode';

const MODE_LABELS: Record<EditorMode, string> = {
  sync: 'Sync',
  edit: 'Edit',
  style: 'Style',
  preview: 'Preview'
};

const MODE_ICONS: Record<EditorMode, string> = {
  sync: '◉',
  edit: '✎',
  style: '◐',
  preview: '▶'
};

const MODE_TITLES: Record<EditorMode, string> = {
  sync: 'Sync mode — hold Space to time lyric paragraphs',
  edit: 'Edit mode — drag, resize and nudge clips on the timeline',
  style: 'Style mode — pick presets and tweak text/animation/FX',
  preview: 'Preview mode — clean playback view'
};

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
  editorMode: EditorMode;
  onEditorModeChange: (next: EditorMode) => void;
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
  editorMode,
  onEditorModeChange,
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
  const moreRef = useRef<HTMLDetailsElement>(null);
  const saveTone = SAVE_TONE[saveStatus];
  const masterLabel = masterChannel?.fileName ?? 'No master loaded';
  const masterDuration = masterChannel ? formatDuration(masterChannel.duration) : '—:—';
  const runMoreAction = (action: () => void) => {
    moreRef.current?.removeAttribute('open');
    action();
  };

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

      <div className="tr-mode-switcher" role="tablist" aria-label="Editor mode">
        {(['sync', 'edit', 'style', 'preview'] as const).map(m => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={editorMode === m}
            className={`tr-mode-tab ${editorMode === m ? 'active' : ''}`}
            onClick={() => onEditorModeChange(m)}
            title={MODE_TITLES[m]}
          >
            <span className="tr-mode-icon" aria-hidden>{MODE_ICONS[m]}</span>
            <span className="tr-mode-label">{MODE_LABELS[m]}</span>
          </button>
        ))}
      </div>

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
        <button className="tr-btn small" onClick={onExportProject} title="Export the full Lyrixa project">
          Export
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

      <details className="tr-more" ref={moreRef}>
        <summary className="tr-btn small">More ▾</summary>
        <div className="tr-more-menu" role="menu">
          <button className="tr-more-item" onClick={() => runMoreAction(onOpenProjectImportPicker)}>
            Import project (.lyrixa.json)
          </button>
          <button className="tr-more-item" onClick={() => runMoreAction(onExportLyricsBundle)}>
            Export lyrics bundle
          </button>
          <button className="tr-more-item" onClick={() => runMoreAction(onOpenLyricsBundleImportPicker)}>
            Import lyrics bundle
          </button>
          <button className="tr-more-item" onClick={() => runMoreAction(onOpenShortcuts)}>
            ⌨ Keyboard shortcuts <span className="tr-more-key">Shift+?</span>
          </button>
          <button className="tr-more-item danger" onClick={() => runMoreAction(onResetProject)}>
            ⚠ Delete project
          </button>
        </div>
      </details>

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
