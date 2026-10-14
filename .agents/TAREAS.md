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
| Import `.vibrix-manifest.json`                                     | Hecho, sólo schema v1         |
| Revisión Current / Updated / Missing                               | Hecho para slots v1           |
| Catálogo y pista Scene                                             | Hecho                         |
| Drag + `Add at playhead`                                           | Hecho                         |
| Export `.vibrix-score.json`                                        | Hecho en v1, sólo referencias |
| Import `.vibrix-authoring`                                         | Pendiente                     |
| Manifiesto e imágenes schema v2                                    | Pendiente                     |
| Cues sostenidos sin `endTimeMs`                                    | Pendiente                     |
| Carriles Image y granulares                                        | Pendiente                     |
| `inherit`                                                          | Pendiente                     |
| Export `.vibrix-score` autocontenido                               | Pendiente                     |

## Orden de implementación

1. **L1 · Abrir el paquete de autoría.** Parser puro para
   `.vibrix-authoring`, manifiestos v1/v2, snapshots y previews. Mantener el
   JSON v1 como entrada legacy.
2. **L2 · Dominio score v2.** Nuevos cues guardan sólo `startTimeMs`; leer y
   normalizar proyectos/scores v1 sin reinterpretarlos silenciosamente.
3. **L3 · Timeline sostenida.** Añadir Image, Scene y carriles granulares. El
   borde derecho se deriva del siguiente cue del carril o del final del audio.
4. **L4 · Catálogo completo.** Slots e imágenes con preview o placeholder,
   drag, `Add at playhead`, estado de revisión e `inherit` granular.
5. **L5 · Paquete de score.** Exportar `.vibrix-score` con `score.json` y sólo
   snapshots, previews y assets referenciados.
6. **Integración.** Entregar un paquete real a Vibrix y verificar Play, seek y
   export offline con dos imágenes, dos escenas, Spectrum 2 e `inherit`.

### Siguiente paso concreto

Empieza por **L1** en `src/core/composition/authoringPackage.ts` y amplía los
tipos/parser existentes. Copia el fixture v2 literal desde el contrato de
Vibrix y pruébalo antes de tocar componentes React.

Contrato dueño:
`/Users/frankman254/Desktop/Personal-Projects/LiveWallpaperAnimeGlitch/docs/features/VIBRIX_AUTHORING_CONTRACT.md`.

## Trabajo local existente que no se mezcla

La revisión encontró cambios sin commit en exports estándar de letras,
sincronización y refactor del shell. Los serializadores LRC, Enhanced LRC, SRT,
VTT y TXT están implementados localmente con tests y UI, pero aún falta validar
manualmente `.srt` en VLC y `.lrc` en un reproductor de letras. Conserva ese
trabajo y ciérralo como su propio cambio; no lo incluyas en L1.

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
