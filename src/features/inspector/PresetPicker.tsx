import { useMemo, useState } from 'react';
import { VISUAL_PRESETS, type LyricVisualPreset } from '../../core/presets/visualPresets';

export type PresetScope = 'project' | 'layer' | 'clip';

interface PresetPickerProps {
  /** Which scopes are currently available (e.g. no clip selected → omit 'clip'). */
  availableScopes: PresetScope[];
  /** Default scope on first render. Defaults to the most-specific available. */
  defaultScope?: PresetScope;
  /** Called when the user picks a preset; receives the picked preset + scope. */
  onApply: (preset: LyricVisualPreset, scope: PresetScope) => void;
}

const SCOPE_LABEL: Record<PresetScope, string> = {
  project: 'Project default',
  layer: 'Selected layer',
  clip: 'Selected clip'
};

/**
 * Surfaces curated visual presets so the user can change a clip's look without
 * touching every low-level animation/FX/style control. Picking a preset merges
 * its values into the chosen scope's existing config (project default / layer
 * defaults / per-clip override) — non-preset fields stay put.
 */
export function PresetPicker({
  availableScopes,
  defaultScope,
  onApply
}: PresetPickerProps) {
  const initialScope =
    defaultScope && availableScopes.includes(defaultScope)
      ? defaultScope
      : (availableScopes.includes('clip') ? 'clip'
        : availableScopes.includes('layer') ? 'layer'
        : 'project');
  const [scope, setScope] = useState<PresetScope>(initialScope);

  const groups = useMemo(() => {
    const map = new Map<string, LyricVisualPreset[]>();
    for (const preset of VISUAL_PRESETS) {
      const arr = map.get(preset.group) ?? [];
      arr.push(preset);
      map.set(preset.group, arr);
    }
    return Array.from(map.entries());
  }, []);

  return (
    <section className="preset-picker">
      <header className="preset-picker-head">
        <label className="preset-scope">
          Apply to
          <select
            className="form-control form-select"
            value={scope}
            onChange={(e) => setScope(e.target.value as PresetScope)}
          >
            {availableScopes.map(s => (
              <option key={s} value={s}>{SCOPE_LABEL[s]}</option>
            ))}
          </select>
        </label>
      </header>
      <div className="preset-grid">
        {groups.flatMap(([group, presets]) =>
          presets.map(preset => (
            <button
              key={preset.id}
              type="button"
              className="preset-card"
              onClick={() => onApply(preset, scope)}
              title={preset.description}
            >
              <span className="preset-card-name">{preset.name}</span>
              <span className="preset-card-group">{group}</span>
              <span className="preset-card-desc">{preset.description}</span>
            </button>
          ))
        )}
      </div>
    </section>
  );
}
