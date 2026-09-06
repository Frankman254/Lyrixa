import type { ClipPositionPreset } from '../../core/types/clip';
import type { LyricLayer, LyricLayerRole } from '../../core/types/layer';
import { LYRIC_LAYER_ROLES, LYRIC_LAYER_ROLE_LABELS } from '../../core/types/layer';
import { EmptyText, Group } from './InspectorPrimitives';
import { LayerAudioReactiveEditor } from './LayerAudioReactiveEditor';

interface LayerInspectorProps {
  selectedLayer: LyricLayer | null;
  onPatchLayer: (patch: Partial<LyricLayer>) => void;
  onClearLayerClips?: (layerId: string) => void;
}

export function LayerInspector({
  selectedLayer,
  onPatchLayer,
  onClearLayerClips
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
        {/* Role and language are what a renderer reads to tell a translation
            from a backing vocal. Both stay optional: leaving them unset is a
            valid project, and an old file must never be forced to declare
            something its author never chose. */}
        <label>
          Role
          <select
            className="form-control form-select"
            value={selectedLayer.role ?? ''}
            onChange={(e) => onPatchLayer({
              role: e.target.value ? (e.target.value as LyricLayerRole) : undefined
            })}
          >
            <option value="">Not declared</option>
            {LYRIC_LAYER_ROLES.map(role => (
              <option key={role} value={role}>{LYRIC_LAYER_ROLE_LABELS[role]}</option>
            ))}
          </select>
        </label>
        <label>
          Language
          <input
            className="form-control form-input"
            value={selectedLayer.language ?? ''}
            placeholder="ja, es, ja-Latn…"
            onChange={(e) => onPatchLayer({ language: e.target.value.trim() || undefined })}
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

      <Group title="Rendering">
        <label className="tl-inline-check">
          <input
            type="checkbox"
            checked={!!selectedLayer.renderSettings?.suppressClipText}
            onChange={(e) => onPatchLayer({
              renderSettings: {
                positionPreset: selectedLayer.renderSettings?.positionPreset ?? 'center',
                ...selectedLayer.renderSettings,
                suppressClipText: e.target.checked
              }
            })}
          />
          Treat as FX accent (don't render clip text by default)
        </label>
      </Group>

      <Group title="Audio reactive">
        <LayerAudioReactiveEditor
          value={selectedLayer.audioReactive}
          onChange={(next) => onPatchLayer({ audioReactive: next })}
        />
      </Group>

      {onClearLayerClips && (
        <Group title="Danger zone">
          <button
            type="button"
            className="ls-btn small danger"
            onClick={() => {
              const confirmed = window.confirm(`Delete every clip from "${selectedLayer.name}"?`);
              if (confirmed) onClearLayerClips(selectedLayer.id);
            }}
          >
            Clear layer clips
          </button>
        </Group>
      )}
    </section>
  );
}
