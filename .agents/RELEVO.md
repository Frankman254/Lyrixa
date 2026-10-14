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

El primer corte del secuenciador existe y **L1, L2 y la implementación de L3
están completados**:

- `src/core/composition/` define manifiesto, tracks, cues y scores v1/v2.
- Se importan `.vibrix-manifest.json` schema 1/2 y `.vibrix-authoring` v1.
- El paquete completo se valida en `src/core` y se guarda una sola vez en
  IndexedDB; el proyecto conserva `vibrixAuthoringRef`.
- El catálogo legacy sólo muestra escenas; completarlo para v2 corresponde a L4.
- La timeline v2 tiene el grupo plegable `Visual composition`, ordena Scene e
  Image antes de los carriles granulares y muestra activaciones sostenidas.
- El borde derecho de cada cue v2 se deriva del siguiente corte del mismo
  carril o del final del audio. Moverlo aplica el snap global y recalcula los
  vecinos; v2 no ofrece resize ni guarda `endTimeMs`.
- La timeline v1 conserva su editor de intervalos y sus dos handles sin
  reinterpretar proyectos históricos.
- Se exporta `.vibrix-score.json` con referencias, no snapshots portables.
- El proyecto persiste `composition` y la referencia ligera al catálogo.
- `project.composition` es una unión discriminada v1/v2. Los proyectos nuevos
  nacen en v2; la forma histórica sin `schemaVersion` se conserva como v1 con
  su `endTimeMs`.
- El dominio v2 admite Scene, Image, familias granulares e `inherit`, sólo con
  `startTimeMs`; el sobre JSON conserva la versión del proyecto.

Vibrix ya avanzó a v2: exporta `.vibrix-authoring` con slots, imágenes,
snapshots y previews; acepta score v2 con activaciones sostenidas e `inherit`.
Lyrixa ya abre ese paquete, entiende el score v2 y puede mostrar/mover cues de
Image, Scene y familias granulares. Aún falta L4 para poblar esos carriles desde
el catálogo con drag, `Add at playhead`, previews e `inherit`.

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
al iniciar L3. L3 permanece como cambios locales sin commit en esa misma rama:

- `src/core/composition/timeline.ts` y su test: orden, duración derivada, snap y
  movimiento puro;
- `SustainedCompositionTrackLane.tsx`: vista v2 sin handles de resize;
- `TimelineEditor.tsx`/`.css`: grupo plegable, altura/playhead y orden visual;
- `docs/fixtures/l3-sustained-score.lyrixa.json`: proyecto manual de 30 s con
  Scene, Image, Looks y Rain.

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

Sólo queda la confirmación manual del usuario (pasos abajo) antes de empezar
**L4** en `src/features/composition/CompositionCatalog.tsx`: catálogo v2
completo, previews/placeholder, creación del carril correcto e `inherit`
granular.

### Cómo probar L3 manualmente

1. `npm run dev`, abre `/#/editor`.
2. More → Import project → `docs/fixtures/l3-sustained-score.lyrixa.json`.
3. Pestaña Compose: el grupo `Visual composition` muestra
   "4 tracks · score v2" en orden Scene → Image → Looks → Rain.
4. Mueve "Chorus Scene" con drag: sus vecinos cambian de ancho al instante,
   nunca hay handles de resize; con Snap activo (Toolbar ▸ Snap) el corte cae
   en múltiplos exactos.
5. Ctrl/Cmd+Z deshace y Ctrl/Cmd+Shift+Z rehace el corte.
6. Pliega y despliega el grupo con su cabecera.

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
