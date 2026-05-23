import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { SHORTCUT_BY_ID, SHORTCUT_DEFINITIONS } from '../../core/shortcuts/registry';
import { matchBinding } from '../../core/shortcuts/matchBinding';
import type { ShortcutBinding, ShortcutBindings, ShortcutDefinition } from '../../core/shortcuts/types';

const STORAGE_KEY = 'lyrixa.shortcuts.v1';

interface ShortcutsContextValue {
  /** Every shortcut definition, in declaration order. */
  definitions: ShortcutDefinition[];
  /** Effective bindings (user overrides merged on top of defaults). */
  bindings: ShortcutBindings;
  /** True when the supplied event matches the shortcut id's binding. */
  matches: (event: KeyboardEvent, id: string) => boolean;
  /** Replace a single shortcut's binding. */
  setBinding: (id: string, binding: ShortcutBinding) => void;
  /** Restore the default binding for one shortcut. */
  resetBinding: (id: string) => void;
  /** Restore every shortcut to its default. */
  resetAll: () => void;
  /** Any other shortcut ids whose binding equals this id's binding (for conflict UI). */
  conflictsFor: (id: string) => string[];
}

// eslint-disable-next-line react-refresh/only-export-components
export const ShortcutsContext = createContext<ShortcutsContextValue | null>(null);

export type { ShortcutsContextValue };

function loadOverrides(): Partial<ShortcutBindings> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Partial<ShortcutBindings> = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue;
      const v = value as Record<string, unknown>;
      if (typeof v.key !== 'string') continue;
      out[id] = {
        key: v.key,
        shift: v.shift === true || undefined,
        alt: v.alt === true || undefined,
        ctrlOrMeta: v.ctrlOrMeta === true || undefined
      };
    }
    return out;
  } catch {
    return {};
  }
}

function persistOverrides(overrides: Partial<ShortcutBindings>): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    /* ignore quota errors */
  }
}

export function ShortcutsProvider({ children }: { children: ReactNode }) {
  const [overrides, setOverrides] = useState<Partial<ShortcutBindings>>(() => loadOverrides());

  const bindings = useMemo<ShortcutBindings>(() => {
    const merged: ShortcutBindings = {};
    for (const def of SHORTCUT_DEFINITIONS) {
      merged[def.id] = overrides[def.id] ?? def.default;
    }
    return merged;
  }, [overrides]);

  // Keep a ref so the matches() callback stays stable for downstream effects.
  const bindingsRef = useRef(bindings);
  useEffect(() => { bindingsRef.current = bindings; }, [bindings]);

  const matches = useCallback((event: KeyboardEvent, id: string) => {
    const binding = bindingsRef.current[id];
    if (!binding) return false;
    return matchBinding(event, binding);
  }, []);

  const setBinding = useCallback((id: string, binding: ShortcutBinding) => {
    if (!SHORTCUT_BY_ID[id]) return;
    setOverrides(prev => {
      const next = { ...prev, [id]: binding };
      persistOverrides(next);
      return next;
    });
  }, []);

  const resetBinding = useCallback((id: string) => {
    setOverrides(prev => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      persistOverrides(next);
      return next;
    });
  }, []);

  const resetAll = useCallback(() => {
    setOverrides({});
    persistOverrides({});
  }, []);

  const conflictsFor = useCallback((id: string): string[] => {
    const b = bindings[id];
    if (!b) return [];
    const out: string[] = [];
    for (const def of SHORTCUT_DEFINITIONS) {
      if (def.id === id) continue;
      const other = bindings[def.id];
      if (!other) continue;
      if (
        other.key === b.key &&
        !!other.shift === !!b.shift &&
        !!other.alt === !!b.alt &&
        !!other.ctrlOrMeta === !!b.ctrlOrMeta
      ) {
        out.push(def.id);
      }
    }
    return out;
  }, [bindings]);

  const value: ShortcutsContextValue = useMemo(() => ({
    definitions: SHORTCUT_DEFINITIONS,
    bindings,
    matches,
    setBinding,
    resetBinding,
    resetAll,
    conflictsFor
  }), [bindings, matches, setBinding, resetBinding, resetAll, conflictsFor]);

  return <ShortcutsContext.Provider value={value}>{children}</ShortcutsContext.Provider>;
}

