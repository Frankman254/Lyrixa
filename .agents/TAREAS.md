# Lyrixa — qué hacer ahora

> Actualizado el 2026-10-16: Vibrix ya lee el contenedor y el contrato pasa la
> comprobación cruzada; falta el intercambio real con escenas.
> Empieza por
> [RELEVO.md](RELEVO.md) y usa
> [TAREA_SECUENCIADOR.md](TAREA_SECUENCIADOR.md) como cola ejecutable.

## Objetivo activo: migrar el secuenciador Compose a v2

Lyrixa es el secuenciador temporal; Vibrix prepara y renderiza imágenes,
escenas, spectra y efectos. El primer corte v1 de Lyrixa fue útil para validar
la idea, pero ya quedó detrás del contrato real de Vibrix.

### Estado real

| Pieza                                                              | Estado                        |
| ------------------------------------------------------------------ | ----------------------------- |
| Dominio `CompositionTrack` / `CompositionCue` / `CompositionScore` | Hecho v1/v2 (L2)              |
| Import `.vibrix-manifest.json`                                     | Hecho, schema v1/v2           |
| Revisión Current / Updated / Missing                               | Hecho para slots v1           |
| Catálogo y pista Scene                                             | Hecho                         |
| Drag + `Add at playhead`                                           | Hecho                         |
| Export `.vibrix-score.json`                                        | Hecho (v1 legacy, referencias)|
| Import `.vibrix-authoring`                                         | Hecho (L1)                    |
| Manifiesto e imágenes schema v2                                    | Hecho en parser/catálogo (L1) |
| Cues sostenidos sin `endTimeMs`                                    | Hecho en dominio (L2)         |
| Carriles Image y granulares                                        | Hecho en timeline (L3)        |
| Catálogo v2 (images/scenes/granular + preview + inherit)           | Hecho (L4)                    |
| Navegación catálogo: pestañas + acordeones + lista grande (≤2 clics)| Hecho (L4.1, `202c719`)       |
| «Visual at playhead» orientativo + plumbing miniatura de slot (V2.4a)| Hecho (L4.2, `571cc51`)       |
| `inherit`                                                          | Hecho en catálogo (L4)        |
| Export `.vibrix-score` autocontenido                               | Hecho (L5)                    |
| Vibrix lee el contenedor y rechaza `intro-window`                  | Hecho en Vibrix (`9dec2b48`)  |
| Carriles de letra sin solape en el preview                         | Hecho, sin commit             |

## Orden de implementación

1. **L1 · Abrir el paquete de autoría — hecho.** Parser puro para
   `.vibrix-authoring`, manifiestos v1/v2, snapshots y previews. Mantener el
   JSON suelto como entrada legacy. El fixture literal del manifiesto no tiene
   imágenes; añadir un fixture separado del paquete con imagen y miniatura. El
   paquete validado se guarda en IndexedDB y el proyecto conserva sólo una
   referencia ligera; no se embebe en `localStorage`.
2. **L2 · Dominio score v2 — hecho.** Nuevos cues guardan sólo `startTimeMs`; leer y
   normalizar proyectos/scores v1 sin reinterpretarlos silenciosamente. La
   versión se guarda explícitamente en `project.composition`, incluso vacío.
3. **L3 · Timeline sostenida — hecho y verificado.** Grupo plegable, Image y
   Scene primero, carriles granulares, ancho derivado y movimiento con
   snap/undo sin resize. Fixture manual en
   `docs/fixtures/l3-sustained-score.lyrixa.json`. Verificación automatizada
   (171/171, lint sin errores, build) más prueba en navegador real el
   2026-10-13: orden de carriles, plegado, drag con vecinos recalculados, snap
   0.5 s y Undo/Redo correctos (pasos en `RELEVO.md`).
4. **L4 · Catálogo completo — hecho y verificado.** Slots e imágenes con
   preview o placeholder, secciones por familia, search, drag al carril correcto
   (creado on-demand), `Add at playhead`, estado de revisión e `inherit`
   granular. Verificación en navegador real el 2026-10-14 con el fixture L3 y
   con el paquete Clairvoyance (0 escenas, 230 imágenes, 10 familias granulares);
   185/185 tests, lint sin errores, build correcto (pasos en `RELEVO.md`).
5. **L5 · Paquete de score — hecho y verificado.** `src/core/composition/scorePackage.ts`
   arma `.vibrix-score` (`format:'vibrix-score'`, `packageVersion:1`) reusando el
   envelope de `score.ts` y añadiendo el cierre transitivo de snapshots (escena
   → `bindings`, imagen → `sceneSlotId`; `inherit` y `'off'` no añaden nada,
   cues deshabilitados se ignoran) con sus previews transportables; valida
   revisión y clase contra el catálogo y lanza `VibrixScorePackageError` si
   falta algo. Sin `.vibrix-authoring` degrada a envelope de referencias
   (`.vibrix-score.json` v1 legacy intacto). Los originales de imagen no
   entran: Lyrixa nunca los recibe. Verificación 2026-10-14: 12 tests nuevos
   (48 en composition, 197 totales), export descargado y validado en navegador
   real con fixture de escena+bindings, y cierre sin fugas + previews
   `data:image/` sobre el paquete real Clairvoyance (560 snapshots) (pasos en
   `RELEVO.md`).
6. **Integración.** El lado Vibrix está hecho (`9dec2b48`: contenedor,
   `snapshots`/`previews` por `kind:id`, `intro-window` rechazado). El
   2026-10-16 un test cruzado pasó un paquete de Lyrixa por el parser real de
   Vibrix: 7/7 cues `ready`. Falta entregar un paquete real y verificar Play,
   seek y export offline con dos imágenes, dos escenas, Spectrum 2 e `inherit`.

### Siguiente paso concreto

**Intercambio real.** Hace falta un `.vibrix-authoring` exportado de un
proyecto Vibrix con ≥2 escenas (Clairvoyance tiene 0). Pasos en `RELEVO.md`
§«Próximo paso: intercambio real con Vibrix». Mientras tanto, commitear los
carriles de letra (`src/core/render/previewLanes.ts` + `ClipLyricsRenderer`)
si el usuario lo pide.

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
