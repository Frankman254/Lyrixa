# Lyrixa — qué hacer ahora

> Actualizado el 2026-10-13 después de contrastar el código de Lyrixa con el
> productor y runtime actuales de Vibrix. Empieza por
> [RELEVO.md](RELEVO.md) y usa
> [TAREA_SECUENCIADOR.md](TAREA_SECUENCIADOR.md) como cola ejecutable.

## Objetivo activo: migrar el secuenciador Compose a v2

Lyrixa es el secuenciador temporal; Vibrix prepara y renderiza imágenes,
escenas, spectra y efectos. El primer corte v1 de Lyrixa fue útil para validar
la idea, pero ya quedó detrás del contrato real de Vibrix.

### Estado real

| Pieza                                                              | Estado                        |
| ------------------------------------------------------------------ | ----------------------------- |
| Dominio `CompositionTrack` / `CompositionCue` / `CompositionScore` | Hecho en v1                   |
| Import `.vibrix-manifest.json`                                     | Hecho, schema v1/v2           |
| Revisión Current / Updated / Missing                               | Hecho para slots v1           |
| Catálogo y pista Scene                                             | Hecho                         |
| Drag + `Add at playhead`                                           | Hecho                         |
| Export `.vibrix-score.json`                                        | Hecho en v1, sólo referencias |
| Import `.vibrix-authoring`                                         | Hecho (L1)                    |
| Manifiesto e imágenes schema v2                                    | Hecho en parser/catálogo (L1) |
| Cues sostenidos sin `endTimeMs`                                    | Pendiente                     |
| Carriles Image y granulares                                        | Pendiente                     |
| `inherit`                                                          | Pendiente                     |
| Export `.vibrix-score` autocontenido                               | Pendiente                     |

## Orden de implementación

1. **L1 · Abrir el paquete de autoría — hecho.** Parser puro para
   `.vibrix-authoring`, manifiestos v1/v2, snapshots y previews. Mantener el
   JSON suelto como entrada legacy. El fixture literal del manifiesto no tiene
   imágenes; añadir un fixture separado del paquete con imagen y miniatura. El
   paquete validado se guarda en IndexedDB y el proyecto conserva sólo una
   referencia ligera; no se embebe en `localStorage`.
2. **L2 · Dominio score v2.** Nuevos cues guardan sólo `startTimeMs`; leer y
   normalizar proyectos/scores v1 sin reinterpretarlos silenciosamente. La
   versión se guarda explícitamente en `project.composition`, incluso vacío.
3. **L3 · Timeline sostenida.** Añadir Image, Scene y carriles granulares. El
   borde derecho se deriva del siguiente cue del carril o del final del audio.
4. **L4 · Catálogo completo.** Slots e imágenes con preview o placeholder,
   drag, `Add at playhead`, estado de revisión e `inherit` granular.
5. **L5 · Paquete de score.** Exportar `.vibrix-score` con el score, el cierre
   transitivo de snapshots usados y las previews correspondientes. Los
   originales de imagen no entran: Lyrixa nunca los recibe.
6. **Integración.** Entregar un paquete real a Vibrix y verificar Play, seek y
   export offline con dos imágenes, dos escenas, Spectrum 2 e `inherit`.

### Siguiente paso concreto

Empieza por **L2** en `src/core/composition/types.ts` y
`src/core/composition/score.ts`: modela `StoredCompositionV1 |
StoredCompositionV2`, agrega el discriminante y prueba round-trip/migración sin
tocar aún la timeline.

Contrato dueño:
`/Users/frankman254/Desktop/Personal-Projects/LiveWallpaperAnimeGlitch/docs/features/VIBRIX_AUTHORING_CONTRACT.md`.

## Trabajo previo separado

El usuario ya cerró en un commit los exports estándar de letras,
sincronización y refactor del shell. Los serializadores LRC, Enhanced LRC, SRT,
VTT y TXT tienen tests y UI; aún falta validar manualmente `.srt` en VLC y
`.lrc` en un reproductor de letras. No mezclar esas validaciones con Compose.

## Después de Compose

- Identidad del paquete (`lyra-ui` → `lyrixa`, versión y changelog).
- Servir bajo subpath y transporte HTTP con los mismos bytes que los archivos.
- `.ass` y TTML después de `1.0`.

## No hacer ahora

- Añadir efectos visuales que Vibrix no renderiza.
- Copiar controles de shaders o edición de slots a Lyrixa.
- Cuentas, nube, colaboración o llamadas directas a modelos.
- Borrar el soporte v1 antes de que el circuito v2 pase la prueba real.

## Antes de cerrar cada paso

```bash
npm test
npm run lint
npm run build
```
