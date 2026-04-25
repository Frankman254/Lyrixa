import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { AudioEngine } from '../player/AudioEngine';
import type { AudioEngineRef } from '../player/AudioEngine';
import { TimelineEditor } from '../timeline-editor/TimelineEditor';
import { ClipLyricsRenderer } from '../lyrics-view/ClipLyricsRenderer';
import { LyricsImportPanel } from './LyricsImportPanel';
import { useLyrixaProject } from './useLyrixaProject';
import type { SaveStatus } from './useLyrixaProject';
import './LyrixaEditorShell.css';

const SAVE_LABEL: Record<SaveStatus, string> = {
  idle: 'Saved',
  pending: 'Saving…',
  saved: 'Saved ✓'
};

export function LyrixaEditorShell() {
  const {
    project,
    saveStatus,
    audioNeedsReload,
    setProjectName,
    loadAudioFile,
    removeAudio,
    applyLyrics,
    setClips,
    setLayers,
    setCurrentTime,
    setDuration,
    resetProject
  } = useLyrixaProject();

  const audioEngineRef = useRef<AudioEngineRef>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [nameEditing, setNameEditing] = useState(false);
  const [draftName, setDraftName] = useState(project.name);

  useEffect(() => {
    setDraftName(project.name);
  }, [project.name]);

  // Auto-open the import panel on a fresh empty project so users see how to start.
  useEffect(() => {
    if (
      !project.track &&
      project.clips.length === 0 &&
      project.rawLyricsText.length === 0
    ) {
      // Keep it closed by default — the editor surfaces empty-state prompts
      // on the lanes themselves. Users open import explicitly.
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFilePicker = () => fileInputRef.current?.click();

  const handleAudioFileSelected = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset the input value so selecting the same file twice still fires change.
    e.target.value = '';
    if (!file) return;
    try {
      await loadAudioFile(file);
    } catch (err) {
      console.error('[Lyrixa] Failed to load audio file:', err);
    }
  };

  const handleSeek = (time: number) => {
    setCurrentTime(time);
    if (project.track?.objectUrl) {
      audioEngineRef.current?.seekTo(time);
    }
  };

  const handlePlayToggle = () => {
    if (!project.track?.objectUrl) return;
    setIsPlaying(p => !p);
  };

  const commitName = () => {
    const trimmed = draftName.trim();
    if (trimmed.length > 0 && trimmed !== project.name) {
      setProjectName(trimmed);
    } else {
      setDraftName(project.name);
    }
    setNameEditing(false);
  };

  const effectiveDuration = project.track?.duration ?? 60;

  return (
    <div className="lyrixa-shell">
      <header className="ls-topbar">
        <div className="ls-topbar-section ls-brand">
          <span className="ls-logo">LYRIXA</span>
          {nameEditing ? (
            <input
              className="ls-name-input"
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitName();
                else if (e.key === 'Escape') {
                  setDraftName(project.name);
                  setNameEditing(false);
                }
              }}
            />
          ) : (
            <button
              className="ls-name"
              onClick={() => setNameEditing(true)}
              title="Rename project"
            >
              {project.name}
            </button>
          )}
        </div>

        <div className="ls-topbar-section ls-actions">
          <button className="ls-btn" onClick={handleFilePicker}>
            {project.track ? '↻ Replace audio' : '＋ Load audio'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,.mp3,.wav,.ogg,.flac,.m4a"
            style={{ display: 'none' }}
            onChange={handleAudioFileSelected}
          />
          <button className="ls-btn" onClick={() => setImportOpen(true)}>
            ✎ Import lyrics
          </button>
          <button
            className={`ls-btn ${isPlaying ? 'active' : ''}`}
            onClick={handlePlayToggle}
            disabled={!project.track?.objectUrl}
            title={!project.track?.objectUrl ? 'Load audio to play' : undefined}
          >
            {isPlaying ? '⏸ Pause' : '▶ Play'}
          </button>
          <button
            className={`ls-btn ${previewOpen ? 'active' : ''}`}
            onClick={() => setPreviewOpen(p => !p)}
          >
            {previewOpen ? '🅧 Close preview' : '◉ Preview'}
          </button>
        </div>

        <div className="ls-topbar-section ls-meta">
          <span className={`ls-save-chip ${saveStatus}`}>{SAVE_LABEL[saveStatus]}</span>
          <button
            className="ls-btn ghost danger"
            onClick={() => {
              if (window.confirm('Discard the current project and start a new one?')) {
                resetProject();
                setIsPlaying(false);
              }
            }}
            title="Reset project"
          >
            New
          </button>
        </div>
      </header>

      {audioNeedsReload && project.track && !project.track.objectUrl && (
        <div className="ls-reload-banner">
          <span>
            Audio file needs to be reloaded:{' '}
            <strong>{project.track.fileName}</strong>. Your lyrics and clips are safe.
          </span>
          <div className="ls-reload-actions">
            <button className="ls-btn small" onClick={handleFilePicker}>Reload audio</button>
            <button className="ls-btn ghost small" onClick={removeAudio}>Clear</button>
          </div>
        </div>
      )}

      {project.track?.objectUrl && (
        <AudioEngine
          ref={audioEngineRef}
          audioUrl={project.track.objectUrl}
          isPlaying={isPlaying}
          onTimeUpdate={setCurrentTime}
          onDurationChange={setDuration}
          onEnded={() => setIsPlaying(false)}
        />
      )}

      <main className="ls-main">
        <TimelineEditor
          embedded
          clips={project.clips}
          layers={project.layers}
          currentTime={project.currentTime}
          duration={effectiveDuration}
          isPlaying={isPlaying}
          trackName={project.track?.fileName ?? 'No audio loaded'}
          peaks={project.track?.waveformPeaks}
          onClipsChange={setClips}
          onLayersChange={setLayers}
          onSeek={handleSeek}
          onPlayToggle={handlePlayToggle}
        />

        {!project.track && (
          <EmptyLaneHint
            icon="🎵"
            title="No audio loaded"
            description="Load an MP3, WAV, or other audio file to populate the audio lane."
            actionLabel="Load audio"
            onAction={handleFilePicker}
          />
        )}

        {project.clips.length === 0 && project.track && (
          <EmptyLaneHint
            icon="📝"
            title="No lyrics yet"
            description="Paste or import lyrics to create draggable text clips on the timeline."
            actionLabel="Import lyrics"
            onAction={() => setImportOpen(true)}
          />
        )}
      </main>

      <LyricsImportPanel
        open={importOpen}
        initialText={project.rawLyricsText}
        layers={project.layers}
        onClose={() => setImportOpen(false)}
        onApply={applyLyrics}
      />

      {previewOpen && (
        <div className="ls-preview-overlay" onClick={() => setPreviewOpen(false)}>
          <div className="ls-preview-stage" onClick={(e) => e.stopPropagation()}>
            <ClipLyricsRenderer
              clips={project.clips}
              layers={project.layers}
              currentTime={project.currentTime}
              styleConfig={project.styleConfig}
            />
            <button
              className="ls-btn ghost ls-preview-close"
              onClick={() => setPreviewOpen(false)}
            >
              Close preview
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface EmptyLaneHintProps {
  icon: string;
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
}

function EmptyLaneHint({ icon, title, description, actionLabel, onAction }: EmptyLaneHintProps) {
  return (
    <div className="ls-empty-hint" role="status">
      <span className="ls-empty-icon" aria-hidden>{icon}</span>
      <div className="ls-empty-text">
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
      <button className="ls-btn primary small" onClick={onAction}>{actionLabel}</button>
    </div>
  );
}
