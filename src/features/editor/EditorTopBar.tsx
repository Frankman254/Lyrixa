import { useRef, type ChangeEvent, type RefObject } from 'react';
import type { AudioChannel, AudioChannelRole } from '../../core/types/audio';
import type { LyrixaProject } from '../../core/types/project';
import type { LyricExportOptions } from '../../core/export';
import type { SaveStatus } from './useLyrixaProject';
import { LyricsExportSection } from './LyricsExportSection';
import { ACCENT_OPTIONS } from '../../shared/theme/useAccentTheme';
import type { AccentName } from '../../shared/theme/useAccentTheme';
import { useIsDenseDesktop } from '../../shared/layout/useViewportTier';
import type { ViewportTier } from '../../shared/layout/useViewportTier';
import { EditorHiddenFileInputs } from './EditorHiddenFileInputs';
import { EditorPlaybackControls } from './EditorPlaybackControls';
import { EDITOR_MODES, MODE_ICONS, MODE_LABELS, MODE_TITLES } from './useEditorMode';
import type { EditorMode } from './useEditorMode';

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

/** Inline project rename. */
export interface TopBarNameEdit {
  editing: boolean;
  draft: string;
  onDraftChange: (value: string) => void;
  onStart: () => void;
  onCommit: () => void;
  onCancel: () => void;
}

export interface TopBarPlayback {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  onPlayToggle: () => void;
  onSeek: (time: number) => void;
}

export interface TopBarHistory {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

export interface TopBarMode {
  current: EditorMode;
  onChange: (next: EditorMode) => void;
  syncMode: boolean;
  canSync: boolean;
  onToggleSync: () => void;
}

export interface TopBarPanels {
  inspectorVisible: boolean;
  /** False while the inspector is already occupying the stage (mobile style mode) or in preview mode. */
  showInspectorToggle: boolean;
  onToggleInspector: () => void;
  /** Opens the layers drawer on compact/mobile tiers. */
  onToggleSidebar: () => void;
}

export interface TopBarPreview {
  open: boolean;
  transparentOpen: boolean;
  miniVisible: boolean;
  onToggle: () => void;
  onOpenOverlay: () => void;
  onShowMini: () => void;
  onHideMini: () => void;
}

/** Hidden file inputs the bar owns, and the pickers that open them. */
export interface TopBarFiles {
  masterFileInputRef: RefObject<HTMLInputElement | null>;
  projectImportInputRef: RefObject<HTMLInputElement | null>;
  lyricsBundleImportInputRef: RefObject<HTMLInputElement | null>;
  onAudioFileSelected: (role: AudioChannelRole) => (e: ChangeEvent<HTMLInputElement>) => void;
  onProjectFileSelected: (e: ChangeEvent<HTMLInputElement>) => void;
  onLyricsBundleFileSelected: (e: ChangeEvent<HTMLInputElement>) => void;
  onOpenMasterPicker: () => void;
  onOpenProjectImportPicker: () => void;
  onOpenLyricsBundleImportPicker: () => void;
}

/** Project-level commands: lyrics in, exports out, reset. */
export interface TopBarProjectActions {
  onOpenLyricsImport: () => void;
  onExportProject: () => void;
  onExportLyricsBundle: () => void;
  onExportLyrics: (options: LyricExportOptions) => void;
  onSendToLiveWallpaper: () => void;
  onResetProject: () => void;
  onOpenShortcuts: () => void;
}

interface EditorTopBarProps {
  project: LyrixaProject;
  masterChannel: AudioChannel | null;
  saveStatus: SaveStatus;
  /** Viewport tier — drives which clusters render in the bar vs. the More menu. */
  tier: ViewportTier;
  nameEdit: TopBarNameEdit;
  playback: TopBarPlayback;
  history: TopBarHistory;
  mode: TopBarMode;
  panels: TopBarPanels;
  preview: TopBarPreview;
  files: TopBarFiles;
  actions: TopBarProjectActions;
  accent: { value: AccentName; onChange: (next: AccentName) => void };
}

export function EditorTopBar({
  project,
  masterChannel,
  saveStatus,
  tier,
  nameEdit,
  playback,
  history,
  mode,
  panels,
  preview,
  files,
  actions,
  accent
}: EditorTopBarProps) {
  const moreRef = useRef<HTMLDetailsElement>(null);
  const saveTone = SAVE_TONE[saveStatus];
  const masterLabel = masterChannel?.fileName ?? 'No master loaded';
  const masterDuration = masterChannel ? formatDuration(masterChannel.duration) : '-:-';
  const isMobile = tier === 'mobile';
  const isDesktop = tier === 'desktop';
  // Desktop tier, but too narrow for the full transport (~1180–1779px): the
  // low-priority clusters collapse into the More menu instead of scrolling
  // off-screen. The dense media query already requires the desktop tier's
  // min-width, so no extra tier check is needed here.
  const isDense = useIsDenseDesktop();
  const isWide = isDesktop && !isDense;
  const runMoreAction = (action: () => void) => {
    moreRef.current?.removeAttribute('open');
    action();
  };
  // The bar row scrolls (overflow-x auto), which also clips a static flyout.
  // Anchor the More menu to the button's viewport rect whenever it opens.
  const handleMoreToggle = () => {
    const details = moreRef.current;
    const menu = details?.querySelector<HTMLElement>('.tr-more-menu');
    if (!details?.open || !menu) return;
    const rect = details.getBoundingClientRect();
    const menuW = menu.offsetWidth;
    menu.style.top = `${Math.round(rect.bottom + 6)}px`;
    menu.style.left = `${Math.round(Math.max(8, Math.min(rect.right - menuW, window.innerWidth - menuW - 8)))}px`;
    menu.style.right = 'auto';
  };

  return (
    <header className={`transport${isDense ? ' transport-dense' : ''}`}>
      <div className="brand">
        <span className="brand-mark">L</span>
        <span className="brand-text">Lyrixa</span>
      </div>

      {!isDesktop && (
        <button
          className="tr-btn icon-only"
          onClick={panels.onToggleSidebar}
          title="Layers"
          aria-label="Toggle layers drawer"
        >
          ☰
        </button>
      )}

      {!isMobile && (
        <>
          <div className="tr-divider" />

          {nameEdit.editing ? (
            <input
              className="tr-name-input"
              autoFocus
              value={nameEdit.draft}
              onChange={(e) => nameEdit.onDraftChange(e.target.value)}
              onBlur={nameEdit.onCommit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') nameEdit.onCommit();
                else if (e.key === 'Escape') nameEdit.onCancel();
              }}
            />
          ) : (
            <button className="tr-name" onClick={nameEdit.onStart} title="Rename project">
              {project.name}
            </button>
          )}

          <div className="tr-divider" />

          <button
            className="song-chip"
            onClick={files.onOpenMasterPicker}
            title={masterChannel ? `Master track: ${masterChannel.fileName}` : 'Load the main audio file'}
          >
            <span className="song-chip-icon" aria-hidden>♪</span>
            <span className="title">{masterLabel}</span>
            <span className="duration mono">{masterDuration}</span>
          </button>

          <div className="tr-divider" />

          <div className="tr-mode-switcher" role="tablist" aria-label="Editor mode">
            {EDITOR_MODES.map(m => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode.current === m}
                className={`tr-mode-tab ${mode.current === m ? 'active' : ''}`}
                onClick={() => mode.onChange(m)}
                title={MODE_TITLES[m]}
              >
                <span className="tr-mode-icon" aria-hidden>{MODE_ICONS[m]}</span>
                <span className="tr-mode-label">{MODE_LABELS[m]}</span>
              </button>
            ))}
          </div>

          <div className="tr-divider" />
        </>
      )}

      <EditorPlaybackControls
        isPlaying={playback.isPlaying}
        currentTime={playback.currentTime}
        duration={playback.duration}
        enabled={!!masterChannel?.objectUrl}
        compact={isMobile}
        onPlayToggle={playback.onPlayToggle}
        onSeek={playback.onSeek}
      />

      <div className="tr-group" role="group" aria-label="History">
        <button
          className="tr-btn icon-only"
          onClick={history.onUndo}
          disabled={!history.canUndo}
          title="Undo (Ctrl/⌘+Z)"
          aria-label="Undo"
        >
          ↶
        </button>
        <button
          className="tr-btn icon-only"
          onClick={history.onRedo}
          disabled={!history.canRedo}
          title="Redo (Ctrl/⌘+Shift+Z)"
          aria-label="Redo"
        >
          ↷
        </button>
      </div>

      {/* Compact/mobile reach these through the mode switcher / More menu. */}
      {isWide && (
        <>
          <div className="tr-divider" />

          <button className="tr-btn" onClick={actions.onOpenLyricsImport} title="Paste or import lyrics text">
            Import lyrics
          </button>
          <button
            className={`tr-btn primary ${mode.syncMode ? 'active' : ''}`}
            onClick={mode.onToggleSync}
            disabled={!mode.canSync && !mode.syncMode}
            title={mode.syncMode
              ? 'Exit tap-to-sync mode'
              : mode.canSync
              ? 'Tap-to-sync: play the song and press Space on each line'
              : 'Load audio and import lyrics first'}
          >
            {mode.syncMode ? '✕ Exit sync' : '⊙ Sync lyrics'}
          </button>
        </>
      )}

      <div className="transport-spacer" />

      <div className={`save-status ${saveTone}`}>
        <span className="dot" />
        <span className="save-status-label">{SAVE_LABEL[saveStatus]}</span>
      </div>

      {isWide && (
        <>
          <div className="tr-group">
            <button className="tr-btn small" onClick={actions.onExportProject} title="Export the full Lyrixa project">
              Export
            </button>
          </div>

          <div className="tr-group">
            <button
              className={`tr-btn small ${preview.open ? 'active' : ''}`}
              onClick={preview.onToggle}
              title="Toggle the large preview overlay"
            >
              {preview.open ? '✕ Preview' : '◉ Preview'}
            </button>
            <button
              className={`tr-btn small ${preview.transparentOpen ? 'active' : ''}`}
              onClick={preview.onOpenOverlay}
              title="Open the transparent overlay preview"
            >
              ⧉
            </button>
            {preview.miniVisible && !preview.open ? (
              <button className="tr-btn small active" onClick={preview.onHideMini} title="Hide the floating preview">
                ✕ ◳
              </button>
            ) : !preview.open ? (
              <button className="tr-btn small" onClick={preview.onShowMini} title="Show the floating preview">
                ◳
              </button>
            ) : null}
          </div>

          <label className="accent-picker" title="Accent color">
            <span aria-hidden style={{ background: 'var(--accent)' }} />
            <select
              value={accent.value}
              onChange={(e) => accent.onChange(e.target.value as AccentName)}
            >
              {ACCENT_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
        </>
      )}

      {panels.showInspectorToggle && (
        <button
          className={`tr-btn icon-only ${panels.inspectorVisible ? 'active' : ''}`}
          onClick={panels.onToggleInspector}
          title={panels.inspectorVisible ? 'Hide inspector' : 'Show inspector'}
          aria-label={panels.inspectorVisible ? 'Hide inspector' : 'Show inspector'}
          aria-pressed={panels.inspectorVisible}
        >
          ◨
        </button>
      )}

      <details className="tr-more" ref={moreRef} onToggle={handleMoreToggle}>
        <summary className="tr-btn small">More ▾</summary>
        <div className="tr-more-menu" role="menu">
          {isMobile && (
            <button className="tr-more-item" onClick={() => runMoreAction(files.onOpenMasterPicker)}>
              ♪ Load audio <span className="tr-more-key">{masterChannel ? masterDuration : ''}</span>
            </button>
          )}
          {!isWide && (
            <button className="tr-more-item" onClick={() => runMoreAction(actions.onOpenLyricsImport)}>
              Import lyrics
            </button>
          )}
          {!isWide && (
            <>
              <button className="tr-more-item" onClick={() => runMoreAction(actions.onExportProject)}>
                Export project
              </button>
              <button className="tr-more-item" onClick={() => runMoreAction(preview.onOpenOverlay)}>
                ⧉ Transparent overlay
              </button>
              {preview.miniVisible && !preview.open ? (
                <button className="tr-more-item" onClick={() => runMoreAction(preview.onHideMini)}>
                  ✕ Hide floating preview
                </button>
              ) : !preview.open && (
                <button className="tr-more-item" onClick={() => runMoreAction(preview.onShowMini)}>
                  ◳ Floating preview
                </button>
              )}
            </>
          )}
          <button className="tr-more-item" onClick={() => runMoreAction(files.onOpenProjectImportPicker)}>
            Import project (.lyrixa.json)
          </button>
          <button className="tr-more-item" onClick={() => runMoreAction(actions.onExportLyricsBundle)}>
            Export lyrics bundle
          </button>
          {/* Same bundle as the export above; this picks the destination
              instead of always writing a file. With no renderer configured it
              falls back to that export, so the action is never a dead end. */}
          <button className="tr-more-item" onClick={() => runMoreAction(actions.onSendToLiveWallpaper)}>
            Send to LiveWallpaper
          </button>
          <button className="tr-more-item" onClick={() => runMoreAction(files.onOpenLyricsBundleImportPicker)}>
            Import lyrics bundle
          </button>
          <LyricsExportSection
            project={project}
            onExport={options => runMoreAction(() => actions.onExportLyrics(options))}
          />
          {!isWide && (
            <label className="tr-more-item tr-more-accent" title="Accent color">
              <span>Accent color</span>
              <select
                value={accent.value}
                onChange={(e) => accent.onChange(e.target.value as AccentName)}
              >
                {ACCENT_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
          )}
          <button className="tr-more-item" onClick={() => runMoreAction(actions.onOpenShortcuts)}>
            ⌨ Keyboard shortcuts <span className="tr-more-key">Shift+?</span>
          </button>
          <button className="tr-more-item danger" onClick={() => runMoreAction(actions.onResetProject)}>
            ⚠ Delete project
          </button>
        </div>
      </details>

      <EditorHiddenFileInputs
        masterFileInputRef={files.masterFileInputRef}
        projectImportInputRef={files.projectImportInputRef}
        lyricsBundleImportInputRef={files.lyricsBundleImportInputRef}
        onAudioFileSelected={files.onAudioFileSelected}
        onProjectFileSelected={files.onProjectFileSelected}
        onLyricsBundleFileSelected={files.onLyricsBundleFileSelected}
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
