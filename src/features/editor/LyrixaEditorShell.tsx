import { useCallback, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { AudioEngine } from '../player/AudioEngine';
import { TimelineEditor } from '../timeline-editor/TimelineEditor';
import { ClipLyricsRenderer } from '../lyrics-view/ClipLyricsRenderer';
import { LyricsImportPanel } from './LyricsImportPanel';
import { FloatingPreview } from './FloatingPreview';
import { EditorAlerts } from './EditorAlerts';
import { EditorTopBar } from './EditorTopBar';
import { LayersSidebar } from './LayersSidebar';
import { InspectorPanel } from '../inspector/InspectorPanel';
import { TapSyncPanel } from '../sync/TapSyncPanel';
import { useTapSync } from '../sync/useTapSync';
import { parkLayerClips } from '../../core/timeline/tapSync';
import { useLyrixaProject } from './useLyrixaProject';
import { useAccentTheme } from '../../shared/theme/useAccentTheme';
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
    setProjectName,
    loadAudioFile,
    removeAudio,
    getAudioBlob,
    applyLyrics,
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

  const [syncMode, setSyncMode] = useState(false);
  const [syncSpeed, setSyncSpeed] = useState(1);
  const [importOpen, setImportOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [transparentPreviewOpen, setTransparentPreviewOpen] = useState(false);
  const [floatingPreviewWidth, setFloatingPreviewWidth] = useState(() =>
    readStoredNumber('lyrixa_floating_preview_width', 420)
  );
  const [miniPreviewVisible, setMiniPreviewVisible] = useState(true);
  const [nameEditing, setNameEditing] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(project.layers[0]?.id ?? null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() =>
    safeGetLocalStorage('lyrixa_sidebar_collapsed') === '1'
  );

  const { accent, setAccent } = useAccentTheme();

  const masterChannel = project.audioTracks.master;

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
    activeAudioChannel: masterChannel,
    onCurrentTimeCommit: setCurrentTime
  });

  const openMasterPicker = () => masterFileInputRef.current?.click();

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
    lyricsBundleImportInputRef,
    openProjectImportPicker,
    openLyricsBundleImportPicker,
    handleExportProject,
    handleExportLyricsBundle,
    handleProjectFileSelected,
    handleLyricsBundleFileSelected
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

  const syncLayerId = selectedLayerId ?? project.layers[0]?.id ?? null;
  const syncLayerName =
    project.layers.find(l => l.id === syncLayerId)?.name ?? 'Lyrics';
  const canSync =
    !!masterChannel?.objectUrl &&
    project.clips.some(c => c.layerId === syncLayerId);

  const tapSync = useTapSync({
    enabled: syncMode,
    clips: project.clips,
    layerId: syncLayerId,
    trackDuration: masterChannel?.duration,
    playbackTime,
    onClipsChange: setClips,
    onPlayToggle: handlePlayToggle,
    onSeek: handleSeek
  });

  const clearSyncLayer = useCallback(() => {
    if (!syncLayerId) return;
    setClips(parkLayerClips(project.clips, syncLayerId));
  }, [project.clips, syncLayerId, setClips]);

  const handleToggleSync = useCallback(() => {
    setSyncMode(prev => {
      const next = !prev;
      if (next) {
        setIsPlaying(false);
        setMiniPreviewVisible(true);
        // Start every sync pass from a clean lane at the top of the song — the
        // heuristic import timings are throwaway; tapping rebuilds them precisely.
        if (syncLayerId) setClips(parkLayerClips(project.clips, syncLayerId));
        handleSeek(0);
      } else {
        setSyncSpeed(1);
      }
      return next;
    });
  }, [setIsPlaying, syncLayerId, setClips, project.clips, handleSeek]);

  const handleSyncRestart = useCallback(() => {
    clearSyncLayer();
    tapSync.reset();
    handleSeek(0);
  }, [clearSyncLayer, tapSync, handleSeek]);

  const handleFloatingPreviewSize = (width: number) => {
    const next = Math.max(320, Math.min(760, width));
    setFloatingPreviewWidth(next);
    try { window.localStorage.setItem('lyrixa_floating_preview_width', String(next)); } catch { /* ignore */ }
  };

  const shellClass = [
    'lyrixa-shell',
    sidebarCollapsed ? 'sidebar-collapsed' : ''
  ].filter(Boolean).join(' ');

  return (
    <div className={shellClass}>
      <EditorTopBar
        projectName={project.name}
        nameEditing={nameEditing}
        draftName={nameEditing ? draftName : project.name}
        masterChannel={masterChannel ?? null}
        isPlaying={isPlaying}
        currentTime={playbackTime}
        duration={effectiveDuration}
        saveStatus={saveStatus}
        syncMode={syncMode}
        canSync={canSync}
        previewOpen={previewOpen}
        transparentPreviewOpen={transparentPreviewOpen}
        miniPreviewVisible={miniPreviewVisible}
        masterFileInputRef={masterFileInputRef}
        projectImportInputRef={projectImportInputRef}
        lyricsBundleImportInputRef={lyricsBundleImportInputRef}
        onDraftNameChange={setDraftName}
        onStartNameEdit={() => {
          setDraftName(project.name);
          setNameEditing(true);
        }}
        onCommitName={commitName}
        onCancelNameEdit={cancelNameEdit}
        onOpenMasterPicker={openMasterPicker}
        onOpenProjectImportPicker={openProjectImportPicker}
        onOpenLyricsBundleImportPicker={openLyricsBundleImportPicker}
        onAudioFileSelected={handleAudioFileSelected}
        onProjectFileSelected={handleProjectFileSelected}
        onLyricsBundleFileSelected={handleLyricsBundleFileSelected}
        onOpenLyricsImport={() => setImportOpen(true)}
        onToggleSync={handleToggleSync}
        onExportProject={handleExportProject}
        onExportLyricsBundle={handleExportLyricsBundle}
        onTogglePreview={() => setPreviewOpen(p => !p)}
        onOpenOverlay={() => setTransparentPreviewOpen(true)}
        onShowMiniPreview={() => setMiniPreviewVisible(true)}
        onPlayToggle={handlePlayToggle}
        onSeek={handleSeek}
        onResetProject={() => {
          if (window.confirm('Discard the current project and start a new one?')) {
            resetProject();
            setIsPlaying(false);
            setPlaybackTime(0);
          }
        }}
        accent={accent}
        onAccentChange={setAccent}
      />

      <EditorAlerts
        audioNeedsReload={audioNeedsReload}
        masterChannel={masterChannel}
        onReloadMaster={openMasterPicker}
        onClearMaster={() => removeAudio('master')}
      />

      {masterChannel?.objectUrl && (
        <AudioEngine
          ref={audioEngineRef}
          audioUrl={masterChannel.objectUrl}
          isPlaying={isPlaying}
          playbackRate={syncMode ? syncSpeed : 1}
          sourceSyncTime={playbackTime}
          onDurationChange={setMasterDuration}
          onEnded={() => setIsPlaying(false)}
        />
      )}

      <LayersSidebar
        layers={project.layers}
        clips={project.clips}
        selectedLayerId={selectedLayerId}
        collapsed={sidebarCollapsed}
        onSelectLayer={(id) => {
          setSelectedLayerId(id);
          setSelectedClipId(null);
        }}
        onLayersChange={setLayers}
        onToggleCollapsed={() => {
          setSidebarCollapsed(v => {
            const next = !v;
            try { window.localStorage.setItem('lyrixa_sidebar_collapsed', next ? '1' : '0'); } catch { /* ignore */ }
            return next;
          });
        }}
      />

      <main className="ls-main">
        <section className="ls-stage">
          <TimelineEditor
            embedded
            disableShortcuts={syncMode}
            clips={project.clips}
            layers={project.layers}
            currentTime={playbackTime}
            duration={effectiveDuration}
            isPlaying={isPlaying}
            trackName={masterChannel?.fileName ?? 'No audio loaded'}
            masterChannel={masterChannel}
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
      </main>

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

      {importOpen && (
        <LyricsImportPanel
          open={importOpen}
          initialText={project.rawLyricsText}
          layers={project.layers}
          onClose={() => setImportOpen(false)}
          onApply={applyLyrics}
        />
      )}

      {syncMode && (
        <TapSyncPanel
          clips={project.clips}
          layerId={syncLayerId}
          layerName={syncLayerName}
          isPlaying={isPlaying}
          playbackTime={playbackTime}
          speed={syncSpeed}
          sync={tapSync}
          onPlayToggle={handlePlayToggle}
          onSeek={handleSeek}
          onSpeedChange={setSyncSpeed}
          onRestart={handleSyncRestart}
          onClose={handleToggleSync}
        />
      )}

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
