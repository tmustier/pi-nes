import { Buffer } from "node:buffer";
import { createRequire } from "node:module";
import jsnes from "jsnes";

const { NES, Controller } = jsnes;

const FRAME_WIDTH = 256;
const FRAME_HEIGHT = 240;
const FRAMEBUFFER_SIZE = FRAME_WIDTH * FRAME_HEIGHT;
const SRAM_SIZE = 0x2000;

export type NesButton = "up" | "down" | "left" | "right" | "a" | "b" | "start" | "select";

export interface NesCore {
	loadRom(rom: Uint8Array): void;
	tick(): void;
	getFrameBuffer(): ReadonlyArray<number>;
	setButton(button: NesButton, pressed: boolean): void;
	getSram(): Uint8Array | null;
	setSram(sram: Uint8Array): void;
	isSramDirty(): boolean;
	markSramSaved(): void;
	getAudioWarning(): string | null;
	reset(): void;
	dispose(): void;
}

export interface CreateNesCoreOptions {
	enableAudio?: boolean;
	core?: "jsnes" | "wasm";
}

const BUTTON_MAP: Record<NesButton, number> = {
	up: Controller.BUTTON_UP,
	down: Controller.BUTTON_DOWN,
	left: Controller.BUTTON_LEFT,
	right: Controller.BUTTON_RIGHT,
	a: Controller.BUTTON_A,
	b: Controller.BUTTON_B,
	start: Controller.BUTTON_START,
	select: Controller.BUTTON_SELECT,
};

type NesRustWasm = typeof import("nes_rust_wasm");
const require = createRequire(import.meta.url);
let wasmModule: NesRustWasm | null = null;

function getWasmModule(): NesRustWasm {
	if (!wasmModule) {
		wasmModule = require("nes_rust_wasm") as NesRustWasm;
	}
	return wasmModule;
}

class JsnesCore implements NesCore {
	private readonly nes: InstanceType<typeof NES>;
	private frameBuffer: ReadonlyArray<number> = new Array(FRAMEBUFFER_SIZE).fill(0);
	private sram: Uint8Array | null = null;
	private hasBatteryRam = false;
	private sramDirty = false;
	private readonly audioWarning: string | null;

	constructor(enableAudio: boolean) {
		this.audioWarning = enableAudio
			? "Audio output is disabled (no safe dependency available)."
			: null;

		this.nes = new NES({
			onFrame: (framebuffer24) => {
				this.frameBuffer = framebuffer24;
			},
			onAudioSample: null,
			emulateSound: false,
			onBatteryRamWrite: (address, value) => {
				this.handleBatteryRamWrite(address, value);
			},
		});
	}

	loadRom(rom: Uint8Array): void {
		const romString = Buffer.from(rom).toString("latin1");
		this.nes.loadROM(romString);
		this.hasBatteryRam = Boolean(this.nes.rom?.batteryRam);

		if (this.hasBatteryRam) {
			if (!this.sram) {
				this.sram = new Uint8Array(SRAM_SIZE);
			}
			this.nes.rom.batteryRam = this.sram;
			this.nes.mmap?.loadBatteryRam?.();
			this.sramDirty = false;
		} else {
			this.sram = null;
			this.sramDirty = false;
		}
	}

	tick(): void {
		this.nes.frame();
	}

	getFrameBuffer(): ReadonlyArray<number> {
		return this.frameBuffer;
	}

	setButton(button: NesButton, pressed: boolean): void {
		const mapped = BUTTON_MAP[button];
		if (pressed) {
			this.nes.buttonDown(1, mapped);
		} else {
			this.nes.buttonUp(1, mapped);
		}
	}

	getSram(): Uint8Array | null {
		return this.hasBatteryRam ? this.sram : null;
	}

	setSram(sram: Uint8Array): void {
		if (!this.hasBatteryRam) {
			return;
		}
		if (!this.sram) {
			this.sram = new Uint8Array(SRAM_SIZE);
		}
		this.sram.set(sram.subarray(0, this.sram.length));
		this.nes.rom.batteryRam = this.sram;
		this.nes.mmap?.loadBatteryRam?.();
		this.sramDirty = false;
	}

	isSramDirty(): boolean {
		return this.hasBatteryRam && this.sramDirty;
	}

	markSramSaved(): void {
		this.sramDirty = false;
	}

	getAudioWarning(): string | null {
		return this.audioWarning;
	}

	reset(): void {
		this.nes.reset();
	}

	dispose(): void {}

	private handleBatteryRamWrite(address: number, value: number): void {
		if (!this.hasBatteryRam || !this.sram) {
			return;
		}
		const offset = address - 0x6000;
		if (offset < 0 || offset >= this.sram.length) {
			return;
		}
		this.sram[offset] = value & 0xff;
		this.sramDirty = true;
	}
}

class WasmNesCore implements NesCore {
	private readonly nes: InstanceType<NesRustWasm["WasmNes"]>;
	private readonly buttonMap: Record<NesButton, number>;
	private readonly pixelBuffer = new Uint8Array(FRAMEBUFFER_SIZE * 4);
	private readonly frameBuffer = new Uint32Array(FRAMEBUFFER_SIZE);
	private readonly audioWarning: string | null;

	constructor(enableAudio: boolean) {
		this.audioWarning = enableAudio
			? "Audio output is disabled (no safe dependency available)."
			: null;
		const wasm = getWasmModule();
		this.nes = wasm.WasmNes.new();
		this.buttonMap = {
			up: wasm.Button.Joypad1Up,
			down: wasm.Button.Joypad1Down,
			left: wasm.Button.Joypad1Left,
			right: wasm.Button.Joypad1Right,
			a: wasm.Button.Joypad1A,
			b: wasm.Button.Joypad1B,
			start: wasm.Button.Start,
			select: wasm.Button.Select,
		};
	}

	loadRom(rom: Uint8Array): void {
		this.nes.set_rom(rom);
		this.nes.bootup();
	}

	tick(): void {
		this.nes.step_frame();
		this.nes.update_pixels(this.pixelBuffer);
		this.refreshFrameBuffer();
	}

	getFrameBuffer(): ReadonlyArray<number> {
		return this.frameBuffer;
	}

	setButton(button: NesButton, pressed: boolean): void {
		const mapped = this.buttonMap[button];
		if (pressed) {
			this.nes.press_button(mapped);
		} else {
			this.nes.release_button(mapped);
		}
	}

	getSram(): Uint8Array | null {
		return null;
	}

	setSram(_sram: Uint8Array): void {}

	isSramDirty(): boolean {
		return false;
	}

	markSramSaved(): void {}

	getAudioWarning(): string | null {
		return this.audioWarning;
	}

	reset(): void {
		this.nes.reset();
	}

	dispose(): void {
		this.nes.free();
	}

	private refreshFrameBuffer(): void {
		let offset = 0;
		for (let i = 0; i < this.frameBuffer.length; i += 1) {
			const r = this.pixelBuffer[offset];
			const g = this.pixelBuffer[offset + 1];
			const b = this.pixelBuffer[offset + 2];
			this.frameBuffer[i] = r | (g << 8) | (b << 16);
			offset += 4;
		}
	}
}

export function createNesCore(options: CreateNesCoreOptions = {}): NesCore {
	const core = options.core ?? "jsnes";
	if (core === "wasm") {
		return new WasmNesCore(options.enableAudio ?? false);
	}
	return new JsnesCore(options.enableAudio ?? false);
}
