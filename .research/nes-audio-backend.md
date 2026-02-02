# NES audio backend research (Issue #1)

## Context
Audio output was disabled after `speaker` triggered a high-severity advisory (GHSA-w5fc-gj3h-26rx). Goal: find a safe, maintained Node/TS backend for low-latency PCM output on macOS.

## Findings

### `speaker` (current/previous)
- Advisory: **GHSA-w5fc-gj3h-26rx / CVE-2024-21526** (DoS).
- High severity; no fixed version.
- Not acceptable as a default dependency.

### `naudiodon` (PortAudio, N-API)
- npm: https://www.npmjs.com/package/naudiodon
- GitHub: https://github.com/Streampunk/naudiodon
- Snyk: https://security.snyk.io/package/npm/naudiodon
  - **No direct vulnerabilities**, but **maintenance marked INACTIVE**.
  - Last release **4 years ago**, last commit **~3 years ago**.
- README explicitly says **“recommended for development environments and prototypes.”**
- Pros: streams PCM via Node streams, includes PortAudio source.
- Cons: inactive maintenance status, low release cadence.

### `node-portaudio`
- npm: https://www.npmjs.com/package/node-portaudio
- GitHub: https://github.com/joeferner/node-portaudio
- Snyk: https://security.snyk.io/package/npm/node-portaudio
  - **No direct vulnerabilities**, but **maintenance INACTIVE**.
  - Last release **6 years ago**, last commit **6 years ago**.
- Requires external PortAudio install.
- Pros: simple API, PortAudio output.
- Cons: very stale, limited platform support notes.

### `node-core-audio`
- npm: https://www.npmjs.com/package/node-core-audio
- Snyk: https://snyk.io/advisor/npm-package/node-core-audio
  - **Maintenance INACTIVE**, last release **9 years ago**.
- CoreAudio/PortAudio bindings, macOS focused.
- Cons: very stale, minimal Node version support.

### Other Node options
- `audio-speaker` and similar packages wrap `speaker` → inherit the same vulnerability.
- No actively maintained, vulnerability-free Node audio backend found.

## Alternative directions (non-Node dependency)
- **Native audio in Rust core** using `cpal` (https://github.com/RustAudio/cpal):
  - Active, cross-platform, pure Rust.
  - Would avoid Node JS dependency risk.
  - Requires native audio mixing integration in the core.
- **External process** (ffplay/sox/afplay) piping PCM over stdin:
  - No JS dependency, but adds external binary requirement + latency concerns.
  - Best as an opt-in dev feature only.

## Recommendation
- **Keep audio disabled by default** (current behavior).
- If/when audio is reintroduced, prefer a **native Rust backend (e.g., `cpal`)** with an opt-in flag and explicit install notes.
- Node-based options (`naudiodon`, `node-portaudio`, `node-core-audio`) are currently **too stale** for a “safe” dependency policy.

## 2026 update: Rust-native backend status
- **cpal** is active (RustAudio) with recent releases (lib.rs lists updates in 2025). It targets CoreAudio on macOS and is pure Rust.
- **rodio** is active but sits on top of cpal and requires newer Rust; heavier than needed for streaming raw PCM.
- **miniaudio** is a Rust binding to a C library; viable but adds a C dependency vs pure Rust.

## Suggested design (native core)
- Add a Rust audio thread in `nes-core` using `cpal`.
- Implement a ring buffer (`ringbuf` or custom) for f32 samples from `Apu`.
- Maintain 44.1kHz (APU sample_period already targets 44.1k). If the device rate differs, resample or adjust sample_period.
- Gate behind config (`enableAudio`) and compile-time feature flag so builds without audio remain minimal.
