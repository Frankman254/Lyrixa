# Lyrixa Architecture

This document is the working map for the editor codebase. Keep it updated when moving ownership between modules.

## High-level model

Lyrixa is split into two layers:

- `src/core`: pure TypeScript domain code. No React, DOM, CSS, localStorage, IndexedDB, or browser object URLs.
- `src/features`: React UI and browser integration. File inputs, IndexedDB, object URLs, playback, preview rendering, and CSS live here.

The central data object is `LyrixaProject`. UI code edits this object, then the preview/timeline render from it.

## Main editor flow

1. `src/features/editor/LyrixaEditorShell.tsx` composes the editor workspace.
2. `useLyrixaProject` owns the in-memory project state and persistence.
3. `usePlaybackController` owns transport time, play/pause, and seek state.
4. `useProjectImportExport` owns project and lyrics bundle import/export file workflows.
5. `TimelineEditor` owns timeline viewport interactions: selection, drag, resize, nudge, snapping, minimap, and waveform lanes.
6. `InspectorPanel` owns context-aware editing for project, layer, clip, style, texture, FX, and animation.
7. `ClipLyricsRenderer` resolves final visual settings and renders active lyric clips in previews.

## Workspace zones

- Top transport: `EditorTopBar`, `EditorPlaybackControls`, `EditorHiddenFileInputs`.
- Alerts/status: `EditorAlerts`.
- Timeline: `TimelineEditor`, `TimelineToolbar`, `TimelineSelectionToolbar`, `TimelineAudioLanes`, `TimelineLayerList`, `TimelineMinimap`.
- Inspector: `src/features/inspector/*Inspector.tsx`.
- Preview: `FloatingPreview`, `MiniPreview`, and lyrics renderer components.

The timeline should not open separate style inspectors. It reports selection to the shell, and the right inspector edits that selected context.

## Visual style inheritance

Final render settings are resolved in this order:

```text
project defaults -> layer defaults -> clip overrides
```

Core resolver ownership:

- Types/defaults: `src/core/types/render.ts` and `src/core/types/texture.ts`.
- Pure resolution: `src/core/render/resolveVisualStyle.ts`.
- Serialization normalization: `src/core/project/serialization.ts`.

Do not duplicate merge logic in UI components. UI components may decide which scope they are editing, but final visual values should come from the resolver helpers.

## Inspector ownership

`InspectorPanel` is the coordinator. It determines:

- selected clip
- selected layer
- active edit scope
- resolved style/FX/animation targets
- patch functions for project, layer, and clip

Each tab owns only its form controls:

- `ProjectInspector`: project name, import/export entry points, global preview defaults.
- `LayerInspector`: layer name, default position, layer audio reactive config.
- `ClipInspector`: clip text, timing, assigned layer, override toggles.
- `StyleInspector`: typography, glow, blur, stroke.
- `TextureInspector`: solid, gradient, and image texture fill controls.
- `FxInspector`: FX preset and base FX values.
- `AnimationInspector`: active loop animation and animation intensity/speed.

When adding a new control, first decide which scope it belongs to. Avoid putting layer defaults or project defaults inside the clip tab.

## Texture lifecycle

Texture config is project data, but texture blobs are browser assets.

- `TextFillConfig` stores solid, gradient, and image texture metadata.
- `TextImageTextureFill.objectUrl` is runtime-only and must not be persisted in JSON.
- `textureAssetStorage.ts` persists image blobs in IndexedDB.
- `useLyrixaProject` restores texture blobs and recreates object URLs on project load.
- `serialization.ts` strips runtime texture URLs before export.
- If the IndexedDB asset is missing, the config remains and UI shows `Reload texture image`.

The renderer must use real text fill behavior. Image texture fill is implemented with CSS text clipping in `ClipLyricsRenderer.css`, not by pretending the texture is a text color.

## Audio library

Audio metadata and audio bytes deliberately have different ownership.

- `project.audioTracks.master`: the active playable audio channel.
- `project.audioLibrary`: lightweight references to every audio used by the project.
- `audioBlobStorage.ts`: device-wide IndexedDB Blob library, deduplicated by stable `fileKey`.
- `useLyrixaProject`: restores the active audio by project binding first, then by global `fileKey`.
- `peakExtraction.ts`: optional waveform decoding. It stays disabled in performance mode.

Loading another file changes the active master channel but keeps both references in
`project.audioLibrary`. This supports long mixes and multi-audio sessions without
putting large blobs in React state or localStorage.

Lyrics sources may store `audioFileKeys`. These are assignments to reusable audio
assets, not copies of audio bytes.

## Lyrics library

Project lyrics and device lyrics are separate:

- `project.lyricSources`: ordered sources linked into the current editor session.
- `lyricsLibraryStorage.ts`: device-wide text library in localStorage.
- `LyricSource.audioFileKeys`: optional assignments to one or more global audio files.

Lyrics are small enough for localStorage; audio is not.

## Import/export contracts

- Lightweight project JSON envelope: `createProjectExportEnvelope` in `serialization.ts`.
- Full project package: `projectPackage.ts`. It writes a small JSON header followed by
  raw audio blobs and restores those blobs into the device library on import.
- Full project import: `parseProjectExportEnvelope` and `normalizeProject`.
- Cross-app lyrics bundle: `core/project/lyricsBundle.ts`.

Exports should never include browser-only values such as object URLs. Audio blobs belong
in the full package only, never localStorage. Imports should normalize old saved
structures into the current model.

## Before adding a feature

1. Put pure data types/defaults in `src/core/types`.
2. Put pure merge/normalize logic in `src/core`.
3. Put React forms in the matching inspector tab.
4. Put DOM/browser persistence in `src/features`.
5. Add or update docs when ownership changes.
6. Run `npm run lint` and `npm run build`.
