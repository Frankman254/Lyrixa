import type { ChangeEvent, RefObject } from 'react';
import type { AudioChannel, AudioChannelRole } from '../../core/types/audio';
import type { SaveStatus, VocalExtractionStatus } from './useLyrixaProject';

const SAVE_LABEL: Record<SaveStatus, string> = {
  idle: 'Saved',
  pending: 'Saving...',
  saved: 'Saved ✓'
};

interface EditorTopBarProps {
  projectName: string;
  nameEditing: boolean;
  draftName: string;
  masterChannel: AudioChannel | null;
  vocalsChannel: AudioChannel | null;
  playbackMode: 'master' | 'vocals';
  saveStatus: SaveStatus;
  vocalExtractionStatus: VocalExtractionStatus;
  vocalsAnalysisReady: boolean;
  canGenerateTimings: boolean;
  previewOpen: boolean;
  transparentPreviewOpen: boolean;
  miniPreviewVisible: boolean;
  masterFileInputRef: RefObject<HTMLInputElement | null>;
  vocalsFileInputRef: RefObject<HTMLInputElement | null>;
  projectImportInputRef: RefObject<HTMLInputElement | null>;
  onDraftNameChange: (value: string) => void;
  onStartNameEdit: () => void;
  onCommitName: () => void;
  onCancelNameEdit: () => void;
  onOpenMasterPicker: () => void;
  onOpenVocalsPicker: () => void;
  onOpenProjectImportPicker: () => void;
  onAudioFileSelected: (role: AudioChannelRole) => (e: ChangeEvent<HTMLInputElement>) => void;
  onProjectFileSelected: (e: ChangeEvent<HTMLInputElement>) => void;
  onExtractVocals: () => void;
  onRemoveVocals: () => void;
  onOpenLyricsImport: () => void;
  onExportProject: () => void;
  onRegenerateFromVocals: (options?: {
    layerId?: string;
    minDuration?: number;
    maxDuration?: number;
  }) => void;
  onTogglePreview: () => void;
  onOpenOverlay: () => void;
  onShowMiniPreview: () => void;
  onPlaybackModeChange: (mode: 'master' | 'vocals') => void;
  onResetProject: () => void;
}

export function EditorTopBar({
  projectName,
  nameEditing,
  draftName,
  masterChannel,
  vocalsChannel,
  playbackMode,
  saveStatus,
  vocalExtractionStatus,
  vocalsAnalysisReady,
  canGenerateTimings,
  previewOpen,
  transparentPreviewOpen,
  miniPreviewVisible,
  masterFileInputRef,
  vocalsFileInputRef,
  projectImportInputRef,
  onDraftNameChange,
  onStartNameEdit,
  onCommitName,
  onCancelNameEdit,
  onOpenMasterPicker,
  onOpenVocalsPicker,
  onOpenProjectImportPicker,
  onAudioFileSelected,
  onProjectFileSelected,
  onExtractVocals,
  onRemoveVocals,
  onOpenLyricsImport,
  onExportProject,
  onRegenerateFromVocals,
  onTogglePreview,
  onOpenOverlay,
  onShowMiniPreview,
  onPlaybackModeChange,
  onResetProject
}: EditorTopBarProps) {
  return (
    <header className="ls-topbar">
      <div className="ls-topbar-section ls-brand">
        <span className="ls-logo">LYRIXA</span>
        {nameEditing ? (
          <input
            className="ls-name-input"
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
          <button
            className="ls-name"
            onClick={onStartNameEdit}
            title="Rename project"
          >
            {projectName}
          </button>
        )}
      </div>

      <div className="ls-topbar-section ls-actions">
        <button
          className="ls-btn"
          onClick={onOpenMasterPicker}
          title={masterChannel
            ? `Master track: ${masterChannel.fileName}`
            : 'Load the main audio file (MP3, WAV, etc.)'}
        >
          {masterChannel ? `↻ ${masterChannel.fileName}` : '+ Load master track'}
        </button>
        <button
          className={`ls-btn ${vocalsChannel ? 'active' : ''}`}
          onClick={onExtractVocals}
          disabled={!masterChannel?.objectUrl || vocalExtractionStatus === 'extracting'}
          title={vocalsChannel
            ? `Re-isolate vocals from the master track. Current vocals helper: ${vocalsChannel.fileName}.`
            : 'Isolate a vocal-focused helper track from the loaded master audio.'}
        >
          {vocalExtractionStatus === 'extracting'
            ? 'Isolating vocals...'
            : vocalsChannel
              ? '↻ Isolate vocals'
              : '✦ Isolate vocals'}
        </button>
        <button
          className="ls-btn ghost small"
          onClick={onOpenVocalsPicker}
          title="Upload a clean isolated vocals stem instead of using automatic extraction."
        >
          Upload stem
        </button>
        {vocalsChannel && (
          <button
            className="ls-btn ghost small"
            onClick={onRemoveVocals}
            title="Remove vocals stem"
          >
            ✕
          </button>
        )}
        <input
          ref={masterFileInputRef}
          type="file"
          accept="audio/*,.mp3,.wav,.ogg,.flac,.m4a"
          style={{ display: 'none' }}
          onChange={onAudioFileSelected('master')}
        />
        <input
          ref={vocalsFileInputRef}
          type="file"
          accept="audio/*,.mp3,.wav,.ogg,.flac,.m4a"
          style={{ display: 'none' }}
          onChange={onAudioFileSelected('vocals')}
        />
        <input
          ref={projectImportInputRef}
          type="file"
          accept=".lyrixa.json,application/json"
          style={{ display: 'none' }}
          onChange={onProjectFileSelected}
        />
        <button className="ls-btn" onClick={onOpenLyricsImport}>
          Import lyrics
        </button>
        <button className="ls-btn" onClick={onExportProject}>
          Export Project
        </button>
        <button className="ls-btn" onClick={onOpenProjectImportPicker}>
          Import Project
        </button>
        {vocalsAnalysisReady && canGenerateTimings && (
          <button
            className="ls-btn primary"
            onClick={() => onRegenerateFromVocals()}
            title="Use detected vocal activity regions from the vocals stem to retime all lyric clips. You can still adjust manually after."
          >
            ⟲ Generate timings from vocals
          </button>
        )}
        <button
          className={`ls-btn ${previewOpen ? 'active' : ''}`}
          onClick={onTogglePreview}
        >
          {previewOpen ? '✕ Close preview' : '◉ Preview'}
        </button>
        <button
          className={`ls-btn ${transparentPreviewOpen ? 'active' : ''}`}
          onClick={onOpenOverlay}
          title="Transparent in-editor overlay. Real always-on-top over other apps requires a desktop wrapper."
        >
          ⧉ Overlay
        </button>
        {!miniPreviewVisible && !previewOpen && (
          <button className="ls-btn" onClick={onShowMiniPreview}>
            ◳ Live preview
          </button>
        )}
        {vocalsChannel?.objectUrl && (
          <div className="ls-monitor-toggle" aria-label="Playback source">
            <button
              className={playbackMode === 'master' ? 'active' : ''}
              onClick={() => onPlaybackModeChange('master')}
              title="Listen to the original master track"
            >
              Master
            </button>
            <button
              className={playbackMode === 'vocals' ? 'active' : ''}
              onClick={() => onPlaybackModeChange('vocals')}
              title="Listen to the isolated vocals helper"
            >
              Vocals
            </button>
          </div>
        )}
      </div>

      <div className="ls-topbar-section ls-meta">
        {vocalsAnalysisReady && (
          <span
            className="ls-vocals-chip"
            title="Vocals stem is loaded and analyzed. Vocal activity regions are shown on the vocals waveform lane. Use 'Generate timings from vocals' to auto-time your lyrics."
          >
            ◐ Vocals stem active
          </span>
        )}
        {vocalsChannel && !vocalsAnalysisReady && (
          <span className="ls-vocals-chip" title="Analyzing vocals stem waveform...">
            ◌ Analyzing vocals...
          </span>
        )}
        {vocalExtractionStatus === 'failed' && (
          <span className="ls-vocals-chip error" title="Automatic vocal isolation failed. Try uploading a clean vocals stem.">
            Vocal isolation failed
          </span>
        )}
        <span className={`ls-save-chip ${saveStatus}`}>{SAVE_LABEL[saveStatus]}</span>
        <button
          className="ls-btn ghost danger"
          onClick={onResetProject}
          title="Reset project"
        >
          New
        </button>
      </div>
    </header>
  );
}
