import { useEffect, useState } from 'react';
import type { LyricLayer } from '../../../core/types/layer';
import './Inspectors.css';

interface LayerInspectorProps {
  layers: LyricLayer[];
  /** Optional id of the layer to focus initially (e.g. selected clip's layer). */
  activeLayerId?: string | null;
  onLayerChange: (layerId: string, patch: Partial<LyricLayer>) => void;
}

export function LayerInspector({ layers, activeLayerId, onLayerChange }: LayerInspectorProps) {
  const fallbackId = layers[0]?.id ?? null;
  const [editingId, setEditingId] = useState<string | null>(activeLayerId ?? fallbackId);

  // Snap the picker back to the externally-driven active layer when the
  // selected clip changes — keeps the inspector in sync with the timeline.
  useEffect(() => {
    if (activeLayerId && activeLayerId !== editingId) {
      setEditingId(activeLayerId);
    }
  }, [activeLayerId, editingId]);

  const layer = layers.find(l => l.id === editingId) ?? null;

  return (
    <aside className="lx-inspector">
      <h3>Layer</h3>
      {layers.length === 0 ? (
        <span className="lx-inspector-empty">No layers in this project.</span>
      ) : (
        <>
          <label>
            Editing
            <select
              value={editingId ?? ''}
              onChange={(e) => setEditingId(e.target.value)}
            >
              {layers.map(l => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </label>
          {layer && (
            <>
              <label>
                Name
                <input
                  type="text"
                  value={layer.name}
                  onChange={(e) => onLayerChange(layer.id, { name: e.target.value })}
                />
              </label>
              <div className="lx-inspector-row">
                <label>
                  Color
                  <input
                    type="color"
                    value={layer.color}
                    onChange={(e) => onLayerChange(layer.id, { color: e.target.value })}
                  />
                </label>
                <label>
                  Order
                  <input
                    type="number"
                    step="1"
                    value={layer.order}
                    onChange={(e) => {
                      const next = parseInt(e.target.value, 10);
                      if (!Number.isFinite(next)) return;
                      onLayerChange(layer.id, { order: next });
                    }}
                  />
                </label>
              </div>
              <div className="lx-inspector-row">
                <label className="inline">
                  <input
                    type="checkbox"
                    checked={layer.visible}
                    onChange={(e) => onLayerChange(layer.id, { visible: e.target.checked })}
                  />
                  Visible
                </label>
                <label className="inline">
                  <input
                    type="checkbox"
                    checked={layer.locked}
                    onChange={(e) => onLayerChange(layer.id, { locked: e.target.checked })}
                  />
                  Locked
                </label>
              </div>
            </>
          )}
        </>
      )}
    </aside>
  );
}
