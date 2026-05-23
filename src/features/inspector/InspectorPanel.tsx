import { useMemo, useState } from 'react';
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
import './InspectorPanel.css';

type InspectorTab = 'project' | 'layer' | 'clip' | 'style' | 'texture' | 'fx' | 'animation';

interface InspectorPanelProps {
  project: LyrixaProject;
  selectedClipId: string | null;
  selectedLayerId: string | null;
  onProjectNameChange: (name: string) => void;
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
  onHardResetProject: () => void;
  onRenameLyricSource: (id: string, title: string) => void;
  onRemoveLyricSource: (id: string) => void;
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
  onProjectNameChange,
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
  onHardResetProject,
  onRenameLyricSource,
  onRemoveLyricSource
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

  return (
    <aside className="inspector-panel">
      <header className="insp-header">
        <strong>Inspector</strong>
        <span>{scope === 'clip' ? 'Clip override' : scope === 'layer' ? selectedLayer?.name : 'Project defaults'}</span>
      </header>
      <nav className="insp-tabs" aria-label="Inspector tabs">
        {(['project', 'layer', 'clip', 'style', 'texture', 'fx', 'animation'] as InspectorTab[]).map(value => (
          <button key={value} className={tab === value ? 'active' : ''} onClick={() => setTab(value)}>
            {value}
          </button>
        ))}
      </nav>
      <div className="insp-body">
        {tab === 'project' && (
          <ProjectInspector
            project={project}
            onProjectNameChange={onProjectNameChange}
            onProgressChange={onProgressChange}
            onImportLyrics={onImportLyrics}
            onExportProject={onExportProject}
            onImportProject={onImportProject}
            onHardResetProject={onHardResetProject}
            onRenameLyricSource={onRenameLyricSource}
            onRemoveLyricSource={onRemoveLyricSource}
          />
        )}

        {tab === 'layer' && (
          <LayerInspector
            selectedLayer={selectedLayer}
            onPatchLayer={patchLayer}
          />
        )}

        {tab === 'clip' && (
          <ClipInspector
            selectedClip={selectedClip}
            layers={project.layers}
            onPatchClip={patchClip}
            onDuplicateClip={onDuplicateClip}
          />
        )}

        {tab === 'style' && (
          <StyleInspector
            style={styleTarget}
            onPatchStyle={patchScopedStyle}
          />
        )}

        {tab === 'texture' && (
          <TextureInspector
            projectId={project.id}
            style={styleTarget}
            onPatchFill={patchFill}
          />
        )}

        {tab === 'fx' && (
          <FxInspector
            fx={fxTarget}
            onPatchFx={patchScopedFx}
          />
        )}

        {tab === 'animation' && (
          <AnimationInspector
            animation={animationTarget}
            onPatchAnimation={patchScopedAnimation}
          />
        )}
      </div>
    </aside>
  );
}
