# Lyrixa — qué hacer ahora

> Fuente: plan maestro de la suite
> (`/Users/frankman254/Desktop/Personal-Projects/LiveWallpaperAnimeGlitch/docs/plans/PLAN_MAESTRO_LANZAMIENTO.md`,
> §0.5 y tareas 2.5 / 2.7). Actualiza este archivo al cerrar cada tarea.

Vibrix está en su Fase 1 (export de vídeo). Lyrixa **no bloquea** esa fase, así
que estas tareas pueden avanzar en paralelo, en este orden:

## S0 · El secuenciador de composición — **nuevo, y ya no está bloqueado**

Está en su propio documento: **[TAREA_SECUENCIADOR.md](TAREA_SECUENCIADOR.md)**.

Lo que cambió: el contrato del catálogo ya existe y trae un **fixture literal**,
así que no hay que esperar a que Vibrix publique nada para empezar. Trae tres
correcciones al diseño que cambian tipos (`motion` no existe, `background` es en
realidad el zoom por graves, Spectrum 2 es familia propia).

Contrato (lo mantiene Vibrix):
`/Users/frankman254/Desktop/Personal-Projects/LiveWallpaperAnimeGlitch/docs/features/VIBRIX_AUTHORING_CONTRACT.md`.

**L1 sigue siendo la prioridad alta** si prefieres cerrar algo entero primero: no
depende de Vibrix en absoluto.

## L1 · Exports de letra estándar — prioridad alta

El autor no sabía qué formatos exportar; la respuesta del plan es esta:

| Formato                         | Para qué                                                    | Estado     |
| ------------------------------- | ----------------------------------------------------------- | ---------- |
| `.lyrixa-lyrics.json`           | Vibrix (contrato rico: capas, roles, `words[]`)             | Hecho      |
| **`.lrc`** (líneas)             | Reproductores, Musixmatch/Spotify, karaoke                  | **Hacer**  |
| **Enhanced LRC** (`<mm:ss.xx>` por palabra) | Karaoke palabra a palabra cuando hay `words[]`  | **Hacer**  |
| **`.srt`**                      | Subtítulos de YouTube / Premiere / CapCut                   | **Hacer**  |
| **`.vtt`**                      | Web, TikTok, players HTML5                                  | **Hacer**  |
| **`.txt`**                      | Descripción de YouTube, copiar/pegar                        | **Hacer**  |
| `.ass` (karaoke `\k`)           | Karaoke con estilo en ffmpeg/Aegisub                        | Después de `1.0` |
| TTML (Apple Music)              | Distribuidoras                                              | Después de `1.0` |

Cómo:

1. Serializadores **puros** en `src/core/export/` (p. ej. `toLrc.ts`,
   `toSrt.ts`, `toVtt.ts`, `toTxt.ts`), uno por formato, que reciban el
   proyecto normalizado y **una capa** (por defecto la de `role: 'primary'`).
2. Tests por formato: redondeo de tiempos (LRC centésimas, SRT coma, VTT
   punto), líneas vacías/silencios, solapes, caracteres no latinos (japonés),
   capa de traducción elegida, clips sin `words[]` en Enhanced LRC.
3. UI: en el menú de export actual (`useProjectImportExport`), un selector de
   formato + capa. Sin modales nuevos a pantalla completa.
4. Documentar los formatos en `docs/01-architecture.md` §Import/export contracts.

Criterio de salida: exportar el mismo proyecto a los 5 formatos, abrir el
`.srt` en VLC y el `.lrc` en un reproductor con letras, y que la sincronía sea
la del editor.

## L2 · Identidad del paquete — prioridad media

- `package.json`: `name` `lyra-ui` → `lyrixa`, `version` `0.0.0` → `0.1.0`.
- Crear `CHANGELOG.md` (en español) empezando en `0.1.0`.
- Revisar restos del nombre viejo "LyraMotion" en `docs/00-product-vision.md`
  y `docs/agent-bootstrap-prompt.md` (marcar este último como histórico).
- Borrar o ignorar `Lyrixa (1).zip` de la raíz (preguntar antes de borrar).

## L3 · Preparar el despliegue junto a Vibrix — cuando Vibrix llegue a Fase 2

- La app debe poder servirse bajo un subpath (`base` de Vite, p. ej. `/lyrics/`).
- "Enviar a Vibrix" por mismo origen (sin descarga manual) usando
  `liveWallpaperTarget.ts`; coordinar con Vibrix tarea 2.7.

## No hacer (congelado hasta `1.0.0` de Vibrix)

- Nuevos efectos visuales/animaciones de preview que Vibrix no renderiza.
- Cuentas, nube o colaboración.
- Llamar a modelos de IA directamente desde Lyrixa (eso es del Transcriptor).
