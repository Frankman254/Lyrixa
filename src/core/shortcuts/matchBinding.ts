import type { ShortcutBinding } from './types';

/** True when the keyboard event matches the binding's key + modifiers. */
export function matchBinding(event: KeyboardEvent, binding: ShortcutBinding): boolean {
  if (!sameKey(event.key, binding.key)) return false;
  if (!!binding.shift !== event.shiftKey) return false;
  if (!!binding.alt !== event.altKey) return false;
  const eventMeta = event.metaKey || event.ctrlKey;
  if (!!binding.ctrlOrMeta !== eventMeta) return false;
  return true;
}

function sameKey(a: string, b: string): boolean {
  if (a === b) return true;
  // Single-character keys are case-insensitive (Shift handled via modifier flag).
  if (a.length === 1 && b.length === 1) return a.toLowerCase() === b.toLowerCase();
  return false;
}

/**
 * Build a binding by reading an in-progress keydown event — used during the
 * shortcuts panel's rebind capture flow. Returns null for modifier-only presses
 * (Shift, Control, etc.) so the user can hold a modifier and tap the real key.
 */
export function bindingFromEvent(event: KeyboardEvent): ShortcutBinding | null {
  const key = event.key;
  if (key === 'Shift' || key === 'Control' || key === 'Alt' || key === 'Meta') return null;
  return {
    key: key.length === 1 ? key.toLowerCase() : key,
    shift: event.shiftKey || undefined,
    alt: event.altKey || undefined,
    ctrlOrMeta: event.metaKey || event.ctrlKey || undefined
  };
}

const KEY_LABELS: Record<string, string> = {
  ' ': 'Space',
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Backspace: '⌫',
  Enter: '↵',
  Escape: 'Esc'
};

/** Human-friendly label for a binding ("Shift+←", "Ctrl/Cmd+A"). */
export function formatBinding(binding: ShortcutBinding): string {
  const parts: string[] = [];
  if (binding.ctrlOrMeta) parts.push('Ctrl/⌘');
  if (binding.alt) parts.push('Alt');
  if (binding.shift) parts.push('Shift');
  parts.push(KEY_LABELS[binding.key] ?? (binding.key.length === 1 ? binding.key.toUpperCase() : binding.key));
  return parts.join(' + ');
}

/** True when two bindings would fire on the same event. */
export function bindingsConflict(a: ShortcutBinding, b: ShortcutBinding): boolean {
  return (
    sameKey(a.key, b.key) &&
    !!a.shift === !!b.shift &&
    !!a.alt === !!b.alt &&
    !!a.ctrlOrMeta === !!b.ctrlOrMeta
  );
}
