# Trabajar en Lyrixa

Editor de letras tipo DAW (React 19 + TypeScript + Vite). Prepara y sincroniza
la letra que luego renderiza **Vibrix**. Es parte de una suite de cuatro
proyectos: lee **[.agents/SUITE.md](.agents/SUITE.md)** antes de nada.

**Qué hacer ahora:** [.agents/TAREAS.md](.agents/TAREAS.md).

## Rutas de los proyectos vecinos (esta máquina)

| Proyecto          | Ruta                                                                     |
| ----------------- | ------------------------------------------------------------------------ |
| Vibrix (consume el bundle) | `/Users/frankman254/Desktop/Personal-Projects/LiveWallpaperAnimeGlitch` |
| Transcriptor (produce `.lyrixa.json`) | `/Users/frankman254/Desktop/Personal-Projects/transcriptor` |
| Web de venta      | `/Users/frankman254/Desktop/Personal-Projects/vibrix-web`                |

## Leer antes de escribir código

1. [docs/01-architecture.md](docs/01-architecture.md) — capas, dueños, puentes y contratos.
2. [docs/02-refactor-roadmap.md](docs/02-refactor-roadmap.md) — limpieza pendiente.
3. Contrato con Vibrix (lado que lee las letras):
   `/Users/frankman254/Desktop/Personal-Projects/LiveWallpaperAnimeGlitch/docs/features/LYRIXA_CONTRACT.md`
   — y el inverso, el catálogo de slots que Vibrix publica para el secuenciador:
   `.../docs/features/VIBRIX_AUTHORING_CONTRACT.md`
4. Contrato con el Transcriptor (lado que escribe):
   `/Users/frankman254/Desktop/Personal-Projects/transcriptor/docs/contrato-lyrixa.md`
5. Plan de la suite:
   `/Users/frankman254/Desktop/Personal-Projects/LiveWallpaperAnimeGlitch/docs/plans/PLAN_MAESTRO_LANZAMIENTO.md` §0.5

## Reglas duras

- **Paquetes con `npm`** (`package-lock.json`). No mezclar con pnpm aquí.
- **`src/core` es puro:** nada de React, DOM, CSS, `localStorage`, IndexedDB ni
  object URLs. `fetch` se inyecta. Lo del navegador vive en `src/features`.
- **Un solo resolver de estilo** (`src/core/render/resolveVisualStyle.ts`):
  proyecto → capa → clip. No duplicar merge en componentes.
- **El bundle `.lyrixa-lyrics.json` es un contrato** (`src/core/project/lyricsBundle.ts`).
  Añadir un campo opcional no sube `schemaVersion`; quitar o cambiar el
  significado de uno sí, y Vibrix debe aceptar la versión anterior.
  Precedencia acordada: un `position` con nombre (distinto de `center`) gana
  sobre `coords` — Vibrix lo aplica así desde `0.4.1-alpha`.
- Los exports nunca llevan object URLs; el audio va solo en `.lyrixa-package`.
- Tests junto al código como `*.test.ts` en `src/core` (Vitest, entorno `node`).
- Docs en español; código y commits en inglés. Commits solo si el usuario lo pide.

## Antes de terminar

```bash
npm test
npm run lint
npm run build
```
