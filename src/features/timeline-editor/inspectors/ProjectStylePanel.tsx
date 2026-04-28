import type {
  ClipProgressIndicatorConfig,
  LyricAnimationConfig,
  LyricFxConfig,
  LyricVisualStyle,
} from '../../../core/types/render';
import './Inspectors.css';

interface ProjectStylePanelProps {
  styleConfig: LyricVisualStyle;
  animationConfig: LyricAnimationConfig;
  fxConfig: LyricFxConfig;
  progressIndicatorConfig: ClipProgressIndicatorConfig;
  onStyleChange: (next: LyricVisualStyle) => void;
  onAnimationChange: (next: LyricAnimationConfig) => void;
  onFxChange: (next: LyricFxConfig) => void;
  onProgressChange: (next: ClipProgressIndicatorConfig) => void;
}

export function ProjectStylePanel({
  styleConfig,
  animationConfig,
  fxConfig,
  progressIndicatorConfig,
  onStyleChange,
  onAnimationChange,
  onFxChange,
  onProgressChange
}: ProjectStylePanelProps) {
  const patchStyle = (patch: Partial<LyricVisualStyle>) =>
    onStyleChange({ ...styleConfig, ...patch });

  const patchAnimation = (patch: Partial<LyricAnimationConfig>) =>
    onAnimationChange({ ...animationConfig, ...patch });

  const patchFx = (patch: Partial<LyricFxConfig>) =>
    onFxChange({ ...fxConfig, ...patch });

  const patchProgress = (patch: Partial<ClipProgressIndicatorConfig>) =>
    onProgressChange({ ...progressIndicatorConfig, ...patch });

  return (
    <aside className="lx-inspector">
      <h3>Project style</h3>

      <div className="lx-inspector-row">
        <label>
          Active color
          <input
            type="color"
            value={toHex(styleConfig.activeTextColor)}
            onChange={(e) => patchStyle({ activeTextColor: e.target.value })}
          />
        </label>
        <label>
          Glow
          <input
            type="color"
            value={toHex(styleConfig.glowColor)}
            onChange={(e) => patchStyle({ glowColor: e.target.value })}
          />
        </label>
      </div>
      <div className="lx-inspector-row">
        <label>
          Font size
          <input
            type="text"
            value={styleConfig.fontSize}
            onChange={(e) => patchStyle({ fontSize: e.target.value })}
          />
        </label>
        <label>
          Alignment
          <select
            value={styleConfig.alignment}
            onChange={(e) =>
              patchStyle({ alignment: e.target.value as LyricVisualStyle['alignment'] })
            }
          >
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </select>
        </label>
      </div>
      <label className="inline">
        <input
          type="checkbox"
          checked={styleConfig.backgroundEmphasis}
          onChange={(e) => patchStyle({ backgroundEmphasis: e.target.checked })}
        />
        Background emphasis
      </label>

      <div className="lx-inspector-divider" />
      <h3>Animation</h3>
      <label className="inline">
        <input
          type="checkbox"
          checked={animationConfig.activeAnimation !== 'none'}
          onChange={(e) => patchAnimation({ activeAnimation: e.target.checked ? 'pulse' : 'none' })}
        />
        Enable active animation
      </label>
      <div className="lx-inspector-row">
        <label>
          Duration (ms)
          <input
            type="number"
            min={0}
            step="20"
            value={animationConfig.durationMs}
            onChange={(e) => {
              const next = parseInt(e.target.value, 10);
              if (Number.isFinite(next)) patchAnimation({ durationMs: next });
            }}
          />
        </label>
        <label>
          Exit linger (ms)
          <input
            type="number"
            min={0}
            step="20"
            value={animationConfig.exitLingerMs}
            onChange={(e) => {
              const next = parseInt(e.target.value, 10);
              if (Number.isFinite(next)) patchAnimation({ exitLingerMs: next });
            }}
          />
        </label>
      </div>

      <div className="lx-inspector-divider" />
      <h3>FX</h3>
      <label className="inline">
        <input
          type="checkbox"
          checked={fxConfig.enabled}
          onChange={(e) => patchFx({ enabled: e.target.checked })}
        />
        Enable FX bus
      </label>
      <div className="lx-inspector-row">
        <label>
          Intensity
          <input
            type="number"
            min={0}
            max={2}
            step="0.05"
            value={fxConfig.intensity}
            onChange={(e) => {
              const next = parseFloat(e.target.value);
              if (Number.isFinite(next)) patchFx({ intensity: clamp(next, 0, 2) });
            }}
          />
        </label>
        <label>
          Blur
          <input
            type="number"
            min={0}
            max={24}
            step="0.5"
            value={fxConfig.blur}
            onChange={(e) => {
              const next = parseFloat(e.target.value);
              if (Number.isFinite(next)) patchFx({ blur: clamp(next, 0, 24) });
            }}
          />
        </label>
      </div>
      <label>
        FX opacity
        <input
          type="number"
          min={0}
          max={1}
          step="0.05"
          value={fxConfig.opacity}
          onChange={(e) => {
            const next = parseFloat(e.target.value);
            if (Number.isFinite(next)) patchFx({ opacity: clamp01(next) });
          }}
        />
      </label>

      <div className="lx-inspector-divider" />
      <h3>Progress indicator</h3>
      <div className="lx-inspector-row">
        <label>
          Dot size
          <input
            type="number"
            min={0}
            step="1"
            value={progressIndicatorConfig.size}
            onChange={(e) => {
              const next = parseInt(e.target.value, 10);
              if (Number.isFinite(next)) patchProgress({ size: next });
            }}
          />
        </label>
        <label>
          Dot glow
          <input
            type="number"
            min={0}
            max={2}
            step="0.05"
            value={progressIndicatorConfig.glow}
            onChange={(e) => {
              const next = parseFloat(e.target.value);
              if (Number.isFinite(next)) patchProgress({ glow: clamp(next, 0, 2) });
            }}
          />
        </label>
      </div>
      <label className="inline">
        <input
          type="checkbox"
          checked={progressIndicatorConfig.enabled}
          onChange={(e) => patchProgress({ enabled: e.target.checked })}
        />
        Show progress dot
      </label>
    </aside>
  );
}

function clamp01(n: number): number {
  return clamp(n, 0, 1);
}

function clamp(n: number, min: number, max: number): number {
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

// `<input type="color">` only accepts #rrggbb. Pass through anything that
// already matches; otherwise fall back to white so the swatch is interactive.
function toHex(value: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
  return '#ffffff';
}
