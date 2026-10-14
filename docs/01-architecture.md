# Lyrixa Architecture

This document is the working map for the editor codebase. Keep it updated when moving ownership between modules.

## High-level model

Lyrixa is split into two layers:

- `src/core`: pure TypeScript domain code. No React, DOM, CSS, localStorage, IndexedDB, or browser object URLs.
- `src/features`: React UI and browser integration. File inputs, IndexedDB, object URLs, playback, preview rendering, and CSS live here.

The central data object is `LyrixaProject`. UI code edits this object, then the preview/timeline render from it.

`LyrixaProject.composition` es la única fuente de verdad para los cues
deterministas de Vibrix. Es una unión discriminada por `schemaVersion`; la forma
histórica sin discriminante se lee como v1 y los proyectos nuevos nacen como
v2.

El catálogo importado se normaliza una sola vez y se guarda en IndexedDB como
manifiesto legacy o paquete completo. `LyrixaProject.vibrixAuthoringRef` sólo
guarda la clave y metadatos ligeros necesarios para hidratarlo. El campo actual
`vibrixManifest` se sigue leyendo al importar proyectos antiguos y se migra a
ese almacenamiento, pero no convive como otra fuente de verdad. La UI de
composición nunca mantiene un segundo array de cues.

## Main editor flow

1. `src/features/editor/LyrixaEditorShell.tsx` composes the editor workspace.
2. `useLyrixaProject` owns the in-memory project state, undo history and persistence.
   Its callbacks are thin adapters over pure `(project, …) => project`
   functions in `src/core`. Project-wide render defaults (style, animation, FX,
   progress indicator) change through one `setProjectDefaults(patch)`.
3. `usePlaybackController` owns transport time, play/pause, and seek state.
4. `useProjectImportExport` owns project, lyrics bundle and standard lyric
   format (LRC/SRT/VTT/TXT) import/export file workflows.
5. `TimelineEditor` owns timeline viewport interactions: selection, drag, resize, nudge, snapping, minimap, and waveform lanes.
6. `InspectorPanel` owns context-aware editing for project, layer, clip, style, texture, FX, and animation.
7. `ClipLyricsRenderer` resolves final visual settings and renders active lyric clips in previews.

## Workspace zones

- Top transport: `EditorTopBar`, `EditorPlaybackControls`, `EditorHiddenFileInputs`,
  `LyricsExportSection`. `EditorTopBar` takes grouped props (`nameEdit`,
  `playback`, `history`, `mode`, `panels`, `preview`, `files`, `actions`,
  `accent`); add a new control to the group it belongs to.
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

`core/lyrics/lyricSourceLibrary.ts` owns every change to `project.lyricSources`
(upsert, remove, attach, recover from a layer, active source, mode, title,
start time, audio assignment). It is also the only place that derives
`project.rawLyricsText` and `project.normalizedLyrics` from the sources, so
those two fields can never drift from them.

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

Ownership:

- `core/timeline/syncQueue.ts` (`buildSyncQueue`) is pure: given a project, a
  layer and an optional lyric source it returns the lines to time, the clips
  with line identity attached, the cursor and the resume time.
- `features/sync/useSyncSession.ts` holds the session's choices (target layer,
  source, speed) and wires `useTapSync` to playback. The shell only passes it
  playback callbacks and renders `TapSyncPanel` with the returned session.

## Line identity across layers

A project can hold the same lyric several times: the original, a romanization,
and one translation per language. `clip.sourceId` is what ties those copies
together — it names _the line_, not a layer and not a clip, so
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

### Secuenciador de composición de Vibrix

El diseño entre aplicaciones vive en
[`03-vibrix-composition-sequencer.md`](03-vibrix-composition-sequencer.md).
No extiende el bundle de letras: las letras conservan su contrato v1 estable,
mientras `.vibrix-authoring` y `.vibrix-score` transportan el catálogo visual y
los tiempos deterministas. Vibrix sigue siendo dueño de los valores y del
render; Lyrixa crea referencias y tiempos de activación.

El corte vertical schema v1 y el dominio L1/L2 de schema v2 están implementados:

- `core/composition/types.ts` owns manifest, track, cue and score types.
- `core/composition/authoringManifest.ts` valida manifiestos v1/v2 y paquetes
  `.vibrix-authoring` v1 sin APIs de navegador.
- `core/composition/slotStatus.ts` compares cue revisions with the catalog.
- `core/composition/score.ts` normalizes project composition and builds the
  `.vibrix-score.json` envelope.
- `features/composition/authoringSourceStorage.ts` persiste la fuente completa
  en IndexedDB mediante `features/storage/lyrixaDatabase.ts`.
- `features/composition/CompositionCatalog.tsx` importa paquete o manifiesto,
  resume slots/imágenes y edita el cue Scene seleccionado.
- `features/timeline-editor/CompositionTrackLane.tsx` renders and edits the
  Scene track on the shared audio timeline.

Este corte abre manifiestos v1/v2 y paquetes v1, pero todavía muestra sólo
Scene, crea intervalos de ocho segundos y exporta dependencias por referencia.
L2 ya modela Image, pistas granulares, `inherit` y cues con sólo `startTimeMs`.
La migración activa continúa en L3: representarlos como carriles sostenidos y,
después, exportar `.vibrix-score` con el cierre transitivo de snapshots
referenciados y las previews disponibles. Los
binarios originales permanecen en Vibrix y no forman parte del primer paquete
JSON. El orden ejecutable vive en `.agents/TAREA_SECUENCIADOR.md`.

## Import/export contracts

- Lightweight project JSON envelope: `createProjectExportEnvelope` in `serialization.ts`.
- Full project package: `projectPackage.ts`. It writes a small JSON header followed by
  raw audio blobs and restores those blobs into the device library on import.
- Full project import: `parseProjectExportEnvelope` and `normalizeProject`.
- Cross-app lyrics bundle: `core/project/lyricsBundle.ts`. It carries
  `layers[].role`, `layers[].language` and `clips[].sourceId` through to
  LiveWallpaper; layer ids are not part of the contract. Adding a field does
  not bump `schemaVersion`.

- Standard lyric formats: `core/export/index.ts`. One entry point,
  `exportLyrics(project, { format, layerId? })`, returns `{ fileName, mimeType,
text, cueCount }` for one layer. These files carry timing and text only (no
  style, FX or audio):

  | Format         | Shape                                                                                                                                            |
  | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
  | `lrc`          | `[ti:]`, `[length:]`, `[re:Lyrixa]` header; `[mm:ss.xx]text` per clip; an empty `[mm:ss.xx]` line closes each silence and the last line          |
  | `lrc-enhanced` | Same, plus A2 word tags `<mm:ss.xx>word` from `clip.words[]`, closed by the last word's end; clips without usable words fall back to plain lines |
  | `srt`          | Numbered cues, `hh:mm:ss,mmm --> hh:mm:ss,mmm`                                                                                                   |
  | `vtt`          | `WEBVTT` header, `hh:mm:ss.mmm`, text escaped (`&`, `<`, `>`, `-->`)                                                                             |
  | `txt`          | One clip per line, no timing                                                                                                                     |

  Rules shared by every format: only non-muted clips with text and valid times
  on the chosen layer, sorted by start; overlaps are kept as authored. Times are
  rounded to the format's resolution before being split into fields, so
  `59.999s` is `01:00.00`, never `00:60.00`. The default layer is the one with
  `role: 'primary'`, else the top-most layer with text. A non-default layer
  tags the file name with its `language` or name (`Song.es.srt`).

- `LyricClip.words[]` (optional, `{ text, startTime, endTime, score? }`) is the
  word timing the Transcriptor produces. Lyrixa preserves it and uses it only
  for Enhanced LRC; it does not edit it yet.

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
