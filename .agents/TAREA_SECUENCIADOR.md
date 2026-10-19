# Tarea — secuenciador Compose v2 (lado Lyrixa)

> Actualizado el 2026-10-14. Diseño:
> [../docs/03-vibrix-composition-sequencer.md](../docs/03-vibrix-composition-sequencer.md).
> Contrato dueño:
> `/Users/frankman254/Desktop/Personal-Projects/LiveWallpaperAnimeGlitch/docs/features/VIBRIX_AUTHORING_CONTRACT.md`.

## Responsabilidad

Vibrix crea y renderiza objetos visuales. Lyrixa recibe un paquete de autoría,
los coloca en el tiempo y devuelve un score. Lyrixa no evalúa shaders ni guarda
una copia editable de los parámetros de Vibrix.

```text
Vibrix ── .vibrix-authoring ──▶ Lyrixa ── .vibrix-score ──▶ Vibrix
```

## Corte existente: v1

Ya existe y debe seguir abriendo mientras se construye v2:

- `core/composition/types.ts`: familias, manifiesto, tracks y cues v1.
- `authoringManifest.ts`: parser de manifiesto JSON schema 1.
- `slotStatus.ts`: Current / Updated / Missing por id + revisión.
- `score.ts`: normalización y sobre `.vibrix-score.json` schema 1.
- `CompositionCatalog.tsx`: escenas, drag y `Add at playhead`.
- `CompositionTrackLane.tsx`: una pista Scene con mover y resize.
- `project.composition` y `project.vibrixManifest`: persistencia aditiva.

Cada cue v1 tiene `startTimeMs` y `endTimeMs`; la UI crea ocho segundos. Ese
modelo es compatibilidad, no la base de la nueva timeline.

## Modelo v2 cerrado

- Un cue nuevo guarda `startTimeMs`, target, prioridad y enabled.
- La activación dura hasta el siguiente cue del carril o el final del audio.
- Carriles: Image, Scene, Spectrum 1, Spectrum 2, Looks, Particles, Rain,
  Lights, Camera FX, Logo, Track Title y Background Zoom avanzado.
- `intro-window` es informativo; calibration nunca se publica.
- Scene e Image son agregados. Un cue granular sólo afecta su familia.
- `inherit` retira un override granular sostenido y devuelve el control a
  Scene/Image.
- En el mismo milisegundo el orden semántico es Scene, Image y granulares.
- La transición de imágenes pertenece a la imagen saliente; Lyrixa sólo fija el
  instante del cambio.

### Decisiones de contrato que no se dejan a la implementación

- `VibrixCueableSlotFamily` excluye `intro-window`.
- `VibrixGranularFamily` excluye `scene` e `intro-window`; incluye
  `background-zoom`.
- `VibrixTimelineKind = VibrixCueableSlotFamily | 'image'`. Por tanto nunca
  existe un carril `intro-window`.
- Un target `scene` lleva `family: 'scene'`; uno `image`, `family: 'image'`;
  `feature-slot` e `inherit` sólo aceptan `VibrixGranularFamily`.
- El proyecto guarda una unión discriminada interna
  `StoredCompositionV1 | StoredCompositionV2`, con `schemaVersion` dentro de
  `project.composition`. La ausencia del campo al abrir un proyecto antiguo se
  interpreta como v1. No se infiere la versión mirando si existen cues.
- La fuente importada se guarda una sola vez en IndexedDB como unión
  `manifest` / `package`; `project.vibrixAuthoringRef` contiene sólo su clave y
  metadatos ligeros. `project.vibrixManifest` es entrada legacy y se migra a ese
  almacenamiento; no se mantienen dos copias como fuentes de verdad ni se mete
  el paquete completo en `localStorage`.
- Un manifiesto suelto permite editar y exportar JSON por referencias. El
  paquete autocontenido `.vibrix-score` exige haber importado
  `.vibrix-authoring`, porque sólo éste trae snapshots.

## L1 · Importar `.vibrix-authoring` — completado

Trabajo puro en `src/core/composition/`:

1. Modelar `VibrixAuthoringManifest` v1/v2 y el contenedor
   `VibrixAuthoringPackage` sin perder discriminación de versión.
2. Añadir `VibrixManifestImage` y snapshots discriminados `slot` / `image`.
3. Parsear `.vibrix-authoring`; exigir exactamente un snapshot por cada clave
   `(kind, id)` del manifiesto y rechazar duplicados, faltantes, huérfanos o
   discrepancias de `kind`, `family` y `revision`.
4. Mantener `parseAuthoringManifest` para `.vibrix-manifest.json` v1/v2.
5. Aceptar miniaturas sólo como `data:image/...`; rechazar `blob:`, HTTP y rutas
   locales. El contrato v1 del contenedor no fija todavía un MIME concreto ni
   un límite de bytes.
6. Probar por separado el fixture literal del manifiesto —que lleva
   `images: []`—, un fixture de paquete con imagen/miniatura y un paquete real
   exportado por Vibrix.
7. Persistir los bytes/objeto validado en IndexedDB desde `src/features`; el
   dominio puro sólo parsea. El paquete real revisado pesa 9.7 MB y no cabe de
   forma segura en el proyecto que hoy se guarda en `localStorage`.

Criterio: abrir el paquete desconectado y construir catálogo, snapshots y
previews sin `blob:` URLs ni acceso a otro origen.

Comprobado el 2026-10-13 con el paquete real de 9.7 MB: 330 slots, 230 imágenes
y 560 snapshots válidos. La UI lo importó, mostró el resumen y lo recuperó de
IndexedDB tras recargar. El paquete contiene 0 escenas; no cubre aún la prueba
de colocación de cues, que corresponde a un fixture/proyecto posterior.

## L2 · Score v2 y migración — completado

1. Añadir `VibrixCueableSlotFamily`, `VibrixGranularFamily` y
   `VibrixTimelineKind = VibrixCueableSlotFamily | 'image'`.
2. Tipar targets `scene`, `feature-slot`, `image` e `inherit` con las
   restricciones de familia cerradas arriba.
3. Guardar proyectos nuevos con `project.composition.schemaVersion: 2` y sin
   `endTimeMs`; normalizar la forma actual sin discriminante como schema 1.
4. Normalizar proyectos v1 de forma aditiva y conservar su duración histórica
   al importarlos; no convertir silenciosamente un intervalo v1 en activación
   infinita.
5. Extender estado de dependencias a slots e imágenes: current, updated,
   missing, empty y disabled según corresponda.

Criterio: serializar → importar → serializar conserva ids, revisiones, orden y
tiempos; los fixtures v1 siguen verdes.

Comprobado el 2026-10-13: los proyectos nuevos nacen con `schemaVersion: 2`;
la forma sin discriminante abre como v1 y conserva `endTimeMs`; el round-trip
v2 conserva targets, revisiones, orden y tiempos. El sobre JSON sale en la
misma versión del score y discrimina dependencias slot/image. La UI mantiene
el editor de intervalos sólo para v1 hasta L3.

## L3 · Carriles sostenidos

1. Crear el grupo plegable `Visual composition`.
2. Renderizar Scene e Image primero; añadir después los carriles granulares.
3. Derivar cada ancho desde el siguiente cue del **mismo carril** o la duración
   del audio.
4. Mover un cue cambia su corte y recalcula visualmente ambos vecinos.
5. Eliminar resize/end manual de cues v2; mantenerlo sólo al mostrar v1 legacy.
6. Reutilizar viewport, playhead, snap, selección y undo del proyecto sin
   convertir `LyricClip` en tipo genérico.

**Implementado y verificado el 2026-10-13.** La lógica pura vive en
`src/core/composition/timeline.ts`; el componente v2 separado es
`SustainedCompositionTrackLane.tsx`. `CompositionTrackLane.tsx` continúa como
editor legacy v1. `TimelineEditor` añade el grupo plegable y reutiliza el snap,
selección, playhead e historial global. El fixture
`docs/fixtures/l3-sustained-score.lyrixa.json` permite comprobar los cuatro
carriles sin depender de que el paquete real de Vibrix tenga escenas.

Prueba en navegador real (2026-10-13, fixture importado en Compose): orden de
carriles Scene → Image → Looks → Rain correcto; plegar oculta las 4 lanes y
desplegar restaura los 9 cues; arrastrar "Chorus Scene" +2 s movió su corte y
recalculó los vecinos en vivo; con Snap 0.5 s el corte quedó en 11000 ms
exactos; Undo/Redo revierten y rehacen el corte; sin handles de resize en
cues v2.

## L4 · Catálogo y edición

1. Separar objetos por Images, Scenes y familias granulares.
2. Mostrar miniatura transportable o placeholder con nombre.
3. Mantener drag y la alternativa táctil `Add at playhead` con área de 44 px.
4. Crear/enfocar el carril correcto al colocar un objeto.
5. Ofrecer `Inherit scene/image` sólo en carriles granulares.
6. Mostrar Updated/Missing sin borrar cues automáticamente.

Lyrixa puede mostrar una representación simple del bloque, pero Vibrix sigue
siendo la autoridad visual.

**Implementado y verificado el 2026-10-14.** La lógica pura vive en
`src/core/composition/catalog.ts` (agrupación por secciones, filtros,
descriptores de drag `PlacementDescriptor`, `placeFromCatalog` con
`ensureTimelineTrack`). El drag transporta **sólo ids**, nunca revisions: el
drop los resuelve contra el manifiesto vivo, así que Vibrix sigue siendo la
autoridad visual. La UI reescrita es `CompositionCatalog.tsx` (+`.css`); el drop
se conecta en `SustainedCompositionTrackLane.tsx` con
`VIBRIX_PLACEMENT_DRAG_TYPE`. Verificación en navegador real con el fixture L3 y
el paquete Clairvoyance (0 escenas, 230 imágenes, 10 familias): previews,
search (con auto-reset al cambiar de manifiesto), `Add at playhead` de los
cuatro tipos de placement, `inherit` sólo en granulares, carril Spectrum creado
on-demand en orden correcto, drag con snap exacto y undo del par carril+cue.
`npm test` 185/185 (14 nuevos en `catalog.test.ts`), lint sin errores, build
correcto. Los 6 puntos de arriba quedaron cubiertos.

### L4.1 · Navegación del catálogo para paquetes grandes — completado (2026-10-14)

Con el paquete Clairvoyance real (230 imágenes, 330 slots, 0 escenas) el rail
único hacía que `Images 230` dominara la lista y ocultara Scenes y las familias
granulares: encontrar una familia exigía scrollear. Solo UI; el contrato y el
formato del paquete no cambiaron.

1. Barra de pestañas por tipo **All / Images / Scenes / Slots** (filtro de
   vista, conteos no filtrados, la selección persiste en `localStorage`).
2. Cada sección es un **acordeón plegable**; en All/Slots arrancan cerradas, así
   cualquier familia queda a **≤2 clics** (pestaña + familia). `Inherit` sigue
   dentro de su familia.
3. Una búsqueda **fuerza abrir** todas las secciones con matches.
4. Render **incremental** (`WindowedList`, 80 filas + `IntersectionObserver`)
   para no montar de golpe 230 previews `data:image`; sin añadir dependencia de
   virtualización.
5. **0 escenas** se anuncia explícitamente («This package has 0 scenes.») en vez
   de ocultar la sección.

Verificado en navegador real con el paquete Clairvoyance: pestañas con conteos
(All 560 · Images 230 · Scenes 0 · Slots 330); windowing 80→230 al scrollear;
≤2 clics a Background Zoom (última familia); search auto-expande; `Add at
playhead` y drag intactos. Lógica de agrupación/filtro sigue pura en
`src/core/composition/catalog.ts`; la presentación vive en
`CompositionCatalog.tsx`.

## L4.2 · «Visual at playhead» — completado (2026-10-14)

Queja del autor: al editar la timeline se trabaja «a ciegas» — el catálogo no
dice qué está activo en el cursor ni con qué pinta. Solución **orientativa** en
Lyrixa (decisión acordada: el secuenciador sigue en Lyrixa; la autoridad visual
es Vibrix, que nunca se duplica renderizando shaders aquí). La miniatura de slot
con imagen real es un hueco de contrato que resuelve Vibrix (V2.4a); mientras
tanto el panel ya funciona con nombres y placeholders.

1. **Resolver puro** en `src/core/composition/visualState.ts`:
   `resolveCompositionVisualState(score, manifest, timeMs)` repliega los cues
   `startTimeMs <= t` (carriles y cues enabled) exactamente como el contrato:
   escena aplica `bindings`; imagen fija imagen y arrastra su `sceneSlotId`;
   `feature-slot` pisa su carril; `inherit` lo libera a la binding de escena.
   Empates al ms en orden `TRACK_KIND_ORDER` (Scene → Image → granulares). Un
   carril devuelto por escena se marca `fromScene`; `'off'` se marca `off`.
   Sin manifest → inactivo. Sin cues activos → `active: false` (mensajes de
   «Nothing placed yet»). Slots/imágenes inexistentes degradan a id desnudo.
2. **Miniatura de slot en Lyrixa (plumbing V2.4a):** `VibrixManifestSlot`
   admite `thumbnailDataUrl?` (aditivo, **no sube `schemaVersion`**); el parser
   la valida como data URL transportable y rechaza `blob:`; `renderSlotCard` la
   muestra si viene. Un manifiesto sin el campo sigue siendo válido (Vibrix aún
   no la genera).
3. **Panel** `VisualAtPlayhead` en `CompositionCatalog.tsx`: hero con imagen
   actual (miniatura real del paquete) + escena; una línea por carril granular
   resuelto (miniatura o iniciales, marca `(scene)` / `off` /
   `missing in Vibrix`); tiempo del playhead formateado `m:ss`; tope de altura
   con scroll interno.

Pruebas: 9 casos en `visualState.test.ts` (pliegue, bindings on/off/absent,
override sostenido → inherit, imagen→escena, empates ms, carril apagado,
referencia inexistente, clamp de tiempo) + 2 en `authoringManifest.test.ts`
(thumbnail de slot aceptada/rechazada). `npm test` 211/211.

Verificado en navegador real con el paquete Clairvoyance (2026-10-14): en `0:00`
el carril Spectrum muestra «Cardioid Bars» con iniciales; al colocar una imagen
en el playhead el hero pasa de «No image» a su nombre **con su miniatura real**
(data URL del paquete) y el undo lo revierte. Clairvoyance tiene 0 escenas, así
que la rama escena+bindings se ejercita con los tests del fixture v2 inline.

## L5 · Exportar `.vibrix-score` — completado
Implementado en `src/core/composition/scorePackage.ts` (+ `scorePackage.test.ts`)
y conectado al botón `Export score` de `LyrixaEditorShell.tsx`.

1. El contenedor reusa el sobre de `score.ts` (score schema 2 + deps directas +
   metadatos) como `envelope`.
2. `computeScoreClosure` recorre los cues enabled y expande el grafo: escena →
   cada `bindings` (omitido `'off'`, exige familia coincidente), imagen →
   `sceneSlotId` → escena → sus bindings, transitivamente. No se queda en los
   ids escritos a mano.
3. Trae los snapshots del cierre y las `thumbnailDataUrl` de las imágenes del
   cierre; `inherit` no encola nada y los cues deshabilitados se ignoran.
4. Valida que revisión y clase (familia) de cada snapshot alcancen el target; si
   falta o difiere, `VibrixScorePackageError` con la lista de issues.
5. Sin `.vibrix-authoring` (manifiesto suelto) degrada al envelope de
   referencias y se conserva `.vibrix-score.json` v1 legacy intacto.

El contenedor v1 es JSON autocontenido con `format`, `packageVersion`,
`exportedAt`, el sobre `score`, `snapshots` y `previews`. No lleva originales de
imagen: Vibrix no se los entrega a Lyrixa. ZIP/binario entra en una versión
portable futura y no cambia los JSON internos.

## Integración compartida

Vibrix ya aplica el vocabulario estricto: desde `9dec2b48` su parser rechaza
`intro-window` como `track.kind`, `feature-slot.family` e `inherit.family`, y
lee el contenedor `.vibrix-score` con la regla compartida de **carril apagado
= cue inactivo**. Todo está documentado en
`docs/features/VIBRIX_AUTHORING_CONTRACT.md`. El 2026-10-16 un test cruzado
pasó el paquete de Lyrixa por `parseVibrixScoreDocument` + `reviewVibrixScore`
de Vibrix: sin errores y 7/7 cues `ready`.

El score real de salida coloca:

1. Image A `00:00`, Image B `03:00`.
2. Scene A `00:00`, Scene B `01:00`.
3. Spectrum 2 `01:30`, `inherit` `02:00`.

Vibrix debe producir el mismo frame al hacer seek o reproducir desde cero y el
mismo resultado en export offline. Esta comprobación es la única parte que
espera al runtime de Vibrix; L1→L5 no están bloqueados.

## No mezclar

- No tocar el contrato de letras `.lyrixa-lyrics.json`.
- No añadir endpoints antes de que el archivo funcione; HTTP reutilizará los
  mismos bytes.
- No meter parámetros visuales editables de Vibrix en el inspector.
- No mezclar las validaciones pendientes de exports de letra con Compose.

## Siguiente archivo

No queda código pendiente en ninguno de los dos lados. El siguiente paso es la
prueba real de arriba, con un `.vibrix-authoring` que tenga escenas. Pasos en
`RELEVO.md` §«Próximo paso: intercambio real con Vibrix».
