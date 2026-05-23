import { useContext } from 'react';
import { ShortcutsContext, type ShortcutsContextValue } from './ShortcutsContext';

/** Read the live shortcut bindings + helpers from the surrounding provider. */
export function useShortcuts(): ShortcutsContextValue {
  const ctx = useContext(ShortcutsContext);
  if (!ctx) throw new Error('useShortcuts must be used inside <ShortcutsProvider>');
  return ctx;
}
