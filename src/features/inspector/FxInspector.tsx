import type { LyricFxConfig, LyricFxPreset } from '../../core/types/render';
import { Group } from './InspectorPrimitives';

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

interface FxInspectorProps {
  fx: LyricFxConfig;
  onPatchFx: (patch: Partial<LyricFxConfig>) => void;
}

export function FxInspector({
  fx,
  onPatchFx
}: FxInspectorProps) {
  return (
    <section className="insp-stack">
      <Group title="FX" open>
        <label>
          Preset
          <select
            className="form-control form-select"
            value={fx.preset}
            onChange={(e) => {
              const preset = e.target.value as LyricFxPreset;
              onPatchFx({ preset, enabled: preset !== 'none' });
            }}
          >
            {FX_PRESETS.map(preset => (
              <option key={preset} value={preset}>{preset}</option>
            ))}
          </select>
        </label>
        <label>
          Intensity
          <input
            className="form-range"
            type="range"
            min={0}
            max={2.5}
            step={0.05}
            value={fx.intensity}
            onChange={(e) => onPatchFx({ intensity: parseFloat(e.target.value), enabled: fx.preset !== 'none' })}
          />
        </label>
        <label>
          Blur
          <input
            className="form-range"
            type="range"
            min={0}
            max={18}
            step={0.5}
            value={fx.blur}
            onChange={(e) => onPatchFx({ blur: parseFloat(e.target.value), enabled: fx.preset !== 'none' })}
          />
        </label>
      </Group>
    </section>
  );
}
