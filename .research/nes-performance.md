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

## Findings
- Primary bottleneck is **render transport**, not the emulator core.
- Large **base64 graphics payloads** stall the event loop and throttle emulation.
- TUI diffing requires the image line to change each frame; raw images with constant escape sequences won’t re‑render without an injected marker.

## External Research (What Others Do)
- **Kitty graphics protocol** explicitly supports *file* and *shared memory* transports (`t=f` and `t=s`) to avoid base64 payloads. Shared memory is the fastest local option. ([Kitty docs](https://sw.kovidgoyal.net/kitty/graphics-protocol/#the-transmission-medium))
- **Kitty icat** exposes `--transfer-mode` (`detect`, `file`, `memory`, `stream`) and defaults to auto‑detecting local transfers. ([icat source/options](https://github.com/kovidgoyal/kitty/blob/master/kittens/icat/main.py))
- **WezTerm** added support for Kitty image protocol **shared memory** transport (PR #1810), confirming it’s a standard, performant path used by terminal implementers. ([WezTerm changelog](https://github.com/wez/wezterm/blob/master/docs/changelog.md#20220408-101518-b908e2dd))
- **Ghostty discussion** notes that the fastest option is shared memory and that **mpv uses shared memory** for Kitty graphics. ([Ghostty discussion](https://github.com/ghostty-org/ghostty/discussions/5350))
- **Foot issue** notes shared memory avoids chunking/base64 and improves local performance. ([foot issue #481](https://codeberg.org/dnkl/foot/issues/481))

## New Approach (Current Plan)

### ✅ Step 1: Kitty file transport for raw RGB frames (implemented)
- Write raw RGB bytes to a temp file.
- Use Kitty graphics protocol with `t=f` (file) and `f=24` (RGB).
- Send only a **small escape sequence** with base64 file path.
- Inject a frame marker so TUI re-renders the image line.

### ⚠️ Current Result
- Still seeing stalls. Likely due to **sync file writes each frame** and JS thread contention.

### ✅ Node Native + Shared Memory (implemented)
1) **Native addon (Rust + napi-rs)** creates POSIX shared memory (`shm_open` + `ftruncate` + `mmap`).
2) Exposes a **zero‑copy `Uint8Array`** backed by mapped memory for RGB frames.
3) Emits Kitty `t=s` escape sequences referencing the shared memory name.
4) Falls back to `t=f`/PNG if the addon isn’t available.

**Important:** Kitty unlinks the shared memory object after each transfer, so we create a new shared memory handle per frame and release older ones after a short delay.

### Future Options
- Move the **NES core into native** (Rust `nes-rust`) to avoid JS pixel conversion.
- Worker thread + shared buffers for JS/WASM if native core isn’t used.
- SRAM persistence support in the WASM/native core.

## Notes
- Image mode runs full‑screen (no overlay) to avoid sequence truncation.
- Render FPS can be increased now that file transport is in place.
