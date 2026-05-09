import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { ClipPositionPreset } from '../../../core/types/clip';
import type {
  LayerRenderSettings,
  LyricLayer,
  LyricLayerAudioReactive,
  LyricLayerAudioReactiveBandMode,
  LyricLayerAudioReactiveResponseMode,
  LyricLayerAudioReactiveSource,
  LyricLayerAudioReactiveTarget
} from '../../../core/types/layer';
import { DEFAULT_LAYER_AUDIO_REACTIVE } from '../../../core/types/layer';
import type {
  ClipProgressIndicatorConfig,
  LyricActiveAnimationPreset,
  LyricAnimationConfig,
  LyricFxConfig,
  LyricFxPreset,
  LyricTransitionPreset
} from '../../../core/types/render';
import {
  resolveLyricAnimationConfig,
  resolveLyricFxConfig,
  resolveLyricVisualStyle,
  resolveProgressIndicatorConfig
} from '../../../core/render/resolveVisualStyle';
import './Inspectors.css';

interface LayerInspectorProps {
  layers: LyricLayer[];
  /** Optional id of the layer to focus initially (e.g. selected clip's layer). */
  activeLayerId?: string | null;
  onLayerChange: (layerId: string, patch: Partial<LyricLayer>) => void;
}

const POSITION_PRESETS: ClipPositionPreset[] = [
  'center',
  'top',
  'bottom',
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right'
];

const TRANSITION_PRESETS: LyricTransitionPreset[] = [
  'none',
  'fade',
  'fade-out',
  'slide-up',
  'slide-down',
  'scale-in',
  'scale-out',
  'blur-in',
  'blur-out',
  'glow-pop',
  'glitch-in',
  'glitch-out'
];

const ACTIVE_ANIMATIONS: LyricActiveAnimationPreset[] = [
  'none',
  'pulse',
  'glow-pulse',
  'breathing',
  'shake-light',
  'wave',
  'flicker'
];

const FX_PRESETS: LyricFxPreset[] = [
  'none',
  'neon-glow',
  'rgb-shift',
  'glitch',
  'scanline',
  'chromatic-aberration',
  'blur-flicker',
  'wave-distort',
  'shadow-trail',
  'energy-pulse',
  'soft-bloom',
  'prism-shader',
  'liquid-shimmer',
  'heat-haze'
];

const REACTIVE_SOURCES: LyricLayerAudioReactiveSource[] = ['master', 'vocals-stem', 'estimated'];
const REACTIVE_BANDS: LyricLayerAudioReactiveBandMode[] = [
  'full-mix',
  'vocals',
  'instrumental',
  'kick',
  'bass',
  'hihat'
];
const REACTIVE_RESPONSES: LyricLayerAudioReactiveResponseMode[] = ['envelope', 'peak'];
const REACTIVE_TARGET_KEYS = ['opacity', 'blur', 'glowIntensity', 'scale', 'offsetY'] as const;
type ReactiveTargetKey = (typeof REACTIVE_TARGET_KEYS)[number];

export function LayerInspector({ layers, activeLayerId, onLayerChange }: LayerInspectorProps) {
  const fallbackId = layers[0]?.id ?? null;
  const [editingId, setEditingId] = useState<string | null>(activeLayerId ?? fallbackId);

  // Snap the picker back to the externally-driven active layer when the
  // selected clip changes — keeps the inspector in sync with the timeline.
  useEffect(() => {
    if (activeLayerId && activeLayerId !== editingId) {
      setEditingId(activeLayerId);
    }
  }, [activeLayerId, editingId]);

  const layer = layers.find(l => l.id === editingId) ?? null;

  if (layers.length === 0) {
    return (
      <aside className="lx-inspector">
        <h3>Layer</h3>
        <span className="lx-inspector-empty">No layers in this project.</span>
      </aside>
    );
  }

  return (
    <aside className="lx-inspector">
      <h3>Layer</h3>
      <label>
        Editing
        <select
          value={editingId ?? ''}
          onChange={(e) => setEditingId(e.target.value)}
        >
          {layers.map(l => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
      </label>
      {layer && (
        <LayerEditor layer={layer} onLayerChange={onLayerChange} />
      )}
    </aside>
  );
}

interface LayerEditorProps {
  layer: LyricLayer;
  onLayerChange: (layerId: string, patch: Partial<LyricLayer>) => void;
}

function LayerEditor({ layer, onLayerChange }: LayerEditorProps) {
  const patch = (next: Partial<LyricLayer>) => onLayerChange(layer.id, next);

  const patchRender = (next: Partial<LayerRenderSettings>) => {
    patch({
      renderSettings: {
        positionPreset: layer.renderSettings?.positionPreset ?? 'center',
        ...layer.renderSettings,
        ...next
      }
    });
  };

  const patchStyle = (next: Partial<NonNullable<LyricLayer['styleDefaults']>>) => {
    patch({
      styleDefaults: {
        ...(layer.styleDefaults ?? {}),
        ...next
      }
    });
  };

  const patchAnimation = (next: Partial<LyricAnimationConfig>) => {
    patch({
      animationDefaults: {
        ...(layer.animationDefaults ?? {}),
        ...next
      }
    });
  };

  const patchFx = (next: Partial<LyricFxConfig>) => {
    patch({
      fxDefaults: {
        ...(layer.fxDefaults ?? {}),
        ...next
      }
    });
  };

  const patchProgress = (next: Partial<ClipProgressIndicatorConfig>) => {
    patch({
      progressIndicatorDefaults: {
        ...(layer.progressIndicatorDefaults ?? {}),
        ...next
      }
    });
  };

  const patchAudioReactive = (next: Partial<LyricLayerAudioReactive>) => {
    const base: LyricLayerAudioReactive = layer.audioReactive ?? DEFAULT_LAYER_AUDIO_REACTIVE;
    patch({
      audioReactive: {
        ...base,
        ...next,
        targets: { ...base.targets, ...(next.targets ?? {}) }
      }
    });
  };

  const resolvedStyle = resolveLyricVisualStyle(undefined, layer.styleDefaults ?? layer.style);
  const resolvedAnimation = resolveLyricAnimationConfig(undefined, layer.animationDefaults ?? layer.animation);
  const resolvedFx = resolveLyricFxConfig(undefined, layer.fxDefaults ?? layer.fx);
  const resolvedProgress = resolveProgressIndicatorConfig(undefined, layer.progressIndicatorDefaults ?? layer.progressIndicator);
  const reactive = layer.audioReactive ?? DEFAULT_LAYER_AUDIO_REACTIVE;

  return (
    <>
      <Section title="Basic" defaultOpen>
        <label>
          Name
          <input
            type="text"
            value={layer.name}
            onChange={(e) => patch({ name: e.target.value })}
          />
        </label>
        <div className="lx-inspector-row">
          <label>
            Color
            <input
              type="color"
              value={layer.color}
              onChange={(e) => patch({ color: e.target.value })}
            />
          </label>
          <label>
            Order
            <input
              type="number"
              step="1"
              value={layer.order}
              onChange={(e) => {
                const next = parseInt(e.target.value, 10);
                if (!Number.isFinite(next)) return;
                patch({ order: next });
              }}
            />
          </label>
        </div>
        <div className="lx-inspector-row">
          <label className="inline">
            <input
              type="checkbox"
              checked={layer.visible}
              onChange={(e) => patch({ visible: e.target.checked })}
            />
            Visible
          </label>
          <label className="inline">
            <input
              type="checkbox"
              checked={layer.locked}
              onChange={(e) => patch({ locked: e.target.checked })}
            />
            Locked
          </label>
        </div>
      </Section>

      <Section title="Render" defaultOpen>
        <label>
          Position preset
          <select
            value={layer.renderSettings?.positionPreset ?? 'center'}
            onChange={(e) => patchRender({ positionPreset: e.target.value as ClipPositionPreset })}
          >
            {POSITION_PRESETS.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </label>
        <div className="lx-inspector-row">
          <label>
            Text align
            <select
              value={layer.renderSettings?.textAlign ?? 'center'}
              onChange={(e) => patchRender({ textAlign: e.target.value as 'left' | 'center' | 'right' })}
            >
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
          </label>
          <label>
            Z-index
            <input
              type="number"
              step="1"
              value={layer.renderSettings?.zIndex ?? 0}
              onChange={(e) => {
                const next = parseInt(e.target.value, 10);
                if (Number.isFinite(next)) patchRender({ zIndex: next });
              }}
            />
          </label>
        </div>
      </Section>

      <Section title="Style defaults">
        <div className="lx-inspector-row">
          <label>
            Font size
            <input
              type="number"
              step="0.1"
              min={0.5}
              value={parseFloat(resolvedStyle.fontSize) || 2.5}
              onChange={(e) => patchStyle({ fontSize: `${e.target.value}rem` })}
            />
          </label>
          <label>
            Text color
            <input
              type="color"
              value={toColorInput(resolvedStyle.textColor)}
              onChange={(e) => patchStyle({ textColor: e.target.value, activeTextColor: e.target.value })}
            />
          </label>
        </div>
        <label>
          Opacity ({resolvedStyle.opacity.toFixed(2)})
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={resolvedStyle.opacity}
            onChange={(e) => patchStyle({ opacity: parseFloat(e.target.value) })}
          />
        </label>
        <label>
          Glow intensity ({resolvedStyle.glowIntensity.toFixed(2)})
          <input
            type="range"
            min={0}
            max={2}
            step={0.05}
            value={resolvedStyle.glowIntensity}
            onChange={(e) => patchStyle({ glowIntensity: parseFloat(e.target.value) })}
          />
        </label>
        <label>
          Blur amount ({resolvedStyle.blurAmount.toFixed(1)})
          <input
            type="range"
            min={0}
            max={16}
            step={0.5}
            value={resolvedStyle.blurAmount}
            onChange={(e) => patchStyle({ blurAmount: parseFloat(e.target.value) })}
          />
        </label>
      </Section>

      <Section title="Animation defaults">
        <label>
          Active animation
          <select
            value={resolvedAnimation.activeAnimation}
            onChange={(e) => patchAnimation({ activeAnimation: e.target.value as LyricActiveAnimationPreset })}
          >
            {ACTIVE_ANIMATIONS.map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </label>
        <div className="lx-inspector-row">
          <label>
            Transition in
            <select
              value={resolvedAnimation.transitionIn}
              onChange={(e) => patchAnimation({ transitionIn: e.target.value as LyricTransitionPreset })}
            >
              {TRANSITION_PRESETS.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            Transition out
            <select
              value={resolvedAnimation.transitionOut}
              onChange={(e) => patchAnimation({ transitionOut: e.target.value as LyricTransitionPreset })}
            >
              {TRANSITION_PRESETS.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Speed ({resolvedAnimation.speed.toFixed(2)})
          <input
            type="range"
            min={0.25}
            max={4}
            step={0.05}
            value={resolvedAnimation.speed}
            onChange={(e) => patchAnimation({ speed: parseFloat(e.target.value) })}
          />
        </label>
      </Section>

      <Section title="FX defaults">
        <label className="inline">
          <input
            type="checkbox"
            checked={resolvedFx.enabled}
            onChange={(e) => patchFx({ enabled: e.target.checked })}
          />
          FX enabled
        </label>
        <label>
          Preset
          <select
            value={resolvedFx.preset}
            onChange={(e) => {
              const preset = e.target.value as LyricFxPreset;
              patchFx({ preset, enabled: preset !== 'none' });
            }}
          >
            {FX_PRESETS.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </label>
        <label>
          Intensity ({resolvedFx.intensity.toFixed(2)})
          <input
            type="range"
            min={0}
            max={2}
            step={0.05}
            value={resolvedFx.intensity}
            onChange={(e) => patchFx({ intensity: parseFloat(e.target.value) })}
          />
        </label>
      </Section>

      <Section title="Progress indicator">
        <label className="inline">
          <input
            type="checkbox"
            checked={resolvedProgress.enabled}
            onChange={(e) => patchProgress({ enabled: e.target.checked })}
          />
          Show progress dot by default
        </label>
        <div className="lx-inspector-row">
          <label>
            Color
            <input
              type="color"
              value={toColorInput(resolvedProgress.color)}
              onChange={(e) => patchProgress({ color: e.target.value })}
            />
          </label>
          <label>
            Size
            <input
              type="number"
              min={2}
              max={32}
              step={1}
              value={resolvedProgress.size}
              onChange={(e) => {
                const next = parseFloat(e.target.value);
                if (Number.isFinite(next)) patchProgress({ size: next });
              }}
            />
          </label>
        </div>
      </Section>

      <Section title="Audio reactive">
        <label className="inline">
          <input
            type="checkbox"
            checked={reactive.enabled}
            onChange={(e) => patchAudioReactive({ enabled: e.target.checked })}
          />
          Drive this layer from audio
        </label>
        <div className="lx-inspector-row">
          <label>
            Source
            <select
              value={reactive.source}
              onChange={(e) => patchAudioReactive({ source: e.target.value as LyricLayerAudioReactiveSource })}
            >
              {REACTIVE_SOURCES.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Band
            <select
              value={reactive.bandMode}
              onChange={(e) => patchAudioReactive({ bandMode: e.target.value as LyricLayerAudioReactiveBandMode })}
            >
              {REACTIVE_BANDS.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="lx-inspector-row">
          <label>
            Response
            <select
              value={reactive.responseMode}
              onChange={(e) => patchAudioReactive({ responseMode: e.target.value as LyricLayerAudioReactiveResponseMode })}
            >
              {REACTIVE_RESPONSES.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </label>
          <label className="inline">
            <input
              type="checkbox"
              checked={reactive.invert}
              onChange={(e) => patchAudioReactive({ invert: e.target.checked })}
            />
            Invert
          </label>
        </div>
        <div className="lx-inspector-row">
          <label>
            Attack ms
            <input
              type="number"
              min={0}
              max={4000}
              step={5}
              value={reactive.attackMs}
              onChange={(e) => {
                const next = parseFloat(e.target.value);
                if (Number.isFinite(next)) patchAudioReactive({ attackMs: next });
              }}
            />
          </label>
          <label>
            Release ms
            <input
              type="number"
              min={0}
              max={4000}
              step={5}
              value={reactive.releaseMs}
              onChange={(e) => {
                const next = parseFloat(e.target.value);
                if (Number.isFinite(next)) patchAudioReactive({ releaseMs: next });
              }}
            />
          </label>
        </div>
        <label>
          Threshold ({reactive.threshold.toFixed(2)})
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={reactive.threshold}
            onChange={(e) => patchAudioReactive({ threshold: parseFloat(e.target.value) })}
          />
        </label>
        <label>
          Softness ({reactive.softness.toFixed(2)})
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={reactive.softness}
            onChange={(e) => patchAudioReactive({ softness: parseFloat(e.target.value) })}
          />
        </label>
        <div className="lx-inspector-divider" />
        <strong className="lx-inspector-empty" style={{ color: '#c9d0e2', fontStyle: 'normal' }}>Targets</strong>
        {REACTIVE_TARGET_KEYS.map(key => (
          <ReactiveTargetRow
            key={key}
            name={key}
            target={reactive.targets[key]}
            onChange={(next) =>
              patchAudioReactive({
                targets: {
                  ...reactive.targets,
                  [key]: next
                }
              })
            }
          />
        ))}
      </Section>
    </>
  );
}

function ReactiveTargetRow({
  name,
  target,
  onChange
}: {
  name: ReactiveTargetKey;
  target: LyricLayerAudioReactiveTarget | undefined;
  onChange: (next: LyricLayerAudioReactiveTarget | undefined) => void;
}) {
  const enabled = !!target;
  const value: LyricLayerAudioReactiveTarget = target ?? defaultTargetFor(name);
  return (
    <div className="lx-inspector-target">
      <label className="inline">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onChange(e.target.checked ? value : undefined)}
        />
        {name}
      </label>
      {enabled && (
        <div className="lx-inspector-row">
          <label>
            Amount
            <input
              type="number"
              step="0.05"
              min={-4}
              max={4}
              value={value.amount}
              onChange={(e) => {
                const next = parseFloat(e.target.value);
                if (Number.isFinite(next)) onChange({ ...value, amount: next });
              }}
            />
          </label>
          <label>
            Min
            <input
              type="number"
              step="0.05"
              value={value.min}
              onChange={(e) => {
                const next = parseFloat(e.target.value);
                if (Number.isFinite(next)) onChange({ ...value, min: next });
              }}
            />
          </label>
          <label>
            Max
            <input
              type="number"
              step="0.05"
              value={value.max}
              onChange={(e) => {
                const next = parseFloat(e.target.value);
                if (Number.isFinite(next)) onChange({ ...value, max: next });
              }}
            />
          </label>
        </div>
      )}
    </div>
  );
}

function defaultTargetFor(key: ReactiveTargetKey): LyricLayerAudioReactiveTarget {
  switch (key) {
    case 'opacity': return { amount: 1, min: 0.2, max: 1 };
    case 'blur': return { amount: 1, min: 0, max: 8 };
    case 'glowIntensity': return { amount: 1, min: 0, max: 2 };
    case 'scale': return { amount: 0.4, min: 0.9, max: 1.15 };
    case 'offsetY': return { amount: 0.5, min: -8, max: 8 };
  }
}

function Section({
  title,
  defaultOpen = false,
  children
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="lx-inspector-section">
      <button
        type="button"
        className="lx-inspector-section-toggle"
        onClick={() => setOpen(v => !v)}
      >
        <span>{title}</span>
        <span aria-hidden>{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="lx-inspector-section-body">{children}</div>}
    </div>
  );
}

function toColorInput(color: string | undefined): string {
  if (color && /^#[0-9a-f]{6}$/i.test(color)) return color;
  if (color && /^#[0-9a-f]{3}$/i.test(color)) {
    const [, r, g, b] = color.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i) ?? [];
    return r && g && b ? `#${r}${r}${g}${g}${b}${b}` : '#ffffff';
  }
  return '#ffffff';
}
