import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { AudioEngine } from '../player/AudioEngine';
import { TimelineEditor } from '../timeline-editor/TimelineEditor';
import { ClipLyricsRenderer } from '../lyrics-view/ClipLyricsRenderer';
import { LyricsImportPanel } from './LyricsImportPanel';
import { FloatingPreview } from './FloatingPreview';
import { EditorAlerts } from './EditorAlerts';
import { EditorTopBar } from './EditorTopBar';
import { InspectorPanel } from '../inspector/InspectorPanel';
import { useLyrixaProject } from './useLyrixaProject';
import type { AudioChannelRole, AudioBandMode } from '../../core/types/audio';
import { extractBandPeaksFromBlob } from './peakExtraction';
import { usePlaybackController } from './usePlaybackController';
import { useProjectImportExport } from './useProjectImportExport';
import './LyrixaEditorShell.css';

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

  const masterFileInputRef = useRef<HTMLInputElement>(null);
  const vocalsFileInputRef = useRef<HTMLInputElement>(null);

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

  const masterChannel = project.audioTracks.master;
  const vocalsChannel = project.audioTracks.vocals;
  const activeAudioChannel =
    playbackMode === 'vocals' && vocalsChannel?.objectUrl ? vocalsChannel : masterChannel;

  const {
    audioEngineRef,
    isPlaying,
    setIsPlaying,
    playbackTime,
    setPlaybackTime,
    handleSeek,
    handlePlayToggle
  } = usePlaybackController({
    projectId: project.id,
    initialTime: project.currentTime ?? 0,
    activeAudioChannel,
    onCurrentTimeCommit: setCurrentTime
  });

  useEffect(() => {
    setDraftName(project.name);
  }, [project.name]);

  const openMasterPicker = () => masterFileInputRef.current?.click();
  const openVocalsPicker = () => vocalsFileInputRef.current?.click();

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

  const cancelNameEdit = () => {
    setDraftName(project.name);
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

  const {
    projectImportInputRef,
    openProjectImportPicker,
    handleExportProject,
    handleProjectFileSelected
  } = useProjectImportExport({
    project,
    importProject,
    onProjectImported: imported => {
      setIsPlaying(false);
      setPlaybackTime(imported.currentTime ?? 0);
      setMiniPreviewVisible(true);
    }
  });

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
      <EditorTopBar
        projectName={project.name}
        nameEditing={nameEditing}
        draftName={draftName}
        masterChannel={masterChannel ?? null}
        vocalsChannel={vocalsChannel ?? null}
        playbackMode={playbackMode}
        saveStatus={saveStatus}
        vocalExtractionStatus={vocalExtractionStatus}
        vocalsAnalysisReady={vocalsAnalysisReady}
        canGenerateTimings={project.normalizedLyrics.length > 0}
        previewOpen={previewOpen}
        transparentPreviewOpen={transparentPreviewOpen}
        miniPreviewVisible={miniPreviewVisible}
        masterFileInputRef={masterFileInputRef}
        vocalsFileInputRef={vocalsFileInputRef}
        projectImportInputRef={projectImportInputRef}
        onDraftNameChange={setDraftName}
        onStartNameEdit={() => setNameEditing(true)}
        onCommitName={commitName}
        onCancelNameEdit={cancelNameEdit}
        onOpenMasterPicker={openMasterPicker}
        onOpenVocalsPicker={openVocalsPicker}
        onOpenProjectImportPicker={openProjectImportPicker}
        onAudioFileSelected={handleAudioFileSelected}
        onProjectFileSelected={handleProjectFileSelected}
        onExtractVocals={handleExtractVocals}
        onRemoveVocals={() => removeAudio('vocals')}
        onOpenLyricsImport={() => setImportOpen(true)}
        onExportProject={handleExportProject}
        onRegenerateFromVocals={regenerateFromVocals}
        onTogglePreview={() => setPreviewOpen(p => !p)}
        onOpenOverlay={() => setTransparentPreviewOpen(true)}
        onShowMiniPreview={() => setMiniPreviewVisible(true)}
        onPlaybackModeChange={(mode) => {
          setIsPlaying(false);
          setPlaybackMode(mode);
        }}
        onResetProject={() => {
          if (window.confirm('Discard the current project and start a new one?')) {
            resetProject();
            setIsPlaying(false);
            setPlaybackTime(0);
          }
        }}
      />

      <EditorAlerts
        audioNeedsReload={audioNeedsReload}
        masterChannel={masterChannel}
        vocalsNeedsReload={vocalsNeedsReload}
        vocalsChannel={vocalsChannel}
        onReloadMaster={openMasterPicker}
        onClearMaster={() => removeAudio('master')}
        onReloadVocals={openVocalsPicker}
        onClearVocals={() => removeAudio('vocals')}
      />

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
