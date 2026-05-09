# Lyrixa -> LiveWallpaper

## Objetivo

Convertir `Lyrixa` en la herramienta principal de autoría para lyrics avanzadas y hacer que `LiveWallpaperAnimeGlitch` pueda **importar y renderizar** esas lyrics con el mismo significado temporal, visual y estructural.

La meta no es exportar solo texto LRC. La meta es exportar un **lyrics bundle** con:

- timing correcto
- capas reales
- clips por capa
- estilos/animaciones/fx existentes
- base para futuras reactividades por audio a nivel de capa

## Decisión de arquitectura

1. `Lyrixa` será la **fuente de verdad** para autoría avanzada de lyrics.
2. `LiveWallpaperAnimeGlitch` será primero **importador + renderer** de ese bundle.
3. No seguir empujando la edición avanzada de lyrics dentro de un tab lateral del editor principal.
4. No usar `assetId` de LiveWallpaper como binding primario de exportación, porque `Lyrixa` no conoce esos ids.
5. El export debe incluir metadatos de pista para que LiveWallpaper haga el match localmente.

## Estado actual detectado

### Lo que Lyrixa ya tiene bien

- editor de ventana completa
- timeline real basado en clips
- 3 capas por defecto (`main`, `backing`, `fx`)
- proyecto persistido con `clips`, `layers`, `styleConfig`, `animationConfig`, `fxConfig`
- waveform / vocal helper / band peaks para asistencia de sincronía
- export/import de proyecto `.lyrixa.json`

### Lo que todavía falta para el caso de integración

- mejorar la UX en canciones largas / mixes muy extensos
- estabilizar un export dedicado para lyrics interoperables
- definir un contrato común de capas/clips/estilos
- agregar FX/reactividad por audio a nivel de capa
- dejar el formato preparado para futuro word-sync sin romper v1

## Requisito clave

`LiveWallpaperAnimeGlitch` debe poder interpretar el bundle sin adivinar semántica.

Eso significa:

- ids estables de capas
- nombres de presets/animaciones/fx estables
- tipos serializados claros
- versionado explícito
- fallback limpio cuando algo aún no esté soportado en el renderer destino

## Formato recomendado

Agregar un export dedicado además del `.lyrixa.json` actual:

- nombre sugerido: `*.lyrixa-lyrics.json`
- propósito: bundle interoperable para importación en LiveWallpaper

### Envelope sugerido

```json
{
  "schemaVersion": 1,
  "app": "Lyrixa",
  "exportKind": "lyrics-bundle",
  "exportedAt": "2026-05-07T12:00:00.000Z",
  "sourceTrack": {
    "fileName": "example.mp3",
    "durationMs": 8520170,
    "fileKey": "example.mp3::123456789::1710000000000",
    "sizeBytes": 123456789,
    "lastModified": 1710000000000
  },
  "project": {
    "rawLyricsText": "...",
    "normalizedLyrics": ["..."],
    "layers": [],
    "clips": [],
    "styleConfig": {},
    "animationConfig": {},
    "fxConfig": {},
    "progressIndicatorConfig": {}
  }
}
```

## Contrato compartido v1

### `sourceTrack`

Debe exportarse para que LiveWallpaper pueda hacer binding local:

- `fileName`
- `durationMs`
- `fileKey` si existe
- `sizeBytes` si existe
- `lastModified` si existe

No exportar `assetId` de LiveWallpaper. Ese id debe resolverse en import local.

### `layers`

Las capas deben exportarse con semántica estable:

- `id`
- `name`
- `layerType`
- `color`
- `visible`
- `locked`
- `order`
- `renderSettings`
- `styleDefaults`
- `animationDefaults`
- `fxDefaults`
- `progressIndicatorDefaults`

Los ids por defecto deben mantenerse estables:

- `layer-main`
- `layer-backing`
- `layer-fx`

### `clips`

Cada clip debe exportarse con:

- `id`
- `text`
- `startTime`
- `endTime`
- `layerId`
- `position`
- `transitionIn`
- `transitionOut`
- `styleOverride`
- `animationOverride`
- `fxOverride`
- `progressIndicatorOverride`
- `locked`
- `muted`

## Nueva capacidad requerida: audio reactive por capa

El usuario quiere que el efecto se aplique a la **capa/canal**, no a cada caja hija por separado.

Eso debe vivir en `LyricLayer`, no en `LyricClip`.

### Campo nuevo propuesto

```ts
audioReactive?: {
  enabled: boolean;
  source: "master" | "vocals-stem" | "estimated";
  bandMode: "full-mix" | "vocals" | "instrumental" | "kick" | "bass" | "hihat";
  responseMode: "envelope" | "peak";
  attackMs: number;
  releaseMs: number;
  threshold: number;
  softness: number;
  invert: boolean;
  targets: {
    opacity?: { amount: number; min: number; max: number };
    blur?: { amount: number; min: number; max: number };
    glowIntensity?: { amount: number; min: number; max: number };
    scale?: { amount: number; min: number; max: number };
    offsetY?: { amount: number; min: number; max: number };
  };
}
```

### Alcance v1 recomendado

Implementar primero estos targets:

- `opacity`
- `blur`
- `glowIntensity`
- `scale`
- `offsetY`

No meter demasiados targets en la primera iteración.

## UX requerida en Lyrixa

### 1. Edición cómoda para canciones largas

Hoy este punto es crítico para mixes largos.

Agregar:

- zoom más agresivo y más fino
- `fit selection`
- `fit song`
- botón/atajo para centrar playhead
- minimap / overview horizontal
- jump a clip seleccionado
- mejor follow-playhead
- navegación rápida por líneas o clips

### 2. Capas reales visibles y fáciles de usar

Debe ser simple trabajar con:

- capa principal
- backing vocals
- fx / adlibs

Y poder:

- reordenarlas
- ocultarlas
- bloquearlas
- renombrarlas
- cambiar posición/render por capa

### 3. Inspector de capa más fuerte

El `LayerInspector` actual es demasiado básico para este objetivo.

Debe crecer para editar:

- `renderSettings`
- `styleDefaults`
- `animationDefaults`
- `fxDefaults`
- `progressIndicatorDefaults`
- `audioReactive`

## Reglas de compatibilidad con LiveWallpaper

### 1. No romper el export de proyecto existente

Mantener `.lyrixa.json` como export de proyecto completo.

Agregar además el export dedicado:

- `.lyrixa-lyrics.json`

### 2. No duplicar fuentes de verdad

Para el bundle interoperable:

- `clips + layers` son la fuente de verdad para render avanzado
- `rawLyricsText` queda como fallback/histórico
- no depender de re-parsear LRC para reconstruir capas/FX

### 3. Degradación controlada

Si LiveWallpaper no soporta aún una feature:

- no debe romper importación
- debe ignorar el campo o degradarlo con fallback explícito

## Futuro: word sync

No es obligatorio resolver word-drag ahora mismo, pero sí dejar el formato preparado.

Cada clip puede permitir en el futuro:

```ts
words?: Array<{
  text: string;
  startTime: number;
  endTime: number;
}>
```

Eso no debe bloquear v1.

## Tareas concretas para el agente en Lyrixa

### Prioridad alta

1. Diseñar y añadir el export `lyrics-bundle` interoperable.
2. Mantener ids de capa estables y serialización limpia.
3. Mejorar timeline UX para canciones largas.
4. Expandir `LayerInspector` para defaults visuales reales por capa.
5. Añadir `audioReactive` a `LyricLayer` y a la serialización.

### Prioridad media

1. Permitir más de 3 capas sin romper las 3 default.
2. Agregar minimap / overview del timeline.
3. Agregar import/export aislado solo de lyrics bundle.

### Prioridad posterior

1. word sync real
2. editor de palabras arrastrables
3. karaoke por palabra

## Criterios de aceptación

El trabajo se considera listo cuando:

1. Un mix largo de 1h+ se puede editar con navegación razonable.
2. Las 3 capas default funcionan bien y se pueden configurar por separado.
3. El bundle exportado conserva:
   - timing
   - capas
   - clips
   - estilos
   - animaciones
   - fx
4. El contrato no depende de ids internos de LiveWallpaper.
5. La nueva config `audioReactive` existe a nivel de capa y queda persistida/exportada.

## Qué NO hacer

- No convertir el export interoperable en una copia del estado runtime.
- No acoplar el formato a `assetId` del otro proyecto.
- No dejar el significado de presets/animaciones implícito.
- No meter reactividad por audio en cada clip individual si la intención es por capa.

## Entregable esperado del lado Lyrixa

1. código para `lyrics-bundle export`
2. schema versionado
3. mejoras mínimas de timeline para mixes largos
4. capa `audioReactive` serializable
5. breve `IMPORT_NOTES.md` o sección en docs explicando cómo otro renderer debe interpretar el bundle

## Nota final

La app `LiveWallpaperAnimeGlitch` va a implementar el import/render de este bundle. Por eso es clave que `Lyrixa` exporte una estructura explícita y estable, no solo LRC ni solo texto con timestamps.
