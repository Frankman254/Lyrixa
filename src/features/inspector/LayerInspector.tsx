import type { ClipPositionPreset } from '../../core/types/clip';
import type { LyricLayer } from '../../core/types/layer';
import { EmptyText, Group } from './InspectorPrimitives';
import { LayerAudioReactiveEditor } from './LayerAudioReactiveEditor';

interface LayerInspectorProps {
  selectedLayer: LyricLayer | null;
  onPatchLayer: (patch: Partial<LyricLayer>) => void;
}

export function LayerInspector({
  selectedLayer,
  onPatchLayer
}: LayerInspectorProps) {
  if (!selectedLayer) {
    return <EmptyText text="Select a layer to edit layer defaults." />;
  }

  return (
    <section className="insp-stack">
      <Group title="Basic" open>
        <label>
          Name
          <input
            className="form-control form-input"
            value={selectedLayer.name}
            onChange={(e) => onPatchLayer({ name: e.target.value })}
          />
        </label>
        <label>
          Default position
          <select
            className="form-control form-select"
            value={selectedLayer.renderSettings?.positionPreset ?? 'center'}
            onChange={(e) => onPatchLayer({
              renderSettings: {
                ...selectedLayer.renderSettings,
                positionPreset: e.target.value as ClipPositionPreset
              }
            })}
          >
            {['center', 'top', 'bottom', 'top-left', 'top-right', 'bottom-left', 'bottom-right'].map(pos => (
              <option key={pos} value={pos}>{pos}</option>
            ))}
          </select>
        </label>
      </Group>

      <Group title="Audio reactive">
        <LayerAudioReactiveEditor
          value={selectedLayer.audioReactive}
          onChange={(next) => onPatchLayer({ audioReactive: next })}
        />
      </Group>
    </section>
  );
}
