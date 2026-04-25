import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { AudioEngine } from '../player/AudioEngine';
import type { AudioEngineRef } from '../player/AudioEngine';
import { TimelineEditor } from '../timeline-editor/TimelineEditor';
import { ClipLyricsRenderer } from '../lyrics-view/ClipLyricsRenderer';
import { LyricsImportPanel } from './LyricsImportPanel';
import { MiniPreview } from './MiniPreview';
import { useLyrixaProject } from './useLyrixaProject';
import type { SaveStatus } from './useLyrixaProject';
import type { AudioChannelRole } from '../../core/types/audio';
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
    regenerateFromVocals,
    setClips,
    setLayers,
    setCurrentTime,
    setMasterDuration,
    resetProject
  } = useLyrixaProject();

  const audioEngineRef = useRef<AudioEngineRef>(null);
  const masterFileInputRef = useRef<HTMLInputElement>(null);
  const vocalsFileInputRef = useRef<HTMLInputElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [miniPreviewVisible, setMiniPreviewVisible] = useState(true);
  const [nameEditing, setNameEditing] = useState(false);
  const [draftName, setDraftName] = useState(project.name);

  // Transient playback time. Updated at ~60fps via rAF while playing,
  // and by user-driven seeks otherwise. Never persisted on its own ticks.
  const [playbackTime, setPlaybackTime] = useState(project.currentTime ?? 0);
  const rafRef = useRef<number | null>(null);

  const masterChannel = project.audioTracks.master;
  const vocalsChannel = project.audioTracks.vocals;

  useEffect(() => {
    setDraftName(project.name);
  }, [project.name]);

  useEffect(() => {
    setPlaybackTime(project.currentTime ?? 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  // rAF loop for the playhead.
  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }
    const tick = () => {
      const t = audioEngineRef.current?.getCurrentTime() ?? 0;
      setPlaybackTime(t);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [isPlaying]);

  // Persist last position only on pause transitions.
  useEffect(() => {
    if (isPlaying) return;
    setCurrentTime(playbackTime);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  const openMasterPicker = () => masterFileInputRef.current?.click();
  const openVocalsPicker = () => vocalsFileInputRef.current?.click();

  const handleAudioFileSelected = (role: AudioChannelRole) =>
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      try {
        await loadAudioFile(file, role);
      } catch (err) {
        console.error(`[Lyrixa] Failed to load ${role} audio file:`, err);
      }
    };

  const handleSeek = useCallback((time: number) => {
    setPlaybackTime(time);
    setCurrentTime(time);
    audioEngineRef.current?.seekTo(time);
  }, [setCurrentTime]);

  const handlePlayToggle = () => {
    if (!masterChannel?.objectUrl) return;
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

  const effectiveDuration = masterChannel?.duration ?? 60;
  const showMini = miniPreviewVisible && !previewOpen;
  const vocalsAnalysisReady = !!vocalsChannel?.vocalActivity?.length;

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
          <button className="ls-btn" onClick={openMasterPicker}>
            {masterChannel ? '↻ Replace audio' : '＋ Load audio'}
          </button>
          <button
            className={`ls-btn ${vocalsChannel ? 'active' : ''}`}
            onClick={openVocalsPicker}
            title="Optional vocals stem for analysis"
          >
            {vocalsChannel ? '↻ Replace vocals' : '＋ Load vocals'}
          </button>
          {vocalsChannel && (
            <button
              className="ls-btn ghost small"
              onClick={() => removeAudio('vocals')}
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
            onChange={handleAudioFileSelected('master')}
          />
          <input
            ref={vocalsFileInputRef}
            type="file"
            accept="audio/*,.mp3,.wav,.ogg,.flac,.m4a"
            style={{ display: 'none' }}
            onChange={handleAudioFileSelected('vocals')}
          />
          <button className="ls-btn" onClick={() => setImportOpen(true)}>
            ✎ Import lyrics
          </button>
          {vocalsAnalysisReady && project.normalizedLyrics.length > 0 && (
            <button
              className="ls-btn primary"
              onClick={() => regenerateFromVocals()}
              title="Use vocal activity to retime existing lyric clips"
            >
              ⟲ Generate timings from vocals
            </button>
          )}
          <button
            className={`ls-btn ${isPlaying ? 'active' : ''}`}
            onClick={handlePlayToggle}
            disabled={!masterChannel?.objectUrl}
            title={!masterChannel?.objectUrl ? 'Load audio to play' : undefined}
          >
            {isPlaying ? '⏸ Pause' : '▶ Play'}
          </button>
          <button
            className={`ls-btn ${previewOpen ? 'active' : ''}`}
            onClick={() => setPreviewOpen(p => !p)}
          >
            {previewOpen ? '🅧 Close preview' : '◉ Preview'}
          </button>
          {!miniPreviewVisible && !previewOpen && (
            <button className="ls-btn" onClick={() => setMiniPreviewVisible(true)}>
              ◳ Mini preview
            </button>
          )}
        </div>

        <div className="ls-topbar-section ls-meta">
          {vocalsAnalysisReady && (
            <span className="ls-vocals-chip" title="Vocal activity detected">
              ◐ Vocals analysis available
            </span>
          )}
          <span className={`ls-save-chip ${saveStatus}`}>{SAVE_LABEL[saveStatus]}</span>
          <button
            className="ls-btn ghost danger"
            onClick={() => {
              if (window.confirm('Discard the current project and start a new one?')) {
                resetProject();
                setIsPlaying(false);
                setPlaybackTime(0);
              }
            }}
            title="Reset project"
          >
            New
          </button>
        </div>
      </header>

      {audioNeedsReload && masterChannel && !masterChannel.objectUrl && (
        <div className="ls-reload-banner">
          <span>
            Audio file needs to be reloaded:{' '}
            <strong>{masterChannel.fileName}</strong>. Your lyrics and clips are safe.
          </span>
          <div className="ls-reload-actions">
            <button className="ls-btn small" onClick={openMasterPicker}>Reload audio</button>
            <button className="ls-btn ghost small" onClick={() => removeAudio('master')}>Clear</button>
          </div>
        </div>
      )}

      {masterChannel?.objectUrl && (
        <AudioEngine
          ref={audioEngineRef}
          audioUrl={masterChannel.objectUrl}
          isPlaying={isPlaying}
          onDurationChange={setMasterDuration}
          onEnded={() => setIsPlaying(false)}
        />
      )}

      <main className="ls-main">
        <TimelineEditor
          embedded
          clips={project.clips}
          layers={project.layers}
          currentTime={playbackTime}
          duration={effectiveDuration}
          isPlaying={isPlaying}
          trackName={masterChannel?.fileName ?? 'No audio loaded'}
          masterChannel={masterChannel}
          vocalsChannel={vocalsChannel}
          onClipsChange={setClips}
          onLayersChange={setLayers}
          onSeek={handleSeek}
          onPlayToggle={handlePlayToggle}
        />

        {showMini && (
          <MiniPreview
            clips={project.clips}
            layers={project.layers}
            currentTime={playbackTime}
            styleConfig={project.styleConfig}
            onExpand={() => setPreviewOpen(true)}
            onClose={() => setMiniPreviewVisible(false)}
          />
        )}

        {!masterChannel && (
          <EmptyLaneHint
            icon="🎵"
            title="No audio loaded"
            description="Load an MP3, WAV, or other audio file to populate the audio lane."
            actionLabel="Load audio"
            onAction={openMasterPicker}
          />
        )}

        {project.clips.length === 0 && masterChannel && (
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
        vocalsAvailable={vocalsAnalysisReady}
        onClose={() => setImportOpen(false)}
        onApply={applyLyrics}
      />

      {previewOpen && (
        <div className="ls-preview-overlay" onClick={() => setPreviewOpen(false)}>
          <div className="ls-preview-stage" onClick={(e) => e.stopPropagation()}>
            <ClipLyricsRenderer
              clips={project.clips}
              layers={project.layers}
              currentTime={playbackTime}
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
