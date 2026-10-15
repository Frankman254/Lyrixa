import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { AudioEngine } from '../player/AudioEngine';
import { TimelineEditor } from '../timeline-editor/TimelineEditor';
import { ClipLyricsRenderer } from '../lyrics-view/ClipLyricsRenderer';
import type { LyrixaProject } from '../../core/types/project';
import { LyricsImportPanel } from './LyricsImportPanel';
import { FloatingPreview } from './FloatingPreview';
import { EditorAlerts } from './EditorAlerts';
import { EditorTopBar } from './EditorTopBar';
import { LayersSidebar } from './LayersSidebar';
import { InspectorPanel } from '../inspector/InspectorPanel';
import { CompositionCatalog } from '../composition/CompositionCatalog';
import { TapSyncPanel } from '../sync/TapSyncPanel';
import { useSyncSession } from '../sync/useSyncSession';
import { useEditorMode } from './useEditorMode';
import type { EditorMode } from './useEditorMode';
import { ShortcutsPanel } from '../shortcuts/ShortcutsPanel';
import { useShortcuts } from '../shortcuts/useShortcuts';
import { findActiveLyricSource, getLyricSourceStartTime } from '../../core/lyrics/lyricSourceLibrary';
import { duplicateClipSelection } from '../../core/timeline/duplicateClips';
import { useLyrixaProject } from './useLyrixaProject';
import { useAccentTheme } from '../../shared/theme/useAccentTheme';
import { useViewportTier } from '../../shared/layout/useViewportTier';
import { EditorModeNav } from './EditorModeNav';
import type { AudioChannelRole, AudioBandMode } from '../../core/types/audio';
import {
  extractBandPeaksFromBlob,
  isLongAudio as detectLongAudio,
  shouldExtractRealPeaks
} from './peakExtraction';
import { usePlaybackController } from './usePlaybackController';
import { useProjectImportExport } from './useProjectImportExport';
import { createBridgeServices } from '../bridge/bridgeServices';
import { useTranscriptorJob } from '../bridge/useTranscriptorJob';
import {
  resolveLiveWallpaperTarget,
  sendProjectToLiveWallpaper
} from '../../core/bridge/liveWallpaperTarget';
import { createVibrixScoreEnvelope } from '../../core/composition/score';
import { buildVibrixScorePackage, VibrixScorePackageError } from '../../core/composition/scorePackage';
import { manifestFromAuthoringSource } from '../../core/composition/authoringManifest';
import type { VibrixAuthoringSource } from '../../core/composition/types';
import {
  getAuthoringSource,
  putAuthoringSource
} from '../composition/authoringSourceStorage';
import './LyrixaEditorShell.css';

export function LyrixaEditorShell() {
  const [waveformEnabled, setWaveformEnabled] = useState(() =>
    readStoredBoolean('lyrixa_waveform_enabled', false)
  );

  const {
    project,
    saveStatus,
    audioNeedsReload,
    audioLibrary,
    lyricsLibrary,
    setProjectName,
    loadAudioFile,
    removeAudio,
    activateAudioLibraryAsset,
    getAudioBlob,
    setRawLyricsText,
    applyLyrics,
    setLyricMode,
    setActiveLyricSource,
    setLyricSourceTitle,
    setLyricSourceStartTime,
    removeLyricSource,
    recoverLyricsFromLayer,
    attachLyricSourceFromLibrary,
    setLyricSourceAudioAssignment,
    setClips,
    setLayers,
    setComposition,
    setVibrixAuthoringRef,
    setProjectDefaults,
    setCurrentTime,
    setMasterDuration,
    importProject,
    undo,
    redo,
    canUndo,
    canRedo,
    hardResetProject
  } = useLyrixaProject({
    waveformAnalysisEnabled: waveformEnabled
  });

  const masterFileInputRef = useRef<HTMLInputElement>(null);

  const { mode, setMode, isSync: syncMode, isCompose, isPreview } = useEditorMode();
  const setSyncMode = useCallback((next: boolean) => {
    if (next) setMode('sync');
    else if (mode === 'sync') setMode('edit');
  }, [mode, setMode]);
  const [importOpen, setImportOpen] = useState(false);
  const [editingLyricSourceId, setEditingLyricSourceId] = useState<string | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [transparentPreviewOpen, setTransparentPreviewOpen] = useState(false);
  const [floatingPreviewWidth, setFloatingPreviewWidth] = useState(() =>
    readStoredNumber('lyrixa_floating_preview_width', 420)
  );
  const [miniPreviewVisible, setMiniPreviewVisibleState] = useState(() =>
    readStoredBoolean('lyrixa_floating_preview_visible', false)
  );
  const [nameEditing, setNameEditing] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(project.layers[0]?.id ?? null);
  const [selectedCompositionCueId, setSelectedCompositionCueId] = useState<string | null>(null);
  const [vibrixAuthoringSource, setVibrixAuthoringSource] = useState<VibrixAuthoringSource | null>(null);
  const [vibrixSourceUnavailable, setVibrixSourceUnavailable] = useState(false);
  const [vibrixSourceLoading, setVibrixSourceLoading] = useState(false);
  const [timelineFocusRequest, setTimelineFocusRequest] = useState<{ time: number; nonce: number } | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() =>
    safeGetLocalStorage('lyrixa_sidebar_collapsed') === '1'
  );

  useEffect(() => {
    let cancelled = false;
    const reference = project.vibrixAuthoringRef;
    if (!reference) {
      setVibrixAuthoringSource(project.vibrixManifest
        ? { kind: 'manifest', manifest: project.vibrixManifest }
        : null);
      setVibrixSourceUnavailable(false);
      setVibrixSourceLoading(false);
      return () => { cancelled = true; };
    }
    // The reference belongs to the current project; drop the previous project's
    // source synchronously so the catalog and export never run on a stale snapshot set.
    setVibrixAuthoringSource(null);
    setVibrixSourceUnavailable(false);
    setVibrixSourceLoading(true);
    void getAuthoringSource(reference).then(source => {
      if (cancelled) return;
      setVibrixAuthoringSource(source);
      setVibrixSourceUnavailable(source === null);
      setVibrixSourceLoading(false);
    });
    return () => { cancelled = true; };
  }, [project.vibrixAuthoringRef, project.vibrixManifest]);

  const activeVibrixManifest = vibrixAuthoringSource
    ? manifestFromAuthoringSource(vibrixAuthoringSource)
    : project.vibrixManifest;

  const importVibrixAuthoring = useCallback(async (source: VibrixAuthoringSource) => {
    const reference = await putAuthoringSource(project.id, source);
    setVibrixAuthoringSource(source);
    setVibrixSourceUnavailable(false);
    setVibrixAuthoringRef(reference);
  }, [project.id, setVibrixAuthoringRef]);

  const tier = useViewportTier();
  const isMobile = tier === 'mobile';
  const isDesktop = tier === 'desktop';
  // Desktop: the inspector is a pinned grid column the user can hide (persisted).
  // Compact/mobile: it's an overlay drawer/sheet that always starts closed.
  const [inspectorPinned, setInspectorPinnedState] = useState(() =>
    readStoredBoolean('lyrixa_inspector_visible', true)
  );
  const [inspectorDrawerOpen, setInspectorDrawerOpen] = useState(false);
  const [sidebarDrawerOpen, setSidebarDrawerOpen] = useState(false);

  const setInspectorPinned = useCallback((visible: boolean) => {
    setInspectorPinnedState(visible);
    try {
      window.localStorage.setItem('lyrixa_inspector_visible', visible ? '1' : '0');
    } catch { /* ignore */ }
  }, []);

  // Overlay drawers don't survive a tier change — a drawer left open while
  // resizing back to desktop would otherwise float over the 3-column grid.
  useEffect(() => {
    setInspectorDrawerOpen(false);
    setSidebarDrawerOpen(false);
  }, [tier]);

  const { accent, setAccent } = useAccentTheme();
  const { matches: matchesShortcut } = useShortcuts();

  const setMiniPreviewVisible = useCallback((visible: boolean) => {
    setMiniPreviewVisibleState(visible);
    try {
      window.localStorage.setItem('lyrixa_floating_preview_visible', visible ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, []);

  // Global shortcuts: Shift+? toggles the reference panel; Ctrl/Cmd+Z and
  // Ctrl/Cmd+Shift+Z drive project undo/redo. Skipped while typing so text
  // fields keep their native undo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const editable = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' ||
        (target as HTMLElement | null)?.isContentEditable;
      if (editable) return;
      if (matchesShortcut(e, 'shortcuts.open')) {
        e.preventDefault();
        setShortcutsOpen(prev => !prev);
        return;
      }
      // Redo first: its binding is a superset of undo's (extra Shift).
      if (matchesShortcut(e, 'project.redo')) {
        e.preventDefault();
        redo();
        return;
      }
      if (matchesShortcut(e, 'project.undo')) {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [matchesShortcut, redo, undo]);

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

  useEffect(() => {
    if (!previewOpen) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const editable = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' ||
        (target as HTMLElement | null)?.isContentEditable;
      if (editable) return;

      if (matchesShortcut(e, 'transport.playPause')) {
        e.preventDefault();
        e.stopImmediatePropagation();
        handlePlayToggle();
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        setPreviewOpen(false);
      }
    };

    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [handlePlayToggle, matchesShortcut, previewOpen]);

  const openMasterPicker = () => masterFileInputRef.current?.click();

  const focusTimelineAt = useCallback((time: number) => {
    const safeTime = Number.isFinite(time) ? Math.max(0, time) : 0;
    setTimelineFocusRequest({ time: safeTime, nonce: Date.now() });
  }, []);

  const handleAudioFileSelected = (role: AudioChannelRole) =>
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      try {
        await loadAudioFile(file, role, { analyzeWaveform: waveformEnabled });
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
      if (!waveformEnabled) return null;
      const blob = getAudioBlob('master');
      if (!blob) return null;
      if (!shouldExtractRealPeaks(blob, masterChannel?.duration ?? 0)) return null;
      return extractBandPeaksFromBlob(blob, mode);
    },
    [getAudioBlob, masterChannel?.duration, waveformEnabled]
  );

  const {
    projectImportInputRef,
    lyricsBundleImportInputRef,
    openProjectImportPicker,
    openLyricsBundleImportPicker,
    handleExportProject,
    handleExportLyricsBundle,
    handleExportLyrics,
    handleProjectFileSelected,
    handleLyricsBundleFileSelected
  } = useProjectImportExport({
    project,
    importProject,
    onProjectImported: imported => {
      setIsPlaying(false);
      setPlaybackTime(imported.currentTime ?? 0);
    }
  });

  // Built once per session. Constructing the services performs no network
  // call, so a standalone Lyrixa pays nothing for the bridge existing.
  const [bridge] = useState(createBridgeServices);

  const transcriptorJob = useTranscriptorJob({
    client: bridge.transcriptor,
    importProject,
    loadAudioFile,
    onProjectImported: imported => {
      setIsPlaying(false);
      setPlaybackTime(imported.currentTime ?? 0);
    }
  });

  const handleSendToLiveWallpaper = useCallback(async () => {
    try {
      const target = await resolveLiveWallpaperTarget(bridge.liveWallpaperTargets);
      const result = await sendProjectToLiveWallpaper(project, target);
      // Only the file destination needs a word: an HTTP hand-off that worked
      // is visible in LiveWallpaper itself, and a dialog would just be noise.
      if (result.kind === 'download') window.alert(result.message);
    } catch (err) {
      console.error('[Lyrixa] Could not send to LiveWallpaper:', err);
      window.alert(err instanceof Error ? err.message : 'Could not send to LiveWallpaper.');
    }
  }, [bridge.liveWallpaperTargets, project]);

  const effectiveDuration = masterChannel?.duration ?? 60;
  const isLongAudio = detectLongAudio(masterChannel?.sizeBytes, masterChannel?.duration);
  const showMini = miniPreviewVisible && !previewOpen;

  const activeLyricSource = findActiveLyricSource(project);
  const editingLyricSource = useMemo(
    () => editingLyricSourceId
      ? project.lyricSources.find(source => source.id === editingLyricSourceId) ?? null
      : null,
    [editingLyricSourceId, project.lyricSources]
  );

  const pausePlayback = useCallback(() => setIsPlaying(false), [setIsPlaying]);
  const sync = useSyncSession({
    active: syncMode,
    onActiveChange: setSyncMode,
    project,
    selectedLayerId,
    onSelectLayer: setSelectedLayerId,
    setClips,
    setRawLyricsText,
    setActiveLyricSource,
    audioReady: !!masterChannel?.objectUrl,
    trackDuration: masterChannel?.duration,
    playbackTime,
    onPlayToggle: handlePlayToggle,
    onPause: pausePlayback,
    onSeek: handleSeek,
    onFocusTime: focusTimelineAt
  });

  const openLyricsImport = useCallback((sourceId: string | null = null) => {
    if (sourceId) setActiveLyricSource(sourceId);
    setEditingLyricSourceId(sourceId);
    setImportOpen(true);
  }, [setActiveLyricSource]);

  const closeLyricsImport = useCallback(() => {
    setImportOpen(false);
    setEditingLyricSourceId(null);
  }, []);

  const handleApplyLyrics = useCallback((
    rawText: string,
    options: Parameters<typeof applyLyrics>[1]
  ): boolean => {
    const sourceId = options?.sourceId;
    const existing = sourceId
      ? project.lyricSources.find(source => source.id === sourceId)
      : null;
    const changesPlacedSource =
      !!existing &&
      existing.rawText !== rawText &&
      project.clips.some(clip => clip.lyricSourceId === existing.id);
    if (changesPlacedSource) {
      const confirmed = window.confirm(
        'This lyric source already has synchronized clips. Editing the global text will keep existing timeline clips unchanged. Modified or new paragraphs must be synchronized again, and obsolete timeline clips must be deleted manually. Continue?'
      );
      if (!confirmed) return false;
    }
    applyLyrics(rawText, options);
    return true;
  }, [applyLyrics, project.clips, project.lyricSources]);

  const handleJumpToLyricSource = useCallback((sourceId: string) => {
    setActiveLyricSource(sourceId);
    const startTime = getLyricSourceStartTime(project, sourceId);
    handleSeek(startTime);
    focusTimelineAt(startTime);
  }, [focusTimelineAt, handleSeek, project, setActiveLyricSource]);

  /**
   * Clone an existing clip on the same layer for repeated verses/choruses, so
   * the user doesn't need to re-import lyrics just to repeat a paragraph. The
   * duplicate gets a fresh `sourceId` so tap-sync won't mistake it for the
   * original line, and is placed just after the original (capped by the song
   * duration). Selecting it lets the user fine-tune timing from the inspector.
   */
  const handleDuplicateClip = useCallback((clipId: string) => {
    const { clips: nextClips, duplicatedIds } = duplicateClipSelection(
      project.clips,
      [clipId],
      { trackDuration: effectiveDuration }
    );
    if (duplicatedIds.length === 0) return;
    setClips(nextClips);
    setSelectedClipId(duplicatedIds[0] ?? null);
  }, [project.clips, effectiveDuration, setClips]);

  const handleHardResetProject = useCallback(async () => {
    const confirmed = window.confirm(
      'Esto borrará el proyecto actual, clips, lyrics vinculadas, texturas y preferencias del editor. Las bibliotecas globales de audio y lyrics seguirán disponibles en este dispositivo. ¿Deseas continuar?'
    );
    if (!confirmed) return;
    setIsPlaying(false);
    setPlaybackTime(0);
    setSyncMode(false);
    setPreviewOpen(false);
    setTransparentPreviewOpen(false);
    setMiniPreviewVisible(false);
    setWaveformEnabled(false);
    setSelectedClipId(null);
    setSelectedLayerId(null);
    await hardResetProject();
    window.alert('Project reset complete');
  }, [hardResetProject, setIsPlaying, setMiniPreviewVisible, setPlaybackTime, setSyncMode]);

  const handleFloatingPreviewSize = (width: number) => {
    const next = Math.max(320, Math.min(760, width));
    setFloatingPreviewWidth(next);
    try { window.localStorage.setItem('lyrixa_floating_preview_width', String(next)); } catch { /* ignore */ }
  };

  const toggleWaveformEnabled = useCallback(() => {
    setWaveformEnabled(current => {
      const next = !current;
      try { window.localStorage.setItem('lyrixa_waveform_enabled', next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const togglePreviewWindow = useCallback(() => {
    if (previewOpen || miniPreviewVisible) {
      setPreviewOpen(false);
      setMiniPreviewVisible(false);
      return;
    }
    setMiniPreviewVisible(true);
  }, [miniPreviewVisible, previewOpen, setMiniPreviewVisible]);

  const toggleLargePreview = useCallback(() => {
    setPreviewOpen(open => {
      const next = !open;
      if (next) setMiniPreviewVisible(false);
      return next;
    });
  }, [setMiniPreviewVisible]);

  // Shared by the top-bar switcher and the mobile bottom nav. Preview mode also
  // opens the large preview so the user sees their work without other panels
  // stealing focus.
  const handleEditorModeChange = useCallback((next: EditorMode) => {
    setMode(next);
    if (next === 'preview') {
      setMiniPreviewVisible(false);
      setPreviewOpen(true);
    }
    if (next !== 'preview') setPreviewOpen(false);
    // Style mode is inspector-centric: on the compact tier open its drawer
    // right away (mobile renders it on the stage instead).
    if (next === 'style' && tier === 'compact') setInspectorDrawerOpen(true);
    if (next === 'compose' && tier !== 'desktop') setSidebarDrawerOpen(true);
  }, [setMiniPreviewVisible, setMode, tier]);

  // Mobile style mode promotes the inspector to the stage area — styling on a
  // phone needs the full width, and the timeline isn't useful mid-styling.
  const mobileStyleMode = isMobile && mode === 'style';
  const inspectorShown = isPreview || isCompose
    ? false
    : mobileStyleMode
      ? true
      : isDesktop
        ? inspectorPinned
        : inspectorDrawerOpen;
  const inspectorIsOverlay = !isDesktop && !mobileStyleMode;
  const handleToggleInspector = useCallback(() => {
    if (isDesktop) setInspectorPinned(!inspectorPinned);
    else setInspectorDrawerOpen(open => !open);
  }, [isDesktop, inspectorPinned, setInspectorPinned]);

  const sidebarIsDrawer = !isDesktop;
  const backdropShown = sidebarIsDrawer
    ? sidebarDrawerOpen || (inspectorIsOverlay && inspectorShown)
    : false;

  const shellClass = [
    'lyrixa-shell',
    `tier-${tier}`,
    sidebarCollapsed && isDesktop && !isCompose ? 'sidebar-collapsed' : '',
    !inspectorShown || inspectorIsOverlay || mobileStyleMode ? 'inspector-hidden' : '',
    mobileStyleMode ? 'mobile-style' : ''
  ].filter(Boolean).join(' ');
  const importCreatesNewSource = project.lyricMode === 'multi' && project.lyricSources.length > 0;

  return (
    <div className={shellClass}>
      <EditorTopBar
        project={project}
        masterChannel={masterChannel ?? null}
        saveStatus={saveStatus}
        tier={tier}
        nameEdit={{
          editing: nameEditing,
          draft: nameEditing ? draftName : project.name,
          onDraftChange: setDraftName,
          onStart: () => {
            setDraftName(project.name);
            setNameEditing(true);
          },
          onCommit: commitName,
          onCancel: cancelNameEdit
        }}
        playback={{
          isPlaying,
          currentTime: playbackTime,
          duration: effectiveDuration,
          onPlayToggle: handlePlayToggle,
          onSeek: handleSeek
        }}
        history={{ canUndo, canRedo, onUndo: undo, onRedo: redo }}
        mode={{
          current: mode,
          onChange: handleEditorModeChange,
          syncMode,
          canSync: sync.canSync,
          onToggleSync: sync.toggle
        }}
        panels={{
          inspectorVisible: inspectorShown,
          showInspectorToggle: !isPreview && !isCompose && !mobileStyleMode,
          onToggleInspector: handleToggleInspector,
          onToggleSidebar: () => setSidebarDrawerOpen(open => !open)
        }}
        preview={{
          open: previewOpen,
          transparentOpen: transparentPreviewOpen,
          miniVisible: miniPreviewVisible,
          onToggle: toggleLargePreview,
          onOpenOverlay: () => {
            setMiniPreviewVisible(false);
            setTransparentPreviewOpen(true);
          },
          onShowMini: () => setMiniPreviewVisible(true),
          onHideMini: () => setMiniPreviewVisible(false)
        }}
        files={{
          masterFileInputRef,
          projectImportInputRef,
          lyricsBundleImportInputRef,
          onAudioFileSelected: handleAudioFileSelected,
          onProjectFileSelected: handleProjectFileSelected,
          onLyricsBundleFileSelected: handleLyricsBundleFileSelected,
          onOpenMasterPicker: openMasterPicker,
          onOpenProjectImportPicker: openProjectImportPicker,
          onOpenLyricsBundleImportPicker: openLyricsBundleImportPicker
        }}
        actions={{
          onOpenLyricsImport: () => openLyricsImport(),
          onExportProject: handleExportProject,
          onExportLyricsBundle: handleExportLyricsBundle,
          onExportLyrics: handleExportLyrics,
          onSendToLiveWallpaper: handleSendToLiveWallpaper,
          onResetProject: handleHardResetProject,
          onOpenShortcuts: () => setShortcutsOpen(true)
        }}
        accent={{ value: accent, onChange: setAccent }}
      />

      <EditorAlerts
        audioNeedsReload={audioNeedsReload}
        masterChannel={masterChannel}
        onReloadMaster={openMasterPicker}
        onClearMaster={() => removeAudio('master')}
        transcriptorPhase={transcriptorJob.phase}
        transcriptorError={transcriptorJob.error}
        transcriptorAudioWarning={transcriptorJob.audioWarning}
        onDismissTranscriptorNotice={transcriptorJob.dismiss}
      />

      {masterChannel?.objectUrl && (
        <AudioEngine
          ref={audioEngineRef}
          audioUrl={masterChannel.objectUrl}
          isPlaying={isPlaying}
          playbackRate={syncMode ? sync.speed : 1}
          analysisEnabled={waveformEnabled}
          sourceSyncTime={playbackTime}
          onDurationChange={setMasterDuration}
          onEnded={() => setIsPlaying(false)}
        />
      )}

      {(!sidebarIsDrawer || sidebarDrawerOpen) && (
        isCompose ? (
          <CompositionCatalog
            manifest={activeVibrixManifest}
            score={project.composition}
            selectedCueId={selectedCompositionCueId}
            currentTime={playbackTime}
            sourceKind={vibrixAuthoringSource?.kind}
            sourceUnavailable={vibrixSourceUnavailable}
            sourceLoading={vibrixSourceLoading}
            onAuthoringImport={importVibrixAuthoring}
            onScoreChange={setComposition}
            onSelectCue={setSelectedCompositionCueId}
            onExportScore={() => downloadVibrixScore({
              ...project,
              vibrixManifest: activeVibrixManifest
            }, vibrixAuthoringSource)}
            onClose={sidebarIsDrawer ? () => setSidebarDrawerOpen(false) : undefined}
          />
        ) : (
          <LayersSidebar
            layers={project.layers}
            clips={project.clips}
            selectedLayerId={selectedLayerId}
            collapsed={sidebarIsDrawer ? false : sidebarCollapsed}
            waveformEnabled={waveformEnabled}
            previewVisible={showMini || previewOpen}
            onSelectLayer={(id) => {
              setSelectedLayerId(id);
              setSelectedClipId(null);
            }}
            onLayersChange={setLayers}
            onToggleWaveform={toggleWaveformEnabled}
            onTogglePreview={togglePreviewWindow}
            onToggleCollapsed={() => {
              if (sidebarIsDrawer) {
                setSidebarDrawerOpen(false);
                return;
              }
              setSidebarCollapsed(v => {
                const next = !v;
                try { window.localStorage.setItem('lyrixa_sidebar_collapsed', next ? '1' : '0'); } catch { /* ignore */ }
                return next;
              });
            }}
          />
        )
      )}

      {backdropShown && (
        <div
          className="ls-drawer-backdrop"
          onClick={() => {
            setSidebarDrawerOpen(false);
            setInspectorDrawerOpen(false);
          }}
          aria-hidden
        />
      )}

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
            focusRequest={timelineFocusRequest}
            trackName={masterChannel?.fileName ?? 'No audio loaded'}
            masterChannel={masterChannel}
            waveformEnabled={waveformEnabled}
            isLongAudio={isLongAudio}
            onExtractBandPeaks={waveformEnabled ? extractBandPeaksForMode : undefined}
            onClipsChange={setClips}
            onLayersChange={setLayers}
            onSeek={handleSeek}
            onPlayToggle={handlePlayToggle}
            onSelectionChange={({ clipId, layerId }) => {
              setSelectedClipId(clipId);
              setSelectedLayerId(layerId);
            }}
            composition={isCompose ? project.composition : undefined}
            vibrixManifest={activeVibrixManifest}
            selectedCompositionCueId={selectedCompositionCueId}
            onCompositionChange={isCompose ? setComposition : undefined}
            onCompositionSelectionChange={isCompose ? setSelectedCompositionCueId : undefined}
          />

          {showMini && !isPreview && (
            <FloatingPreview
              clips={project.clips}
              layers={project.layers}
              currentTime={playbackTime}
              selectedLayerId={selectedLayerId}
              styleConfig={project.styleConfig}
              animationConfig={project.animationConfig}
              fxConfig={project.fxConfig}
              progressIndicatorConfig={project.progressIndicatorConfig}
              width={floatingPreviewWidth}
              onSizeChange={handleFloatingPreviewSize}
              onExpand={() => {
                setMiniPreviewVisible(false);
                setPreviewOpen(true);
              }}
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

          {!isCompose && !sync.hasLyrics && project.clips.length === 0 && masterChannel && (
            <EmptyLaneHint
              icon="📝"
              title="No lyrics yet"
              description="Paste or import lyrics to create draggable text clips on the timeline."
              actionLabel="Import lyrics"
              onAction={() => openLyricsImport()}
            />
          )}
        </section>
      </main>

      {inspectorShown && <InspectorPanel
        project={project}
        translation={bridge.translation}
        selectedClipId={selectedClipId}
        selectedLayerId={selectedLayerId}
        currentTime={playbackTime}
        onProjectNameChange={setProjectName}
        onLyricModeChange={setLyricMode}
        onProjectDefaultsChange={setProjectDefaults}
        onClipsChange={setClips}
        onLayersChange={setLayers}
        onDuplicateClip={handleDuplicateClip}
        onImportLyrics={() => openLyricsImport()}
        onExportProject={handleExportProject}
        onImportProject={openProjectImportPicker}
        audioLibrary={audioLibrary}
        lyricsLibrary={lyricsLibrary}
        onLoadAudio={openMasterPicker}
        onActivateAudio={(fileKey) => {
          void activateAudioLibraryAsset(fileKey).catch(err => {
            console.error('[Lyrixa] Failed to activate audio-library asset:', err);
            window.alert(err instanceof Error ? err.message : 'Could not activate audio file.');
          });
        }}
        onHardResetProject={handleHardResetProject}
        onSelectLyricSource={setActiveLyricSource}
        onRenameLyricSource={setLyricSourceTitle}
        onSetLyricSourceStartTime={setLyricSourceStartTime}
        onJumpToLyricSource={handleJumpToLyricSource}
        onRemoveLyricSource={removeLyricSource}
        onRecoverLyricsFromLayer={(layerId) => {
          const layer = project.layers.find(item => item.id === layerId);
          const layerName = layer?.name ?? 'selected layer';
          const count = project.clips.filter(clip =>
            clip.layerId === layerId &&
            !clip.muted &&
            clip.text.trim().length > 0
          ).length;
          if (count === 0) {
            window.alert(`No hay clips visibles con texto en ${layerName}.`);
            return;
          }
          const ok = window.confirm(
            `Esto reconstruirá una nueva fuente global usando ${count} clips visibles de "${layerName}", ordenados por tiempo. No cambiará tus tiempos ni borrará clips. ¿Continuar?`
          );
          if (!ok) return;
          recoverLyricsFromLayer(layerId);
          window.alert(`Lyrics recuperada desde "${layerName}". Ahora queda como fuente activa.`);
        }}
        onEditLyricSource={(sourceId) => openLyricsImport(sourceId)}
        onAttachLyricSource={attachLyricSourceFromLibrary}
        onSetLyricSourceAudioAssignment={setLyricSourceAudioAssignment}
        editorMode={mode}
        onClose={inspectorIsOverlay ? () => setInspectorDrawerOpen(false) : undefined}
      />}

      {isMobile && (
        <EditorModeNav mode={mode} onModeChange={handleEditorModeChange} />
      )}

      {importOpen && (
        <LyricsImportPanel
          initialText={editingLyricSource ? editingLyricSource.rawText : importCreatesNewSource ? '' : activeLyricSource?.rawText ?? project.rawLyricsText}
          initialTitle={editingLyricSource?.title ?? (importCreatesNewSource ? `Lyrics ${project.lyricSources.length + 1}` : activeLyricSource?.title)}
          initialStartTime={editingLyricSource?.startTime ?? (importCreatesNewSource ? playbackTime : activeLyricSource?.startTime ?? playbackTime)}
          currentTime={playbackTime}
          lyricMode={project.lyricMode}
          defaultAsNewSource={!editingLyricSource && importCreatesNewSource}
          editingSourceId={editingLyricSource?.id}
          onClose={closeLyricsImport}
          onApply={handleApplyLyrics}
        />
      )}

      <ShortcutsPanel open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      {syncMode && (
        <TapSyncPanel
          session={sync}
          clips={project.clips}
          layers={project.layers}
          sources={project.lyricSources}
          lyricMode={project.lyricMode}
          isPlaying={isPlaying}
          playbackTime={playbackTime}
          onPlayToggle={handlePlayToggle}
          onSeek={handleSeek}
          docked={!isDesktop}
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
            <div className="ls-preview-controls" onClick={(e) => e.stopPropagation()}>
              <button
                className="ls-preview-control-btn"
                type="button"
                disabled={!masterChannel?.objectUrl}
                onClick={() => handleSeek(Math.max(0, playbackTime - 5))}
              >
                -5s
              </button>
              <button
                className="ls-preview-play"
                type="button"
                disabled={!masterChannel?.objectUrl}
                onClick={handlePlayToggle}
                aria-label={isPlaying ? 'Pause song' : 'Play song'}
              >
                {isPlaying ? 'Pause' : 'Play'}
              </button>
              <button
                className="ls-preview-control-btn"
                type="button"
                disabled={!masterChannel?.objectUrl}
                onClick={() => handleSeek(Math.min(effectiveDuration, playbackTime + 5))}
              >
                +5s
              </button>
              <span className="ls-preview-time mono">
                {formatPreviewTime(playbackTime)} / {formatPreviewTime(effectiveDuration)}
              </span>
            </div>
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

function readStoredBoolean(key: string, fallback: boolean): boolean {
  const raw = safeGetLocalStorage(key);
  if (raw === '1') return true;
  if (raw === '0') return false;
  return fallback;
}

function formatPreviewTime(seconds: number): string {
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

function downloadVibrixScore(
  project: LyrixaProject,
  source: VibrixAuthoringSource | null
): void {
  try {
    const packageSource = source?.kind === 'package' ? source : null;
    let payload: string;
    let fileName: string;
    if (packageSource) {
      const scorePackage = buildVibrixScorePackage({ project, manifest: project.vibrixManifest, source: packageSource });
      payload = JSON.stringify(scorePackage, null, 2);
      fileName = 'vibrix-score';
    } else {
      payload = JSON.stringify(createVibrixScoreEnvelope(project), null, 2);
      fileName = 'vibrix-score.json';
    }
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeName = project.name.trim().replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '') || 'lyrixa-score';
    link.href = url;
    link.download = `${safeName}.${fileName}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (reason) {
    const issues = reason instanceof VibrixScorePackageError
      ? reason.issues.join('\n')
      : reason instanceof Error ? reason.message : 'Could not export Vibrix score.';
    window.alert(issues);
  }
}
