import type { LyricLayer } from '../../core/types/layer';
import type { LyricClip } from '../../core/types/clip';
import './LayersSidebar.css';

interface LayersSidebarProps {
  layers: LyricLayer[];
  clips: LyricClip[];
  selectedLayerId: string | null;
  collapsed: boolean;
  waveformEnabled: boolean;
  previewVisible: boolean;
  onSelectLayer: (id: string) => void;
  onLayersChange: (next: LyricLayer[]) => void;
  onToggleCollapsed: () => void;
  onToggleWaveform: () => void;
  onTogglePreview: () => void;
}

/**
 * Left rail listing the project's layers. Drives the same `layers` state the
 * timeline uses — selecting a row also focuses the inspector on that layer.
 * Collapses to a 44px chrome strip when the user wants more stage room.
 */
export function LayersSidebar({
  layers,
  clips,
  selectedLayerId,
  collapsed,
  waveformEnabled,
  previewVisible,
  onSelectLayer,
  onLayersChange,
  onToggleCollapsed,
  onToggleWaveform,
  onTogglePreview
}: LayersSidebarProps) {
  const sortedLayers = [...layers].sort((a, b) => a.order - b.order);

  const toggleVisible = (id: string) => {
    onLayersChange(layers.map(l => (l.id === id ? { ...l, visible: !l.visible } : l)));
  };
  const toggleLocked = (id: string) => {
    onLayersChange(layers.map(l => (l.id === id ? { ...l, locked: !l.locked } : l)));
  };

  if (collapsed) {
    return (
      <aside className="ls-sidebar collapsed">
        <button
          type="button"
          className="ls-sidebar-collapse"
          onClick={onToggleCollapsed}
          title="Expand layers sidebar"
        >
          ▸
        </button>
      </aside>
    );
  }

  return (
    <aside className="ls-sidebar">
      <header className="ls-sidebar-header">
        <span className="label-eyebrow">Layers</span>
        <button
          type="button"
          className="ls-sidebar-collapse"
          onClick={onToggleCollapsed}
          title="Collapse layers sidebar"
        >
          ◂
        </button>
      </header>
      <div className="ls-sidebar-body">
        <div className="ls-sidebar-section">
          <div className="ls-sidebar-section-title">Tracks</div>
          <div className="ls-sidebar-rows">
            {sortedLayers.map(layer => {
              const clipCount = clips.filter(c => c.layerId === layer.id).length;
              const selected = selectedLayerId === layer.id;
              const hasState = !layer.visible || layer.locked;
              return (
                <div
                  key={layer.id}
                  role="button"
                  tabIndex={0}
                  className={`ls-layer-row ${selected ? 'selected' : ''} ${hasState ? 'has-state' : ''}`}
                  onClick={() => onSelectLayer(layer.id)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' && e.key !== ' ') return;
                    e.preventDefault();
                    onSelectLayer(layer.id);
                  }}
                >
                  <span className="ls-layer-swatch" style={{ background: layer.color }} />
                  <span className="ls-layer-name">{layer.name}</span>
                  <span className="ls-layer-meta mono">{clipCount}</span>
                  <span className="ls-layer-actions">
                    <button
                      type="button"
                      className={layer.visible ? 'on' : 'muted-icon'}
                      onClick={(e) => { e.stopPropagation(); toggleVisible(layer.id); }}
                      title={layer.visible ? 'Hide layer' : 'Show layer'}
                    >
                      {layer.visible ? '◉' : '◌'}
                    </button>
                    <button
                      type="button"
                      className={layer.locked ? 'on' : ''}
                      onClick={(e) => { e.stopPropagation(); toggleLocked(layer.id); }}
                      title={layer.locked ? 'Unlock' : 'Lock'}
                    >
                      {layer.locked ? '⊟' : '⊞'}
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="ls-sidebar-section ls-quick-section">
          <div className="ls-sidebar-section-title">Quick Access</div>
          <div className="ls-quick-actions">
            <button
              type="button"
              className={`ls-quick-action ${waveformEnabled ? 'active' : ''}`}
              onClick={onToggleWaveform}
              title={waveformEnabled
                ? 'Hide waveform and stop audio peak analysis'
                : 'Show waveform and allow audio peak analysis'}
            >
              <span className="ls-quick-icon" aria-hidden>≋</span>
              <span>
                <strong>Waveform</strong>
                <small>{waveformEnabled ? 'On' : 'Off'}</small>
              </span>
            </button>
            <button
              type="button"
              className={`ls-quick-action ${previewVisible ? 'active' : ''}`}
              onClick={onTogglePreview}
              title={previewVisible ? 'Hide floating preview' : 'Show floating preview'}
            >
              <span className="ls-quick-icon" aria-hidden>◉</span>
              <span>
                <strong>Preview</strong>
                <small>{previewVisible ? 'Shown' : 'Hidden'}</small>
              </span>
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
