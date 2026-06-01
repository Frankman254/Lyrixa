import { useState } from 'react';
import type { ClipProgressIndicatorConfig } from '../../core/types/render';
import type { LyricProjectMode, LyrixaProject } from '../../core/types/project';
import type { AudioLibraryAsset } from '../../core/types/audio';
import { Group } from './InspectorPrimitives';

interface ProjectInspectorProps {
  project: LyrixaProject;
  currentTime: number;
  onProjectNameChange: (name: string) => void;
  onLyricModeChange: (mode: LyricProjectMode) => void;
  onProgressChange: (next: ClipProgressIndicatorConfig) => void;
  onImportLyrics: () => void;
  onExportProject: () => void;
  onImportProject: () => void;
  audioLibrary: AudioLibraryAsset[];
  lyricsLibrary: LyrixaProject['lyricSources'];
  onLoadAudio: () => void;
  onActivateAudio: (fileKey: string) => void;
  onHardResetProject: () => void;
  onSelectLyricSource: (id: string) => void;
  onRenameLyricSource: (id: string, title: string) => void;
  onSetLyricSourceStartTime: (id: string, startTime: number) => void;
  onJumpToLyricSource: (id: string) => void;
  onRemoveLyricSource: (id: string) => void;
  onAttachLyricSource: (id: string) => void;
  onSetLyricSourceAudioAssignment: (id: string, fileKey: string, assigned: boolean) => void;
}

export function ProjectInspector({
  project,
  currentTime,
  onProjectNameChange,
  onLyricModeChange,
  onProgressChange,
  onImportLyrics,
  onExportProject,
  onImportProject,
  audioLibrary,
  lyricsLibrary,
  onLoadAudio,
  onActivateAudio,
  onHardResetProject,
  onSelectLyricSource,
  onRenameLyricSource,
  onSetLyricSourceStartTime,
  onJumpToLyricSource,
  onRemoveLyricSource,
  onAttachLyricSource,
  onSetLyricSourceAudioAssignment
}: ProjectInspectorProps) {
  // Local edit buffer so the user can type without re-rendering the entire list
  // and losing focus on every keystroke.
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const commitTitle = (id: string, fallback: string) => {
    const draft = drafts[id];
    if (draft === undefined) return;
    const trimmed = draft.trim();
    setDrafts(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (trimmed && trimmed !== fallback) onRenameLyricSource(id, trimmed);
  };
  return (
    <section className="insp-stack">
      <Group title="Basic" open>
        <label>
          Project name
          <input
            className="form-control form-input"
            value={project.name}
            onChange={(e) => onProjectNameChange(e.target.value)}
          />
        </label>
        <div className="insp-button-row">
          <button className="ls-btn small" onClick={onImportLyrics}>Import lyrics</button>
          <button className="ls-btn small" onClick={onExportProject}>Export project</button>
          <button className="ls-btn small" onClick={onImportProject}>Import project</button>
        </div>
        <div className="insp-mode-toggle" role="group" aria-label="Lyrics mode">
          <button
            type="button"
            className={project.lyricMode === 'single' ? 'active' : ''}
            onClick={() => onLyricModeChange('single')}
            title="One active lyric source for a normal song workflow"
          >
            Single lyric
          </button>
          <button
            type="button"
            className={project.lyricMode === 'multi' ? 'active' : ''}
            onClick={() => onLyricModeChange('multi')}
            title="Multiple ordered lyric sources for long mixes and medleys"
          >
            Multi lyrics
          </button>
        </div>
        <p className="insp-muted compact">
          {project.lyricMode === 'multi'
            ? 'Multi mode keeps several lyric sources, each with its own start checkpoint.'
            : 'Single mode uses one active lyric source; imports replace that source by default.'}
        </p>
      </Group>

      <Group title="Audio library">
        <div className="insp-button-row">
          <button className="ls-btn small" onClick={onLoadAudio}>Add audio file</button>
        </div>
        {audioLibrary.length === 0 ? (
          <p className="insp-muted compact">No persisted audio files on this device yet.</p>
        ) : (
          <div className="insp-source-list">
            {audioLibrary.map(asset => {
              const active = project.audioTracks.master?.fileKey === asset.fileKey;
              return (
                <div className={`insp-source-card ${active ? 'active' : ''}`} key={asset.fileKey}>
                  <div className="insp-source-title-row">
                    <strong title={asset.fileName}>{asset.fileName}</strong>
                    <span className="insp-source-count">{formatCheckpoint(asset.duration)}</span>
                  </div>
                  <div className="insp-source-actions">
                    <button
                      className={`ls-btn small ${active ? 'primary' : ''}`}
                      disabled={active}
                      onClick={() => onActivateAudio(asset.fileKey)}
                    >
                      {active ? 'Active audio' : 'Use audio'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className="insp-muted compact">
          Audio bytes stay in this device library. A project package includes every audio referenced by this project.
        </p>
      </Group>

      <Group title="Preview settings">
        <label className="tl-inline-check">
          <input
            type="checkbox"
            checked={project.progressIndicatorConfig.enabled}
            onChange={(e) => onProgressChange({ ...project.progressIndicatorConfig, enabled: e.target.checked })}
          />
          Show progress dot by default
        </label>
      </Group>

      <Group title="Lyrics sources">
        {project.lyricSources.length === 0 ? (
          <p className="insp-muted">No lyrics sources yet. Use Import lyrics above to add one.</p>
        ) : (
          <div className="insp-source-list">
            {[...project.lyricSources].sort((a, b) => a.order - b.order).map(source => {
              const draft = drafts[source.id];
              const value = draft ?? source.title;
              const isActive = project.activeLyricSourceId === source.id;
              const startTime = source.startTime ?? 0;
              return (
                <div key={source.id} className={`insp-source-card ${isActive ? 'active' : ''}`}>
                  <div className="insp-source-title-row">
                    <input
                      className="form-control form-input"
                      value={value}
                      onChange={(e) => setDrafts(prev => ({ ...prev, [source.id]: e.target.value }))}
                      onFocus={() => onSelectLyricSource(source.id)}
                      onBlur={() => commitTitle(source.id, source.title)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                        else if (e.key === 'Escape') setDrafts(prev => {
                          const next = { ...prev };
                          delete next[source.id];
                          return next;
                        });
                      }}
                    />
                    <span className="insp-source-count">{source.normalizedLines.length} lines</span>
                  </div>
                  <div className="insp-source-checkpoint">
                    <label>
                      Start checkpoint
                      <input
                        className="form-control form-input"
                        type="number"
                        min={0}
                        step={0.1}
                        value={formatSecondsValue(startTime)}
                        onChange={(e) => onSetLyricSourceStartTime(source.id, Number(e.target.value))}
                      />
                    </label>
                    <span className="insp-source-time mono">{formatCheckpoint(startTime)}</span>
                  </div>
                  <div className="insp-source-actions">
                    <button
                      type="button"
                      className="ls-btn small"
                      onClick={() => onSetLyricSourceStartTime(source.id, currentTime)}
                      title="Use the current playhead time as this source checkpoint"
                    >
                      Set current
                    </button>
                    <button
                      type="button"
                      className="ls-btn small"
                      onClick={() => onJumpToLyricSource(source.id)}
                      title="Jump the playhead to this lyric source checkpoint"
                    >
                      Jump
                    </button>
                    <button
                      type="button"
                      className={`ls-btn small ${isActive ? 'primary' : ''}`}
                      onClick={() => onSelectLyricSource(source.id)}
                      title="Make this the active lyric source"
                    >
                      {isActive ? 'Active' : 'Use'}
                    </button>
                    <button
                      type="button"
                      className="ls-btn small danger"
                      title="Delete this lyric source. Clips already placed on layers are kept."
                      onClick={() => {
                        const ok = window.confirm(
                          `Delete lyric source "${source.title}"? Clips already placed on layers stay; only the lyric text is removed.`
                        );
                        if (ok) onRemoveLyricSource(source.id);
                      }}
                    >
                      ✕
                    </button>
                  </div>
                  {project.audioTracks.master?.fileKey && (
                    <label className="tl-inline-check">
                      <input
                        type="checkbox"
                        checked={(source.audioFileKeys ?? []).includes(project.audioTracks.master.fileKey)}
                        onChange={(e) => onSetLyricSourceAudioAssignment(
                          source.id,
                          project.audioTracks.master!.fileKey!,
                          e.target.checked
                        )}
                      />
                      Assigned to active audio
                    </label>
                  )}
                </div>
              );
            })}
            <p className="insp-muted" style={{ marginTop: 4 }}>
              Deleting a source removes only the lyric text. Clips already placed on layers via Sync stay intact.
            </p>
          </div>
        )}
      </Group>

      <Group title="Global lyrics library">
        {lyricsLibrary.length === 0 ? (
          <p className="insp-muted compact">Lyrics imported in any project will appear here.</p>
        ) : (
          <div className="insp-source-list">
            {lyricsLibrary.map(source => {
              const linked = project.lyricSources.some(item => item.id === source.id);
              return (
                <div className="insp-source-row" key={source.id}>
                  <strong title={source.title}>{source.title}</strong>
                  <button
                    className={`ls-btn small ${linked ? 'primary' : ''}`}
                    disabled={linked}
                    onClick={() => onAttachLyricSource(source.id)}
                  >
                    {linked ? 'Linked' : 'Add'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Group>

      <Group title="Danger zone" open>
        <button className="ls-btn small danger" onClick={onHardResetProject}>
          Delete whole project
        </button>
      </Group>
    </section>
  );
}

function formatSecondsValue(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0';
  return Number(seconds.toFixed(1)).toString();
}

function formatCheckpoint(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}
