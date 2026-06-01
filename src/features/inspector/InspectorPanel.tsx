import { useEffect, useMemo, useState } from 'react';
import type { LyricClip } from '../../core/types/clip';
import type { LyricLayer } from '../../core/types/layer';
import type {
  ClipProgressIndicatorConfig,
  LyricAnimationConfig,
  LyricFxConfig,
  LyricVisualStyle
} from '../../core/types/render';
import type { TextFillConfig } from '../../core/types/texture';
import type { LyrixaProject } from '../../core/types/project';
import type { LyricProjectMode } from '../../core/types/project';
import type { AudioLibraryAsset } from '../../core/types/audio';
import {
  resolveLyricAnimationConfig,
  resolveLyricFxConfig,
  resolveLyricVisualStyle
} from '../../core/render/resolveVisualStyle';
import { AnimationInspector } from './AnimationInspector';
import { ClipInspector } from './ClipInspector';
import { FxInspector } from './FxInspector';
import { LayerInspector } from './LayerInspector';
import { ProjectInspector } from './ProjectInspector';
import { StyleInspector } from './StyleInspector';
import { TextureInspector } from './TextureInspector';
import { PresetPicker, type PresetScope } from './PresetPicker';
import { Group } from './InspectorPrimitives';
import type { LyricVisualPreset } from '../../core/presets/visualPresets';
import type { EditorMode } from '../editor/useEditorMode';
import './InspectorPanel.css';

type InspectorTab = 'project' | 'layer' | 'clip' | 'style' | 'texture' | 'fx' | 'animation';

interface InspectorPanelProps {
  project: LyrixaProject;
  selectedClipId: string | null;
  selectedLayerId: string | null;
  currentTime: number;
  onProjectNameChange: (name: string) => void;
  onLyricModeChange: (mode: LyricProjectMode) => void;
  onStyleChange: (next: LyricVisualStyle) => void;
  onAnimationChange: (next: LyricAnimationConfig) => void;
  onFxChange: (next: LyricFxConfig) => void;
  onProgressChange: (next: ClipProgressIndicatorConfig) => void;
  onClipsChange: (next: LyricClip[]) => void;
  onLayersChange: (next: LyricLayer[]) => void;
  /** Clone the selected clip on the same layer (for repeated verses). */
  onDuplicateClip?: (clipId: string) => void;
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
  onEditLyricSource: (id: string) => void;
  onAttachLyricSource: (id: string) => void;
  onSetLyricSourceAudioAssignment: (id: string, fileKey: string, assigned: boolean) => void;
  /** Which editor mode the workspace is in. Filters which tabs are visible. */
  editorMode?: EditorMode;
}

/**
 * Context-aware editor for project, layer, and clip settings.
 *
 * The panel chooses the active edit scope and delegates actual form controls
 * to tab components. Final render values still come from core resolver helpers,
 * so UI editing does not duplicate inheritance logic.
 */
export function InspectorPanel({
  project,
  selectedClipId,
  selectedLayerId,
  currentTime,
  onProjectNameChange,
  onLyricModeChange,
  onStyleChange,
  onAnimationChange,
  onFxChange,
  onProgressChange,
  onClipsChange,
  onLayersChange,
  onDuplicateClip,
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
  onEditLyricSource,
  onAttachLyricSource,
  onSetLyricSourceAudioAssignment,
  editorMode = 'edit'
}: InspectorPanelProps) {
  const selectedClip = useMemo(
    () => selectedClipId ? project.clips.find(clip => clip.id === selectedClipId) ?? null : null,
    [project.clips, selectedClipId]
  );
  const selectedLayer = useMemo(
    () => selectedLayerId ? project.layers.find(layer => layer.id === selectedLayerId) ?? null : null,
    [project.layers, selectedLayerId]
  );
  const selectedClipLayer = selectedClip
    ? project.layers.find(layer => layer.id === selectedClip.layerId) ?? null
    : selectedLayer;
  const [tab, setTab] = useState<InspectorTab>('project');

  // Each mode reveals a different subset of tabs so the inspector isn't an
  // undifferentiated grid of 7 controls. Style mode shows everything.
  const visibleTabs = useMemo<InspectorTab[]>(() => {
    switch (editorMode) {
      case 'sync':    return ['project', 'clip'];
      case 'edit':    return ['project', 'layer', 'clip'];
      case 'style':   return ['project', 'layer', 'clip', 'style', 'texture', 'fx', 'animation'];
      case 'preview': return [];
      default:        return ['project', 'layer', 'clip', 'style', 'texture', 'fx', 'animation'];
    }
  }, [editorMode]);

  // Derive the rendered tab in-render: when the stored tab isn't allowed in the
  // current mode, fall back to the first visible one for THIS paint so the body
  // never flashes empty. The effect below keeps state in sync for subsequent
  // clicks and `setTab` calls.
  const effectiveTab: InspectorTab | null = visibleTabs.includes(tab)
    ? tab
    : (visibleTabs[0] ?? null);

  useEffect(() => {
    if (effectiveTab && effectiveTab !== tab) setTab(effectiveTab);
  }, [effectiveTab, tab]);

  const scope = selectedClip?.styleOverride
    ? 'clip'
    : selectedLayer
      ? 'layer'
      : 'project';

  const styleTarget = scope === 'clip'
    ? resolveLyricVisualStyle(project.styleConfig, selectedClipLayer?.styleDefaults, selectedClip?.styleOverride)
    : scope === 'layer'
      ? resolveLyricVisualStyle(project.styleConfig, selectedLayer?.styleDefaults)
      : resolveLyricVisualStyle(project.styleConfig);

  const fxTarget = scope === 'clip'
    ? resolveLyricFxConfig(project.fxConfig, selectedClipLayer?.fxDefaults, selectedClip?.fxOverride)
    : scope === 'layer'
      ? resolveLyricFxConfig(project.fxConfig, selectedLayer?.fxDefaults)
      : resolveLyricFxConfig(project.fxConfig);

  const animationTarget = scope === 'clip'
    ? resolveLyricAnimationConfig(project.animationConfig, selectedClipLayer?.animationDefaults, selectedClip?.animationOverride)
    : scope === 'layer'
      ? resolveLyricAnimationConfig(project.animationConfig, selectedLayer?.animationDefaults)
      : resolveLyricAnimationConfig(project.animationConfig);

  const patchClip = (patch: Partial<LyricClip>) => {
    if (!selectedClip) return;
    onClipsChange(project.clips.map(clip => clip.id === selectedClip.id ? { ...clip, ...patch } : clip));
  };

  const patchLayer = (patch: Partial<LyricLayer>) => {
    if (!selectedLayer) return;
    onLayersChange(project.layers.map(layer => layer.id === selectedLayer.id ? { ...layer, ...patch } : layer));
  };

  const deleteClip = (clipId: string) => {
    const clip = project.clips.find(item => item.id === clipId);
    const layer = clip ? project.layers.find(item => item.id === clip.layerId) : null;
    if (!clip || clip.locked || layer?.locked) return;
    onClipsChange(project.clips.filter(item => item.id !== clipId));
  };

  const clearLayerClips = (layerId: string) => {
    const layer = project.layers.find(item => item.id === layerId);
    if (!layer || layer.locked) return;
    onClipsChange(project.clips.filter(clip => clip.layerId !== layerId || clip.locked));
  };

  const patchScopedStyle = (patch: Partial<LyricVisualStyle>) => {
    if (scope === 'clip' && selectedClip) {
      patchClip({ styleOverride: { ...(selectedClip.styleOverride ?? {}), ...patch } });
      return;
    }
    if (scope === 'layer' && selectedLayer) {
      patchLayer({ styleDefaults: { ...(selectedLayer.styleDefaults ?? {}), ...patch } });
      return;
    }
    onStyleChange({ ...project.styleConfig, ...patch });
  };

  const patchScopedFx = (patch: Partial<LyricFxConfig>) => {
    if (scope === 'clip' && selectedClip) {
      patchClip({ fxOverride: { ...(selectedClip.fxOverride ?? {}), ...patch } });
      return;
    }
    if (scope === 'layer' && selectedLayer) {
      patchLayer({ fxDefaults: { ...(selectedLayer.fxDefaults ?? {}), ...patch } });
      return;
    }
    onFxChange({ ...project.fxConfig, ...patch });
  };

  const patchScopedAnimation = (patch: Partial<LyricAnimationConfig>) => {
    if (scope === 'clip' && selectedClip) {
      patchClip({ animationOverride: { ...(selectedClip.animationOverride ?? {}), ...patch } });
      return;
    }
    if (scope === 'layer' && selectedLayer) {
      patchLayer({ animationDefaults: { ...(selectedLayer.animationDefaults ?? {}), ...patch } });
      return;
    }
    onAnimationChange({ ...project.animationConfig, ...patch });
  };

  const patchFill = (fill: TextFillConfig) => patchScopedStyle({ textFill: fill });

  /**
   * Apply a curated preset to the requested scope. We bypass the active scope
   * for this one action because the picker has its own scope selector — that
   * way a user with a clip selected can still apply a preset to the whole
   * project without first changing what's selected.
   */
  const applyPreset = (preset: LyricVisualPreset, targetScope: PresetScope) => {
    if (targetScope === 'clip') {
      if (!selectedClip) return;
      const nextClip: Partial<LyricClip> = {};
      if (preset.style) nextClip.styleOverride = { ...(selectedClip.styleOverride ?? {}), ...preset.style };
      if (preset.animation) nextClip.animationOverride = { ...(selectedClip.animationOverride ?? {}), ...preset.animation };
      if (preset.fx) nextClip.fxOverride = { ...(selectedClip.fxOverride ?? {}), ...preset.fx };
      onClipsChange(project.clips.map(clip => clip.id === selectedClip.id ? { ...clip, ...nextClip } : clip));
      return;
    }
    if (targetScope === 'layer') {
      if (!selectedLayer) return;
      const nextLayer: Partial<LyricLayer> = {};
      if (preset.style) nextLayer.styleDefaults = { ...(selectedLayer.styleDefaults ?? {}), ...preset.style };
      if (preset.animation) nextLayer.animationDefaults = { ...(selectedLayer.animationDefaults ?? {}), ...preset.animation };
      if (preset.fx) nextLayer.fxDefaults = { ...(selectedLayer.fxDefaults ?? {}), ...preset.fx };
      onLayersChange(project.layers.map(layer => layer.id === selectedLayer.id ? { ...layer, ...nextLayer } : layer));
      return;
    }
    // project scope
    if (preset.style) onStyleChange({ ...project.styleConfig, ...preset.style });
    if (preset.animation) onAnimationChange({ ...project.animationConfig, ...preset.animation });
    if (preset.fx) onFxChange({ ...project.fxConfig, ...preset.fx });
  };

  const availableScopes: PresetScope[] = [
    'project',
    ...(selectedLayer ? ['layer' as PresetScope] : []),
    ...(selectedClip ? ['clip' as PresetScope] : [])
  ];

  // Preview mode hides the inspector entirely so the user gets a clean stage.
  // The shell also wraps this component with a conditional, but a defensive
  // early-return guarantees the panel can never leak into preview mode even if
  // a future caller forgets the outer guard.
  if (editorMode === 'preview') return null;

  return (
    <aside className="inspector-panel">
      <header className="insp-header">
        <strong>Inspector</strong>
        <span>{scope === 'clip' ? 'Clip override' : scope === 'layer' ? selectedLayer?.name : 'Project defaults'}</span>
      </header>
      <nav className="insp-tabs" aria-label="Inspector tabs">
        {visibleTabs.map(value => (
          <button key={value} className={effectiveTab === value ? 'active' : ''} onClick={() => setTab(value)}>
            {value}
          </button>
        ))}
      </nav>
      <div className="insp-body">
        <Group title="Visual preset" open>
          <PresetPicker
            availableScopes={availableScopes}
            defaultScope={scope}
            onApply={applyPreset}
          />
        </Group>

        {effectiveTab === 'project' && (
          <ProjectInspector
            project={project}
            currentTime={currentTime}
            onProjectNameChange={onProjectNameChange}
            onLyricModeChange={onLyricModeChange}
            onProgressChange={onProgressChange}
            onImportLyrics={onImportLyrics}
            onExportProject={onExportProject}
            onImportProject={onImportProject}
            audioLibrary={audioLibrary}
            lyricsLibrary={lyricsLibrary}
            onLoadAudio={onLoadAudio}
            onActivateAudio={onActivateAudio}
            onHardResetProject={onHardResetProject}
            onSelectLyricSource={onSelectLyricSource}
            onRenameLyricSource={onRenameLyricSource}
            onSetLyricSourceStartTime={onSetLyricSourceStartTime}
            onJumpToLyricSource={onJumpToLyricSource}
            onRemoveLyricSource={onRemoveLyricSource}
            onEditLyricSource={onEditLyricSource}
            onAttachLyricSource={onAttachLyricSource}
            onSetLyricSourceAudioAssignment={onSetLyricSourceAudioAssignment}
          />
        )}

        {effectiveTab ==='layer' && (
          <LayerInspector
            selectedLayer={selectedLayer}
            onPatchLayer={patchLayer}
            onClearLayerClips={clearLayerClips}
          />
        )}

        {effectiveTab ==='clip' && (
          <ClipInspector
            selectedClip={selectedClip}
            layers={project.layers}
            onPatchClip={patchClip}
            onDuplicateClip={onDuplicateClip}
            onDeleteClip={deleteClip}
          />
        )}

        {effectiveTab ==='style' && (
          <StyleInspector
            style={styleTarget}
            onPatchStyle={patchScopedStyle}
          />
        )}

        {effectiveTab ==='texture' && (
          <TextureInspector
            projectId={project.id}
            style={styleTarget}
            onPatchFill={patchFill}
          />
        )}

        {effectiveTab ==='fx' && (
          <FxInspector
            fx={fxTarget}
            onPatchFx={patchScopedFx}
          />
        )}

        {effectiveTab ==='animation' && (
          <AnimationInspector
            animation={animationTarget}
            onPatchAnimation={patchScopedAnimation}
          />
        )}
      </div>
    </aside>
  );
}
