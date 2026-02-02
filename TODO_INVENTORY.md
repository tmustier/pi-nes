# TODO Inventory Review

Scope: `extensions/nes/native/nes-core/vendor/nes_rust` (vendored emulator core). Each TODO reviewed for necessity.

## Action Plan (prioritized)

### P0 — Correctness (act)
- [ ] APU timing fixes (sample_period, sampling timing, frame sequencer timing, sweep negation, DMC stall timing)
- [ ] PPU fetch timing + scroll updates (cycles 257–340, subcycle fetch, attribute fetch, pixel alignment)
- [ ] Mapper IRQ/MMC1 correctness (MMC3 IRQ timing/placement, MMC1 32KB banking fix)
- [ ] CPU correctness/timing (ADC 0x71 page-cross, NMI vs IRQ priority, BIT/JMP/JSR/RTI/RTS/SBC logic, relative addressing sign extension, DMA stall timing)

### P1 — Architecture cleanup
- [ ] Move MMC3 IRQ handling out of ROM/PPU into mapper layer
- [ ] Replace invalid-register/addressing TODOs with explicit no-op or `unreachable!()`
- [ ] Remove/clarify doc-only TODOs (audio example note, greyscale comment, PPU master/slave select if intentionally ignored)

### P2 — Optional refactors/optimizations
- [ ] Opcode table refactor
- [ ] Register<u8>/Register<u16> merge
- [ ] Audio buffer cleanup + constant for 4096
- [ ] Header caching + sprite eval/pos calculation optimizations

## extensions/nes/native/nes-core/vendor/nes_rust/src/lib.rs
| Line | TODO | Assessment |
| --- | --- | --- |
| 57 | Audio buffer sample code is T.B.D. (doc example) | Change: replace TODO with a short note that audio output is omitted in the example. |

## extensions/nes/native/nes-core/vendor/nes_rust/src/apu.rs
| Line | TODO | Assessment |
| --- | --- | --- |
| 53 | Fix sample_period (1764000 / 44100) | Needed for accurate audio timing; keep until audio timing is corrected. |
| 67 | Implement reset properly | Needed for accurate APU reset behavior; keep. |
| 79 | More precise sampling timing | Needed for correct audio output timing; keep. |
| 93 | Add note (DMC timer) | Delete: remove TODO unless you have a specific note to add. |
| 102 | More precise frame sequencer timing | Needed for correct APU frame sequencing; keep. |
| 168 | Check IRQ timing when sending | Needed for correct IRQ behavior; keep. |
| 276 | DMC CPU memory workaround is hacky; simplify | Optional refactor; keep if you want cleanup, otherwise can remove. |
| 400 | Throw an error on invalid pulse register | Change: document invalid register writes as no-op (no error) and remove TODO. |
| 467 | Fix negated sweep behavior | Needed for accurate sweep; keep. |
| 612 | Throw an error on invalid triangle register | Change: document invalid register writes as no-op (no error) and remove TODO. |
| 775 | Throw an error on invalid noise register | Change: document invalid register writes as no-op (no error) and remove TODO. |
| 949 | DMC invalid register case | Change: document invalid register writes as no-op (no error) and remove TODO. |
| 975 | Remove DMC CPU memory workaround | Optional refactor; keep if you want to eliminate the workaround. |

## extensions/nes/native/nes-core/vendor/nes_rust/src/default_audio.rs
| Line | TODO | Assessment |
| --- | --- | --- |
| 29 | Remove side effect in copy_sample_buffer | Optional cleanup; keep if you plan to revisit buffer semantics. |
| 31 | Remove magic number (4096) | Needed for maintainability; replace with a named constant if audio is used. |

## extensions/nes/native/nes-core/vendor/nes_rust/src/ppu.rs
| Line | TODO | Assessment |
| --- | --- | --- |
| 119 | Support data bus decay | Optional accuracy improvement; keep if fidelity matters. |
| 322 | Support greyscale if needed | Delete: greyscale masking is already handled in `load_palette` (unless you need register-read behavior). |
| 495 | Investigate `cycle - 1` vs `cycle - 2` pixel alignment | Needed for render correctness; keep. |
| 594 | Cycle 257-320 behavior | Needed for correct PPU fetch timing; keep. |
| 595 | Cycle 321-336 behavior | Needed for correct PPU fetch timing; keep. |
| 596 | Cycle 337-340 behavior | Needed for correct PPU fetch timing; keep. |
| 615 | 0-1 subcycle fetch details | Needed for correctness; keep. |
| 616 | 2-3 subcycle fetch details | Needed for correctness; keep. |
| 617 | 4-5 subcycle fetch details | Needed for correctness; keep. |
| 618 | 6-7 subcycle fetch details | Needed for correctness; keep. |
| 660 | Implement attribute fetch properly | Needed for PPU accuracy; keep. |
| 690 | Optimize pos calculation | Optional performance cleanup; not required. |
| 758 | Check MMC3 IRQ timing | Needed for mapper IRQ accuracy; keep. |
| 759 | MMC3-specific IRQ hook location | Optional refactor; keep if you plan to move this into mapper layer. |
| 804 | Only increment scroll if rendering enabled? | Needed for correctness; keep. |
| 830 | Only copy scroll if rendering enabled? | Needed for correctness; keep. |
| 863 | Optimize sprite evaluation | Optional performance cleanup; not required. |
| 1020 | Implement color emphasis properly | Needed if emphasis bits should affect output; keep. |
| 1069 | Implement PPU master/slave select | Change: document as intentionally ignored on NES and remove TODO. |

## extensions/nes/native/nes-core/vendor/nes_rust/src/register.rs
| Line | TODO | Assessment |
| --- | --- | --- |
| 5 | Combine Register<u8> with Register<u16> | Optional refactor; not required. Consider removing if you don’t plan to refactor. |

## extensions/nes/native/nes-core/vendor/nes_rust/src/mapper.rs
| Line | TODO | Assessment |
| --- | --- | --- |
| 45 | MMC3-specific `drive_irq_counter` in trait | Optional architecture cleanup; keep if you want a mapper-specific IRQ interface. |
| 149 | MMC1 32KB banking fix | Needed for correct MMC1 behavior; keep. |

## extensions/nes/native/nes-core/vendor/nes_rust/src/cpu.rs
| Line | TODO | Assessment |
| --- | --- | --- |
| 44 | Throw error for unknown button mapping | Change: replace with `unreachable!()` (exhaustive match) and remove TODO. |
| 242 | Replace opcode match with static array | Optional refactor; not required. |
| 620 | Add +1 cycle if page crossed (ADC 0x71) | Needed for accurate timing; keep. |
| 1254 | Simplify DMC sample handling | Optional refactor; keep if you want cleanup. |
| 1258 | Fix DMC stall timing (+4 cycles) | Needed for accuracy; keep. |
| 1271 | More precise frame update detection | Optional; keep if timing fidelity matters. |
| 1285 | Implement Poweroff input | Optional feature; keep if you plan to support it. |
| 1313 | Handle NMI vs IRQ priority | Needed for correctness; keep. |
| 1368 | Clean up operate() if needed | Delete: vague cleanup note; drop unless a refactor is planned. |
| 1417 | Check BIT instruction logic | Needed for correctness; keep. |
| 1531 | Throw on INV instruction | Change: handle illegal opcode (NOP or implement) instead of throwing; remove TODO. |
| 1552 | Check JMP logic | Needed for correctness; keep. |
| 1557 | Check JSR logic | Needed for correctness; keep. |
| 1709 | Check RTI logic | Needed for correctness; keep. |
| 1716 | Check RTS logic | Needed for correctness; keep. |
| 1732 | Confirm SBC carry/borrow logic | Needed for correctness; keep. |
| 1738 | Implement correct SBC overflow logic | Needed for correctness; keep. |
| 1895 | Clean up store() control flow | Delete: vague cleanup note; drop unless refactoring. |
| 1909 | DMA stall cycle timing | Needed for accuracy (513/514 cycle detail); keep. |
| 1952 | Optimize interrupt handling | Optional; not required. |
| 1994 | Confirm relative addressing sign extension | Needed for correctness; keep. |
| 2116 | Throw on unknown addressing mode | Change: mark as unreachable or handle explicitly; remove TODO. |

## extensions/nes/native/nes-core/vendor/nes_rust/src/rom.rs
| Line | TODO | Assessment |
| --- | --- | --- |
| 139 | MMC3-specific `irq_interrupted` in ROM | Optional architecture cleanup; keep if you plan to move IRQ handling into mapper layer. |
| 145 | Cache RomHeader fields | Optional optimization; not required. |
