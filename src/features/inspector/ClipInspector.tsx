import type { LyricClip } from '../../core/types/clip';
import type { LyricLayer } from '../../core/types/layer';
import { EmptyText, Group } from './InspectorPrimitives';

interface ClipInspectorProps {
  selectedClip: LyricClip | null;
  layers: LyricLayer[];
  onPatchClip: (patch: Partial<LyricClip>) => void;
  /** Clone this clip on the same layer (used for repeated verses/choruses). */
  onDuplicateClip?: (clipId: string) => void;
}

export function ClipInspector({
  selectedClip,
  layers,
  onPatchClip,
  onDuplicateClip
}: ClipInspectorProps) {
  if (!selectedClip) {
    return <EmptyText text="Select a clip to edit clip text, timing and override toggles." />;
  }

  return (
    <section className="insp-stack">
      <Group title="Basic" open>
        <label>
          Text
          <textarea
            className="form-control form-input"
            rows={3}
            value={selectedClip.text}
            onChange={(e) => onPatchClip({ text: e.target.value })}
          />
        </label>
        <label>
          Assigned layer
          <select
            className="form-control form-select"
            value={selectedClip.layerId}
            onChange={(e) => onPatchClip({ layerId: e.target.value })}
          >
            {layers.map(layer => (
              <option key={layer.id} value={layer.id}>{layer.name}</option>
            ))}
          </select>
        </label>
        {onDuplicateClip && (
          <button
            type="button"
            className="ls-btn small"
            onClick={() => onDuplicateClip(selectedClip.id)}
            title="Place a copy of this clip right after itself — handy for repeated verses or choruses."
            style={{ alignSelf: 'flex-start' }}
          >
            ⎘ Duplicate clip
          </button>
        )}
      </Group>

      <Group title="Timing" open>
        <div className="inspector-grid">
          <label>
            Start
            <input
              className="form-control form-input"
              type="number"
              step="0.01"
              value={Number(selectedClip.startTime.toFixed(2))}
              onChange={(e) => onPatchClip({
                startTime: Math.max(0, Math.min(selectedClip.endTime - 0.25, parseFloat(e.target.value) || 0))
              })}
            />
          </label>
          <label>
            End
            <input
              className="form-control form-input"
              type="number"
              step="0.01"
              value={Number(selectedClip.endTime.toFixed(2))}
              onChange={(e) => onPatchClip({
                endTime: Math.max(selectedClip.startTime + 0.25, parseFloat(e.target.value) || selectedClip.endTime)
              })}
            />
          </label>
        </div>
        <p className="insp-muted">
          Duration: {(selectedClip.endTime - selectedClip.startTime).toFixed(2)}s
        </p>
      </Group>

      <Group title="Advanced overrides">
        <p className="insp-muted">
          Toggle to override a config field per-clip. Use the Style / FX / Animation tabs to edit it once enabled.
        </p>
        <label className="tl-inline-check">
          <input
            type="checkbox"
            checked={!!selectedClip.forceTextRender}
            onChange={(e) => onPatchClip({ forceTextRender: e.target.checked || undefined })}
          />
          Force show text (overrides FX-layer suppression)
        </label>
        <label className="tl-inline-check">
          <input
            type="checkbox"
            checked={!!selectedClip.styleOverride}
            onChange={(e) => onPatchClip({ styleOverride: e.target.checked ? {} : undefined })}
          />
          Style override
        </label>
        <label className="tl-inline-check">
          <input
            type="checkbox"
            checked={!!selectedClip.animationOverride}
            onChange={(e) => onPatchClip({ animationOverride: e.target.checked ? {} : undefined })}
          />
          Animation override
        </label>
        <label className="tl-inline-check">
          <input
            type="checkbox"
            checked={!!selectedClip.fxOverride}
            onChange={(e) => onPatchClip({ fxOverride: e.target.checked ? {} : undefined })}
          />
          FX override
        </label>
      </Group>
    </section>
  );
}
