# Tests

## Quick Start

```bash
# Run unit tests (no ROMs needed)
npm test

# Run with a specific ROM
NES_TEST_ROM=~/roms/nes/Zelda.nes npm run test:core

# Run regression against all ROMs in a directory  
NES_ROM_DIR=~/roms/nes npm run test:regression

# Debug a specific game (visual ASCII output)
npx tsx tests/debug-game.ts ~/roms/nes/Mario.nes
```

## Test Structure

### Unit Tests (always run)

| File | What it tests |
|------|---------------|
| `paths.test.ts` | Path utilities (displayPath, expandHomePath, etc.) |
| `roms.test.ts` | ROM name parsing |
| `saves.test.ts` | Save path generation |
| `config.test.ts` | Config normalization and validation |
| `input-map.test.ts` | Keyboard-to-button mapping |

### Core Smoke Tests (require ROM)

Set `NES_TEST_ROM=/path/to/rom.nes` to enable.

| File | What it tests |
|------|---------------|
| `core-smoke.test.ts` | ROM loading, frame execution, freeze detection, SRAM round-trip |

### Regression Tests (require ROM directory)

Set `NES_ROM_DIR=/path/to/roms` to enable.

| File | What it tests |
|------|---------------|
| `regression.test.ts` | Scripted game tests with input sequences |
| `game-scripts.ts` | Game-specific input sequences (Start, move, etc.) |

### Debug Tool

```bash
npx tsx tests/debug-game.ts <rom-path>
```

Shows ASCII rendering of the game after running the script, useful for diagnosing rendering issues.

## CI Usage

For CI without commercial ROMs:

```bash
npm run test:unit  # Only pure function tests
```

For local development with ROMs:

```bash
NES_ROM_DIR=~/roms/nes npm run test:regression
```

## Interpreting Results

### Regression Output

```
✅ OK Dragon Quest III [scripted] (425 frames)  # Loaded, ran script, frames animated
⚠️ FROZE Super Mario Bros [scripted] (475 frames) # Ran script but frames frozen
❌ ERROR Broken.nes (0 frames)                    # Failed to load or crashed
```

### What "FROZE" Means

For **scripted** tests, "FROZE" indicates a likely bug:
- Background renders but sprites missing
- Game stuck after input sequence
- No animation after reaching gameplay

The scripted tests simulate actual gameplay (press Start, move character) and verify the screen animates. A frozen screen after pressing right in Mario means the sprite isn't rendering.

### Debug Output Example

```
Frame Analysis (after script):
  Non-zero pixels: 59,440 / 61,440 (96.7%)  ← Background renders
  Unique colors: 9                          ← Limited palette (no sprites)
  
ASCII Preview:
  [Shows level but no Mario sprite visible]
```

## Adding Game Scripts

Edit `tests/game-scripts.ts` to add scripts for new ROMs:

```typescript
"my game": {
  description: "Start game, verify gameplay",
  sequence: [
    { type: "wait", frames: 180 },        // 3 seconds
    { type: "press", button: "start" },   // tap Start
    { type: "wait", frames: 120 },        // 2 seconds  
    { type: "hold", button: "right", frames: 30 }, // move
  ],
  postSequenceFrames: 60,  // frames to check for animation
}
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `NES_TEST_ROM` | Path to a single ROM for core smoke tests |
| `NES_ROM_DIR` | Directory containing .nes files for regression tests |
