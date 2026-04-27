import type {
  AnimationConfig,
  FxConfig,
  LyricVisualStyle,
  ProgressIndicatorConfig,
  ProgressIndicatorVariant
} from '../../../core/types/render';
import './Inspectors.css';

interface ProjectStylePanelProps {
  styleConfig: LyricVisualStyle;
  animationConfig: AnimationConfig;
  fxConfig: FxConfig;
  progressIndicatorConfig: ProgressIndicatorConfig;
  onStyleChange: (next: LyricVisualStyle) => void;
  onAnimationChange: (next: AnimationConfig) => void;
  onFxChange: (next: FxConfig) => void;
  onProgressChange: (next: ProgressIndicatorConfig) => void;
}

const PROGRESS_VARIANTS: ProgressIndicatorVariant[] = ['none', 'bar', 'underline', 'glow'];

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

  const patchAnimation = (patch: Partial<AnimationConfig>) =>
    onAnimationChange({ ...animationConfig, ...patch });

  const patchFx = (patch: Partial<FxConfig>) =>
    onFxChange({ ...fxConfig, ...patch });

  const patchProgress = (patch: Partial<ProgressIndicatorConfig>) =>
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
          checked={animationConfig.enabled}
          onChange={(e) => patchAnimation({ enabled: e.target.checked })}
        />
        Enable transitions
      </label>
      <div className="lx-inspector-row">
        <label>
          Enter (ms)
          <input
            type="number"
            min={0}
            step="20"
            value={animationConfig.enterDurationMs}
            onChange={(e) => {
              const next = parseInt(e.target.value, 10);
              if (Number.isFinite(next)) patchAnimation({ enterDurationMs: next });
            }}
          />
        </label>
        <label>
          Exit (ms)
          <input
            type="number"
            min={0}
            step="20"
            value={animationConfig.exitDurationMs}
            onChange={(e) => {
              const next = parseInt(e.target.value, 10);
              if (Number.isFinite(next)) patchAnimation({ exitDurationMs: next });
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
          Ambient
          <input
            type="number"
            min={0}
            max={1}
            step="0.05"
            value={fxConfig.ambientIntensity}
            onChange={(e) => {
              const next = parseFloat(e.target.value);
              if (Number.isFinite(next)) patchFx({ ambientIntensity: clamp01(next) });
            }}
          />
        </label>
        <label>
          Bloom
          <input
            type="number"
            min={0}
            max={1}
            step="0.05"
            value={fxConfig.bloom}
            onChange={(e) => {
              const next = parseFloat(e.target.value);
              if (Number.isFinite(next)) patchFx({ bloom: clamp01(next) });
            }}
          />
        </label>
      </div>
      <label>
        Vignette
        <input
          type="number"
          min={0}
          max={1}
          step="0.05"
          value={fxConfig.vignette}
          onChange={(e) => {
            const next = parseFloat(e.target.value);
            if (Number.isFinite(next)) patchFx({ vignette: clamp01(next) });
          }}
        />
      </label>

      <div className="lx-inspector-divider" />
      <h3>Progress indicator</h3>
      <div className="lx-inspector-row">
        <label>
          Variant
          <select
            value={progressIndicatorConfig.variant}
            onChange={(e) =>
              patchProgress({ variant: e.target.value as ProgressIndicatorVariant })
            }
          >
            {PROGRESS_VARIANTS.map(v => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </label>
        <label>
          Thickness
          <input
            type="number"
            min={0}
            step="1"
            value={progressIndicatorConfig.thickness}
            onChange={(e) => {
              const next = parseInt(e.target.value, 10);
              if (Number.isFinite(next)) patchProgress({ thickness: next });
            }}
          />
        </label>
      </div>
      <label className="inline">
        <input
          type="checkbox"
          checked={progressIndicatorConfig.showOnActiveOnly}
          onChange={(e) => patchProgress({ showOnActiveOnly: e.target.checked })}
        />
        Show on active only
      </label>
    </aside>
  );
}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

// `<input type="color">` only accepts #rrggbb. Pass through anything that
// already matches; otherwise fall back to white so the swatch is interactive.
function toHex(value: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
  return '#ffffff';
}
