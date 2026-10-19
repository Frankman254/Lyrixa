import { useEffect, useRef } from 'react';

interface ClipTextEditorProps {
  initialText: string;
  /** Left edge in lane pixels (the clip's left). */
  left: number;
  /** The clip's width; the editor never gets narrower than its minimum. */
  width: number;
  onCommit: (text: string) => void;
  onCancel: () => void;
}

/**
 * Inline text box drawn over a clip while it is being typed into.
 *
 * Enter commits, Shift+Enter adds a line break, Esc cancels, and leaving the
 * box commits — the usual spreadsheet-cell contract, so pasting a line and
 * clicking elsewhere never loses it. It lives in the lane, not inside the
 * clip: the clip clips its overflow and a short clip would hide the box.
 */
export function ClipTextEditor({ initialText, left, width, onCommit, onCancel }: ClipTextEditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  // Enter and Esc both end editing, and the blur that follows unmounting must
  // not commit a second time (or commit after a cancel).
  const doneRef = useRef(false);

  // Focus in the next task: a double press mounts the box during the clip's
  // pointerdown, and the browser's mousedown focus (on the clip) lands after
  // that — focusing now would be undone at once, and the blur would commit.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const el = ref.current;
      if (!el || doneRef.current) return;
      el.focus();
      el.select();
    });
    return () => window.clearTimeout(timer);
  }, []);

  const finish = (commit: boolean) => {
    if (doneRef.current) return;
    doneRef.current = true;
    if (commit) onCommit(ref.current?.value ?? initialText);
    else onCancel();
  };

  return (
    <textarea
      ref={ref}
      className="tl-clip-editor"
      style={{ left: `${left}px`, width: `${Math.max(width, 260)}px` }}
      defaultValue={initialText}
      placeholder="Type or paste the line…"
      aria-label="Clip text"
      rows={1}
      onPointerDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
      onDoubleClick={e => e.stopPropagation()}
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          finish(true);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          finish(false);
        }
      }}
      onBlur={() => finish(true)}
    />
  );
}
