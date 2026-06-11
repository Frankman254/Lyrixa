import { useEffect, useState } from 'react';

/**
 * Viewport tiers drive how the editor shell lays itself out:
 *
 * - `desktop` (≥1180px) — persistent 3-column grid: sidebar | stage | inspector.
 * - `compact` (768–1179px) — stage takes the full width; sidebar and inspector
 *   become overlay drawers toggled from the top bar.
 * - `mobile`  (<768px) — single column guided by the editor mode; the mode
 *   switcher moves to a bottom navigation bar and panels open as sheets.
 *
 * Keep these breakpoints in sync with the media queries in
 * `LyrixaEditorShell.css`.
 */
export type ViewportTier = 'mobile' | 'compact' | 'desktop';

export const MOBILE_MAX_WIDTH = 767;
export const COMPACT_MAX_WIDTH = 1179;

const MOBILE_QUERY = `(max-width: ${MOBILE_MAX_WIDTH}px)`;
const COMPACT_QUERY = `(max-width: ${COMPACT_MAX_WIDTH}px)`;

function readTier(): ViewportTier {
  if (typeof window === 'undefined' || !window.matchMedia) return 'desktop';
  if (window.matchMedia(MOBILE_QUERY).matches) return 'mobile';
  if (window.matchMedia(COMPACT_QUERY).matches) return 'compact';
  return 'desktop';
}

export function useViewportTier(): ViewportTier {
  const [tier, setTier] = useState<ViewportTier>(readTier);

  useEffect(() => {
    const queries = [window.matchMedia(MOBILE_QUERY), window.matchMedia(COMPACT_QUERY)];
    const update = () => setTier(readTier());
    for (const q of queries) q.addEventListener('change', update);
    return () => {
      for (const q of queries) q.removeEventListener('change', update);
    };
  }, []);

  return tier;
}
