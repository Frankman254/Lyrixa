
import type { LyricVisualStyle, RenderMode } from '../../core/types/render';
import './EditorControls.css';

interface EditorControlsProps {
  styleConfig: LyricVisualStyle;
  onStyleChange: (style: LyricVisualStyle) => void;
  renderMode: RenderMode;
  onRenderModeChange: (mode: RenderMode) => void;
  isPlaying: boolean;
  onPlayToggle: () => void;
  onReset: () => void;
  onToggleTrack: () => void;
  trackName: string;
}

export function EditorControls({
  styleConfig,
  onStyleChange,
  renderMode,
  onRenderModeChange,
  isPlaying,
  onPlayToggle,
  onReset,
  onToggleTrack,
  trackName
}: EditorControlsProps) {

  const handleStyleChange = (key: keyof LyricVisualStyle, value: string | number | boolean) => {
    onStyleChange({ ...styleConfig, [key]: value });
  };

  return (
    <div className="editor-controls-panel glass-panel">
      
      <div className="editor-section">
        <h3 className="section-title">Mode & Track</h3>
        <div className="control-row">
          <select 
            value={renderMode}
            onChange={(e) => onRenderModeChange(e.target.value as RenderMode)}
            className="editor-select"
          >
            <option value="player">Player Mode</option>
            <option value="editor">Editor Mode</option>
            <option value="overlay-preview">Overlay Preview</option>
            <option value="sync-recorder">Sync Recorder</option>
          </select>
          <button className="editor-btn" onClick={onToggleTrack}>
            Track: {trackName}
          </button>
        </div>
        <div className="control-row">
          <button className={`editor-btn primary ${isPlaying ? 'active' : ''}`} onClick={onPlayToggle}>
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          <button className="editor-btn" onClick={onReset}>
            Reset
          </button>
        </div>
      </div>

      <div className="editor-section">
        <h3 className="section-title">Visual Style</h3>
        
        <div className="control-group">
          <label>Font Size</label>
          <div className="control-row">
            <input 
              type="text" 
              value={styleConfig.fontSize}
              onChange={(e) => handleStyleChange('fontSize', e.target.value)}
              className="editor-input"
            />
          </div>
        </div>

        <div className="control-group">
          <label>Active Text Color</label>
          <div className="control-row">
            <input 
              type="color" 
              value={styleConfig.activeTextColor}
              onChange={(e) => handleStyleChange('activeTextColor', e.target.value)}
              className="color-picker"
            />
            <span className="color-value">{styleConfig.activeTextColor}</span>
          </div>
        </div>

        <div className="control-group">
          <label>Inactive Text Color</label>
          <div className="control-row">
            <input 
              type="text" 
              value={styleConfig.textColor}
              onChange={(e) => handleStyleChange('textColor', e.target.value)}
              className="editor-input"
            />
          </div>
        </div>

        <div className="control-group">
          <label>Glow Color</label>
          <div className="control-row">
            <input 
              type="color" 
              value={styleConfig.glowColor.startsWith('#') ? styleConfig.glowColor : '#ffffff'}
              onChange={(e) => handleStyleChange('glowColor', e.target.value)}
              className="color-picker"
            />
            <span className="color-value">{styleConfig.glowColor}</span>
          </div>
        </div>

        <div className="control-group">
          <label>Shadow Intensity</label>
          <input 
            type="range" 
            min="0" max="2" step="0.1"
            value={styleConfig.shadowIntensity}
            onChange={(e) => handleStyleChange('shadowIntensity', parseFloat(e.target.value))}
            className="editor-slider"
          />
        </div>

        <div className="control-group">
          <label>Blur Amount</label>
          <input 
            type="range" 
            min="0" max="10" step="0.5"
            value={styleConfig.blurAmount}
            onChange={(e) => handleStyleChange('blurAmount', parseFloat(e.target.value))}
            className="editor-slider"
          />
        </div>

        <div className="control-group checkbox">
          <label>
            <input 
              type="checkbox" 
              checked={styleConfig.backgroundEmphasis}
              onChange={(e) => handleStyleChange('backgroundEmphasis', e.target.checked)}
            />
            Emphasize Active Line Background
          </label>
        </div>

      </div>
    </div>
  );
}
