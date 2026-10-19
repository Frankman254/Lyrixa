# Relevo de Lyrixa

> Actualizado el 2026-10-16. Continúa por
> [TAREAS.md](TAREAS.md) y
> [TAREA_SECUENCIADOR.md](TAREA_SECUENCIADOR.md).

## Norte de producto

Lyrixa sincroniza letras y secuencia objetos visuales en el tiempo. Vibrix
prepara esos objetos y renderiza la secuencia. El intercambio objetivo es:

```text
Vibrix ── proyecto.vibrix-authoring ──▶ Lyrixa
Vibrix ◀──── proyecto.vibrix-score ──── Lyrixa
```

Lyrixa decide **qué se activa y cuándo**. No replica parámetros de shader,
editores de slots ni transiciones internas de Vibrix.

## Estado comprobado

El primer corte del secuenciador existe y **L1, L2, L3, L4 y L5 están
completados y verificados en el navegador**:

- `src/core/composition/` define manifiesto, tracks, cues y scores v1/v2.
- Se importan `.vibrix-manifest.json` schema 1/2 y `.vibrix-authoring` v1.
- El paquete completo se valida en `src/core` y se guarda una sola vez en
  IndexedDB; el proyecto conserva `vibrixAuthoringRef`.
- El catálogo v2 puebla los carriles: secciones Images (con preview), Scenes y
  familias granulares, search, `Add at playhead`, drag con sueltos sobre el
  carril correcto (creado on-demand) y `inherit` en familias granulares.
- La timeline v2 tiene el grupo plegable `Visual composition`, ordena Scene e
  Image antes de los carriles granulares y muestra activaciones sostenidas.
- El borde derecho de cada cue v2 se deriva del siguiente corte del mismo
  carril o del final del audio. Moverlo aplica el snap global y recalcula los
  vecinos; v2 no ofrece resize ni guarda `endTimeMs`.
- La timeline v1 conserva su editor de intervalos y sus dos handles sin
  reinterpretar proyectos históricos.
- Se exporta `.vibrix-score.json` con referencias (envelope legacy) cuando sólo
  hay manifiesto suelto, y el contenedor autocontenido `.vibrix-score` cuando se
  importó `.vibrix-authoring`: score + cierre transitivo de snapshots usados +
  previews transportables (`src/core/composition/scorePackage.ts`).
- El proyecto persiste `composition` y la referencia ligera al catálogo.
- `project.composition` es una unión discriminada v1/v2. Los proyectos nuevos
  nacen en v2; la forma histórica sin `schemaVersion` se conserva como v1 con
  su `endTimeMs`.
- El dominio v2 admite Scene, Image, familias granulares e `inherit`, sólo con
  `startTimeMs`; el sobre JSON conserva la versión del proyecto.

Vibrix ya avanzó a v2 y **cerró su lado del intercambio**: exporta
`.vibrix-authoring` con slots, imágenes, snapshots, previews y, desde
`4087135b` (V2.4a), `thumbnailDataUrl` por slot. Desde `9dec2b48` lee el
contenedor `.vibrix-score` (`parseVibrixScoreDocument` en
`src/features/composition/vibrixScorePackage.ts`), resuelve
`snapshots`/`previews` por `kind:id` y su parser **ya rechaza `intro-window`**
como `track.kind`, `feature-slot.family` e `inherit.family` (tests en
`vibrixScore.test.ts`). W3 (preview/Play/seek) y W4 (export offline vía
`resolveVisualStateAt`) también están hechos. Su store va por la versión 154.

**Comprobación cruzada del 2026-10-16 (sin UI):** un test de vitest en el
scratchpad de la sesión importó `buildVibrixScorePackage` de Lyrixa y
`parseVibrixScoreDocument` + `reviewVibrixScore` de Vibrix (alias `@` →
`LiveWallpaperAnimeGlitch/src`). Con un catálogo de 2 escenas (una con
`bindings` y `rain:'off'`), 2 imágenes (una con `sceneSlotId`), Spectrum 2,
Looks e `inherit looks`, el paquete pasó por `JSON.stringify` y Vibrix lo
aceptó sin errores: `selfContained:true`, cierre de 8 snapshots sin
`rain-a`, y los 7 cues en `ready`. Las formas de `VibrixScorePreview`
(`imageId`, `revision`, `name`, `thumbnailDataUrl`) coinciden en ambos repos.
Lo único que queda es el intercambio real con un proyecto Vibrix que tenga
escenas.

Prueba manual del 2026-10-13: se importó
`future-core-techcore-mix-clairvoyance.vibrix-authoring` (9.7 MB), se mostraron
330 slots y 230 imágenes, y el catálogo sobrevivió una recarga desde IndexedDB.
El proyecto Vibrix exportado contiene 0 escenas, así que sirve para cerrar L1
pero no para probar todavía cues Scene.

## Commits reales y trabajo local actual

`main == origin/main` en `571cc51`:

- L3 `b884174`: cues sostenidos, orden/duración derivada/snap (`timeline.ts` +
  test, `SustainedCompositionTrackLane.tsx`, `TimelineEditor.tsx`,
  `docs/fixtures/l3-sustained-score.lyrixa.json`).
- L4 `db49a23`: catálogo v2 (`catalog.ts` + test, `CompositionCatalog.tsx`).
- L5 `0b90a01`: contenedor `.vibrix-score` (`scorePackage.ts` + test,
  `snapshotKey` exportada, `downloadVibrixScore` en `LyrixaEditorShell.tsx`).
- Frente B `ac0fa1c`: al cambiar de proyecto la fuente anterior se descarta
  síncronamente y `vibrixSourceLoading` deshabilita `Export score`; los cues de
  un track `enabled:false` son inactivos (fuera del cierre, `dependencies` e
  issues), igual que `resolveVisualStateAt` de Vibrix.
- L4.1 `202c719`: pestañas **All / Images / Scenes / Slots**, acordeones por
  familia (≤2 clics), `WindowedList` incremental y aviso «This package has 0
  scenes.».
- L4.2 `571cc51`: `src/core/composition/visualState.ts` + test, panel
  «Visual at playhead» y `VibrixManifestSlot.thumbnailDataUrl?` aditivo.

Queda **sin commit**:

- **Carriles de letra en el preview** — nuevo `src/core/render/previewLanes.ts`
  + `previewLanes.test.ts` (5 casos) y su uso en
  `src/features/lyrics-view/ClipLyricsRenderer.tsx`/`.css`. Cuando hay ≥2 capas
  de texto visibles con preset `top`/`center`/`bottom`, cada una recibe una
  banda horizontal propia (orden: preset top→bottom, luego rol
  primary→transliteration→translation→backing) y `fitToLane` encoge la fuente
  hasta que el texto envuelto cabe en su banda. Un `position` explícito no
  `center` en el clip queda fuera de las bandas. Es el espejo del reparto
  dinámico que Vibrix commiteó en `9ef1131a`. Sólo toca el preview; el bundle
  `.lyrixa-lyrics.json` no cambia. Verificado en el navegador el 2026-10-16 con
  tres capas (japonés bottom/primary, romaji bottom/transliteration, español
  top/translation): bandas 159–269 / 295–452 / 468–597 px sin solape, fit
  0.53 / 0.82 / 0.65, y el proyecto del usuario restaurado después.

No descartar esos archivos. `.agents/*` **sí está versionado** (no es
gitignore). El usuario decidió continuar directamente en `main`; no crear otra
rama salvo que lo pida.

## Próximo movimiento

**L3 está visualmente verificada (2026-10-13, sesión de relevo):** con el
fixture importado en `/#/editor` → Compose se comprobó en el navegador real:
orden Scene → Image → Looks → Rain; plegar deja 0 lanes, desplegar 4 lanes con
9 cues; arrastrar "Chorus Scene" +2 s movió el corte 8000→10000 ms y los
vecinos se recalculan en vivo (Opening 480→600 px, Chorus 600→480 px); con
snap 0.5 s el mismo arrastre cayó en 11000 ms exactos; Undo devolvió el corte a
8000 ms y Redo a 10000 ms; los cues v2 no tienen handles de resize. Las pruebas
automáticas ya estaban verdes: 171/171, lint sin errores (13 warnings
preexistentes de hooks en `useLyrixaProject.ts`), build correcto.

**L4 está verificada en el navegador (2026-10-14, sesión de relevo).** Con el
fixture L3 y el paquete real `future-core-techcore-mix-clairvoyance.vibrix-authoring`
(0 escenas, 330 slots, 230 imágenes) importados en `/#/editor` → Compose se
comprobó:

- El catálogo agrupa **Images · Scenes · cada familia granular** con contadores,
  thumbnails reales en imágenes y placeholder de 2 letras en slots. Con el
  paquete real aparecen las 10 secciones granulares (Spectrum, Spectrum 2, Looks,
  Particles, Rain, Lights, Camera FX, Logo, Track Title, Background Zoom) +
  Images(230); `intro-window` queda excluida. Antes esto devolvía "no scene
  slots".
- `Add at playhead` coloca imagen, escena, slot granular e `inherit`; el cue se
  selecciona y el inspector v2 muestra su estado (`resolveCueDependencyStatus`)
  con Start (ms) editable y nota "The cut holds until the next one in its lane".
- `Inherit <Familia>` aparece **sólo** en secciones granulares (nunca en Images
  ni Scenes); coloca un corte "Inherit from Scene" con estado "Returns this lane
  to scene inheritance".
- Colocar un slot cuya familia no tiene carril crea el carril on-demand en el
  orden de `TRACK_KIND_ORDER` (p.ej. Spectrum quedó entre Image y Looks).
- Arrastrar un slot al carril correspondiente lo suelta con snap exacto (Chorus
  Scene → 30000 ms a 60 px/s) y lo selecciona; soltarlo en un carril de otra
  familia no hace nada.
- Cmd/Ctrl+Z deshace la colocación revirtiendo **carril nuevo y cue**.
- Search filtra por nombre/id en vivo y se **auto-resetea al cambiar de
  manifiesto** (arreglado en esta sesión).

Pruebas automáticas: `npm test` → 185/185 (36 en `src/core/composition/`, 14
nuevos en `catalog.test.ts`); `npm run lint` → 0 errores (13 warnings
preexistentes de hooks en `useLyrixaProject.ts`); `npm run build` → correcto.

**L5 está verificada en el navegador y a escala (2026-10-14, sesión de relevo).**

- Núcleo puro: 12 tests nuevos en `scorePackage.test.ts` cubren cierre
  transitivo por `bindings`, parada en `off`, exclusión de `inherit` y cues
  deshabilitados, imagen→`sceneSlotId`→escena→bindings, preview sólo para
  imágenes del cierre con `thumbnailDataUrl`, degrades a referencia pura con
  manifiesto suelto, y rechazo por revisión/familia/missing snapshot.
- Navegador real (`/#/editor` → Compose → Export score) con un fixture
  sintético escena→(spec-a, look-a, rain=off) e imagen→escena: el JSON
  descargado trajo `format:'vibrix-score'`, `packageVersion:1`,
  `selfContained:true`, 4 snapshots exactos (`scene-main`, `spec-a`, `look-a`,
  `image-cover`), preview `data:image/...` de `image-cover`, y **cero fugas**
  (`rain-a` por `off`, `spec-b` por cue deshabilitado, `image-raw` no
  referenciado). El envelope interno conserva schema 2 y sólo deps directas.
- Escala real: sobre `future-core-techcore-mix-clairvoyance.vibrix-authoring`
  (9,7 MB, 560 snapshots, 0 escenas, 230 imágenes con `sceneSlotId:null`) el
  builder cerró 3 imágenes sin arrastrar ninguna escena y previews todos
  `data:image/` (ningún `blob:`/ruta local); un target inexistente lanza
  `VibrixScorePackageError`.

Pruebas finales de la sesión: `npm test` → 197/197 (48 en
`src/core/composition/`); `npm run lint` → 0 errores; `npm run build` →
correcto; `tsc --noEmit` limpio.

### Próximo paso: intercambio real con Vibrix

Ambos lados del código están listos y el contrato pasa la comprobación
cruzada. Lo que falta necesita un proyecto Vibrix real **con escenas**
(Clairvoyance tiene 0):

1. En Vibrix: crear o abrir un proyecto con ≥2 escenas, ≥2 imágenes y un slot
   de Spectrum 2; exportar `.vibrix-authoring`.
2. En Lyrixa (`/#/editor` → Compose): importar ese paquete y colocar
   Image A `00:00`, Image B `03:00`, Scene A `00:00`, Scene B `01:00`,
   Spectrum 2 `01:30` e `inherit` `02:00`. `Export score`.
3. En Vibrix: importar el `.vibrix-score`, revisar que todo sale `ready`, y
   comprobar que seek, Play y export offline dan el mismo frame en cada corte.

Si algo falla en el paso 3, el sitio para mirar en Vibrix es
`src/features/composition/vibrixScorePackage.ts` (parser) y
`resolveVisualStateAt.ts` (aplicación de snapshots).

### Cómo probar L5 manualmente

1. `npm run dev`, abre `/#/editor`.
2. More → Import project → `docs/fixtures/l3-sustained-score.lyrixa.json`;
   Catálogo → Import authoring → `~/Downloads/future-core-techcore-mix-clairvoyance.vibrix-authoring`.
   Con sólo el manifiesto del fixture (sin paquete) → `Export score` descarga
   `<proyecto>.vibrix-score.json` (envelope de referencias, comportamiento
   legacy intacto).
3. Con el paquete Clairvoyance cargado: coloca un cue de imagen (todas tienen
   `sceneSlotId:null`) y pulsa `Export score` → descarga `<proyecto>.vibrix-score`.
   `cat` del archivo: `format:'vibrix-score'`, `packageVersion:1`,
   `selfContained:true`, `snapshots` = las imágenes usadas (sin escenas),
   `previews` con `thumbnailDataUrl` `data:image/...`.
4. Para ver el cierre transitivo: construye un `.vibrix-authoring` con una
   escena que enlace `bindings` (como el fixture de `scorePackage.test.ts`),
   colócala y exporta — el JSON debe traer escena + slots enlazados + imagen,
   y excluir los enlazados a `'off'`.
5. Un cue roto (target que ya no existe en el catálogo) muestra `window.alert`
   con la lista de issues y no descarga nada.

### Cómo probar L4 manualmente

1. `npm run dev`, abre `/#/editor`.
2. More → Import project → `docs/fixtures/l3-sustained-score.lyrixa.json`.
3. Pestaña Compose: en el catálogo pulsa `+` en "Cover Image" (va al carril
   Image) y en "Inherit Looks" (va al carril Looks, estado "Returns this lane to
   scene inheritance"). Selecciona un corte y edita Start (ms) en el inspector.
4. Arrastra "Chorus Scene" desde el catálogo hasta mitad del carril Scene: cae
   con snap y se selecciona.
5. Para el caso extremo: Catálogo → Import authoring →
   `~/Downloads/future-core-techcore-mix-clairvoyance.vibrix-authoring`; aparece
   el catálogo completo con previews y 10 carriles granulares; coloca un Spectrum
   (crea su carril) y deshaz con Cmd/Ctrl+Z.

### Cómo probar L4.1 manualmente

1. `npm run dev`, abre `/#/editor` → Compose → Catálogo → Import authoring →
   `~/Downloads/future-core-techcore-mix-clairvoyance.vibrix-authoring`
   (230 imágenes, 330 slots, 0 escenas).
2. Ver la barra **All 560 / Images 230 / Scenes 0 / Slots 330** sobre la lista.
   En **All** las 12 secciones (Images, Scenes, 10 familias) aparecen **cerradas**
   con su contador — ya no hay un `IMAGES 230` que tape el resto.
3. **≤2 clics:** pestaña Slots → clic en «Background Zoom» (última familia) → se
   despliega con sus 3 slots + «Inherit Background Zoom». Ninguna familia queda a
   más de 2 clics.
4. **Windowing:** pestaña Images → el header «Images 230» se abre mostrando las
   primeras 80; al scrollear hacia abajo crece de 80 en 80 hasta 230 sin congelar.
   (`IntersectionObserver`, sin añadir dependencia de virtualización.)
5. **0 escenas:** pestaña Scenes → mensaje explícito «This package has 0 scenes.»
   en vez de esconder la sección.
6. **Search auto-expande:** escribe en el buscador con acordeones cerrados; las
   secciones con matches se abren solas. Limpiar y cambiar de manifiesto resetea
   la búsqueda (ya existía).
7. **No regresión:** el `+` de una tarjeta coloca el cue (inspector + Export
   habilitado) y el drag sigue cayendo en su carril. La pestaña elegida persiste
   entre recargas (`localStorage`).
8. Verificación de la sesión: `npm test` 200/200, `npm run lint` 0 errores
   (13 warnings preexistentes), `npm run build` correcto.

### Cómo probar L4.2 manualmente

1. `npm run dev`, abre `/#/editor` → Compose. El panel **«Visual at playhead»**
   vive bajo los botones Importar/Exportar del catálogo, siempre visible.
2. Con el paquete Clairvoyance cargado y un score con cues: mueve el playhead y
   observa el pliegue en vivo — el hero muestra la **imagen actual con su
   miniatura real** (data URL del paquete) y la escena; cada carril granular
   resuelto aparece en una línea (miniatura o iniciales, y `(scene)` cuando
   viene del binding de la escena).
3. Coloca una imagen en el playhead (`+` en una tarjeta): el hero pasa de
   «No image» al nombre de esa imagen al instante; Cmd/Ctrl+Z lo revierte.
4. Sin ningún cue antes del cursor: «Nothing placed yet — the score follows your
   manual Vibrix settings.» El score del fixture L3 (escenas + bindings) ejercita
   el caso escena→carriles; Clairvoyance tiene 0 escenas, así que esa rama se
   comprueba sobre todo vía `visualState.test.ts` (9 casos: bindings on/off/
   ausente, override→inherit, imagen→escena, empates al ms, carril apagado).
5. **Las miniaturas de slot con imagen real llegarán con V2.4a (lado Vibrix):**
   hoy `renderSlotCard` ya muestra `slot.thumbnailDataUrl` si el manifiesto la
   trae; como Vibrix aún no la emite, los slots salen con iniciales. Es un campo
   **aditivo**: un paquete sin él sigue importando igual (2 nuevos tests de
   parser: data URL aceptada, `blob:` rechazada).

## Reglas del repo

- Usa `npm`, nunca pnpm.
- `src/core` permanece puro: sin React, DOM, storage ni object URLs.
- La UI usa una sola `project.composition`; no crea un segundo array de cues.
- `project.composition` lleva discriminante v1/v2; un proyecto antiguo sin él
  se lee como v1.
- El paquete/manifiesto importado vive una sola vez en IndexedDB;
  `project.vibrixAuthoringRef` guarda una referencia ligera y `vibrixManifest`
  queda sólo como entrada legacy. No persistir el paquete dentro del JSON de
  `localStorage`.
- No reutilices `LyricClip` para composición.
- Archivo primero; HTTP llega después con los mismos bytes.
- Tests junto al dominio como `*.test.ts`.

## Al cerrar una sesión

Actualiza `TAREAS.md`, `TAREA_SECUENCIADOR.md` y este relevo. Indica el último
paso L completado, las comprobaciones ejecutadas y el siguiente archivo
concreto. No marques v2 completo hasta cerrar L3→L5 y la integración real.
