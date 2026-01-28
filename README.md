# pi-nes

NES emulator extension for pi (targeting Kitty).

## Setup

```bash
cd /Users/thomasmustier/projects/pi-nes
npm install
```

### Build native addons (required core + optional Kitty shared memory)

Requires a Rust toolchain (cargo + rustc).

```bash
# Native NES core (required)
cd /Users/thomasmustier/projects/pi-nes/extensions/nes/native/nes-core
npm install
npm run build

# Kitty shared-memory renderer (optional, faster)
cd /Users/thomasmustier/projects/pi-nes/extensions/nes/native/kitty-shm
npm install
npm run build
```

If the native core addon isn’t built, `/nes` will show an error and exit. The shared-memory renderer is optional; we fall back to the Kitty file transport if it’s missing.

## Install as a pi package

```bash
# From npm
pi install npm:@tmustier/pi-nes

# From git
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
- `/nes config` — guided configuration (ROM directory + quality)
- `/nes-config` — edit configuration (alias)

Controls:
- `Ctrl+Q` — detach overlay (keeps the session running)
- `Q` — quit emulator

Note: if a session is running, `/nes` reattaches. Use `/nes <path>` to start a new ROM.

## Configuration

Config file: `~/.pi/nes/config.json` (use `/nes config` for guided setup or `/nes-config` to edit JSON directly). On first run, `/nes` will prompt you to configure ROM directory + quality.

Example:
```json
{
  "romDir": "/roms/nes",
  "saveDir": "/Users/you/.pi/nes/saves",
  "enableAudio": false,
  "renderer": "image",
  "pixelScale": 1.2,
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

The extension uses the **native Rust core** only (required build step). Battery-backed SRAM persistence for native is tracked in issue #3.

## Rendering

Default renderer is `image`, which uses Kitty's image protocol for high resolution. On Kitty, we **prefer shared-memory transport (`t=s`)** when the native addon is built, falling back to the **file transport (`t=f`)** path if the addon isn’t available; non-Kitty terminals fall back to PNG. Image mode runs **nearly full-screen** (no overlay) because Kitty graphics sequences can't be safely composited inside overlays; it caps to ~90% height and centers vertically to reduce terminal compositor load. Image mode also **throttles rendering to ~30fps** to keep emulation speed stable. Set `renderer: "text"` if you prefer ANSI half-block rendering in an overlay. You can tweak `pixelScale` to 1.5–2.0 for larger images in PNG mode.

## Audio

Audio output is currently disabled (no safe dependency selected). If you set `enableAudio: true`, the extension will warn and continue in silent mode.
