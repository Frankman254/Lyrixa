import type {
  LyricLayerAudioReactive,
  LyricLayerAudioReactiveBandMode,
  LyricLayerAudioReactiveResponseMode,
  LyricLayerAudioReactiveSource
} from '../../core/types/layer';
import { DEFAULT_LAYER_AUDIO_REACTIVE } from '../../core/types/layer';

const REACTIVE_SOURCES: LyricLayerAudioReactiveSource[] = ['master', 'estimated'];
const REACTIVE_BANDS: LyricLayerAudioReactiveBandMode[] = [
  'full-mix',
  'vocals',
  'instrumental',
  'kick',
  'bass',
  'hihat'
];
const REACTIVE_RESPONSES: LyricLayerAudioReactiveResponseMode[] = ['envelope', 'peak'];
const REACTIVE_TARGETS = ['opacity', 'blur', 'glowIntensity', 'scale', 'offsetY'] as const;

interface LayerAudioReactiveEditorProps {
  value: LyricLayerAudioReactive | undefined;
  onChange: (next: LyricLayerAudioReactive | undefined) => void;
}

/**
 * Layer-level audio-reactive authoring.
 *
 * Lyrixa stores this config on the layer and exports it to renderer targets
 * such as LiveWallpaper. The editor keeps the controls explicit because these
 * values can affect several visual fields at once.
 */
export function LayerAudioReactiveEditor({ value, onChange }: LayerAudioReactiveEditorProps) {
  const reactive: LyricLayerAudioReactive = value ?? DEFAULT_LAYER_AUDIO_REACTIVE;
  const isPresent = !!value;

  const patch = (next: Partial<LyricLayerAudioReactive>) => {
    onChange({
      ...reactive,
      ...next,
      targets: { ...reactive.targets, ...(next.targets ?? {}) }
    });
  };

  if (!isPresent) {
    return (
      <div>
        <button
          type="button"
          className="ls-btn small"
          onClick={() => onChange({ ...DEFAULT_LAYER_AUDIO_REACTIVE, enabled: true })}
        >
          Enable audio-reactive on this layer
        </button>
      </div>
    );
  }

  return (
    <>
      <label className="tl-inline-check">
        <input
          type="checkbox"
          checked={reactive.enabled}
          onChange={(e) => patch({ enabled: e.target.checked })}
        />
        Drive this layer from audio
      </label>
      <div className="inspector-grid">
        <label>Source<select className="form-control form-select" value={reactive.source} onChange={(e) => patch({ source: e.target.value as LyricLayerAudioReactiveSource })}>{REACTIVE_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}</select></label>
        <label>Band<select className="form-control form-select" value={reactive.bandMode} onChange={(e) => patch({ bandMode: e.target.value as LyricLayerAudioReactiveBandMode })}>{REACTIVE_BANDS.map(b => <option key={b} value={b}>{b}</option>)}</select></label>
        <label>Response<select className="form-control form-select" value={reactive.responseMode} onChange={(e) => patch({ responseMode: e.target.value as LyricLayerAudioReactiveResponseMode })}>{REACTIVE_RESPONSES.map(r => <option key={r} value={r}>{r}</option>)}</select></label>
        <label className="tl-inline-check"><input type="checkbox" checked={reactive.invert} onChange={(e) => patch({ invert: e.target.checked })} />Invert</label>
      </div>
      <div className="inspector-grid">
        <label>Attack ms<input className="form-control form-input" type="number" min={0} max={4000} step={5} value={reactive.attackMs} onChange={(e) => { const n = parseFloat(e.target.value); if (Number.isFinite(n)) patch({ attackMs: n }); }} /></label>
        <label>Release ms<input className="form-control form-input" type="number" min={0} max={4000} step={5} value={reactive.releaseMs} onChange={(e) => { const n = parseFloat(e.target.value); if (Number.isFinite(n)) patch({ releaseMs: n }); }} /></label>
      </div>
      <label>Threshold ({reactive.threshold.toFixed(2)})<input className="form-range" type="range" min={0} max={1} step={0.01} value={reactive.threshold} onChange={(e) => patch({ threshold: parseFloat(e.target.value) })} /></label>
      <label>Softness ({reactive.softness.toFixed(2)})<input className="form-range" type="range" min={0} max={1} step={0.01} value={reactive.softness} onChange={(e) => patch({ softness: parseFloat(e.target.value) })} /></label>
      <details className="insp-group" open>
        <summary>Targets</summary>
        <div>
          {REACTIVE_TARGETS.map(key => {
            const target = reactive.targets[key];
            const enabled = !!target;
            const tValue = target ?? { amount: 1, min: 0, max: 1 };
            return (
              <div key={key}>
                <label className="tl-inline-check">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => {
                      const nextTargets = { ...reactive.targets };
                      if (e.target.checked) nextTargets[key] = tValue;
                      else delete nextTargets[key];
                      onChange({ ...reactive, targets: nextTargets });
                    }}
                  />
                  {key}
                </label>
                {enabled && (
                  <div className="inspector-grid">
                    <label>Amount<input className="form-control form-input" type="number" step="0.05" min={-4} max={4} value={tValue.amount} onChange={(e) => { const n = parseFloat(e.target.value); if (Number.isFinite(n)) onChange({ ...reactive, targets: { ...reactive.targets, [key]: { ...tValue, amount: n } } }); }} /></label>
                    <label>Min<input className="form-control form-input" type="number" step="0.05" value={tValue.min} onChange={(e) => { const n = parseFloat(e.target.value); if (Number.isFinite(n)) onChange({ ...reactive, targets: { ...reactive.targets, [key]: { ...tValue, min: n } } }); }} /></label>
                    <label>Max<input className="form-control form-input" type="number" step="0.05" value={tValue.max} onChange={(e) => { const n = parseFloat(e.target.value); if (Number.isFinite(n)) onChange({ ...reactive, targets: { ...reactive.targets, [key]: { ...tValue, max: n } } }); }} /></label>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </details>
      <button type="button" className="ls-btn small ghost" onClick={() => onChange(undefined)}>
        Remove audio-reactive
      </button>
    </>
  );
}
