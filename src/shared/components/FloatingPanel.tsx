import { useRef, useState } from 'react';
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

function clampPos(p: Position, panelW: number): Position {
  return {
    x: Math.max(0, Math.min(window.innerWidth  - panelW, p.x)),
    y: Math.max(0, Math.min(window.innerHeight - 40,     p.y))
  };
}

interface FloatingPanelProps {
  /** localStorage key used to persist the panel position. */
  storageKey: string;
  /** Fallback position when nothing is stored yet. */
  defaultPosition?: Position;
  /** Fixed pixel width of the panel. */
  width?: number;
  /** Text shown in the drag-handle header. */
  title: string;
  /** Buttons rendered to the left of minimize/close in the header. */
  headerActions?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}

export function FloatingPanel({
  storageKey,
  defaultPosition,
  width = 320,
  title,
  headerActions,
  onClose,
  children
}: FloatingPanelProps) {
  const fallback: Position = defaultPosition ?? {
    x: window.innerWidth - width - 16,
    y: 16
  };

  const [pos, setPos] = useState<Position>(() => {
    const stored = readStoredPos(storageKey);
    return clampPos(stored ?? fallback, width);
  });

  const [minimized, setMinimized] = useState(false);

  const panelRef    = useRef<HTMLDivElement>(null);
  const posRef      = useRef<Position>(pos);
  posRef.current    = pos;          // always reflects latest render

  // ── Drag logic ────────────────────────────────────────
  const isDragging  = useRef(false);
  const dragOrigin  = useRef({ cx: 0, cy: 0, px: 0, py: 0 });

  const onHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
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
    const next: Position = {
      x: Math.max(0, Math.min(window.innerWidth  - panelW, px + e.clientX - cx)),
      y: Math.max(0, Math.min(window.innerHeight - panelH, py + e.clientY - cy))
    };
    setPos(next);
  };

  const onHeaderPointerUp = () => {
    if (!isDragging.current) return;
    isDragging.current = false;
    // Persist final position
    localStorage.setItem(storageKey, JSON.stringify(posRef.current));
  };

  return (
    <div
      ref={panelRef}
      className="floating-panel"
      style={{ left: pos.x, top: pos.y, width }}
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
          <button
            className="fp-btn"
            onClick={() => setMinimized(m => !m)}
            title={minimized ? 'Restore' : 'Minimize'}
          >
            {minimized ? '▲' : '▼'}
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
