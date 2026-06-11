import { EDITOR_MODES, MODE_ICONS, MODE_LABELS, MODE_TITLES } from './useEditorMode';
import type { EditorMode } from './useEditorMode';

interface EditorModeNavProps {
  mode: EditorMode;
  onModeChange: (next: EditorMode) => void;
}

/**
 * Mobile-only bottom navigation. Replaces the top-bar mode switcher on small
 * viewports so the primary workflow (sync / edit / style / preview) stays
 * reachable with a thumb.
 */
export function EditorModeNav({ mode, onModeChange }: EditorModeNavProps) {
  return (
    <nav className="editor-mode-nav" role="tablist" aria-label="Editor mode">
      {EDITOR_MODES.map(m => (
        <button
          key={m}
          type="button"
          role="tab"
          aria-selected={mode === m}
          className={`mode-nav-tab ${mode === m ? 'active' : ''}`}
          onClick={() => onModeChange(m)}
          title={MODE_TITLES[m]}
        >
          <span className="mode-nav-icon" aria-hidden>{MODE_ICONS[m]}</span>
          <span className="mode-nav-label">{MODE_LABELS[m]}</span>
        </button>
      ))}
    </nav>
  );
}
