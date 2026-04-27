import type { LyricClip } from '../../../core/types/clip';
import type { LyricLayer } from '../../../core/types/layer';
import './Inspectors.css';

interface ClipInspectorProps {
  clip: LyricClip | null;
  layers: LyricLayer[];
  onChange: (patch: Partial<LyricClip>) => void;
}

const TRANSITIONS: LyricClip['transitionIn'][] = [
  'none',
  'fade',
  'slide-up',
  'slide-down',
  'zoom-in',
  'zoom-out',
  'blur-in'
];

const TRANSITION_LABEL: Record<LyricClip['transitionIn'], string> = {
  none: 'None',
  fade: 'Fade',
  'slide-up': 'Slide up',
  'slide-down': 'Slide down',
  'zoom-in': 'Zoom in',
  'zoom-out': 'Zoom out',
  'blur-in': 'Blur in'
};

export function ClipInspector({ clip, layers, onChange }: ClipInspectorProps) {
  if (!clip) {
    return (
      <aside className="lx-inspector">
        <h3>Clip</h3>
        <span className="lx-inspector-empty">Select a single clip to edit it.</span>
      </aside>
    );
  }

  return (
    <aside className="lx-inspector">
      <h3>Clip</h3>
      <label>
        Text
        <textarea
          rows={2}
          value={clip.text}
          onChange={(e) => onChange({ text: e.target.value })}
        />
      </label>
      <div className="lx-inspector-row">
        <label>
          Start
          <input
            type="number"
            step="0.01"
            min={0}
            value={Number(clip.startTime.toFixed(2))}
            onChange={(e) => {
              const next = parseFloat(e.target.value);
              if (!Number.isFinite(next)) return;
              onChange({
                startTime: Math.max(0, Math.min(clip.endTime - 0.25, next))
              });
            }}
          />
        </label>
        <label>
          End
          <input
            type="number"
            step="0.01"
            min={0}
            value={Number(clip.endTime.toFixed(2))}
            onChange={(e) => {
              const next = parseFloat(e.target.value);
              if (!Number.isFinite(next)) return;
              onChange({
                endTime: Math.max(clip.startTime + 0.25, next)
              });
            }}
          />
        </label>
      </div>
      <label>
        Layer
        <select
          value={clip.layerId}
          onChange={(e) => onChange({ layerId: e.target.value })}
        >
          {layers.map(l => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
      </label>
      <div className="lx-inspector-row">
        <label>
          In
          <select
            value={clip.transitionIn}
            onChange={(e) =>
              onChange({ transitionIn: e.target.value as LyricClip['transitionIn'] })
            }
          >
            {TRANSITIONS.map(t => (
              <option key={t} value={t}>{TRANSITION_LABEL[t]}</option>
            ))}
          </select>
        </label>
        <label>
          Out
          <select
            value={clip.transitionOut}
            onChange={(e) =>
              onChange({ transitionOut: e.target.value as LyricClip['transitionOut'] })
            }
          >
            {TRANSITIONS.map(t => (
              <option key={t} value={t}>{TRANSITION_LABEL[t]}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="lx-inspector-row">
        <label className="inline">
          <input
            type="checkbox"
            checked={!!clip.muted}
            onChange={(e) => onChange({ muted: e.target.checked })}
          />
          Mute
        </label>
        <label className="inline">
          <input
            type="checkbox"
            checked={!!clip.locked}
            onChange={(e) => onChange({ locked: e.target.checked })}
          />
          Lock
        </label>
      </div>
    </aside>
  );
}
