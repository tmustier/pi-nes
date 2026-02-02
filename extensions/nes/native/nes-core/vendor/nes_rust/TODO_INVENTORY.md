# nes_rust TODO Inventory (vendored)

This inventory tracks TODOs in the vendored `nes_rust` snapshot.

## src/lib.rs
- L57: Audio buffer sample code T.B.D. (doc example). Change: replace TODO with note that audio output is omitted.

## src/apu.rs
- L53: sample_period timing fix needed for audio accuracy.
- L67: APU reset behavior incomplete.
- L79: Sampling timing not precise.
- L93: Add note (DMC timer) — Delete: remove TODO unless a concrete note is added.
- L102: Frame sequencer timing not precise.
- L168: IRQ timing needs verification.
- L276: DMC CPU memory workaround is hacky; optional refactor.
- L400/612/775/949: Invalid register write handling — Change: document no-op and remove TODOs.
- L467: Sweep negation logic fix needed.
- L975: Remove DMC memory workaround; optional refactor.

## src/default_audio.rs
- L29: Remove side effect in copy_sample_buffer (optional).
- L31: Replace magic number 4096 with constant.

## src/ppu.rs
- L119: Data bus decay support (accuracy improvement).
- L322: Greyscale support comment — Delete: masking handled in load_palette (unless register-read behavior needed).
- L495: Pixel alignment off-by-one investigation.
- L594-L618: Missing cycle/subcycle fetch behavior.
- L660: Attribute fetch correctness.
- L690: Optional optimization.
- L758-L759: MMC3 IRQ timing/placement.
- L804/L830: Scroll updates conditional on rendering.
- L863: Optional optimization.
- L1020: Color emphasis implementation.
- L1069: PPU master/slave select — Change: document as ignored on NES, remove TODO.

## src/register.rs
- L5: Combine Register<u8>/Register<u16> (optional refactor).

## src/mapper.rs
- L45: MMC3 IRQ hook in trait (optional architecture cleanup).
- L149: MMC1 32KB banking fix needed.

## src/cpu.rs
- L44: Unknown button mapping — Change: replace with unreachable! (exhaustive match).
- L242: Opcode table refactor (optional).
- L620: Page-cross cycle for ADC 0x71 needed.
- L1254/L1258: DMC sample handling simplification + stall timing fix.
- L1271: Frame update detection precision.
- L1285: Poweroff input handling.
- L1313: NMI vs IRQ ordering.
- L1368/1895: Cleanup notes — Delete: vague cleanup notes.
- L1417/1552/1557/1709/1716/1732/1738/1994: CPU logic correctness checks.
- L1531/L2116: Invalid instruction/addressing mode handling — Change: treat illegal opcodes as NOP placeholder and document unknown addressing mode fallback.
- L1909: DMA stall timing detail.
- L1952: Interrupt handling optimization (optional).

## src/rom.rs
- L139: MMC3 IRQ in ROM (optional architecture cleanup).
- L145: Cache header fields (optional).
