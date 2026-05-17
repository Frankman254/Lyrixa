# Refactor Roadmap

This roadmap keeps the cleanup work separate from feature work. Use it before adding more visual controls.

## Completed stabilization work

- `LyrixaEditorShell` no longer owns every transport concern directly.
- `EditorTopBar` delegates playback controls and hidden file inputs.
- `GlobalStylePanel` is outside the shell.
- `EditorAlerts` is outside the shell.
- `usePlaybackController` owns transport and playback time.
- `useProjectImportExport` owns import/export file handlers.
- `TimelineEditor` delegates toolbar, selection toolbar, audio lanes, layer list, minimap, and band peak handling.
- Legacy timeline floating inspectors were removed from the active timeline path.
- The right inspector is the single editing surface for project, layer, clip, style, texture, FX, and animation.
- Inspector tab code is split into focused components.
- Visual style, animation, FX, and progress merge logic is centralized in `resolveVisualStyle.ts`.

## Current architecture target

The editor should feel like one workspace:

- Top transport for loading, playback, preview, import/export, and status.
- Main timeline for waveform lanes, lyric layers, clips, selection, drag, resize, and timing.
- Right inspector for all context-aware editing.
- Floating preview for previewing output only, not for editing style.

## Next cleanup phases

### Phase 1: Finish shell decomposition

- Keep `LyrixaEditorShell` as a composition root.
- Move remaining modal/open-close UI state into small hooks only when it starts repeating.
- Keep project mutation calls easy to trace.

### Phase 2: Harden style inheritance

- Add focused unit tests for:
  - project-only visual style
  - layer style over project
  - clip override over layer
  - missing layer values falling back to project values
  - old `textFillMode` migrations into `TextFillConfig`

### Phase 3: Texture reliability

- Add a small UI test or smoke fixture that sets solid, gradient, and image texture fills.
- Confirm exported JSON strips object URLs.
- Confirm reload restores IndexedDB textures and shows reload warning when missing.

### Phase 4: Inspector density

- Keep basic groups open by default.
- Keep advanced groups closed by default.
- Avoid placing global/layer defaults inside the clip tab.
- Add search or compact presets only after the split stays stable.

### Phase 5: Visual feature iteration

Only after the stabilization passes should new visual features land:

- more fonts
- shader-inspired CSS effects
- more blur/diffusion controls
- more animation behaviors
- preview sizing and overlay polish

Each new effect needs:

- a typed config field
- a resolver default
- inspector controls in the right tab
- renderer CSS/logic
- import/export compatibility

## Verification checklist

Run this after meaningful editor changes:

- `npm run lint`
- `npm run build`
- open `/#/editor`
- load or restore a project
- confirm audio play/pause and seek work
- drag and resize clips
- select a clip and edit text/timing in Inspector
- select a layer and edit layer defaults in Inspector
- switch solid, gradient, and texture fill modes
- export and import a project
- confirm Live Preview still renders active lyrics
