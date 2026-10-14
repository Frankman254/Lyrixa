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

El primer corte del secuenciador existe, pero sigue en el contrato v1:

- `src/core/composition/` define manifiesto, tracks, cues y score v1.
- Se importa `.vibrix-manifest.json` y se comparan revisiones de slots.
- El catálogo sólo muestra escenas.
- La timeline tiene una pista Scene; drag y `Add at playhead` crean un bloque de
  ocho segundos con `startTimeMs` y `endTimeMs`.
- Se exporta `.vibrix-score.json` con referencias, no snapshots portables.
- El proyecto persiste `composition` y `vibrixManifest`.

Vibrix ya avanzó a v2: exporta `.vibrix-authoring` con slots, imágenes,
snapshots y previews; acepta score v2 con activaciones sostenidas e `inherit`.
Lyrixa todavía no abre ese paquete ni conoce imágenes, pistas granulares o
duración derivada.

Revisión cruzada: Vibrix tiene W2 en progreso local (sesión Compose y migración
153). No tocar ese trabajo desde Lyrixa. Su parser de score aún usa una unión
demasiado amplia que admite `intro-window` como carril/target; el contrato
cerrado lo excluye y Vibrix debe endurecer ese lector antes de la integración.

## Trabajo local que debes preservar

Al revisar el repo había cambios sin commit en exports de letra, cola de sync,
hooks del editor y documentación. No los reviertas ni los mezcles con la
migración Compose. Valídalos y ciérralos como su propio cambio si siguen
presentes; después trabaja por pasos L1→L5.

## Próximo movimiento

Empieza por **L1**, sólo en dominio puro:

1. ampliar tipos para leer manifiesto v1 y v2;
2. parsear el contenedor `.vibrix-authoring`;
3. validar el fixture literal v2 del manifiesto, que tiene `images: []`;
4. añadir otro fixture de paquete con imagen, snapshot y preview transportable;
5. conservar import de `.vibrix-manifest.json` como legacy.

No cambies todavía la timeline. Cuando el parser y los fixtures estén verdes,
L2 migra el score a cues con sólo `startTimeMs` y mantiene lectura v1.

## Reglas del repo

- Usa `npm`, nunca pnpm.
- `src/core` permanece puro: sin React, DOM, storage ni object URLs.
- La UI usa una sola `project.composition`; no crea un segundo array de cues.
- `project.composition` lleva discriminante v1/v2; un proyecto antiguo sin él
  se lee como v1.
- El paquete/manifiesto importado tiene una sola representación normalizada en
  `project.vibrixAuthoring`; `vibrixManifest` queda sólo como entrada legacy.
- No reutilices `LyricClip` para composición.
- Archivo primero; HTTP llega después con los mismos bytes.
- Tests junto al dominio como `*.test.ts`.

## Al cerrar una sesión

Actualiza `TAREAS.md`, `TAREA_SECUENCIADOR.md` y este relevo. Indica el último
paso L completado, las comprobaciones ejecutadas y el siguiente archivo
concreto. No marques v2 como terminado hasta abrir un `.vibrix-authoring` real.
