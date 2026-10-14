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

El primer corte del secuenciador existe y **L1 de la migración v2 está
completado**:

- `src/core/composition/` define manifiesto, tracks, cues y score v1.
- Se importan `.vibrix-manifest.json` schema 1/2 y `.vibrix-authoring` v1.
- El paquete completo se valida en `src/core` y se guarda una sola vez en
  IndexedDB; el proyecto conserva `vibrixAuthoringRef`.
- El catálogo sólo muestra escenas.
- La timeline tiene una pista Scene; drag y `Add at playhead` crean un bloque de
  ocho segundos con `startTimeMs` y `endTimeMs`.
- Se exporta `.vibrix-score.json` con referencias, no snapshots portables.
- El proyecto persiste `composition` y la referencia ligera al catálogo.

Vibrix ya avanzó a v2: exporta `.vibrix-authoring` con slots, imágenes,
snapshots y previews; acepta score v2 con activaciones sostenidas e `inherit`.
Lyrixa ya abre ese paquete, pero aún no ofrece imágenes, pistas granulares ni
duración derivada en la timeline.

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

El usuario cerró en un commit el trabajo previo de exports de letra, cola de
sync, hooks del editor y documentación antes de iniciar L1. Los cambios actuales
corresponden a L1; no los mezcles con L2 hasta cerrar este corte.

## Próximo movimiento

Empieza por **L2** en `src/core/composition/types.ts` y
`src/core/composition/score.ts`: añade la unión discriminada del score, crea
cues v2 con sólo `startTimeMs` y conserva lectura/serialización histórica v1.
No cambies todavía la timeline; los carriles sostenidos pertenecen a L3.

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
concreto. No marques v2 completo hasta cerrar L2→L5 y la integración real.
