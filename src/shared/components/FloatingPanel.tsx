import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import './FloatingPanel.css';

interface Position { x: number; y: number; }

function readStoredPos(key: string): Position | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const p = JSON.parse(raw) as unknown;
    if (
      p !== null &&
      typeof p === 'object' &&
      typeof (p as Record<string, unknown>).x === 'number' &&
      typeof (p as Record<string, unknown>).y === 'number'
    ) {
      return p as Position;
    }
  } catch { /* ignore */ }
  return null;
}

/**
 * The editor's transport bar (48px, z-index 300) paints ABOVE floating panels.
 * A panel that slides under it gets its header — and its close button —
 * covered by the bar, which then swallows every click. Keep panels below it.
 */
const TOP_INSET = 56;

function clampPos(p: Position, panelW: number, panelH = 40): Position {
  return {
    x: Math.max(0, Math.min(window.innerWidth  - panelW, p.x)),
    y: Math.max(TOP_INSET, Math.min(window.innerHeight - panelH, p.y))
  };
}

interface FloatingPanelProps {
  /** localStorage key used to persist the panel position. */
  storageKey: string;
  /** Fallback position when nothing is stored yet. */
  defaultPosition?: Position;
  /** Fixed pixel width of the panel (clamped to the viewport). */
  width?: number;
  /**
   * `floating` (default) — draggable panel with a persisted position.
   * `sheet` — docked full-width bottom sheet for small viewports; no drag.
   */
  variant?: 'floating' | 'sheet';
  /** Text shown in the drag-handle header. */
  title: string;
  /** Buttons rendered to the left of minimize/close in the header. */
  headerActions?: ReactNode;
  /** Enables a viewport-filling mode for small devices and focused work. */
  allowFullscreen?: boolean;
  /** Short label used when the panel is minimized into an edge tab. */
  edgeTabLabel?: string;
  onClose: () => void;
  children: ReactNode;
}

export function FloatingPanel({
  storageKey,
  defaultPosition,
  width = 320,
  variant = 'floating',
  title,
  headerActions,
  allowFullscreen = false,
  edgeTabLabel,
  onClose,
  children
}: FloatingPanelProps) {
  const isSheet = variant === 'sheet';
  const fallback: Position = defaultPosition ?? {
    x: window.innerWidth - width - 16,
    y: TOP_INSET + 8
  };

  const [pos, setPos] = useState<Position>(() => {
    const stored = readStoredPos(storageKey);
    return clampPos(stored ?? fallback, width);
  });

  const [minimized, setMinimized] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const panelRef    = useRef<HTMLDivElement>(null);
  const posRef      = useRef<Position>(pos);
  useEffect(() => {
    posRef.current = pos;
  }, [pos]);

  const clampToCurrentViewport = useCallback(() => {
    if (isSheet || fullscreen) return;
    setPos(p => clampPos(
      p,
      panelRef.current?.offsetWidth ?? width,
      panelRef.current?.offsetHeight ?? 40
    ));
  }, [fullscreen, isSheet, width]);

  // Keep the panel inside the viewport when the window shrinks or rotates.
  useEffect(() => {
    if (isSheet || fullscreen) return;
    const onResize = () => {
      clampToCurrentViewport();
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, [clampToCurrentViewport, fullscreen, isSheet, width]);

  useLayoutEffect(() => {
    clampToCurrentViewport();
  }, [clampToCurrentViewport]);

  // ── Drag logic ────────────────────────────────────────
  const isDragging  = useRef(false);
  const dragOrigin  = useRef({ cx: 0, cy: 0, px: 0, py: 0 });

  const onHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isSheet || fullscreen) return;
    if (e.button !== 0) return;
    // Don't intercept clicks that originate on a button inside the header.
    // Calling preventDefault on pointerdown suppresses the subsequent click
    // event on child elements, which silences close/minimize/expand buttons.
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    isDragging.current = true;
    dragOrigin.current = {
      cx: e.clientX,
      cy: e.clientY,
      px: posRef.current.x,
      py: posRef.current.y
    };
    // Pointer capture keeps move/up firing even when pointer leaves the header
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onHeaderPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;
    const { cx, cy, px, py } = dragOrigin.current;
    const panelW = panelRef.current?.offsetWidth  ?? width;
    const panelH = panelRef.current?.offsetHeight ?? 40;
    const next = clampPos(
      { x: px + e.clientX - cx, y: py + e.clientY - cy },
      panelW,
      panelH
    );
    posRef.current = next;
    setPos(next);
  };

  const onHeaderPointerUp = () => {
    if (!isDragging.current) return;
    isDragging.current = false;
    // Persist final position
    localStorage.setItem(storageKey, JSON.stringify(posRef.current));
  };

  if (minimized) {
    return (
      <button
        type="button"
        className={`fp-edge-tab ${isSheet ? 'sheet' : ''}`}
        onClick={() => setMinimized(false)}
        title={`Restore ${title}`}
        aria-label={`Restore ${title}`}
      >
        <span>{edgeTabLabel ?? title}</span>
      </button>
    );
  }

  return (
    <div
      ref={panelRef}
      className={`floating-panel ${isSheet ? 'sheet' : ''} ${fullscreen ? 'fullscreen' : ''}`}
      style={isSheet || fullscreen
        ? undefined
        : { left: pos.x, top: pos.y, width: Math.min(width, window.innerWidth - 16) }}
    >
      <div
        className="fp-header"
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={onHeaderPointerUp}
        onPointerCancel={onHeaderPointerUp}
      >
        <span className="fp-title">{title}</span>
        <div className="fp-header-actions">
          {headerActions}
          {allowFullscreen && (
            <button
              className="fp-btn"
              onClick={() => setFullscreen(current => !current)}
              title={fullscreen ? 'Exit full screen' : 'Full screen'}
              aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}
            >
              {fullscreen ? '⤡' : '⤢'}
            </button>
          )}
          <button
            className="fp-btn"
            onClick={() => setMinimized(m => !m)}
            title="Hide to edge"
          >
            ◂
          </button>
          <button className="fp-btn" onClick={onClose} title="Close">
            ✕
          </button>
        </div>
      </div>

      {!minimized && (
        <div className="fp-body">
          {children}
        </div>
      )}
    </div>
  );
}
