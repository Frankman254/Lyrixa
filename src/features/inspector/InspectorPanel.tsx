import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { LyricClip, ClipPositionPreset } from '../../core/types/clip';
import type { LyricLayer } from '../../core/types/layer';
import type {
  ClipProgressIndicatorConfig,
  LyricAnimationConfig,
  LyricFxConfig,
  LyricFxPreset,
  LyricVisualStyle
} from '../../core/types/render';
import type { TextFillConfig } from '../../core/types/texture';
import { DEFAULT_TEXT_FILL } from '../../core/types/texture';
import type { LyrixaProject } from '../../core/types/project';
import {
  resolveLyricAnimationConfig,
  resolveLyricFxConfig,
  resolveLyricVisualStyle
} from '../../core/render/resolveVisualStyle';
import { putTextureAsset } from '../assets/textureAssetStorage';
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
  onImportLyrics: () => void;
  onExportProject: () => void;
  onImportProject: () => void;
}

const FONT_PRESETS = [
  { label: 'Inter', value: 'Inter, system-ui, sans-serif' },
  { label: 'Impact', value: 'Impact, Haettenschweiler, Arial Narrow Bold, sans-serif' },
  { label: 'Arial Black', value: '"Arial Black", Arial, sans-serif' },
  { label: 'Condensed', value: '"Avenir Next Condensed", "Roboto Condensed", Arial Narrow, sans-serif' },
  { label: 'Rounded', value: '"Arial Rounded MT Bold", "Trebuchet MS", system-ui, sans-serif' },
  { label: 'Serif', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Mono', value: '"SFMono-Regular", Menlo, Consolas, monospace' }
];

const FX_PRESETS: LyricFxPreset[] = [
  'none',
  'neon-glow',
  'soft-bloom',
  'prism-shader',
  'liquid-shimmer',
  'heat-haze',
  'rgb-shift',
  'glitch',
  'scanline',
  'blur-flicker',
  'shadow-trail',
  'energy-pulse'
];

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
  onImportLyrics,
  onExportProject,
  onImportProject
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
  const textureValue = useMemo(() => styleTarget.textFill.imageTexture ?? {
    id: crypto.randomUUID(),
    opacity: 1,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    fit: 'cover' as const,
    missing: true
  }, [styleTarget.textFill.imageTexture]);

  const setFillType = (type: TextFillConfig['type']) => {
    if (type === 'solid') {
      patchFill({
        ...styleTarget.textFill,
        type,
        solidColor: styleTarget.textFill.solidColor ?? styleTarget.textColor
      });
      return;
    }
    if (type === 'gradient') {
      patchFill({
        ...styleTarget.textFill,
        type,
        gradient: styleTarget.textFill.gradient ?? DEFAULT_TEXT_FILL.gradient
      });
      return;
    }
    patchFill({
      ...styleTarget.textFill,
      type,
      imageTexture: textureValue
    });
  };

  const handleTextureFile = async (file: File | undefined) => {
    if (!file) return;
    const id = textureValue.id;
    await putTextureAsset(project.id, id, file, file.name);
    const objectUrl = URL.createObjectURL(file);
    patchFill({
      ...styleTarget.textFill,
      type: 'image-texture',
      imageTexture: {
        id,
        objectUrl,
        opacity: textureValue.opacity,
        scale: textureValue.scale,
        offsetX: textureValue.offsetX,
        offsetY: textureValue.offsetY,
        fit: textureValue.fit,
        fileName: file.name,
        missing: false
      }
    });
  };

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
          <section className="insp-stack">
            <Group title="Basic" open>
              <label>Project name<input className="form-control form-input" value={project.name} onChange={(e) => onProjectNameChange(e.target.value)} /></label>
              <div className="insp-button-row">
                <button className="ls-btn small" onClick={onImportLyrics}>Import lyrics</button>
                <button className="ls-btn small" onClick={onExportProject}>Export project</button>
                <button className="ls-btn small" onClick={onImportProject}>Import project</button>
              </div>
            </Group>
            <Group title="Preview settings">
              <label className="tl-inline-check"><input type="checkbox" checked={project.progressIndicatorConfig.enabled} onChange={(e) => onProgressChange({ ...project.progressIndicatorConfig, enabled: e.target.checked })} />Show progress dot by default</label>
            </Group>
          </section>
        )}

        {tab === 'layer' && (
          <section className="insp-stack">
            {selectedLayer ? (
              <>
                <Group title="Basic" open>
                  <label>Name<input className="form-control form-input" value={selectedLayer.name} onChange={(e) => patchLayer({ name: e.target.value })} /></label>
                  <label>Default position<select className="form-control form-select" value={selectedLayer.renderSettings?.positionPreset ?? 'center'} onChange={(e) => patchLayer({ renderSettings: { ...selectedLayer.renderSettings, positionPreset: e.target.value as ClipPositionPreset } })}>
                    {['center', 'top', 'bottom', 'top-left', 'top-right', 'bottom-left', 'bottom-right'].map(pos => <option key={pos} value={pos}>{pos}</option>)}
                  </select></label>
                </Group>
              </>
            ) : <EmptyText text="Select a layer to edit layer defaults." />}
          </section>
        )}

        {tab === 'clip' && (
          <section className="insp-stack">
            {selectedClip ? (
              <>
                <Group title="Clip" open>
                  <label>Text<textarea className="form-control form-input" rows={3} value={selectedClip.text} onChange={(e) => patchClip({ text: e.target.value })} /></label>
                  <div className="inspector-grid">
                    <label>Start<input className="form-control form-input" type="number" step="0.01" value={Number(selectedClip.startTime.toFixed(2))} onChange={(e) => patchClip({ startTime: Math.max(0, Math.min(selectedClip.endTime - 0.25, parseFloat(e.target.value) || 0)) })} /></label>
                    <label>End<input className="form-control form-input" type="number" step="0.01" value={Number(selectedClip.endTime.toFixed(2))} onChange={(e) => patchClip({ endTime: Math.max(selectedClip.startTime + 0.25, parseFloat(e.target.value) || selectedClip.endTime) })} /></label>
                  </div>
                  <label>Assigned layer<select className="form-control form-select" value={selectedClip.layerId} onChange={(e) => patchClip({ layerId: e.target.value })}>{project.layers.map(layer => <option key={layer.id} value={layer.id}>{layer.name}</option>)}</select></label>
                </Group>
                <Group title="Overrides" open>
                  <label className="tl-inline-check"><input type="checkbox" checked={!!selectedClip.styleOverride} onChange={(e) => patchClip({ styleOverride: e.target.checked ? {} : undefined })} />Style override</label>
                  <label className="tl-inline-check"><input type="checkbox" checked={!!selectedClip.animationOverride} onChange={(e) => patchClip({ animationOverride: e.target.checked ? {} : undefined })} />Animation override</label>
                  <label className="tl-inline-check"><input type="checkbox" checked={!!selectedClip.fxOverride} onChange={(e) => patchClip({ fxOverride: e.target.checked ? {} : undefined })} />FX override</label>
                </Group>
              </>
            ) : <EmptyText text="Select a clip to edit clip text, timing and override toggles." />}
          </section>
        )}

        {tab === 'style' && (
          <section className="insp-stack">
            <Group title="Typography" open>
              <div className="inspector-grid">
                <label>Font<select className="form-control form-select" value={styleTarget.fontFamily} onChange={(e) => patchScopedStyle({ fontFamily: e.target.value })}>{FONT_PRESETS.map(font => <option key={font.label} value={font.value}>{font.label}</option>)}</select></label>
                <label>Size<input className="form-control form-input" type="number" step="0.1" min={0.5} value={parseFloat(styleTarget.fontSize) || 2.5} onChange={(e) => patchScopedStyle({ fontSize: `${e.target.value}rem` })} /></label>
                <label>Weight<input className="form-control form-input" type="number" step="100" min={100} max={1000} value={parseInt(String(styleTarget.fontWeight), 10) || 800} onChange={(e) => patchScopedStyle({ fontWeight: parseInt(e.target.value, 10) || 800 })} /></label>
                <label>Line height<input className="form-control form-input" type="number" step="0.05" value={parseFloat(styleTarget.lineHeight) || 1.2} onChange={(e) => patchScopedStyle({ lineHeight: e.target.value, lineSpacing: e.target.value })} /></label>
              </div>
              <label>Letter spacing<input className="form-control form-input" value={styleTarget.letterSpacing} onChange={(e) => patchScopedStyle({ letterSpacing: e.target.value })} /></label>
            </Group>
            <Group title="Glow & Shadow">
              <label>Glow<input className="form-range" type="range" min={0} max={2.5} step={0.05} value={styleTarget.glowIntensity} onChange={(e) => patchScopedStyle({ glowIntensity: parseFloat(e.target.value) })} /></label>
              <label>Blur<input className="form-range" type="range" min={0} max={24} step={0.5} value={styleTarget.blurAmount} onChange={(e) => patchScopedStyle({ blurAmount: parseFloat(e.target.value) })} /></label>
              <label>Stroke<input className="form-control form-input" type="number" min={0} max={12} step={0.5} value={styleTarget.strokeWidth} onChange={(e) => patchScopedStyle({ strokeWidth: parseFloat(e.target.value) || 0 })} /></label>
            </Group>
          </section>
        )}

        {tab === 'texture' && (
          <section className="insp-stack">
            <Group title="Fill / Texture" open>
              <label>Fill type<select className="form-control form-select" value={styleTarget.textFill.type} onChange={(e) => setFillType(e.target.value as TextFillConfig['type'])}><option value="solid">Solid</option><option value="gradient">Gradient</option><option value="image-texture">Image texture</option></select></label>
              {styleTarget.textFill.type === 'solid' && <label>Solid color<input className="form-color" type="color" value={toColorInput(styleTarget.textFill.solidColor ?? styleTarget.textColor)} onChange={(e) => patchFill({ ...styleTarget.textFill, solidColor: e.target.value })} /></label>}
              {styleTarget.textFill.type === 'gradient' && (
                <div className="inspector-grid">
                  <label>Color A<input className="form-color" type="color" value={toColorInput(styleTarget.textFill.gradient?.colorA)} onChange={(e) => patchFill({ ...styleTarget.textFill, gradient: { ...(styleTarget.textFill.gradient ?? DEFAULT_TEXT_FILL.gradient!), colorA: e.target.value } })} /></label>
                  <label>Color B<input className="form-color" type="color" value={toColorInput(styleTarget.textFill.gradient?.colorB)} onChange={(e) => patchFill({ ...styleTarget.textFill, gradient: { ...(styleTarget.textFill.gradient ?? DEFAULT_TEXT_FILL.gradient!), colorB: e.target.value } })} /></label>
                  <label>Angle<input className="form-control form-input" type="number" value={styleTarget.textFill.gradient?.angle ?? 110} onChange={(e) => patchFill({ ...styleTarget.textFill, gradient: { ...(styleTarget.textFill.gradient ?? DEFAULT_TEXT_FILL.gradient!), angle: parseFloat(e.target.value) || 0 } })} /></label>
                </div>
              )}
              {styleTarget.textFill.type === 'image-texture' && (
                <>
                  {(textureValue.missing || !textureValue.objectUrl) && <div className="insp-warning">Reload texture image</div>}
                  <label>Texture image<input className="form-control form-input" type="file" accept="image/*" onChange={(e) => void handleTextureFile(e.target.files?.[0])} /></label>
                  <label>Opacity<input className="form-range" type="range" min={0} max={1} step={0.05} value={textureValue.opacity} onChange={(e) => patchFill({ ...styleTarget.textFill, imageTexture: { ...textureValue, opacity: parseFloat(e.target.value) } })} /></label>
                  <label>Scale<input className="form-range" type="range" min={0.25} max={4} step={0.05} value={textureValue.scale} onChange={(e) => patchFill({ ...styleTarget.textFill, imageTexture: { ...textureValue, scale: parseFloat(e.target.value) } })} /></label>
                  <label>Fit<select className="form-control form-select" value={textureValue.fit} onChange={(e) => patchFill({ ...styleTarget.textFill, imageTexture: { ...textureValue, fit: e.target.value as 'cover' | 'contain' } })}><option value="cover">Cover</option><option value="contain">Contain</option></select></label>
                  <div className="inspector-grid">
                    <label>Offset X<input className="form-control form-input" type="number" value={textureValue.offsetX} onChange={(e) => patchFill({ ...styleTarget.textFill, imageTexture: { ...textureValue, offsetX: parseFloat(e.target.value) || 0 } })} /></label>
                    <label>Offset Y<input className="form-control form-input" type="number" value={textureValue.offsetY} onChange={(e) => patchFill({ ...styleTarget.textFill, imageTexture: { ...textureValue, offsetY: parseFloat(e.target.value) || 0 } })} /></label>
                  </div>
                </>
              )}
            </Group>
          </section>
        )}

        {tab === 'fx' && (
          <section className="insp-stack">
            <Group title="FX" open>
              <label>Preset<select className="form-control form-select" value={fxTarget.preset} onChange={(e) => {
                const preset = e.target.value as LyricFxPreset;
                patchScopedFx({ preset, enabled: preset !== 'none' });
              }}>{FX_PRESETS.map(fx => <option key={fx} value={fx}>{fx}</option>)}</select></label>
              <label>Intensity<input className="form-range" type="range" min={0} max={2.5} step={0.05} value={fxTarget.intensity} onChange={(e) => patchScopedFx({ intensity: parseFloat(e.target.value), enabled: fxTarget.preset !== 'none' })} /></label>
              <label>Blur<input className="form-range" type="range" min={0} max={18} step={0.5} value={fxTarget.blur} onChange={(e) => patchScopedFx({ blur: parseFloat(e.target.value), enabled: fxTarget.preset !== 'none' })} /></label>
            </Group>
          </section>
        )}

        {tab === 'animation' && (
          <section className="insp-stack">
            <Group title="Animation" open>
              <label>Active<select className="form-control form-select" value={animationTarget.activeAnimation} onChange={(e) => patchScopedAnimation({ activeAnimation: e.target.value as LyricAnimationConfig['activeAnimation'] })}>{['none', 'pulse', 'glow-pulse', 'breathing', 'shake-light', 'wave', 'flicker'].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
              <label>Intensity<input className="form-range" type="range" min={0} max={2.5} step={0.05} value={animationTarget.intensity} onChange={(e) => patchScopedAnimation({ intensity: parseFloat(e.target.value) })} /></label>
              <label>Speed<input className="form-range" type="range" min={0.25} max={4} step={0.05} value={animationTarget.speed} onChange={(e) => patchScopedAnimation({ speed: parseFloat(e.target.value) })} /></label>
            </Group>
          </section>
        )}
      </div>
    </aside>
  );
}

function Group({ title, open, children }: { title: string; open?: boolean; children: ReactNode }) {
  return <details className="insp-group" open={open}><summary>{title}</summary><div>{children}</div></details>;
}

function EmptyText({ text }: { text: string }) {
  return <div className="insp-empty">{text}</div>;
}

function toColorInput(color: string | undefined): string {
  if (color && /^#[0-9a-f]{6}$/i.test(color)) return color;
  return '#ffffff';
}
