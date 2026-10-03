# Lyrixa como secuenciador determinista de Vibrix

> Estado: S1, S2 y el primer corte S4 implementados en Lyrixa. No cambia el
> contrato `.lyrixa-lyrics.json` ni evalúa el runtime visual de Vibrix.
> El contrato congelado de Vibrix manda sobre los ejemplos históricos de este
> documento.

## Objetivo

Lyrixa debe poder componer un mapa audiovisual sobre una canción sin duplicar
el editor interno de Vibrix. Vibrix continúa siendo dueño de escenas, spectra,
looks, partículas, luces, cámara y assets. Lyrixa solo conoce un catálogo de
referencias estables y decide **qué se activa, cuándo y durante cuánto tiempo**.

El resultado esperado es un score temporal reproducible:

```text
Vibrix crea slots y escenas
        ↓ manifiesto de autoría
Lyrixa coloca cues en el timeline
        ↓ bundle autocontenido
Vibrix evalúa el score en preview y export offline
```

Esto convierte las letras en un grupo más del timeline. No convierte Lyrixa en
un segundo editor de shaders o de parámetros de Vibrix.

## Decisiones de arquitectura

### 1. No hace falta una base de datos compartida

Para el flujo local, cada aplicación conserva su almacenamiento actual:

- Vibrix guarda configuración y slots en su IndexedDB versionado.
- Lyrixa guarda audio, assets y proyectos en su persistencia local.
- El puente HTTP local o un archivo intercambian manifiestos y bundles.

Una base remota solo aporta valor cuando existan cuentas, colaboración,
sincronización entre dispositivos o una biblioteca cloud. Introducirla antes
añadiría autenticación, conflictos y disponibilidad de red sin resolver ningún
requisito del secuenciador local.

### 2. Empezar por escenas

`SceneSlot` ya es el agregado correcto de Vibrix. Una escena referencia:

- Spectrum 1 y Spectrum 2
- Looks
- Partículas y lluvia
- Luces
- Camera FX
- Logo
- Track title

La primera versión de composición necesita una sola pista visual de escenas.
Eso produce cambios grandes con pocos clips. Las pistas granulares se añaden
después para sobrescribir una familia concreta cuando haga falta.

### 3. No reutilizar `LyricClip` para todo

La capa FX textual propuesta sigue siendo útil para comandos simples, pero un
mapa audiovisual completo necesita datos estructurados. Convertir una escena,
una transición o un burst en texto dentro de `LyricClip` perdería validación,
tipado, referencias y una UI clara.

Lyrixa debe conservar dos dominios:

- lyrics: `LyricLayer` y `LyricClip`;
- composition: `CompositionTrack` y `CompositionCue`.

Ambos comparten viewport, selección, drag, resize, snap y playhead, pero no el
modelo de contenido.

### 4. Evaluación sin estado previo

La regla central es:

> El estado visual en el instante T es función únicamente del score y de T.

No se permiten órdenes tipo toggle cuyo resultado dependa de cuántas veces se
reprodujo una sección. Cada cue es un intervalo o un evento con duración
explícita. Buscar a 01:42 debe producir el mismo frame que reproducir desde
00:00 hasta 01:42.

Los solapes se resuelven por `priority` y después por el `startTimeMs` más
reciente. Las transiciones calculan su progreso desde el tiempo absoluto.

## Contrato propuesto

El bundle de letras mantiene `schemaVersion: 1`. Una composición audiovisual
es otro producto y debe tener otro sobre, por ejemplo:

```ts
interface VibrixScoreEnvelope {
  app: 'Lyrixa';
  exportKind: 'vibrix-score';
  schemaVersion: 1;
  exportedAt: string;
  projectName: string;
  sourceTrack: {
    fileName: string;
    durationMs: number;
    fileKey?: string;
  } | null;
  renderer: {
    minimumVersion: string;
    sourceProjectId?: string;
    catalogRevision?: string;
  };
  score: CompositionScore;
  dependencies: VibrixSlotSnapshot[];
  lyrics?: LyricsBundleEnvelope;
}
```

El score usa milisegundos enteros para evitar deriva por floats:

```ts
interface CompositionScore {
  tracks: CompositionTrack[];
  cues: CompositionCue[];
}

interface CompositionTrack {
  id: string;
  name: string;
  kind: VibrixSlotFamily;
  order: number;
  enabled: boolean;
  locked: boolean;
}

interface CompositionCue {
  id: string;
  trackId: string;
  startTimeMs: number;
  endTimeMs: number;
  target: {
    kind: 'scene' | 'feature-slot';
    family?: CompositionTrack['kind'];
    slotId: string;
    slotRevision: string;
  };
  transition?: {
    type: 'cut' | 'crossfade' | 'morph';
    durationMs: number;
    easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
  };
  priority: number;
  enabled: boolean;
}
```

`VibrixSlotFamily` es exactamente: `scene`, `spectrum`, `spectrum-second`,
`looks`, `particles`, `rain`, `lights`, `camera-fx`, `logo`, `track-title`,
`background-zoom` e `intro-window`. `motion` no existe. `intro-window` se lista
en el catálogo pero no es cueable; `background-zoom` sólo entra en modo
avanzado y no es enlazable por una escena.

`slotRevision` es un hash del contenido. Si Vibrix modifica un slot después de
que Lyrixa lo referenció, Lyrixa puede mostrar `Updated in Vibrix` en vez de
cambiar silenciosamente la composición.

## Catálogo que publica Vibrix

Lyrixa no necesita leer todo el store de Vibrix. Necesita un manifiesto seguro
y pequeño:

```ts
interface VibrixAuthoringManifest {
  schemaVersion: 1;
  projectId: string;
  projectName: string;
  revision: string;
  rendererVersion: string;
  capabilities: string[];
  slots: Array<{
    id: string;
    family: CompositionTrack['kind'];
    name: string;
    revision: string;
    thumbnailUrl?: string;
  }>;
}
```

Endpoints locales sugeridos:

```text
GET     /api/authoring/manifest
GET     /api/authoring/slots/:id/snapshot
OPTIONS /api/composition-bundle
POST    /api/composition-bundle
```

La lectura del catálogo es de solo lectura. El `POST` entrega el score final.
La descarga de archivo sigue siendo el fallback y debe producir exactamente
el mismo sobre que el transporte HTTP.

## Export portable

Referenciar solo `slotId` funciona mientras Lyrixa y Vibrix usan el mismo
proyecto local. No basta para mover el score a otra máquina o conservarlo tras
editar los slots.

Por eso el export incluye únicamente snapshots de las dependencias usadas:

1. Lyrixa recopila los `slotId` referenciados.
2. Solicita a Vibrix sus snapshots y dependencias transitivas.
3. El bundle guarda esas copias inmutables.
4. Vibrix importa los snapshots en un namespace del score y resuelve los cues
   contra ese namespace.

Las imágenes, audio y otros binarios no deben ir en JSON/base64. Un paquete
portable debe usar el contenedor binario/ZIP que ya utiliza el export de
proyecto de Vibrix.

## Runtime de Vibrix

Vibrix necesita un evaluador puro compartido por preview y export offline:

```ts
resolveCompositionAtTime(score, dependencies, timeMs) => ResolvedComposition
```

El evaluador:

- encuentra cues activos;
- resuelve solapes y prioridades;
- calcula progreso de transición desde tiempo absoluto;
- genera patches por subsistema;
- ignora familias o slots desconocidos con un warning deduplicado.

No debe llamar secuencialmente a `applySceneSlotById` esperando que el store
recuerde el pasado. Esa acción actual sirve para el editor manual; el score
necesita resolución stateless para seek, loops y render offline.

## UI de Lyrixa

La composición no debe añadir otra colección de ventanas flotantes.

### Espacio de trabajo

- Barra superior: transporte, proyecto, conexión con Vibrix, export.
- Rail izquierdo: Lyrics y catálogo de Vibrix.
- Timeline central: grupos `Lyrics` y `Visual composition` plegables.
- Inspector derecho: propiedades de la selección actual.
- Preview: flotante opcional, no editor de propiedades.

### Dos niveles de complejidad

`Simple` muestra:

- audio;
- letras;
- una pista Scene;
- transición y duración del cue seleccionado.

`Advanced` añadirá pistas granulares según `VibrixSlotFamily`, incluyendo
Spectrum 2 y Background Zoom, pero nunca Motion. Un usuario puede empezar arrastrando escenas y abrir una
familia solo cuando necesita sobrescribirla.

### Drag and drop

El catálogo muestra cards compactas con nombre, familia, miniatura y estado de
sincronización. Arrastrar una escena a la pista crea un cue real. Arrastrar un
slot granular crea o enfoca la pista de su familia. El inspector ofrece
transición, easing, prioridad, enabled y reemplazo de slot.

### Mobile y Fold

- La timeline permanece visible; catálogo e inspector son bottom sheets.
- Los sheets tienen estados `peek`, `half` y `full`, no una altura única.
- Cada sheet puede esconderse en una pestaña lateral persistente.
- Los controles táctiles tienen área mínima de 44 px.
- Drag and drop tiene alternativa explícita: seleccionar slot y pulsar
  `Add at playhead`.
- El modo Sync mantiene sus controles de seek y hold táctil separados del modo
  Compose.

## Fases de implementación

### Fase A — contrato y catálogo

1. Definir los tipos del manifiesto y del score en ambos repositorios.
2. Crear fixtures contractuales compartidos y pruebas de compatibilidad.
3. Vibrix publica su manifiesto local de slots y escenas.
4. Lyrixa lo consulta y muestra conexión, revisión y slots obsoletos.

### Fase B — pista Scene

1. Añadir `composition` al proyecto Lyrixa con migración aditiva.
2. Extraer primitivas genéricas del timeline sin cambiar `LyricClip`.
3. Implementar catálogo, drag/drop y `Add at playhead`.
4. Añadir undo/redo para cues.
5. Preview local usa una representación simple de la escena; Vibrix sigue
   siendo la autoridad visual.

### Fase C — runtime Vibrix

1. Implementar `resolveCompositionAtTime` puro.
2. Aplicarlo al preview y al export offline.
3. Importar `vibrix-score` por archivo y HTTP.
4. Añadir validación de versión, dependencias y slots desconocidos.

### Fase D — pistas granulares

1. Spectrum y Looks.
2. Partículas, luces y Camera FX.
3. Background y Motion.
4. Morfología/interpolación solo para familias que declaren soporte.

### Fase E — empaquetado portable

1. Resolver dependencias transitivas.
2. Empaquetar assets binarios fuera del JSON.
3. Verificar identidad del audio y compatibilidad de renderer.

## Riesgos que deben resolverse antes de implementar

- Un slot borrado o editado no puede cambiar un score silenciosamente.
- `morph` no es válido para todas las familias; cada capability debe declararlo.
- Preview en vivo y export offline deben consumir el mismo evaluador.
- El audio debe identificarse por `fileKey` y duración, no solo por nombre.
- Importar un score no debe pisar el proyecto de Vibrix sin confirmación.
- El timeline de Lyrixa necesita undo/redo de proyecto antes de crecer con más
  tipos de item.

## Primer corte recomendado

El primer vertical slice debe ser deliberadamente pequeño:

1. Vibrix publica tres escenas guardadas en un manifiesto.
2. Lyrixa muestra esas escenas en un catálogo.
3. El usuario añade cues a una sola pista Scene.
4. Exporta un score con snapshots de esas escenas.
5. Vibrix lo importa y cambia de escena al hacer seek o reproducir.
6. El mismo resultado aparece en el export offline.

Cuando ese corte sea determinista, portable y cómodo en móvil, las pistas
granulares pueden crecer sin convertir Lyrixa en una copia de Vibrix.
