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
- `/nes` — pick a ROM from the configured directory
- `/nes <path>` — load a specific ROM
- `/nes-config` — edit configuration

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

Audio output uses the `speaker` module (native). If `enableAudio` is true but audio shows as disabled, ensure `npm install` completes successfully and the module builds on your system.
