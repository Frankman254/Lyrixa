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
 * The full desktop transport bar needs ~1780px of width. Between the desktop
 * tier floor and that width the bar is "dense": low-priority clusters (Import
 * lyrics, Sync, Export, Preview, accent picker) collapse into the More menu.
 *
 * Keep these breakpoints in sync with the media queries in
 * `LyrixaEditorShell.css`.
 */
export type ViewportTier = 'mobile' | 'compact' | 'desktop';

export const MOBILE_MAX_WIDTH = 767;
export const COMPACT_MAX_WIDTH = 1179;
/** Below this width the desktop transport bar hides its low-priority clusters. */
export const DENSE_DESKTOP_MAX_WIDTH = 1779;

const MOBILE_QUERY = `(max-width: ${MOBILE_MAX_WIDTH}px)`;
const COMPACT_QUERY = `(max-width: ${COMPACT_MAX_WIDTH}px)`;
const DENSE_DESKTOP_QUERY = `(min-width: ${COMPACT_MAX_WIDTH + 1}px) and (max-width: ${DENSE_DESKTOP_MAX_WIDTH}px)`;

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

/** True while the viewport is in the desktop tier but too narrow for the full
 * transport bar (≈1180–1779px). Drives collapsing clusters into the More menu
 * and the `.transport-dense` compaction rules in `LyrixaEditorShell.css`. */
export function useIsDenseDesktop(): boolean {
  const [dense, setDense] = useState(
    () =>
      typeof window !== 'undefined' &&
      !!window.matchMedia &&
      window.matchMedia(DENSE_DESKTOP_QUERY).matches
  );

  useEffect(() => {
    const query = window.matchMedia(DENSE_DESKTOP_QUERY);
    const update = () => setDense(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return dense;
}
