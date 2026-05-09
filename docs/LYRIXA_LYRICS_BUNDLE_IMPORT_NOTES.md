# Lyrixa lyrics-bundle — import notes

This document is for the *consumer side* of the bundle (e.g. the
`LiveWallpaperAnimeGlitch` renderer). It describes how to interpret the
file that Lyrixa exports as `*.lyrixa-lyrics.json`.

The authoritative type definitions live in
[`src/core/project/lyricsBundle.ts`](../src/core/project/lyricsBundle.ts).
This file is the human description of the same contract.

## Top-level shape

```ts
{
  schemaVersion: 1,
  app: "Lyrixa",
  exportKind: "lyrics-bundle",
  exportedAt: string,            // ISO timestamp, informational only
  projectName: string,           // display label, not authoritative
  sourceTrack: SourceTrack | null,
  project: {
    rawLyricsText: string,
    normalizedLyrics: string[],
    layers: LyricLayer[],
    clips: LyricClip[],
    styleConfig: LyricVisualStyle,
    animationConfig: LyricAnimationConfig,
    fxConfig: LyricFxConfig,
    progressIndicatorConfig: ClipProgressIndicatorConfig
  }
}
```

## Validation

A valid bundle MUST satisfy:

- `app === "Lyrixa"`
- `exportKind === "lyrics-bundle"`
- `schemaVersion === 1`
- `project` is an object

If `schemaVersion` is greater than what the renderer knows about, the
renderer SHOULD refuse to import and surface a clear "this bundle is
newer than your renderer" message rather than guessing.

## Source track binding

`sourceTrack` describes the master audio file the bundle was authored
against. It exists so the renderer can rebind to its own copy of the
audio without sharing a project id with Lyrixa.

```ts
sourceTrack: {
  fileName: string,
  durationMs: number,        // integer milliseconds
  fileKey?: string,          // "name::sizeBytes::lastModifiedMs"
  sizeBytes?: number,
  lastModified?: number      // epoch ms
}
```

Recommended match order on import:

1. `fileKey` — if the renderer also stores it, this is the strongest match.
2. `(fileName, sizeBytes, lastModified)` triple.
3. `fileName + durationMs` within a tolerance (e.g. ±200 ms).
4. Fallback: ask the user to pick the file manually.

The renderer MUST NOT use Lyrixa's project id (it is not in the bundle)
or any local Lyrixa asset id.

## Layers

Layer ids are stable and meaningful. The defaults Lyrixa always exports
are:

- `layer-main` — primary lyrics
- `layer-backing` — backing vocals / harmonies
- `layer-fx` — FX / adlibs

A renderer MAY attach renderer-specific behavior to those ids (e.g. a
distinctive font, a fixed screen position, a default reactive curve)
even when the layer's serialized fields are otherwise default.

Each layer carries:

- `id`, `name`, `layerType`, `color`, `visible`, `locked`, `order`
- `renderSettings` — `{ positionPreset, textAlign?, zIndex? }`
- `styleDefaults`, `animationDefaults`, `fxDefaults`, `progressIndicatorDefaults`
- `audioReactive` (optional, see below)

Fields the renderer does not yet implement MUST be ignored, not
rejected. That's how new authoring features ship without breaking older
renderers.

## Clips

Clips are the authoritative timeline. Each clip carries:

- `id`, `text`
- `startTime`, `endTime` — seconds, master timeline
- `layerId` — must match one of the layer ids in the bundle
- `position` (`ClipPositionPreset`), optional `coords`
- `transitionIn`, `transitionOut`
- `styleOverride`, `animationOverride`, `fxOverride`, `progressIndicatorOverride`
- `locked?`, `muted?`

The renderer MUST treat `clips + layers` as the source of truth.
`rawLyricsText` and `normalizedLyrics` are author-side history kept for
re-import; they are NOT to be re-parsed to reconstruct timing or layer
assignment.

## Override resolution

Visual fields cascade in this order, narrowest wins:

1. `project.styleConfig` / `project.animationConfig` / `project.fxConfig`
   / `project.progressIndicatorConfig`
2. `layer.styleDefaults` / `layer.animationDefaults` / `layer.fxDefaults`
   / `layer.progressIndicatorDefaults`
3. `clip.styleOverride` / `clip.animationOverride` / `clip.fxOverride`
   / `clip.progressIndicatorOverride`

Each layer of override is a **partial** of the same shape. A field that
is absent at level *n* means "inherit from level *n−1*", NOT "reset to
default".

## Audio-reactive (per-layer)

When present on a layer:

```ts
audioReactive: {
  enabled: boolean,
  source: "master" | "vocals-stem" | "estimated",
  bandMode: "full-mix" | "vocals" | "instrumental" | "kick" | "bass" | "hihat",
  responseMode: "envelope" | "peak",
  attackMs: number,            // 0..4000
  releaseMs: number,           // 0..4000
  threshold: number,           // 0..1
  softness: number,            // 0..1
  invert: boolean,
  targets: {
    opacity?:        { amount, min, max },
    blur?:           { amount, min, max },
    glowIntensity?:  { amount, min, max },
    scale?:          { amount, min, max },
    offsetY?:        { amount, min, max }
  }
}
```

Semantics:

- The signal is computed **once per layer**, not per clip. All clips on
  the layer share the same envelope at any given time.
- `threshold` is applied first; values below it are treated as silence.
  `softness` smooths the transition near the threshold.
- `attackMs` / `releaseMs` shape the envelope follower.
- For each target, the modulated value is
  `clamp(min, max, lerp(min, max, signal * amount))`. When `invert` is
  true, replace `signal` with `1 − signal`.
- Targets the renderer does not yet support MUST be ignored, not
  rejected.

If a renderer cannot produce the requested `source` (e.g. no vocals
stem available), it SHOULD fall back to `"estimated"` rather than
erroring.

## Degradation rules

The contract is intentionally tolerant of forward-compatibility:

- Unknown top-level fields → ignore.
- Unknown layer/clip fields → ignore.
- Unknown enum values (e.g. a future `transitionIn` preset) → fall back
  to `none` or the renderer's nearest equivalent. Log, do not throw.
- Missing `sourceTrack` → still importable; renderer asks user to bind
  audio manually.

## Future fields (reserved)

These are not yet exported but the consumer should not break if they
appear in a future v1 bundle:

- `clip.words: Array<{ text, startTime, endTime }>` — word-level sync.

A renderer that has not implemented word sync SHOULD ignore the field
and continue to render the clip as a single block.
