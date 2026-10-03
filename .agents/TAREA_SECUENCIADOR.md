# Tarea — el secuenciador de composición (lado Lyrixa)

> **Diseño:** [../docs/03-vibrix-composition-sequencer.md](../docs/03-vibrix-composition-sequencer.md)
> — sigue siendo válido salvo donde el contrato lo corrige.
>
> **Contrato, y manda sobre el diseño:**
> `/Users/frankman254/Desktop/Personal-Projects/LiveWallpaperAnimeGlitch/docs/features/VIBRIX_AUTHORING_CONTRACT.md`.
> Lo escribe y lo mantiene Vibrix, porque el catálogo es su estado — igual que
> Lyrixa manda en el bundle de letras.
>
> **El otro lado:**
> `LiveWallpaperAnimeGlitch/.agents/TAREA_MANIFIESTO.md`.

## No estás bloqueada. Esto es lo que cambió

La versión anterior del plan decía que Lyrixa no podía arrancar hasta que Vibrix
publicara el manifiesto. **Ya no:** el contrato trae un **fixture literal** —un
manifiesto JSON completo, con sus casos de borde— y la regla es que los dos repos
lo validen cada uno en su suite. Construye contra ese fixture. Cuando llegue el
manifiesto real, si no encaja, el que avisa es un test.

Lo único que de verdad espera a Vibrix es la **última** comprobación: que un
score exportado cambie lo que se ve en Vibrix. Todo lo anterior se hace hoy.

## Tres correcciones al diseño, verificadas en el código de Vibrix

No son matices; cambian tipos y UI, y es más barato ahora que después.

**1. `kind: 'motion'` no existe. Bórralo.** No es que falte en Vibrix: se
**eliminó**. `wallpaperStoreMigrations.ts:2974` hace
`delete migratedState.motionProfileSlots`. «Motion» era partículas+lluvia juntas
y hoy se componen por separado. Un cue `'motion'` no se podría resolver nunca.

**2. `'background'` pasa a `'background-zoom'`, y no es lo que parece.**
`backgroundProfileSlots` son perfiles del **envelope de zoom por graves** (los
consume `BgZoomAudioSection.tsx`), no «qué imagen se ve». Ninguna escena los
referencia. Si la pista se llama `background`, la UI promete cambiar la imagen de
fondo desde la línea temporal — y eso no es un slot, es el pool y los setlists de
Vibrix. Llega con `sceneBindable: false` y sólo debe aparecer en `Advanced`.

**3. `'spectrum-second'` es una familia propia.** Spectrum 2 tiene su **propio
banco** de slots en Vibrix (`spectrumSecondProfileSlots`) y las escenas lo ligan
aparte de Spectrum 1. Dos pistas, no una con un parámetro.

Y una familia nueva, informativa: **`intro-window`**, con `cueable: false`. Una
ventana de intro **cubre** la cabeza del tema por diseño, no se coloca en un
instante; se muestra para que el usuario sepa con qué abre el tema, y no se
arrastra. `calibration` no se publica nunca: es del dispositivo de quien edita.

## S1 · El dominio de composición — ahora, sin esperar nada

`src/core/composition/` (puro: nada de React, DOM ni `localStorage`, como manda
AGENTS.md).

1. **Tipos** `CompositionTrack` / `CompositionCue` / `CompositionScore` del
   diseño, con `VibrixSlotFamily` del contrato (las tres correcciones de arriba
   aplicadas). Milisegundos **enteros**.
2. **Parser del manifiesto** — `parseAuthoringManifest(unknown)`, que devuelve
   errores legibles en vez de reventar. El fixture del contrato es su test
   principal, copiado **literal**.
3. **Serializador del score** — `createVibrixScoreEnvelope(project)`, con la
   misma disciplina que `createLyricsBundleEnvelope`: los mismos bytes para
   archivo y para HTTP.

**Tests que importan más que el resto** (los casos de borde del fixture):
`revision: 'empty'` ⇒ slot listado pero no arrastrable; una clave de `bindings`
**ausente** ≠ `"off"` (ausente es «no toques ese subsistema»; `"off"` es
«apágalo») — aplanarlos es el bug caro; `sceneBindable: false` ⇒ ninguna escena
le apunta; `cueable: false` ⇒ no se arrastra.

## S2 · Detectar que un slot cambió bajo tus pies

Para esto existe `slotRevision`, y conviene tenerlo **antes** de la UI, porque
decide qué estados pinta una card.

Un cue guarda `target.slotRevision`. Al importar un manifiesto nuevo, por cada
cue: **igual** ⇒ al día; **distinta** ⇒ `Updated in Vibrix`; **el id no está** ⇒
`Missing in Vibrix`, y el cue se queda (nunca se borra solo) pero no se puede
exportar como válido.

Ojo con lo que **no** cambia la revisión: **renombrar un slot en Vibrix no la
mueve**, porque sólo se hashea el contenido. Si tu UI empareja por nombre, un
rename romperá un score que en realidad está perfecto.

## S3 · Primitivas del timeline, sin tocar `LyricClip`

Extraer lo que ya comparten letras y composición —viewport, selección, drag,
resize, snap, playhead— **sin cambiar `LyricClip`**. Es la Fase B.2 del diseño y
el punto donde es fácil romper lo que ya funciona: el modelo de contenido **no**
se comparte, sólo la mecánica.

El diseño pide **undo/redo de proyecto antes de que el timeline crezca** con más
tipos de item. Es un riesgo que él mismo anota; si hay que elegir, va antes que
las pistas granulares.

## S4 · Catálogo y una sola pista `Scene`

El corte vertical del diseño, en modo `Simple`: audio, letras, **una** pista
Scene, y transición/duración del cue seleccionado. Drag and drop **con
alternativa explícita** (`Add at playhead`) desde el primer día: en móvil no es
un extra, es el camino principal, con área táctil de 44 px.

## S5 · Cerrar el círculo — esto sí espera a Vibrix

Exportar `<proyecto>.vibrix-score.json`, que Vibrix lo importe y que al hacer
seek cambie de escena. Y el mismo resultado en su export offline.

## Transporte: archivo. Y por qué, verificado

`src/core/bridge/liveWallpaperTarget.ts` apunta a
`POST {base}/api/lyrics-bundle`. El servidor de Vibrix
(`backend/server/src/index.mjs`) sirve `/api/health`, `/api/ai/scene-intent` y
`/api/projects*`: **esa ruta no existe**. Hoy el target HTTP siempre informa «no
disponible» y todo cae al fallback de archivo — que es el camino que funciona de
verdad, no un plan B.

Además el manifiesto sale del **store del navegador** de Vibrix, que el servidor
no tiene. Así que la primera versión va por archivo en los dos sentidos. El
puente ya está bien diseñado para esto: su propio comentario dice que la entrega
es separable de la construcción, así que añade un `VibrixCatalogSource` para la
lectura y un `sendScoreToLiveWallpaper` para la escritura **con la misma forma**
que lo de letras, y HTTP entra después sin tocar los bytes.

## Lo que NO entra

- **No dupliques el editor de Vibrix.** Lyrixa decide **qué, cuándo y cuánto**.
  Ningún parámetro de shader, ningún dial de una familia.
- **No evalúes el score para pintar «de verdad».** El preview de Lyrixa es una
  representación simple; la autoridad visual es Vibrix. El evaluador stateless
  (`resolveVisualStateAt`) es trabajo **de Vibrix**, en su Fase C.
- **No toques el código de Vibrix desde aquí** (ni al revés): su AGENTS.md y el
  tuyo lo prohíben. Si el contrato necesita un cambio, se cambia **en su
  documento**, en Vibrix, y los dos lados lo siguen.
- Nada de cuentas, nube ni IA desde Lyrixa (sigue vigente en TAREAS.md).

## Orden sugerido

`S1 → S2 → S3 → S4` sin parar en ninguna puerta, y `S5` cuando Vibrix tenga el
manifiesto. Si prefieres entregar algo cerrado antes, **L1 (exports LRC/SRT/VTT)
de [TAREAS.md](TAREAS.md) sigue siendo la prioridad alta** y no depende de nada
de esto.
