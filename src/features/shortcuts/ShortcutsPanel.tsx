import { useEffect, useMemo, useState } from 'react';
import { FloatingPanel } from '../../shared/components/FloatingPanel';
import { bindingFromEvent, formatBinding } from '../../core/shortcuts/matchBinding';
import { SHORTCUT_BY_ID } from '../../core/shortcuts/registry';
import { useShortcuts } from './useShortcuts';
import './ShortcutsPanel.css';

const STORAGE_KEY = 'lyrixa_shortcuts_panel_pos';

interface ShortcutsPanelProps {
  open: boolean;
  onClose: () => void;
}

export function ShortcutsPanel({ open, onClose }: ShortcutsPanelProps) {
  const { definitions, bindings, setBinding, resetBinding, resetAll, conflictsFor } = useShortcuts();
  const [capturingId, setCapturingId] = useState<string | null>(null);

  // Group by category for display.
  const groups = useMemo(() => {
    const map = new Map<string, typeof definitions>();
    for (const def of definitions) {
      const arr = map.get(def.group) ?? [];
      arr.push(def);
      map.set(def.group, arr);
    }
    return Array.from(map.entries());
  }, [definitions]);

  // While capturing, the next non-modifier keydown becomes the new binding.
  useEffect(() => {
    if (!capturingId) return;
    const onKey = (e: KeyboardEvent) => {
      // Esc cancels capture without changing the binding.
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setCapturingId(null);
        return;
      }
      const next = bindingFromEvent(e);
      if (!next) return; // pure modifier — keep waiting
      e.preventDefault();
      e.stopPropagation();
      setBinding(capturingId, next);
      setCapturingId(null);
    };
    // Capture-phase so we beat the app's own shortcut handlers.
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true } as AddEventListenerOptions);
  }, [capturingId, setBinding]);

  if (!open) return null;

  return (
    <FloatingPanel
      storageKey={STORAGE_KEY}
      width={520}
      defaultPosition={{ x: 80, y: 80 }}
      title="⌨ Keyboard shortcuts"
      headerActions={
        <button className="fp-btn" onClick={resetAll} title="Restore every shortcut to its default">
          Reset all
        </button>
      }
      onClose={onClose}
    >
      <div className="shortcuts-body">
        <p className="shortcuts-hint">
          Click a row to rebind. Press the new key (with optional Shift / Alt / Ctrl-or-⌘).
          Press <kbd>Esc</kbd> to cancel a rebind.
        </p>
        {groups.map(([group, defs]) => (
          <section key={group} className="shortcuts-group">
            <h3>{group}</h3>
            <ul>
              {defs.map(def => {
                const binding = bindings[def.id];
                const conflicts = conflictsFor(def.id);
                const isCapturing = capturingId === def.id;
                const isDefault =
                  binding.key === SHORTCUT_BY_ID[def.id]!.default.key &&
                  !!binding.shift === !!SHORTCUT_BY_ID[def.id]!.default.shift &&
                  !!binding.alt === !!SHORTCUT_BY_ID[def.id]!.default.alt &&
                  !!binding.ctrlOrMeta === !!SHORTCUT_BY_ID[def.id]!.default.ctrlOrMeta;
                return (
                  <li key={def.id} className="shortcut-row">
                    <div className="shortcut-row-text">
                      <span className="shortcut-row-label">{def.label}</span>
                      {def.description && (
                        <span className="shortcut-row-desc">{def.description}</span>
                      )}
                      {conflicts.length > 0 && !isCapturing && (
                        <span className="shortcut-row-conflict">
                          ⚠ same key as: {conflicts.map(id => SHORTCUT_BY_ID[id]?.label).filter(Boolean).join(', ')}
                        </span>
                      )}
                    </div>
                    <div className="shortcut-row-actions">
                      <button
                        type="button"
                        className={`shortcut-chip ${isCapturing ? 'is-capturing' : ''}`}
                        onClick={() => setCapturingId(isCapturing ? null : def.id)}
                        title={isCapturing ? 'Press any key to bind, Esc to cancel' : 'Click to rebind'}
                      >
                        {isCapturing ? 'Press a key…' : formatBinding(binding)}
                      </button>
                      {!isDefault && (
                        <button
                          type="button"
                          className="shortcut-reset"
                          onClick={() => resetBinding(def.id)}
                          title="Restore default"
                        >
                          ↺
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </FloatingPanel>
  );
}
