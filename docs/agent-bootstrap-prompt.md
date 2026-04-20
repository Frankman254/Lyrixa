# Agent Bootstrap Prompt - LyraMotion

You are a senior full-stack engineer and system architect.

Your task is to bootstrap the foundation of a new project called **LyraMotion**.

## Context

LyraMotion is an audiovisual application focused on:

- music playback
- synchronized lyrics (.lrc)
- animated typography
- visual scenes reacting to audio

This project will later be integrated into an existing system:
"LiveWallpaperAnimeGlitch", so the architecture must support future extraction
of reusable core modules.

## Core Requirement

The system MUST be designed with a strict separation between:

1. CORE (portable, reusable logic)
2. APP (UI, screens, platform-specific logic)

## Goals

- Build a clean and scalable architecture
- Prepare for future multi-platform support
- Ensure core logic can be extracted into a package

## Tech Constraints

- TypeScript
- Modular architecture
- No backend required at this stage
- Focus on client-side logic

## Folder Structure Requirements

You must generate a project structure like:

src/
  core/
    lyrics/
    timeline/
    karaoke/
    scene/
    animation/
    project/
    types/

  features/
    player/
    lyrics-view/
    scene-system/
    presets/

  shared/
    components/
    hooks/
    utils/

## Responsibilities

### CORE must include:
- LRC parser
- timeline engine
- active line resolver
- optional karaoke support (future-ready)
- scene schema definitions

### FEATURES must include:
- player UI
- lyrics rendering
- basic controls
- visual scene integration

## Deliverables

1. Project structure (folders + files)
2. Initial implementation of:
   - parseLRC()
   - timeline sync logic
   - basic lyrics renderer
3. Types for lyrics and timeline
4. Clean separation between core and features

## Important Rules

- DO NOT mix UI logic inside core
- DO NOT couple rendering with parsing logic
- DO NOT overcomplicate the first version
- Focus on a clean, extensible foundation

## Output Format

Provide:
- folder structure
- file contents
- explanation of architecture decisions
