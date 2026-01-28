# pi-nes

Play NES games in your terminal. A [pi](https://github.com/mariozechner/pi) extension that runs a full NES emulator with Kitty graphics support.

## Installation

```bash
pi install npm:@tmustier/pi-nes
```

Or from git:
```bash
pi install git:github.com/tmustier/pi-nes
```

## Quick Start

```bash
/nes              # Pick a ROM from your library
/nes ~/roms/smb.nes   # Load a specific ROM
```

On first run, you'll be prompted to set your ROM directory and display quality.

## Controls

### Game Controls

| Action | Keys |
|--------|------|
| D-pad | Arrow keys or WASD |
| A button | Z |
| B button | X |
| Start | Enter or Space |
| Select | Tab |

### Emulator Controls

| Action | Key |
|--------|-----|
| Detach (keep running) | Ctrl+Q |
| Quit | Q |

**Tip:** Detach with `Ctrl+Q` to return to pi, then run `/nes` to reattach to your game.

## Commands

| Command | Description |
|---------|-------------|
| `/nes` | Pick a ROM or reattach to running session |
| `/nes <path>` | Load a specific ROM file |
| `/nes config` | Configure ROM directory and quality |
| `/nes debug` | Show FPS and memory stats |

## Configuration

Config is stored at `~/.pi/nes/config.json`. Use `/nes config` for guided setup.

```json
{
  "romDir": "/roms/nes",
  "saveDir": "/roms/nes/saves",
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

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `romDir` | `/roms/nes` | Where to look for ROM files |
| `saveDir` | `/roms/nes/saves` | Where to store battery saves (defaults to `<romDir>/saves`) |
| `renderer` | `"image"` | `"image"` (Kitty graphics) or `"text"` (ANSI) |
| `pixelScale` | `1.2` | Display scale (0.5–4.0) |

## Terminal Support

**Best experience:** [Kitty](https://sw.kovidgoyal.net/kitty/) terminal with image protocol support.

- **Kitty** — Full graphics via image protocol (shared memory or file transport)
- **Other terminals** — Falls back to ANSI half-block characters (`▀▄`)

Set `"renderer": "text"` if you prefer the ANSI renderer or have display issues.

## Limitations

- **No audio** — Sound is not currently supported
- **No save states** — Only battery-backed SRAM saves work

---

## Building from Source

Requires Rust toolchain (cargo + rustc).

```bash
git clone https://github.com/tmustier/pi-nes
cd pi-nes
npm install

# Build the NES core (required)
cd extensions/nes/native/nes-core
npm install && npm run build

# Build shared memory renderer (optional, faster on Kitty)
cd ../kitty-shm
npm install && npm run build
```

Run locally:
```bash
pi --extension /path/to/pi-nes
```
