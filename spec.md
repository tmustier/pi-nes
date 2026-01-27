# Pi NES Extension Spec

## Goal
Create a pi extension that plays NES games (Zelda, Mario, Metroid, and other ROMs) inside pi using an overlay renderer and keyboard input.

## Approach Summary
- Build a **pi extension** that registers a `/nes` command.
- Use a **JS/WASM NES core** with mapper support for classic titles (MMC1, NROM, UNROM, MMC3 at minimum).
- Render frames in a custom TUI component using ANSI half‑block characters (same approach as `examples/extensions/doom-overlay`).
- Persist battery-backed SRAM per ROM.

## Terminal Target
- Primary terminal: **Kitty** (truecolor + Kitty keyboard protocol).
- Rely on key-up events for smoother input.
- Optional future: image-mode renderer using Kitty inline images.

## Core Selection (Phase 1)
Selected core: **jsnes@1.2.1** (pure JS) with mapper support for 0/1/2/3/4/5/7/11/34/38/66/94/140/180.

If performance or compatibility is insufficient, switch to a WASM core (e.g., Nestopia/Mesen build) behind the same wrapper interface.

## User Flow
- `/nes` opens a ROM picker (from configured ROM directory) or reattaches to a running session
- `/nes <path>` loads a ROM directly (reuses the running session if same ROM)
- `Ctrl+Q` detaches overlay (session keeps running)
- `Q` quits emulator and persists SRAM
- Optional: `/nes-config` to set ROM directory and keybindings

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
      types/
        jsnes.d.ts      # jsnes type declarations
```

## Rendering
- Use **overlay** via `ctx.ui.custom(..., { overlay: true })`.
- Convert 256×240 framebuffer to terminal lines using **half‑block** characters (▀) with 24‑bit color.
- Target 60fps with a `setInterval` loop; throttle if terminal width is small.

## Input Mapping (default)
- D‑pad: arrows / WASD
- A/B: Z / X
- Start/Select: Enter / Tab
- `Ctrl+Q` detaches, `Q` quits
- Use `isKeyRelease()` for clean key‑up events.

## Saves
- Store SRAM at `~/.pi/nes/saves/<rom-name>.sav`.
- Load SRAM on ROM start.
- Persist on exit and periodically (e.g., every 5–10 seconds).

## Configuration
- `~/.pi/nes/config.json` with:
  - `romDir`
  - `saveDir`
  - `enableAudio`
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
- Core: jsnes (JS) with mapper 0/1/2/3/4 coverage.
- Audio: disabled (no safe dependency selected).
- Default ROM dir: `~/roms/nes` (configurable).
- Default save dir: `~/.pi/nes/saves` (configurable).
