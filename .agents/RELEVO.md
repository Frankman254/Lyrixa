# Relevo de Lyrixa

> Actualizado el 2026-10-13. Continúa por
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

Vibrix ya avanzó a v2: exporta `.vibrix-authoring` con slots, imágenes,
snapshots y previews; acepta score v2 con activaciones sostenidas e `inherit`.
Lyrixa ya abre ese paquete, entiende el score v2, muestra/mueve cues, los
puebla desde el catálogo (L4) y exporta el contenedor `.vibrix-score`
autocontenido (L5). Sólo falta la integración real con Vibrix (leer el
contenedor y endurecer su parser).

Revisión cruzada: Vibrix cerró W2 en `338c8e03` (sesión Compose y migración
153). Su parser de score aún usa una unión
demasiado amplia que admite `intro-window` como carril/target; el contrato
cerrado lo excluye y Vibrix debe endurecer ese lector antes de la integración.

Prueba manual del 2026-10-13: se importó
`future-core-techcore-mix-clairvoyance.vibrix-authoring` (9.7 MB), se mostraron
330 slots y 230 imágenes, y el catálogo sobrevivió una recarga desde IndexedDB.
El proyecto Vibrix exportado contiene 0 escenas, así que sirve para cerrar L1
pero no para probar todavía cues Scene.

## Trabajo local que debes preservar

El usuario integró L1/L2 a `main`; `main` y `origin/main` estaban en `58c2382`
al iniciar L3. L3, L4 y L5 permanecen como cambios locales sin commit en esa
misma rama:

- `src/core/composition/timeline.ts` y su test: orden, duración derivada, snap
  y movimiento puro (`snapAndClampStartTimeMs` extraído y reutilizado);
- `src/core/composition/catalog.ts` + `catalog.test.ts` (L4): placements puros,
  agrupación del manifiesto, filtros, descriptores de drag y
  `placeFromCatalog`/`ensureTimelineTrack`;
- `SustainedCompositionTrackLane.tsx`: vista v2 sin handles de resize y ahora
  con `onDragOver`/`onDrop` de placements (L4);
- `CompositionCatalog.tsx`/`.css` (L4): catálogo v2 reescrito con secciones,
  search, previews, `Add at playhead`, `inherit` e inspector v2;
- `TimelineEditor.tsx`/`.css`: grupo plegable, altura/playhead y orden visual;
- `docs/fixtures/l3-sustained-score.lyrixa.json`: proyecto manual de 30 s con
  Scene, Image, Looks y Rain.
- `src/core/composition/scorePackage.ts` + `scorePackage.test.ts` (L5):
  `computeScoreClosure` (cierre transitivo por `bindings` de escena y
  `sceneSlotId` de imagen, excluye `inherit` y `off`, valida revisión/familia)
  y `buildVibrixScorePackage` (reusa el envelope de `score.ts`; emite
  `snapshots`/`previews` sólo con fuente `.vibrix-authoring`, referencia pura en
  lo demás). `authoringManifest.ts`: `snapshotKey` exportada para reutilizar.
- `LyrixaEditorShell.tsx` (L5): `downloadVibrixScore` recibe la fuente de
  authoría; descarga `<nombre>.vibrix-score` (contenedor) con paquete o
  `<nombre>.vibrix-score.json` (envelope legacy) con manifiesto suelto.

No descartar esos archivos. El usuario decidió continuar directamente en
`main`; no crear otra rama salvo que lo pida.

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

### Próximo paso: Integración con Vibrix

Lyrixa ya emite el contenedor. Falta el lado Vibrix: enseñar a
`src/features/composition/vibrixScore.ts` a reconocer `format:'vibrix-score'`
con `packageVersion` (hoy sólo parsea el envelope plano `app:'Lyrixa'` +
`exportKind`), resolver `snapshots`/`previews` por `kind:id` en lugar de
buscar en su store, y **endurecer el parser** excluyendo `intro-window` de
`track.kind`/`feature-slot.family`/`inherit.family` (anotado en la revisión
cruzada). Luego el primer intercambio real Clairvoyance → Vibrix y comprobar
Play/seek/export offline con el mismo resultado.

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
