# Vendored Dependency: nes_rust

## Upstream
- Repository: https://github.com/takahirox/nes-rust
- Upstream state: last known push (per GitHub API) 2020-08-28

## Fork
- Repository: https://github.com/tmustier/nes-rust
- Purpose: carry project-specific fixes and act as upstream-of-record for this vendor copy.

## Current Vendor Snapshot
- Source commit/tag: `a69898b` (fork master)
- Vendored on: 2026-02-02
- Local patch set: SRAM helpers, CHR RAM support, mapper fixes, PPU timing tweaks, debug hooks, palette index clamp.

## Update Process
1. Sync fork with upstream if needed.
2. Apply/maintain project patches on the fork.
3. Re-vendor from fork at a pinned commit/tag.
4. Update this file with the new commit/tag + patch notes.

## Notes
- This repo uses a vendored copy under `extensions/nes/native/nes-core/vendor/nes_rust`.
- Keep patch history in the fork so changes are auditable.
