# Lyrixa

Lyrixa is a React + TypeScript visual lyrics editor. It combines a DAW-style timeline, waveform lanes, lyric layers, clip timing, a context-aware inspector, and live preview rendering for styled lyrics.

## Development

```bash
npm install
npm run dev
npm run lint
npm run build
```

The main editor route is:

```text
http://localhost:5173/#/editor
```

## Code Map

- `src/core`: pure domain code, types, defaults, timeline helpers, project serialization, and visual style resolution.
- `src/features/editor`: editor shell, top transport, alerts, preview windows, project persistence, playback, audio loading, and import/export hooks.
- `src/features/timeline-editor`: timeline viewport, waveform lanes, clip selection, drag/resize, minimap, and timeline controls.
- `src/features/inspector`: context-aware inspector tabs for project, layer, clip, style, texture, FX, and animation.
- `src/features/lyrics-view`: active lyrics renderer and preview CSS.

## Docs

- [Architecture](docs/01-architecture.md)
- [Refactor roadmap](docs/02-refactor-roadmap.md)
- [Product vision](docs/00-product-vision.md)
- [Lyrics bundle notes](docs/LYRIXA_LYRICS_BUNDLE_IMPORT_NOTES.md)

Before adding editor features, read the architecture doc and keep merge/persistence logic in the right layer.
