# LyraMotion - Product Vision

## Descripcion

LyraMotion es una aplicacion audiovisual enfocada en la reproduccion de musica
con letras sincronizadas y visuales animados.

El sistema combina:
- sincronizacion precisa de letras
- animaciones tipograficas
- escenas visuales reactivas al audio

## Objetivo

Crear un motor reutilizable de renderizado de letras sincronizadas que pueda:

- funcionar como aplicacion independiente
- integrarse como modulo dentro de otros sistemas (ej: LiveWallpaperAnimeGlitch)
- escalar a multiples plataformas (web, Android, Windows, iOS)

## Filosofia

LyraMotion no es solo un reproductor de musica.

Es un **engine visual de letras sincronizadas**.

## Casos de uso

- Visualizacion musical
- Karaoke
- Creacion de contenido (YouTube / loops / mixes)
- Overlays sobre otras aplicaciones
- Escenas animadas para audio

## Modos del sistema

- Player Mode
- Fullscreen Lyrics Mode
- Overlay Mode (futuro)
- Export Mode (futuro)

## Relacion con otros proyectos

Este proyecto esta disenado para evolucionar como modulo dentro de:

- LiveWallpaperAnimeGlitch

El objetivo es que su core pueda integrarse como capa de texto animado
y sincronizacion de letras dentro del motor visual existente.
