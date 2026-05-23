/**
 * Shortcut data model (pure).
 *
 * A binding is a single key plus optional modifiers. `ctrlOrMeta` matches
 * either Ctrl (Win/Linux) or ⌘ (macOS) so the same definition feels native
 * on both platforms.
 */

export interface ShortcutBinding {
  /** The KeyboardEvent.key value — e.g. ' ', 'a', 'ArrowLeft', 'Backspace'. */
  key: string;
  shift?: boolean;
  alt?: boolean;
  ctrlOrMeta?: boolean;
}

export type ShortcutGroup = 'Transport' | 'Sync' | 'Timeline' | 'Clip' | 'General';

export interface ShortcutDefinition {
  id: string;
  label: string;
  description?: string;
  group: ShortcutGroup;
  default: ShortcutBinding;
  /**
   * Whether the action should fire on key-repeat events too. Defaults to false
   * so a held key doesn't spam the action (matters for tap-sync hold).
   */
  allowRepeat?: boolean;
}

export type ShortcutBindings = Record<string, ShortcutBinding>;
