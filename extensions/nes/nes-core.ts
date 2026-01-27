import { Buffer } from "node:buffer";
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

export function createNesCore(options: CreateNesCoreOptions = {}): NesCore {
	return new JsnesCore(options.enableAudio ?? false);
}
