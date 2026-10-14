# Lyrixa como secuenciador determinista de Vibrix

> Estado al 2026-10-13: Lyrixa tiene un vertical slice v1 con una pista Scene.
> Vibrix ya publica el paquete de autoría v2 y posee un evaluador puro, pero aún
> no lo conecta a Play/seek ni al export offline.

## Límite entre productos

Vibrix es dueño de imágenes, escenas, slots, efectos, transiciones y render.
Lyrixa es dueño de la canción, el playhead y la secuencia temporal. El usuario
prepara objetos visuales en Vibrix, los ordena en Lyrixa y vuelve a Vibrix para
reproducir o renderizar.

```text
Vibrix crea objetos
   └─ exporta proyecto.vibrix-authoring
                  ↓
Lyrixa coloca activaciones en carriles
   └─ exporta proyecto.vibrix-score
                  ↓
Vibrix resuelve preview, Play, seek y export offline
```

Lyrixa no contiene un segundo editor de shaders. Vibrix no contiene otra
timeline musical.

## Modelo temporal

Una pista representa un estado independiente. Un cue v2 activa un target en
`startTimeMs` y permanece efectivo hasta el siguiente cue de esa pista o el
final del audio. El ancho del bloque es una vista derivada; no existe
`endTimeMs` en proyectos v2.

Carriles cueables:

- Image y Scene como agregados;
- Spectrum 1 y Spectrum 2;
- Looks, Particles, Rain, Lights y Camera FX;
- Logo y Track Title;
- Background Zoom en modo avanzado.

`intro-window` se muestra como información, pero no se arrastra. Calibration es
específica del dispositivo y nunca entra en el contrato.

### Precedencia

En el mismo milisegundo se aplican Scene, Image y después granulares. Un cue
granular se sostiene sobre escenas/imágenes posteriores. El target `inherit`
retira ese override y devuelve la familia al resultado de los agregados.

La imagen saliente conserva su configuración “transition to next”. Lyrixa fija
el instante del cambio; Vibrix calcula el progreso con tiempo absoluto.

## Contratos de archivo

### Entrada: `.vibrix-authoring`

El paquete contiene:

- manifiesto schema v2 con slots e imágenes;
- snapshots inmutables de cada objeto publicado;
- previews transportables disponibles.

No contiene URLs `blob:`, rutas locales ni dependencias de la IndexedDB de
Vibrix. El manifiesto JSON v1/v2 suelto sigue siendo entrada legacy.

Forma conceptual:

```ts
interface VibrixAuthoringPackage {
  format: "vibrix-authoring";
  packageVersion: 1;
  exportedAt: string;
  manifest: VibrixAuthoringManifestV2;
  snapshots: Array<VibrixSlotSnapshot | VibrixImageSnapshot>;
}
```

### Salida: `.vibrix-score`

El paquete contiene score schema v2 y sólo las dependencias usadas por cues. Un
target guarda id + revisión, nunca una referencia por nombre.

```ts
type CompositionTargetV2 =
  | {
      kind: "scene" | "feature-slot";
      family: VibrixSlotFamily;
      id: string;
      revision: string;
    }
  | { kind: "image"; family: "image"; id: string; revision: string }
  | { kind: "inherit"; family: VibrixSlotFamily };

interface CompositionCueV2 {
  id: string;
  trackId: string;
  startTimeMs: number;
  target: CompositionTargetV2;
  priority: number;
  enabled: boolean;
}
```

El JSON v1 con intervalos continúa siendo legible durante la migración. Los
archivos nuevos se guardan en v2. Un contenedor futuro puede pasar de JSON a ZIP
para portar originales binarios sin cambiar `manifest.json` ni `score.json`.

## Revisiones y seguridad ante cambios

Las revisiones son hashes opacos del contenido publicado. Renombrar un objeto
no cambia su revisión; cambiar su resultado visual sí. Al abrir un catálogo
nuevo, cada cue se clasifica como current, updated, missing, empty o disabled.

Lyrixa nunca borra automáticamente un cue missing/updated. Lo muestra, bloquea
un export inválido y deja que el usuario reemplace o actualice la referencia.

Ausente y `off` tampoco son equivalentes en escenas:

- binding ausente: no tocar esa familia;
- `off`: apagarla de forma explícita.

## Arquitectura en Lyrixa

El dominio vive en `src/core/composition/` y permanece puro. Allí pertenecen:

- tipos v1/v2;
- parsers de manifiesto y paquete;
- normalización/migración del score;
- estado de dependencias;
- selección de snapshots usados;
- serialización del paquete de salida.

La UI lee y escribe únicamente `project.composition`. El catálogo no mantiene
otro array de cues. Letras y composición comparten viewport, selección, snap,
playhead y undo, pero conservan modelos distintos; `LyricClip` no se convierte
en cue genérico.

### UI

- grupo plegable `Visual composition` en la timeline;
- catálogo separado por Images, Scenes y familias;
- preview transportable o placeholder;
- drag and drop y `Add at playhead` como acción equivalente;
- inspector con estado de revisión y reemplazo;
- `inherit` disponible sólo en carriles granulares;
- controles táctiles mínimos de 44 px.

Lyrixa pinta una representación editorial, no una copia del frame de Vibrix.

## Runtime en Vibrix

Vibrix ya tiene la operación pura:

```ts
resolveVisualStateAt(base, score, timeMs) => ResolvedVisualState
```

El runtime debe usarla desde una base congelada tanto para preview/Play/seek
como para cada frame del export offline. No debe encadenar `toggle` ni depender
del store mutado por el frame anterior. Esa regla garantiza que saltar a
`01:42` y reproducir desde cero hasta `01:42` den el mismo estado.

## Fases actuales

| Fase | Lyrixa                          | Vibrix                                        |
| ---- | ------------------------------- | --------------------------------------------- |
| 1    | Abrir `.vibrix-authoring` v1/v2 | Completar transición de imagen pura           |
| 2    | Score v2 y migración v1         | Persistir score/base/mode Compose             |
| 3    | Carriles sostenidos             | Conectar preview, Play y seek                 |
| 4    | Catálogo, previews e `inherit`  | Conectar export offline                       |
| 5    | Export `.vibrix-score`          | Importar el contenedor y revisar dependencias |

Los dos repos avanzan en paralelo contra el contrato dueño de Vibrix. HTTP,
cloud y colaboración se posponen; el archivo debe cerrar el circuito primero.

## Criterio de salida

Un score real coloca Image A `00:00`, Image B `03:00`, Scene A `00:00`, Scene B
`01:00`, Spectrum 2 `01:30` e `inherit` `02:00`.

La fase termina cuando:

1. cada bloque llega al siguiente corte sin guardar una duración duplicada;
2. seek y reproducción continua producen el mismo frame;
3. la transición A→B usa la configuración de A;
4. el granular sobrevive a Scene B y `inherit` lo libera;
5. preview y export offline coinciden;
6. ambos paquetes se abren desconectados y conservan ids, revisiones y
   dependencias.
