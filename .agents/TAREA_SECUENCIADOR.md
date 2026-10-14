# Tarea — secuenciador Compose v2 (lado Lyrixa)

> Actualizado el 2026-10-13. Diseño:
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
- La fuente importada se guarda una sola vez en `project.vibrixAuthoring` como
  unión `manifest` / `package`. `project.vibrixManifest` es entrada legacy y se
  normaliza a esa unión; no se mantienen las dos copias como fuentes de verdad.
- Un manifiesto suelto permite editar y exportar JSON por referencias. El
  paquete autocontenido `.vibrix-score` exige haber importado
  `.vibrix-authoring`, porque sólo éste trae snapshots.

## L1 · Importar `.vibrix-authoring`

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

Criterio: abrir el paquete desconectado y construir catálogo, snapshots y
previews sin `blob:` URLs ni acceso a otro origen.

## L2 · Score v2 y migración

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

## L3 · Carriles sostenidos

1. Crear el grupo plegable `Visual composition`.
2. Renderizar Scene e Image primero; añadir después los carriles granulares.
3. Derivar cada ancho desde el siguiente cue del **mismo carril** o la duración
   del audio.
4. Mover un cue cambia su corte y recalcula visualmente ambos vecinos.
5. Eliminar resize/end manual de cues v2; mantenerlo sólo al mostrar v1 legacy.
6. Reutilizar viewport, playhead, snap, selección y undo del proyecto sin
   convertir `LyricClip` en tipo genérico.

## L4 · Catálogo y edición

1. Separar objetos por Images, Scenes y familias granulares.
2. Mostrar miniatura transportable o placeholder con nombre.
3. Mantener drag y la alternativa táctil `Add at playhead` con área de 44 px.
4. Crear/enfocar el carril correcto al colocar un objeto.
5. Ofrecer `Inherit scene/image` sólo en carriles granulares.
6. Mostrar Updated/Missing sin borrar cues automáticamente.

Lyrixa puede mostrar una representación simple del bloque, pero Vibrix sigue
siendo la autoridad visual.

## L5 · Exportar `.vibrix-score`

1. Escribir el sobre de score schema 2 dentro del contenedor.
2. Calcular el cierre de dependencias de los cues enabled: targets directos y
   todo slot/escena que sus snapshots referencien. No basta con recopilar sólo
   los ids escritos directamente en los cues.
3. Incluir los snapshots de ese cierre y las miniaturas de las imágenes del
   cierre. `inherit` no crea una dependencia.
4. Validar que revisión y clase del snapshot coincidan con el target.
5. Mantener `.vibrix-score.json` v1 como export legacy durante la transición.

El contenedor v1 es JSON autocontenido con `format`, `packageVersion`,
`exportedAt`, el sobre `score`, `snapshots` y `previews`. No lleva originales de
imagen: Vibrix no se los entrega a Lyrixa. ZIP/binario entra en una versión
portable futura y no cambia los JSON internos.

## Integración compartida

Antes de intercambiar el primer archivo, Vibrix debe aplicar el mismo
vocabulario estricto: su parser no puede aceptar `intro-window` como
`track.kind`, `feature-slot.family` o `inherit.family`. En la revisión del
2026-10-13 su tipo `VibrixTimelineKind` todavía se construía con todas las
familias y requería ese ajuste del lado lector.

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
- No mezclar los cambios locales de exports de letra/refactor con L1.

## Siguiente archivo

Crear `src/core/composition/authoringPackage.ts`, extender los tipos con una
unión v1/v2 y añadir su test contra el fixture contractual. Ése es L1; la UI
actual queda intacta durante este paso.
