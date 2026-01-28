# pi-nes

NES emulator extension for pi (targeting Kitty).

## Setup

```bash
cd /Users/thomasmustier/projects/pi-nes
npm install
```

### Optional: build native addons (Kitty shared memory + native core)

Requires a Rust toolchain (cargo + rustc).

```bash
# Kitty shared-memory renderer
cd /Users/thomasmustier/projects/pi-nes/extensions/nes/native/kitty-shm
npm install
npm run build

# Native NES core
cd /Users/thomasmustier/projects/pi-nes/extensions/nes/native/nes-core
npm install
npm run build
```

If you skip these steps, the renderer falls back to the Kitty file transport path and the emulator core falls back to JS/WASM.

## Install as a pi package

```bash
pi install git:github.com/tmustier/pi-nes
```

## Usage

```bash
# Local path
pi --extension /Users/thomasmustier/projects/pi-nes
```

Commands:
- `/nes` — pick a ROM from the configured directory or reattach to a running session
- `/nes <path>` — load a specific ROM
- `/nes debug [<path>]` — enable debug overlay (FPS/memory stats)
- `/nes config` — guided configuration (JSON editor + reset)
- `/nes-config` — edit configuration (alias)

Controls:
- `Ctrl+Q` — detach overlay (keeps the session running)
- `Q` — quit emulator

Note: if a session is running, `/nes` reattaches. Use `/nes <path>` to start a new ROM.

## Configuration

Config file: `~/.pi/nes/config.json` (use `/nes config` for a guided editor or `/nes-config` to edit JSON directly).

Example:
```json
{
  "romDir": "/Users/you/roms/nes",
  "saveDir": "/Users/you/.pi/nes/saves",
  "enableAudio": false,
  "core": "native",
  "renderer": "image",
  "pixelScale": 1,
  "keybindings": {
    "up": ["up", "w"],
    "down": ["down", "s"],
    "left": ["left", "a"],
    "right": ["right", "d"],
    "a": ["z"],
    "b": ["x"],
    "start": ["enter", "space"],
    "select": ["tab"]
  }
}
```

## Core

- `core: "jsnes"` (default) supports battery-backed SRAM saves.
- `core: "wasm"` is faster but **does not persist battery saves yet**.
- `core: "native"` uses the Rust core (no SRAM persistence yet). Requires building the native addon.

## Rendering

Default renderer is `image`, which uses Kitty's image protocol for high resolution. On Kitty, we **prefer shared-memory transport (`t=s`)** when the native addon is built, falling back to the **file transport (`t=f`)** path if the addon isn’t available; non-Kitty terminals fall back to PNG. Image mode runs **full-screen** (no overlay) because Kitty graphics sequences can't be safely composited inside overlays. Image mode also **throttles rendering to ~30fps** to keep emulation speed stable. Set `renderer: "text"` if you prefer ANSI half-block rendering in an overlay. You can tweak `pixelScale` to 1.5–2.0 for larger images in PNG mode.

## Audio

Audio output is currently disabled (no safe dependency selected). If you set `enableAudio: true`, the extension will warn and continue in silent mode.
