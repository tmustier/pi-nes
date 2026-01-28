# AGENTS.md

Technical guidance for AI agents working on this codebase.

## Architecture

pi-nes is a NES emulator extension for [pi](https://github.com/mariozechner/pi). It uses a Rust-based emulator core compiled as a Node.js native addon.

### Project Structure

```
pi-nes/
├── package.json              # Pi package manifest (pi.extensions points to ./extensions/nes)
└── extensions/nes/
    ├── index.ts              # Extension entry - registers /nes and /nes-config commands
    ├── nes-core.ts           # TypeScript wrapper for native addon
    ├── nes-session.ts        # Game session management (frame timing, SRAM saves)
    ├── nes-component.ts      # TUI overlay component (input handling, render loop)
    ├── renderer.ts           # Frame rendering (Kitty image protocol, PNG, ANSI)
    ├── config.ts             # User config (~/.pi/nes/config.json)
    ├── paths.ts              # Path resolution utilities
    ├── roms.ts               # ROM directory listing
    ├── saves.ts              # SRAM persistence
    └── native/
        ├── nes-core/         # Rust NES emulator addon (required)
        │   ├── Cargo.toml    # Dependencies: vendored nes_rust, napi
        │   ├── vendor/nes_rust/ # Patched nes_rust crate (SRAM helpers)
        │   ├── src/lib.rs    # Exposes NativeNes class via napi-rs
        │   └── index.node    # Compiled binary
        └── kitty-shm/        # Rust shared memory addon (optional)
            ├── src/lib.rs    # POSIX shm_open/mmap for zero-copy frames
            └── index.node    # Compiled binary
```

### Native Core

The emulator uses the [`nes_rust`](https://crates.io/crates/nes_rust) crate (vendored + patched in `native/nes-core/vendor/nes_rust` for SRAM helpers) with [napi-rs](https://napi.rs) bindings.

**API exposed to JavaScript:**
- `new NativeNes()` - Create emulator instance
- `setRom(Uint8Array)` - Load ROM data
- `bootup()` / `reset()` - Start/restart emulation
- `stepFrame()` - Advance one frame (~60fps)
- `pressButton(n)` / `releaseButton(n)` - Controller input (0=select, 1=start, 2=A, 3=B, 4-7=dpad)
- `hasBatteryBackedRam()` - Whether the ROM supports battery SRAM
- `getSram()` / `setSram(Uint8Array)` - Read/write SRAM
- `isSramDirty()` / `markSramSaved()` - Dirty tracking for SRAM persistence
- `getFramebuffer()` - Returns RGB pixel data (256×240×3 bytes, zero-copy via external buffer)

### Rendering Pipeline

```
NES Core → RGB framebuffer (256×240×3) → Renderer → Terminal
                                           │
                                           ├─ Kitty shared memory (t=s) — fastest, requires kitty-shm addon
                                           ├─ Kitty file transport (t=f) — writes to /dev/shm or temp file
                                           ├─ Kitty PNG — base64-encoded PNG fallback
                                           └─ ANSI half-blocks — ▀▄ characters, works everywhere
```

- Image mode (`renderer: "image"`) runs at ~30fps to keep emulation stable
- Text mode (`renderer: "text"`) runs at ~60fps in an overlay
- Image mode uses near-fullscreen (90% height) because Kitty graphics can't composite in overlays

### Session Lifecycle

1. `/nes` creates a `NesSession` that owns the core and runs the frame loop
2. `NesOverlayComponent` attaches to display frames and handle input
3. `Ctrl+Q` detaches the component but keeps the session running in background
4. `/nes` reattaches to existing session; `/nes <path>` starts a new one
5. `Q` or `session_shutdown` event stops the session and disposes the core

## Building Native Addons

Requires Rust toolchain (cargo + rustc).

```bash
# NES core (required)
cd extensions/nes/native/nes-core
npm install && npm run build

# Kitty shared memory (optional, faster rendering)
cd extensions/nes/native/kitty-shm
npm install && npm run build
```

The addons compile to `index.node`. The JS wrapper (`index.js`) tries to load it and exports `isAvailable: boolean`.

## Known Limitations

- **No audio** — `enableAudio` config exists but no audio backend is implemented
- **No save states** — Only battery-backed SRAM saves are persisted
- **SRAM for native core** — Tracked in issue #3

## Release and Publishing

## Version Bumps (Git + npm)

Preferred flow (creates a git tag):

```bash
# Ensure clean working tree
npm version patch   # or minor/major

git push --follow-tags
```

If you need more control over tagging:

```bash
# Manually edit package.json version
# Then:
git add package.json

git commit -m "chore(release): vX.Y.Z"
git tag vX.Y.Z

git push

git push --tags
```

## npm Publish

```bash
npm login
npm publish --access public
```

If you need to validate the tarball first:

```bash
npm pack
```

## GitHub Release Notes

```bash
gh release create vX.Y.Z --title "vX.Y.Z" --notes "<release notes>"
```
