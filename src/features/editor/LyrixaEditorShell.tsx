import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { AudioEngine } from '../player/AudioEngine';
import type { AudioEngineRef } from '../player/AudioEngine';
import { TimelineEditor } from '../timeline-editor/TimelineEditor';
import { ClipLyricsRenderer } from '../lyrics-view/ClipLyricsRenderer';
import { LyricsImportPanel } from './LyricsImportPanel';
import { FloatingPreview } from './FloatingPreview';
import { InspectorPanel } from '../inspector/InspectorPanel';
import { useLyrixaProject } from './useLyrixaProject';
import type { SaveStatus } from './useLyrixaProject';
import type { AudioChannelRole, AudioBandMode } from '../../core/types/audio';
import { createProjectExportEnvelope, parseProjectExportEnvelope } from '../../core/project/serialization';
import { extractBandPeaksFromBlob } from './peakExtraction';
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
    vocalExtractionStatus,
    setProjectName,
    loadAudioFile,
    extractVocalsFromMaster,
    removeAudio,
    getAudioBlob,
    applyLyrics,
    regenerateFromVocals,
    setClips,
    setLayers,
    setStyleConfig,
    setAnimationConfig,
    setFxConfig,
    setProgressIndicatorConfig,
    setCurrentTime,
    setMasterDuration,
    importProject,
    resetProject
  } = useLyrixaProject();

  const audioEngineRef = useRef<AudioEngineRef>(null);
  const masterFileInputRef = useRef<HTMLInputElement>(null);
  const vocalsFileInputRef = useRef<HTMLInputElement>(null);
  const projectImportInputRef = useRef<HTMLInputElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackMode, setPlaybackMode] = useState<'master' | 'vocals'>('master');
  const [importOpen, setImportOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [transparentPreviewOpen, setTransparentPreviewOpen] = useState(false);
  const [floatingPreviewWidth, setFloatingPreviewWidth] = useState(() =>
    readStoredNumber('lyrixa_floating_preview_width', 420)
  );
  const [miniPreviewVisible, setMiniPreviewVisible] = useState(true);
  const [nameEditing, setNameEditing] = useState(false);
  const [draftName, setDraftName] = useState(project.name);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(project.layers[0]?.id ?? null);

  // Transient playback time. Updated at ~60fps via rAF while playing,
  // and by user-driven seeks otherwise. Never persisted on its own ticks.
  const [playbackTime, setPlaybackTime] = useState(project.currentTime ?? 0);
  const rafRef = useRef<number | null>(null);

  const masterChannel = project.audioTracks.master;
  const vocalsChannel = project.audioTracks.vocals;
  const activeAudioChannel =
    playbackMode === 'vocals' && vocalsChannel?.objectUrl ? vocalsChannel : masterChannel;

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
  const openProjectImportPicker = () => projectImportInputRef.current?.click();

  useEffect(() => {
    if (playbackMode === 'vocals' && !vocalsChannel?.objectUrl) {
      setPlaybackMode('master');
    }
  }, [playbackMode, vocalsChannel?.objectUrl]);

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
    if (!activeAudioChannel?.objectUrl) return;
    setIsPlaying(p => !p);
  };

  const handleExtractVocals = useCallback(async () => {
    if (!masterChannel?.objectUrl || vocalExtractionStatus === 'extracting') return;
    const wasPlaying = isPlaying;
    setIsPlaying(false);
    try {
      await extractVocalsFromMaster();
      setPlaybackMode('vocals');
      setMiniPreviewVisible(true);
      if (wasPlaying) setIsPlaying(true);
    } catch (err) {
      console.error('[Lyrixa] Vocal isolation failed:', err);
      window.alert(err instanceof Error ? err.message : 'Could not isolate vocals from this track.');
    }
  }, [extractVocalsFromMaster, isPlaying, masterChannel?.objectUrl, vocalExtractionStatus]);

  const commitName = () => {
    const trimmed = draftName.trim();
    if (trimmed.length > 0 && trimmed !== project.name) {
      setProjectName(trimmed);
    } else {
      setDraftName(project.name);
    }
    setNameEditing(false);
  };

  const extractBandPeaksForMode = useCallback(
    async (mode: AudioBandMode) => {
      const blob = getAudioBlob('master');
      if (!blob) return null;
      return extractBandPeaksFromBlob(blob, mode);
    },
    [getAudioBlob]
  );

  const handleExportProject = useCallback(() => {
    const envelope = createProjectExportEnvelope(project, {
      bandMode: safeGetLocalStorage('lyrixa_band_mode') ?? undefined
    });
    const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeName = project.name.trim().replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '') || 'lyrixa-project';
    link.href = url;
    link.download = `${safeName}.lyrixa.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, [project]);

  const handleProjectFileSelected = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const envelope = JSON.parse(await file.text());
      const imported = parseProjectExportEnvelope(envelope);
      const bandMode = envelope?.project?.uiPreferences?.bandMode;
      if (typeof bandMode === 'string') {
        try { window.localStorage.setItem('lyrixa_band_mode', bandMode); } catch { /* ignore */ }
      }
      importProject(imported);
      setIsPlaying(false);
      setPlaybackTime(imported.currentTime ?? 0);
      setMiniPreviewVisible(true);
    } catch (err) {
      console.error('[Lyrixa] Failed to import project:', err);
      window.alert(err instanceof Error ? err.message : 'Could not import Lyrixa project.');
    }
  };

  const effectiveDuration = masterChannel?.duration ?? 60;
  const showMini = miniPreviewVisible && !previewOpen;
  const vocalsAnalysisReady = !!vocalsChannel?.vocalActivity?.length;
  const vocalsNeedsReload = !!vocalsChannel && !vocalsChannel.objectUrl;

  const handleFloatingPreviewSize = (width: number) => {
    const next = Math.max(320, Math.min(760, width));
    setFloatingPreviewWidth(next);
    try { window.localStorage.setItem('lyrixa_floating_preview_width', String(next)); } catch { /* ignore */ }
  };

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
          <button
            className="ls-btn"
            onClick={openMasterPicker}
            title={masterChannel
              ? `Master track: ${masterChannel.fileName}`
              : 'Load the main audio file (MP3, WAV, etc.)'}
          >
            {masterChannel ? `↻ ${masterChannel.fileName}` : '＋ Load master track'}
          </button>
          <button
            className={`ls-btn ${vocalsChannel ? 'active' : ''}`}
            onClick={handleExtractVocals}
            disabled={!masterChannel?.objectUrl || vocalExtractionStatus === 'extracting'}
            title={vocalsChannel
              ? `Re-isolate vocals from the master track. Current vocals helper: ${vocalsChannel.fileName}.`
              : 'Isolate a vocal-focused helper track from the loaded master audio.'}
          >
            {vocalExtractionStatus === 'extracting'
              ? 'Isolating vocals…'
              : vocalsChannel
                ? '↻ Isolate vocals'
                : '✦ Isolate vocals'}
          </button>
          <button
            className="ls-btn ghost small"
            onClick={openVocalsPicker}
            title="Upload a clean isolated vocals stem instead of using automatic extraction."
          >
            Upload stem
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
          <input
            ref={projectImportInputRef}
            type="file"
            accept=".lyrixa.json,application/json"
            style={{ display: 'none' }}
            onChange={handleProjectFileSelected}
          />
          <button className="ls-btn" onClick={() => setImportOpen(true)}>
            Import lyrics
          </button>
          <button className="ls-btn" onClick={handleExportProject}>
            Export Project
          </button>
          <button className="ls-btn" onClick={openProjectImportPicker}>
            Import Project
          </button>
          {vocalsAnalysisReady && project.normalizedLyrics.length > 0 && (
            <button
              className="ls-btn primary"
              onClick={() => regenerateFromVocals()}
              title="Use detected vocal activity regions from the vocals stem to retime all lyric clips. You can still adjust manually after."
            >
              ⟲ Generate timings from vocals
            </button>
          )}
          <button
            className={`ls-btn ${previewOpen ? 'active' : ''}`}
            onClick={() => setPreviewOpen(p => !p)}
          >
            {previewOpen ? '✕ Close preview' : '◉ Preview'}
          </button>
          <button
            className={`ls-btn ${transparentPreviewOpen ? 'active' : ''}`}
            onClick={() => setTransparentPreviewOpen(true)}
            title="Transparent in-editor overlay. Real always-on-top over other apps requires a desktop wrapper."
          >
            ⧉ Overlay
          </button>
          {!miniPreviewVisible && !previewOpen && (
            <button className="ls-btn" onClick={() => setMiniPreviewVisible(true)}>
              ◳ Live preview
            </button>
          )}
          {vocalsChannel?.objectUrl && (
            <div className="ls-monitor-toggle" aria-label="Playback source">
              <button
                className={playbackMode === 'master' ? 'active' : ''}
                onClick={() => {
                  setIsPlaying(false);
                  setPlaybackMode('master');
                }}
                title="Listen to the original master track"
              >
                Master
              </button>
              <button
                className={playbackMode === 'vocals' ? 'active' : ''}
                onClick={() => {
                  setIsPlaying(false);
                  setPlaybackMode('vocals');
                }}
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
            <span className="ls-vocals-chip" title="Analyzing vocals stem waveform…">
              ◌ Analyzing vocals…
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

      {vocalsNeedsReload && (
        <div className="ls-reload-banner">
          <span>
            Vocals stem needs to be reloaded:{' '}
            <strong>{vocalsChannel.fileName}</strong>.
          </span>
          <div className="ls-reload-actions">
            <button className="ls-btn small" onClick={openVocalsPicker}>Reload vocals stem</button>
            <button className="ls-btn ghost small" onClick={() => removeAudio('vocals')}>Clear</button>
          </div>
        </div>
      )}

      {activeAudioChannel?.objectUrl && (
        <AudioEngine
          ref={audioEngineRef}
          audioUrl={activeAudioChannel.objectUrl}
          isPlaying={isPlaying}
          sourceSyncTime={playbackTime}
          onDurationChange={playbackMode === 'master' ? setMasterDuration : () => undefined}
          onEnded={() => setIsPlaying(false)}
        />
      )}

      <main className="ls-main">
        <section className="ls-stage">
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
            vocalsBandPeaks={vocalsChannel?.waveformPeaks}
            onExtractBandPeaks={extractBandPeaksForMode}
            onClipsChange={setClips}
            onLayersChange={setLayers}
            onSeek={handleSeek}
            onPlayToggle={handlePlayToggle}
            onSelectionChange={({ clipId, layerId }) => {
              setSelectedClipId(clipId);
              setSelectedLayerId(layerId);
            }}
          />

          {showMini && (
            <FloatingPreview
              clips={project.clips}
              layers={project.layers}
              currentTime={playbackTime}
              styleConfig={project.styleConfig}
              animationConfig={project.animationConfig}
              fxConfig={project.fxConfig}
              progressIndicatorConfig={project.progressIndicatorConfig}
              width={floatingPreviewWidth}
              onSizeChange={handleFloatingPreviewSize}
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
        </section>

        <InspectorPanel
          project={project}
          selectedClipId={selectedClipId}
          selectedLayerId={selectedLayerId}
          onProjectNameChange={setProjectName}
          onStyleChange={setStyleConfig}
          onAnimationChange={setAnimationConfig}
          onFxChange={setFxConfig}
          onProgressChange={setProgressIndicatorConfig}
          onClipsChange={setClips}
          onLayersChange={setLayers}
          onImportLyrics={() => setImportOpen(true)}
          onExportProject={handleExportProject}
          onImportProject={openProjectImportPicker}
        />
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
              animationConfig={project.animationConfig}
              fxConfig={project.fxConfig}
              progressIndicatorConfig={project.progressIndicatorConfig}
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

      {transparentPreviewOpen && (
        <div className="ls-transparent-preview" role="dialog" aria-label="Transparent preview overlay">
          <ClipLyricsRenderer
            clips={project.clips}
            layers={project.layers}
            currentTime={playbackTime}
            styleConfig={project.styleConfig}
            animationConfig={project.animationConfig}
            fxConfig={project.fxConfig}
            progressIndicatorConfig={project.progressIndicatorConfig}
          />
          <button
            className="ls-btn ghost ls-transparent-exit"
            onClick={() => setTransparentPreviewOpen(false)}
          >
            Exit overlay
          </button>
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

function safeGetLocalStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function readStoredNumber(key: string, fallback: number): number {
  const raw = safeGetLocalStorage(key);
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}
