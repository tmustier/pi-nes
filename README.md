# pi-nes

NES emulator extension for pi (targeting Kitty).

## Setup

```bash
cd /Users/thomasmustier/projects/pi-nes/extensions/nes
npm install
```

## Usage

```bash
pi --extension /Users/thomasmustier/projects/pi-nes/extensions/nes
```

Commands:
- `/nes` — pick a ROM from the configured directory or reattach to a running session
- `/nes <path>` — load a specific ROM
- `/nes-config` — edit configuration

Controls:
- `Ctrl+Q` — detach overlay (keeps the session running)
- `Q` — quit emulator

Note: if a session is running, `/nes` reattaches. Use `/nes <path>` to start a new ROM.

## Configuration

Config file: `~/.pi/nes/config.json`

Example:
```json
{
  "romDir": "/Users/you/roms/nes",
  "saveDir": "/Users/you/.pi/nes/saves",
  "enableAudio": false,
  "keybindings": {
    "up": ["up", "w"],
    "down": ["down", "s"],
    "left": ["left", "a"],
    "right": ["right", "d"],
    "a": ["z"],
    "b": ["x"],
    "start": ["enter"],
    "select": ["tab"]
  }
}
```

## Audio

Audio output is currently disabled (no safe dependency selected). If you set `enableAudio: true`, the extension will warn and continue in silent mode.
