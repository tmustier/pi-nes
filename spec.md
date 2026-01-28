# Pi NES Extension Spec

## Goal
Create a pi extension that plays NES games (Zelda, Mario, Metroid, and other ROMs) inside pi using an overlay renderer and keyboard input.

## Approach Summary
- Build a **pi extension** that registers a `/nes` command.
- Use a **native NES core** (`nes_rust` via napi-rs) with mapper support for classic titles.
- Render frames in a custom TUI component using ANSI half‑block characters (same approach as `examples/extensions/doom-overlay`).
- Persist battery-backed SRAM per ROM (native core support pending).

## Terminal Target
- Primary terminal: **Kitty** (truecolor + Kitty keyboard protocol).
- Rely on key-up events for smoother input.
- Optional future: image-mode renderer using Kitty inline images.

## Core
- Native core only (Rust `nes_rust` via napi-rs).
- Battery-backed SRAM persistence is planned (see issue #3).

## User Flow
- `/nes` opens a ROM picker (from configured ROM directory) or reattaches to a running session
- `/nes <path>` loads a ROM directly (reuses the running session if same ROM)
- `/nes debug [<path>]` enables a debug overlay (FPS/memory stats)
- `Ctrl+Q` detaches overlay (session keeps running)
- `Q` quits emulator and persists SRAM
- Optional: `/nes config` (guided) or `/nes-config` (JSON) to update config

## File Layout (proposed)
```
pi-nes/
  package.json        # pi package manifest (pi-package)
  extensions/
    nes/
      index.ts          # registers /nes command
      nes-component.ts  # TUI component + render loop
      nes-core.ts       # wrapper around emulator core
      nes-session.ts    # runtime session (tick + save loop)
      config.ts         # config loading (rom/save dirs, audio)
      input-map.ts      # key mapping + config
      roms.ts           # ROM discovery + picker helpers
      saves.ts          # SRAM load/save
      native/
        kitty-shm/      # napi-rs shared memory addon (Kitty t=s)
        nes-core/       # napi-rs native NES core (nes_rust)
```

## Rendering
- Use **overlay** via `ctx.ui.custom(..., { overlay: true })`.
- Default: render 256×240 frames via Kitty **image protocol** for higher resolution (full-screen, no overlay), using **shared memory (`t=s`)** when the native addon is available, falling back to file transport (`t=f`) and PNG elsewhere.
- Shared-memory transport requires building the native addon (`extensions/nes/native/kitty-shm`).
- Fallback: half‑block ANSI renderer for terminals without image support (overlay).
- Target 60fps emulation with frame skipping if rendering is slow.

## Input Mapping (default)
- D‑pad: arrows / WASD
- A/B: Z / X
- Start/Select: Enter/Space / Tab
- `Ctrl+Q` detaches, `Q` quits
- Use `isKeyRelease()` for clean key‑up events.

## Saves
- Store SRAM at `<saveDir>/<rom-name>.sav` (default `/roms/nes/saves`).
- Load SRAM on ROM start.
- Persist on exit and periodically (e.g., every 5–10 seconds).

## Configuration
- `~/.pi/nes/config.json` with:
  - `romDir`
  - `saveDir`
  - `enableAudio`
  - `renderer` ("image" or "text")
  - `pixelScale` (float, e.g. 1.5)
  - `keybindings` (button-to-keys map, e.g. `{ "a": ["z"] }`)

Note: audio output is currently disabled; setting `enableAudio` will show a warning.

## Milestones
1. Skeleton extension + `/nes` command + overlay renderer
2. ROM loading + framebuffer rendering
3. Input mapping + smooth key handling
4. SRAM load/save + per-ROM persistence
5. ROM picker UI + config command
6. Optional: audio + performance tuning

## Decisions
- Core: native (required) via nes_rust.
- Audio: disabled (no safe dependency selected).
- Default ROM dir: `/roms/nes` (configurable).
- Default core: `native`.
- Default pixel scale: `1.2`.
- Default save dir: `/roms/nes/saves` (configurable).
