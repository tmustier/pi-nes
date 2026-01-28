# NES Performance Investigation

## Goal
Improve emulation speed and reduce stutter while keeping high‑resolution rendering in Kitty.

## Attempts & Results

### 1) Text renderer (ANSI half‑block)
- **Change:** Half‑block renderer with averaged downsampling.
- **Result:** Fastest, but low resolution and blocky text. Not acceptable for high‑fidelity output.

### 2) Kitty image renderer (PNG)
- **Change:** PNG encoding per frame + Kitty image protocol.
- **Result:** Correct visuals but **slow emulation** (PNG encoding blocks JS thread).

### 3) Decouple emulation from render
- **Change:** Fixed‑timestep emulation with frame catch‑up + render throttling.
- **Result:** Improved, but still slow during action; rendering still too heavy.

### 4) Kitty raw RGB frames (base64)
- **Change:** Send raw RGB (`f=24`) directly to Kitty (no PNG).
- **Result:** Faster, but still stuttered because **base64 payloads are large** and we were still emitting huge escape sequences every frame.

### 5) WASM core (nes_rust_wasm)
- **Change:** Optional WASM core.
- **Result:** Core faster but still limited by render transport; SRAM persistence not supported in this core yet.

### 6) Native core + zero-copy framebuffer (nes_rust via napi-rs)
- **Change:** Native Rust core with a custom display implementation, plus `refreshFramebuffer()` to update a persistent external `Uint8Array` (zero-copy).
- **Result:** CPU overhead and GC pressure reduced; smoother long sessions.
- **Notes:** Fixed an out-of-bounds panic in the display path and corrected RGB channel order (palette values are BGR).

### 7) Kitty shared-memory renderer (`t=s`)
- **Change:** POSIX shared memory (`shm_open` + `mmap`) via napi-rs addon, per-frame handles due to Kitty unlinking shared memory after read.
- **Result:** Much smaller escape payloads and lower JS overhead.
- **Fixes:** Reused Kitty placement (`p=1`) to avoid placement buildup, and switched to an APC marker for TUI diffs (prevents cursor/footers from drifting).

### 8) Observability + config tuning
- **Change:** `/nes debug` overlay with FPS, frames/tick, dropped frames, catch-up, event-loop delay, and memory (heap/rss/external/arrayBuffers).
- **Result:** JS metrics stayed healthy even when the OS felt sluggish, pointing to compositor/Kitty pressure rather than JS stalls.
- **Config:** Guided setup now prompts only for ROM dir + quality presets (low/balanced/high/custom). Default pixel scale bumped to **1.2** and ROM dir to **/roms/nes**.

## Findings
- Primary bottleneck is **render transport + terminal compositor**, not the emulator core. JS metrics can look normal while the OS feels sluggish.
- Large **base64 graphics payloads** stall the event loop and throttle emulation.
- Kitty placement buildup can degrade performance over time; reusing a fixed placement (`p=1`) prevents this.
- TUI diffing requires the image line to change each frame; use a non‑printing APC marker to force re-render without moving the cursor.

## External Research (What Others Do)
- **Kitty graphics protocol** explicitly supports *file* and *shared memory* transports (`t=f` and `t=s`) to avoid base64 payloads. Shared memory is the fastest local option. ([Kitty docs](https://sw.kovidgoyal.net/kitty/graphics-protocol/#the-transmission-medium))
- **Kitty icat** exposes `--transfer-mode` (`detect`, `file`, `memory`, `stream`) and defaults to auto‑detecting local transfers. ([icat source/options](https://github.com/kovidgoyal/kitty/blob/master/kittens/icat/main.py))
- **WezTerm** added support for Kitty image protocol **shared memory** transport (PR #1810), confirming it’s a standard, performant path used by terminal implementers. ([WezTerm changelog](https://github.com/wez/wezterm/blob/master/docs/changelog.md#20220408-101518-b908e2dd))
- **Ghostty discussion** notes that the fastest option is shared memory and that **mpv uses shared memory** for Kitty graphics. ([Ghostty discussion](https://github.com/ghostty-org/ghostty/discussions/5350))
- **Foot issue** notes shared memory avoids chunking/base64 and improves local performance. ([foot issue #481](https://codeberg.org/dnkl/foot/issues/481))

## Current Approach (Implemented)

### Kitty file transport (fallback)
- Write raw RGB bytes to a temp file.
- Use Kitty graphics protocol with `t=f` (file) and `f=24` (RGB).
- Send only a **small escape sequence** with base64 file path.
- Inject a frame marker so TUI re-renders the image line.

### Kitty shared memory transport (preferred)
1) **Native addon (Rust + napi-rs)** creates POSIX shared memory (`shm_open` + `ftruncate` + `mmap`).
2) Exposes a **zero‑copy `Uint8Array`** backed by mapped memory for RGB frames.
3) Emits Kitty `t=s` escape sequences referencing the shared memory name.
4) Reuses image placement (`p=1`) to prevent placement buildup.

**Important:** Kitty unlinks the shared memory object after each transfer, so we create a new shared memory handle per frame and release older ones after a short delay.

### Native core + zero-copy framebuffer
- Rust core (`nes_rust`) via napi-rs, updating an external `Uint8Array` each frame.
- Avoids JS framebuffer repacking and reduces GC pressure.

## Remaining TODOs
- Battery-backed SRAM persistence in the native core (issue #3).
- Reduce shared-memory churn if Kitty ever supports persistent buffers.

## Notes
- Image mode runs full‑screen (no overlay) to avoid sequence truncation.
- Pixel scale **1.2** is the new default; lowering it reduces compositor load.
- Debug overlay shows tick/render FPS, frames/tick, dropped frames, event-loop delay, and memory.
