import { useCallback, useEffect, useState } from 'react';

/**
 * Accent palette. Each entry maps to a set of CSS custom properties
 * (`--accent`, `--accent-strong`, `--accent-soft`, `--accent-fg`) that the
 * rest of the app reads from. Default is `amber` to match the redesign.
 */
export type AccentName = 'amber' | 'teal' | 'magenta' | 'lime';

export const ACCENT_OPTIONS: ReadonlyArray<{ value: AccentName; label: string; swatch: string }> = [
  { value: 'amber', label: 'Amber', swatch: 'oklch(0.82 0.155 75)' },
  { value: 'teal', label: 'Teal', swatch: 'oklch(0.80 0.13 195)' },
  { value: 'magenta', label: 'Magenta', swatch: 'oklch(0.74 0.20 350)' },
  { value: 'lime', label: 'Lime', swatch: 'oklch(0.86 0.18 130)' }
];

interface AccentPalette {
  accent: string;
  strong: string;
  soft: string;
  fg: string;
}

const PALETTES: Record<AccentName, AccentPalette> = {
  amber: {
    accent: 'oklch(0.82 0.155 75)',
    strong: 'oklch(0.85 0.18 75)',
    soft: 'oklch(0.82 0.155 75 / 0.14)',
    fg: 'oklch(0.20 0.04 75)'
  },
  teal: {
    accent: 'oklch(0.80 0.13 195)',
    strong: 'oklch(0.83 0.15 195)',
    soft: 'oklch(0.80 0.13 195 / 0.14)',
    fg: 'oklch(0.18 0.04 195)'
  },
  magenta: {
    accent: 'oklch(0.74 0.20 350)',
    strong: 'oklch(0.78 0.22 350)',
    soft: 'oklch(0.74 0.20 350 / 0.14)',
    fg: 'oklch(0.18 0.04 350)'
  },
  lime: {
    accent: 'oklch(0.86 0.18 130)',
    strong: 'oklch(0.89 0.20 130)',
    soft: 'oklch(0.86 0.18 130 / 0.14)',
    fg: 'oklch(0.20 0.04 130)'
  }
};

const STORAGE_KEY = 'lyrixa_accent';
const DEFAULT_ACCENT: AccentName = 'amber';

function readStoredAccent(): AccentName {
  if (typeof window === 'undefined') return DEFAULT_ACCENT;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw && raw in PALETTES) return raw as AccentName;
  } catch { /* ignore */ }
  return DEFAULT_ACCENT;
}

/**
 * Apply the accent palette to :root and persist the choice. Mount this
 * hook once near the app root — repeated mounts are idempotent.
 */
export function useAccentTheme(): {
  accent: AccentName;
  setAccent: (next: AccentName) => void;
} {
  const [accent, setAccentState] = useState<AccentName>(() => readStoredAccent());

  useEffect(() => {
    const palette = PALETTES[accent];
    const root = document.documentElement;
    root.style.setProperty('--accent', palette.accent);
    root.style.setProperty('--accent-strong', palette.strong);
    root.style.setProperty('--accent-soft', palette.soft);
    root.style.setProperty('--accent-fg', palette.fg);
  }, [accent]);

  const setAccent = useCallback((next: AccentName) => {
    setAccentState(next);
    try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
  }, []);

  return { accent, setAccent };
}
