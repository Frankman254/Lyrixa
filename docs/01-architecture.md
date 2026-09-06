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

Editing a linked lyric source is intentionally non-destructive:

- The source text is updated in the project and device library.
- Existing timeline clips are not rewritten or deleted.
- Paragraphs whose normalized text and index did not change keep the same
  `sourceId`, so Sync recognizes their existing timings.
- New, moved, or edited paragraphs receive new `sourceId` values and must be
  synchronized again. Obsolete timeline clips stay visible until the user
  deletes or replaces them deliberately.

## Tap-sync resume lifecycle

Tap-sync progress is stored in `project.clips`, never in the floating window.

- `TapSyncLine.sourceId` identifies a normalized source paragraph.
- A synchronized `LyricClip` stores the same `sourceId`, its `lyricSourceId`,
  and the selected `layerId`.
- Reopening Sync, switching layer, or switching lyric source derives the first
  pending paragraph and resume time from persisted clips.
- The list marks previously published paragraphs as done before highlighting
  the current pending row.

## Line identity across layers

A project can hold the same lyric several times: the original, a romanization,
and one translation per language. `clip.sourceId` is what ties those copies
together — it names *the line*, not a layer and not a clip, so
`clip-main-42`, `clip-es-42` and `clip-romaji-42` all carry
`sourceId = "line-42"`.

`core/timeline/lineIdentity.ts` owns every question asked of that key:

- `getRelatedClips` / `getRelatedClipsForClip` / `getSiblingClips` — the group.
- `findPrimaryClip`, `getClipsByRole`, `getLayersByRole` — role-driven lookup.
  Nothing keys off layer ids such as `layer-main`; N layers work.
- `createDerivedClip` — a translation inherits `startTime`, `endTime` and
  `sourceId` from its primary once, at creation. Nothing re-syncs afterwards:
  if the author moves a translation deliberately, it stays moved.
- `isDerivedClipStale` / `findStaleDerivedClips` / `markDerivedClipFresh` —
  staleness is **computed**, by comparing `clip.sourceTextHash` against a hash
  of the current primary text. Nothing is stored as a flag, so undoing an edit
  clears the badge with no cleanup pass.
- `reconcileClipLineIdentity` — repairs imports whose `sourceId` is a pointer
  to another clip's id, or a segment label repeated within a layer. It is a
  no-op on projects authored in Lyrixa.

Layer semantics live in `role` (`primary | translation | transliteration |
backing | fx | annotation`) and `language`. Both are optional: a pre-role
project parses with them absent and nothing is invented. `romanization`,
`romaji`, `original` and `main` are accepted as input aliases only —
`transliteration` and `primary` are what Lyrixa writes.

## Bridges to the other apps

Lyrixa is standalone first. Every service below is optional, and with none of
them running the editor imports, edits and exports exactly as before.

- `core/bridge/bridgeConfig.ts` — where the services live. Priority: explicit
  override → `?transcriptor=` / `?livewallpaper=` → localStorage →
  `VITE_*_URL` → the default same-origin path `/transcriptor`. `?job=` is read
  here too and validated so a job id can never escape the service path.
- `core/bridge/transcriptorClient.ts` — `?job=<id>` → project + audio. Prefers
  `GET /api/jobs/{id}/lyrixa` and `/audio`, falling back to today's
  `GET /api/jobs/{id}` plus `/download/{id}/{name}`. `fetch` is injected, so
  `core/` stays free of browser globals and a desktop shell can supply its own.
- `core/translation/translationService.ts` — one line, on demand. Lyrixa never
  talks to a model; it asks Transcriptor for a single line and nothing more.
  With no service reachable, `createUnavailableTranslationService` keeps the
  callers null-check free and the action hidden.
- `core/bridge/liveWallpaperTarget.ts` — where a bundle goes. The envelope is
  built once, outside the transport, so an HTTP hand-off and a file download
  ship byte-identical content.
- `features/bridge/bridgeServices.ts` — the single place browser globals meet
  those modules. `features/bridge/useTranscriptorJob.ts` turns `?job=` into an
  opened project with its audio loaded, at most once per job id; audio failing
  degrades to a warning rather than failing the import.

No host or port appears anywhere under `src/`. In development the Vite server
proxies `/transcriptor` (see `vite.config.ts`), which also avoids needing CORS
on the Python side.

## Import/export contracts

- Lightweight project JSON envelope: `createProjectExportEnvelope` in `serialization.ts`.
- Full project package: `projectPackage.ts`. It writes a small JSON header followed by
  raw audio blobs and restores those blobs into the device library on import.
- Full project import: `parseProjectExportEnvelope` and `normalizeProject`.
- Cross-app lyrics bundle: `core/project/lyricsBundle.ts`. It carries
  `layers[].role`, `layers[].language` and `clips[].sourceId` through to
  LiveWallpaper; layer ids are not part of the contract. Adding a field does
  not bump `schemaVersion`.

Exports should never include browser-only values such as object URLs. Audio blobs belong
in the full package only, never localStorage. Imports should normalize old saved
structures into the current model.

## Before adding a feature

1. Put pure data types/defaults in `src/core/types`.
2. Put pure merge/normalize logic in `src/core`.
3. Put React forms in the matching inspector tab.
4. Put DOM/browser persistence in `src/features`.
5. Add or update docs when ownership changes.
6. Run `npm test`, `npm run lint` and `npm run build`.

Tests live beside the code as `*.test.ts` under `src/core` and run in Vitest's
`node` environment — the domain layer is pure, so no DOM is needed.
