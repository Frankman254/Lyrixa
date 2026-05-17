import type { LyricVisualStyle } from '../../core/types/render';
import { Group } from './InspectorPrimitives';

const FONT_PRESETS = [
  { label: 'Inter', value: 'Inter, system-ui, sans-serif' },
  { label: 'Impact', value: 'Impact, Haettenschweiler, Arial Narrow Bold, sans-serif' },
  { label: 'Arial Black', value: '"Arial Black", Arial, sans-serif' },
  { label: 'Condensed', value: '"Avenir Next Condensed", "Roboto Condensed", Arial Narrow, sans-serif' },
  { label: 'Rounded', value: '"Arial Rounded MT Bold", "Trebuchet MS", system-ui, sans-serif' },
  { label: 'Serif', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Mono', value: '"SFMono-Regular", Menlo, Consolas, monospace' }
];

interface StyleInspectorProps {
  style: LyricVisualStyle;
  onPatchStyle: (patch: Partial<LyricVisualStyle>) => void;
}

export function StyleInspector({
  style,
  onPatchStyle
}: StyleInspectorProps) {
  return (
    <section className="insp-stack">
      <Group title="Typography" open>
        <div className="inspector-grid">
          <label>
            Font
            <select
              className="form-control form-select"
              value={style.fontFamily}
              onChange={(e) => onPatchStyle({ fontFamily: e.target.value })}
            >
              {FONT_PRESETS.map(font => (
                <option key={font.label} value={font.value}>{font.label}</option>
              ))}
            </select>
          </label>
          <label>
            Size
            <input
              className="form-control form-input"
              type="number"
              step="0.1"
              min={0.5}
              value={parseFloat(style.fontSize) || 2.5}
              onChange={(e) => onPatchStyle({ fontSize: `${e.target.value}rem` })}
            />
          </label>
          <label>
            Weight
            <input
              className="form-control form-input"
              type="number"
              step="100"
              min={100}
              max={1000}
              value={parseInt(String(style.fontWeight), 10) || 800}
              onChange={(e) => onPatchStyle({ fontWeight: parseInt(e.target.value, 10) || 800 })}
            />
          </label>
          <label>
            Line height
            <input
              className="form-control form-input"
              type="number"
              step="0.05"
              value={parseFloat(style.lineHeight) || 1.2}
              onChange={(e) => onPatchStyle({ lineHeight: e.target.value, lineSpacing: e.target.value })}
            />
          </label>
        </div>
        <label>
          Letter spacing
          <input
            className="form-control form-input"
            value={style.letterSpacing}
            onChange={(e) => onPatchStyle({ letterSpacing: e.target.value })}
          />
        </label>
      </Group>

      <Group title="Glow & Shadow">
        <label>
          Glow
          <input
            className="form-range"
            type="range"
            min={0}
            max={2.5}
            step={0.05}
            value={style.glowIntensity}
            onChange={(e) => onPatchStyle({ glowIntensity: parseFloat(e.target.value) })}
          />
        </label>
        <label>
          Blur
          <input
            className="form-range"
            type="range"
            min={0}
            max={24}
            step={0.5}
            value={style.blurAmount}
            onChange={(e) => onPatchStyle({ blurAmount: parseFloat(e.target.value) })}
          />
        </label>
        <label>
          Stroke
          <input
            className="form-control form-input"
            type="number"
            min={0}
            max={12}
            step={0.5}
            value={style.strokeWidth}
            onChange={(e) => onPatchStyle({ strokeWidth: parseFloat(e.target.value) || 0 })}
          />
        </label>
      </Group>
    </section>
  );
}
