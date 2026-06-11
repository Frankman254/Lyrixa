import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { AudioEngine } from '../player/AudioEngine';
import { TimelineEditor } from '../timeline-editor/TimelineEditor';
import { ClipLyricsRenderer } from '../lyrics-view/ClipLyricsRenderer';
import type { LyricClip } from '../../core/types/clip';
import type { LyricLayer } from '../../core/types/layer';
import type { LyrixaProject } from '../../core/types/project';
import { LyricsImportPanel } from './LyricsImportPanel';
import { FloatingPreview } from './FloatingPreview';
import { EditorAlerts } from './EditorAlerts';
import { EditorTopBar } from './EditorTopBar';
import { LayersSidebar } from './LayersSidebar';
import { InspectorPanel } from '../inspector/InspectorPanel';
import { TapSyncPanel } from '../sync/TapSyncPanel';
import { useTapSync } from '../sync/useTapSync';
import { useEditorMode } from './useEditorMode';
import type { EditorMode } from './useEditorMode';
import { ShortcutsPanel } from '../shortcuts/ShortcutsPanel';
import { useShortcuts } from '../shortcuts/useShortcuts';
import type { TapSyncLine } from '../../core/timeline/tapSync';
import {
  createTapSyncSourceId,
  findNextUnpublishedLineIndex,
  findTapSyncResumeTime,
  orderedLayerClips
} from '../../core/timeline/tapSync';
import { duplicateClipSelection } from '../../core/timeline/duplicateClips';
import { normalizeLyricsText } from '../../core/lyrics/normalize';
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
    attachLyricSourceFromLibrary,
    setLyricSourceAudioAssignment,
    setClips,
    setLayers,
    setStyleConfig,
    setAnimationConfig,
    setFxConfig,
    setProgressIndicatorConfig,
    setCurrentTime,
    setMasterDuration,
    importProject,
    hardResetProject
  } = useLyrixaProject({
    waveformAnalysisEnabled: waveformEnabled
  });

  const masterFileInputRef = useRef<HTMLInputElement>(null);

  const { mode, setMode, isSync: syncMode, isPreview } = useEditorMode();
  // Tracks whether the sync side-effects (cursor, lines, layer wiring) have
  // already run. Lets the mode switcher AND the "Sync lyrics" button share
  // one idempotent entry/exit path.
  const syncEnteredRef = useRef(false);
  const setSyncMode = useCallback((next: boolean) => {
    if (next) setMode('sync');
    else if (mode === 'sync') setMode('edit');
  }, [mode, setMode]);
  const [syncSpeed, setSyncSpeed] = useState(1);
  const [syncLines, setSyncLines] = useState<TapSyncLine[]>([]);
  const [syncInitialCursor, setSyncInitialCursor] = useState(0);
  const [syncTargetLayerId, setSyncTargetLayerId] = useState<string | null>(null);
  /** When null, sync streams every project lyric source in order. */
  const [syncSourceId, setSyncSourceId] = useState<string | null>(null);
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
  const [timelineFocusRequest, setTimelineFocusRequest] = useState<{ time: number; nonce: number } | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() =>
    safeGetLocalStorage('lyrixa_sidebar_collapsed') === '1'
  );

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

  // Global shortcut: Shift+? opens (and toggles) the shortcuts reference panel.
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
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [matchesShortcut]);

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

  const effectiveDuration = masterChannel?.duration ?? 60;
  const isLongAudio = detectLongAudio(masterChannel?.sizeBytes, masterChannel?.duration);
  const showMini = miniPreviewVisible && !previewOpen;

  const activeLyricSource = useMemo(
    () => project.lyricSources.find(source => source.id === project.activeLyricSourceId)
      ?? project.lyricSources[0]
      ?? null,
    [project.lyricSources, project.activeLyricSourceId]
  );
  const editingLyricSource = useMemo(
    () => editingLyricSourceId
      ? project.lyricSources.find(source => source.id === editingLyricSourceId) ?? null
      : null,
    [editingLyricSourceId, project.lyricSources]
  );
  const effectiveSyncSourceId = project.lyricMode === 'single'
    ? activeLyricSource?.id ?? null
    : syncSourceId;

  const activeLayerId = selectedLayerId ?? project.layers[0]?.id ?? null;
  const syncLayerId = syncMode
    ? syncTargetLayerId ?? activeLayerId
    : activeLayerId;
  const syncLayerName =
    project.layers.find(l => l.id === syncLayerId)?.name ?? 'Lyrics';
  const fallbackLyricSourceClips = useMemo(
    () => findBestLyricSourceClips(project.clips, project.layers, syncLayerId),
    [project.clips, project.layers, syncLayerId]
  );
  const allProjectLyricLines = useMemo(
    () => getOrderedProjectLyricLines(project, null),
    [project]
  );
  const orderedProjectLyricLines = useMemo(
    () => getOrderedProjectLyricLines(project, effectiveSyncSourceId),
    [project, effectiveSyncSourceId]
  );
  const hasImportedLyrics = allProjectLyricLines.length > 0;
  const canSync =
    !!masterChannel?.objectUrl &&
    !!syncLayerId &&
    (hasImportedLyrics || orderedProjectLyricLines.length > 0 || fallbackLyricSourceClips.length > 0);

  const tapSync = useTapSync({
    enabled: syncMode,
    clips: project.clips,
    lines: syncLines,
    layerId: syncLayerId,
    initialCursorIndex: syncInitialCursor,
    trackDuration: masterChannel?.duration,
    playbackTime,
    onClipsChange: setClips,
    onPlayToggle: handlePlayToggle,
    onSeek: handleSeek
  });

  const buildSyncLines = useCallback((
    layerId: string,
    sourceFilterId: string | null = effectiveSyncSourceId
  ): TapSyncLine[] => {
    const layerClips = orderedLayerClips(project.clips, layerId);
    const fallbackSourceClips = findBestLyricSourceClips(project.clips, project.layers, layerId);
    const filteredProjectLines = getOrderedProjectLyricLines(project, sourceFilterId);
    const sourceLines = filteredProjectLines.length > 0
      ? filteredProjectLines
      : sourceFilterId
        ? []
        : fallbackSourceClips.map((clip, index) => ({
            text: clip.text,
            sourceIndex: index,
            sourceId: clip.sourceId ?? createTapSyncSourceId(index, clip.text),
            lyricSourceId: clip.lyricSourceId
          }));

    return sourceLines.map((line, index) => {
      const sameTextAtIndex = layerClips[index]?.text.trim() === line.text.trim()
        ? layerClips[index]
        : undefined;
      const existing = layerClips.find(clip => clip.sourceId === line.sourceId) ?? sameTextAtIndex;
      const template = existing ?? fallbackSourceClips[index];
      return {
        sourceIndex: line.sourceIndex,
        sourceId: line.sourceId,
        lyricSourceId: line.lyricSourceId,
        text: line.text,
        template
      };
    });
  }, [effectiveSyncSourceId, project]);

  const clearSyncLayer = useCallback((layerId = syncLayerId) => {
    if (!layerId) return;
    setClips(previous => previous.filter(clip => clip.layerId !== layerId));
  }, [syncLayerId, setClips]);

  const startSyncForLayer = useCallback((
    layerId: string,
    sourceFilterId: string | null = effectiveSyncSourceId
  ): number => {
    if (!layerId) return 0;
    const lines = buildSyncLines(layerId, sourceFilterId);
    const hydratedClips = attachSourceIdentityToLayerClips(project.clips, layerId, lines);
    const nextCursor = findNextUnpublishedLineIndex(lines, hydratedClips, layerId);
    const resumeTime = findTapSyncResumeTime(
      lines,
      hydratedClips,
      layerId,
      getLyricSourceStartTime(project, sourceFilterId)
    );
    if (project.rawLyricsText.trim().length === 0 && project.lyricSources.length === 0 && lines.length > 0) {
      setRawLyricsText(lines.map(line => line.text).join('\n'));
    }
    if (hydratedClips !== project.clips) {
      setClips(hydratedClips);
    }
    setSyncLines(lines);
    setSyncInitialCursor(nextCursor);
    setSyncTargetLayerId(layerId);
    setSelectedLayerId(layerId);
    tapSync.reset(nextCursor);
    return resumeTime;
  }, [buildSyncLines, effectiveSyncSourceId, project, setClips, setRawLyricsText, tapSync]);

  const exitSyncMode = useCallback(() => {
    if (!syncEnteredRef.current) return;
    syncEnteredRef.current = false;
    setSyncSpeed(1);
    setSyncLines([]);
    setSyncInitialCursor(0);
    setSyncTargetLayerId(null);
    if (mode === 'sync') setMode('edit');
  }, [mode, setMode]);

  const enterSyncMode = useCallback(() => {
    if (syncEnteredRef.current) return;
    syncEnteredRef.current = true;
    // Default the sync source to the project's active source so the user
    // doesn't have to pick when there's exactly one set of lyrics.
    const syncSourceExists = effectiveSyncSourceId == null ||
      project.lyricSources.some(source => source.id === effectiveSyncSourceId);
    const initialSourceId = project.lyricMode === 'single'
      ? activeLyricSource?.id ?? null
      : syncSourceExists
      ? effectiveSyncSourceId ?? activeLyricSource?.id ?? null
      : activeLyricSource?.id ?? null;
    setSyncSourceId(initialSourceId);
    const initialLayerId = syncTargetLayerId ?? activeLayerId;
    const resumeTime = initialLayerId
      ? startSyncForLayer(initialLayerId, initialSourceId)
      : getLyricSourceStartTime(project, initialSourceId);
    setIsPlaying(false);
    handleSeek(resumeTime);
    focusTimelineAt(resumeTime);
    if (mode !== 'sync') setMode('sync');
  }, [activeLayerId, activeLyricSource?.id, effectiveSyncSourceId, focusTimelineAt, handleSeek, mode, project, setIsPlaying, setMode, startSyncForLayer, syncTargetLayerId]);

  const handleToggleSync = useCallback(() => {
    if (syncMode) exitSyncMode();
    else enterSyncMode();
  }, [syncMode, enterSyncMode, exitSyncMode]);

  // Bridge the editor-mode setting to the sync wiring so both the "Sync lyrics"
  // button and the Sync tab on the mode switcher share one idempotent path.
  useEffect(() => {
    if (mode === 'sync') enterSyncMode();
    else exitSyncMode();
  }, [mode, enterSyncMode, exitSyncMode]);

  const handleSyncLayerChange = useCallback((layerId: string) => {
    const resumeTime = startSyncForLayer(layerId);
    handleSeek(resumeTime);
    focusTimelineAt(resumeTime);
  }, [focusTimelineAt, handleSeek, startSyncForLayer]);

  const handleSyncSourceChange = useCallback((nextSourceId: string | null) => {
    setSyncSourceId(nextSourceId);
    if (nextSourceId) setActiveLyricSource(nextSourceId);
    // Rebuild the sync queue against the new source so the cursor jumps to that
    // source's first un-timed line on the active layer. Existing synced clips
    // for other sources stay put — they're keyed by their own sourceId.
    if (syncTargetLayerId) {
      const resumeTime = startSyncForLayer(syncTargetLayerId, nextSourceId);
      handleSeek(resumeTime);
      focusTimelineAt(resumeTime);
      return;
    }
    const startTime = getLyricSourceStartTime(project, nextSourceId);
    handleSeek(startTime);
    focusTimelineAt(startTime);
  }, [focusTimelineAt, handleSeek, project, setActiveLyricSource, startSyncForLayer, syncTargetLayerId]);

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

  const handleSyncRestart = useCallback(() => {
    clearSyncLayer();
    setSyncInitialCursor(0);
    tapSync.reset();
    const startTime = getLyricSourceStartTime(project, effectiveSyncSourceId);
    handleSeek(startTime);
    focusTimelineAt(startTime);
  }, [clearSyncLayer, effectiveSyncSourceId, focusTimelineAt, project, tapSync, handleSeek]);

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
    setSyncLines([]);
    setSyncInitialCursor(0);
    setSyncTargetLayerId(null);
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

  // Shared by the top-bar switcher and the mobile bottom nav. Preview mode also
  // opens the large preview so the user sees their work without other panels
  // stealing focus.
  const handleEditorModeChange = useCallback((next: EditorMode) => {
    setMode(next);
    if (next === 'preview') setPreviewOpen(true);
    if (next !== 'preview') setPreviewOpen(false);
    // Style mode is inspector-centric: on the compact tier open its drawer
    // right away (mobile renders it on the stage instead).
    if (next === 'style' && tier === 'compact') setInspectorDrawerOpen(true);
  }, [setMode, tier]);

  // Mobile style mode promotes the inspector to the stage area — styling on a
  // phone needs the full width, and the timeline isn't useful mid-styling.
  const mobileStyleMode = isMobile && mode === 'style';
  const inspectorShown = isPreview
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
    sidebarCollapsed && isDesktop ? 'sidebar-collapsed' : '',
    !inspectorShown || inspectorIsOverlay || mobileStyleMode ? 'inspector-hidden' : '',
    mobileStyleMode ? 'mobile-style' : ''
  ].filter(Boolean).join(' ');
  const importCreatesNewSource = project.lyricMode === 'multi' && project.lyricSources.length > 0;

  return (
    <div className={shellClass}>
      <EditorTopBar
        editorMode={mode}
        onEditorModeChange={handleEditorModeChange}
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
        tier={tier}
        inspectorVisible={inspectorShown}
        showInspectorToggle={!isPreview && !mobileStyleMode}
        onToggleInspector={handleToggleInspector}
        onToggleSidebar={() => setSidebarDrawerOpen(open => !open)}
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
        onOpenLyricsImport={() => openLyricsImport()}
        onToggleSync={handleToggleSync}
        onExportProject={handleExportProject}
        onExportLyricsBundle={handleExportLyricsBundle}
        onTogglePreview={() => setPreviewOpen(p => !p)}
        onOpenOverlay={() => setTransparentPreviewOpen(true)}
        onShowMiniPreview={() => setMiniPreviewVisible(true)}
        onPlayToggle={handlePlayToggle}
        onSeek={handleSeek}
        onResetProject={handleHardResetProject}
        accent={accent}
        onAccentChange={setAccent}
        onOpenShortcuts={() => setShortcutsOpen(true)}
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
          analysisEnabled={waveformEnabled}
          sourceSyncTime={playbackTime}
          onDurationChange={setMasterDuration}
          onEnded={() => setIsPlaying(false)}
        />
      )}

      {(!sidebarIsDrawer || sidebarDrawerOpen) && (
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

          {!hasImportedLyrics && project.clips.length === 0 && masterChannel && (
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
        selectedClipId={selectedClipId}
        selectedLayerId={selectedLayerId}
        currentTime={playbackTime}
        onProjectNameChange={setProjectName}
        onLyricModeChange={setLyricMode}
        onStyleChange={setStyleConfig}
        onAnimationChange={setAnimationConfig}
        onFxChange={setFxConfig}
        onProgressChange={setProgressIndicatorConfig}
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
          open={importOpen}
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
          clips={project.clips}
          lines={syncLines}
          layers={project.layers}
          layerId={syncLayerId}
          layerName={syncLayerName}
          sources={project.lyricSources}
          sourceId={effectiveSyncSourceId}
          lyricMode={project.lyricMode}
          isPlaying={isPlaying}
          playbackTime={playbackTime}
          speed={syncSpeed}
          sync={tapSync}
          onPlayToggle={handlePlayToggle}
          onSeek={handleSeek}
          onSpeedChange={setSyncSpeed}
          onLayerChange={handleSyncLayerChange}
          onSourceChange={handleSyncSourceChange}
          onRestart={handleSyncRestart}
          onClose={handleToggleSync}
          docked={isMobile}
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

function getLyricSourceStartTime(project: LyrixaProject, sourceId: string | null): number {
  const source = sourceId
    ? project.lyricSources.find(item => item.id === sourceId)
    : project.lyricSources.find(item => item.id === project.activeLyricSourceId)
      ?? project.lyricSources[0];
  const startTime = source?.startTime ?? 0;
  return Number.isFinite(startTime) ? Math.max(0, startTime) : 0;
}

function findBestLyricSourceClips(
  clips: LyricClip[],
  layers: LyricLayer[],
  preferredLayerId: string | null
): LyricClip[] {
  const nonEmpty = (list: LyricClip[]) => list.filter(clip => clip.text.trim().length > 0);
  if (preferredLayerId) {
    const preferred = nonEmpty(orderedLayerClips(clips, preferredLayerId));
    if (preferred.length > 0) return preferred;
  }

  let best: LyricClip[] = [];
  for (const layer of layers) {
    const candidate = nonEmpty(orderedLayerClips(clips, layer.id));
    if (candidate.length > best.length) best = candidate;
  }
  return best;
}

function getOrderedProjectLyricLines(
  project: LyrixaProject,
  sourceFilterId: string | null = null
): TapSyncLine[] {
  const allSources = [...(project.lyricSources ?? [])]
    .filter(source => source.normalizedLines.length > 0 || source.rawText.trim().length > 0)
    .sort((a, b) => a.order - b.order);
  const sources = sourceFilterId
    ? allSources.filter(source => source.id === sourceFilterId)
    : allSources;

  if (sources.length === 0) {
    // Falling back to the project's combined rawLyricsText only makes sense
    // when no specific source is requested.
    if (sourceFilterId) return [];
    return normalizeLyricsText(project.rawLyricsText).lines.map((text, index) => ({
      sourceIndex: index,
      sourceId: createTapSyncSourceId(index, text),
      text
    }));
  }

  return sources.flatMap(source => {
    const lines = source.normalizedLines.length > 0
      ? source.normalizedLines
      : normalizeLyricsText(source.rawText).lines;
    return lines.map((text, index) => ({
      sourceIndex: index,
      sourceId: createTapSyncSourceId(index, text, source.id),
      lyricSourceId: source.id,
      text
    }));
  });
}

function attachSourceIdentityToLayerClips(
  clips: LyricClip[],
  layerId: string,
  lines: TapSyncLine[]
): LyricClip[] {
  const layerClips = orderedLayerClips(clips, layerId);
  const patches = new Map<string, Partial<LyricClip>>();

  for (const line of lines) {
    const sameSource = layerClips.find(clip => clip.sourceId === line.sourceId);
    const sameTextAtIndex = layerClips[line.sourceIndex]?.text.trim() === line.text.trim()
      ? layerClips[line.sourceIndex]
      : undefined;
    const clip = sameSource ?? sameTextAtIndex;
    if (!clip) continue;
    if (
      clip.sourceId === line.sourceId &&
      clip.sourceIndex === line.sourceIndex &&
      clip.lyricSourceId === line.lyricSourceId &&
      clip.createdBy
    ) {
      continue;
    }
    patches.set(clip.id, {
      sourceId: line.sourceId,
      sourceIndex: line.sourceIndex,
      lyricSourceId: line.lyricSourceId,
      createdBy: clip.createdBy ?? 'import'
    });
  }

  if (patches.size === 0) return clips;
  return clips.map(clip => {
    const patch = patches.get(clip.id);
    return patch ? { ...clip, ...patch } : clip;
  });
}
