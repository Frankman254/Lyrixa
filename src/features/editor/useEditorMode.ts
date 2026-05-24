import { useCallback, useState } from 'react';

/**
 * Editor work modes — a UI workflow concept, separate from the render-time
 * `RenderMode` enum on the project. Picking a mode focuses the workspace on
 * one job at a time and hides controls that don't belong to it.
 *
 * - `sync`     — time lyric paragraphs onto a layer (hold-Space).
 * - `edit`     — drag/resize clips, nudge timings, manage selection.
 * - `style`    — pick visual presets, tweak text/animation/FX/textures.
 * - `preview`  — clean playback view, minimal UI.
 */
export type EditorMode = 'sync' | 'edit' | 'style' | 'preview';

const STORAGE_KEY = 'lyrixa.editorMode.v1';
const VALID: ReadonlySet<EditorMode> = new Set(['sync', 'edit', 'style', 'preview']);

function readStoredMode(): EditorMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && (VALID as Set<string>).has(raw)) return raw as EditorMode;
  } catch { /* ignore */ }
  return 'edit';
}

export interface UseEditorModeResult {
  mode: EditorMode;
  setMode: (next: EditorMode) => void;
  isSync: boolean;
  isEdit: boolean;
  isStyle: boolean;
  isPreview: boolean;
}

export function useEditorMode(): UseEditorModeResult {
  const [mode, setModeState] = useState<EditorMode>(readStoredMode);

  const setMode = useCallback((next: EditorMode) => {
    if (!(VALID as Set<string>).has(next)) return;
    setModeState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
  }, []);

  return {
    mode,
    setMode,
    isSync: mode === 'sync',
    isEdit: mode === 'edit',
    isStyle: mode === 'style',
    isPreview: mode === 'preview'
  };
}
