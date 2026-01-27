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

## New Approach (Current Plan)

### ✅ Step 1: Kitty file transport for raw RGB frames (implemented)
- Write raw RGB bytes to a temp file.
- Use Kitty graphics protocol with `t=f` (file) and `f=24` (RGB).
- Send only a **small escape sequence** with base64 file path.
- Inject a frame marker so TUI re-renders the image line.

### ⚠️ Current Result
- Still seeing stalls. Likely due to **sync file writes each frame** and JS thread contention.

### Next (if still needed)
2) **Shared memory transport (`t=s`)** to avoid file I/O.
3) **Expose framebuffer pointer from WASM** to avoid JS copying.
4) **Run emulator in a worker** with shared buffers.

## Notes
- Image mode runs full‑screen (no overlay) to avoid sequence truncation.
- Render FPS can be increased now that file transport is in place.
