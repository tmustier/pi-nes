import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export type NesButton = "up" | "down" | "left" | "right" | "a" | "b" | "start" | "select";

export interface FrameBuffer {
	data: Uint8Array;
}

export interface NesCpuDebugState {
	pc: number;
	a: number;
	x: number;
	y: number;
	sp: number;
	p: number;
	lastPc: number;
	lastOpcode: number;
}

export interface NesMapperDebugState {
	mapperNum: number;
	control: number;
	prg: number;
	chr0: number;
	chr1: number;
	prgMode: number;
	chrMode: number;
	outerPrg: number;
}

export interface NesDebugState {
	cpu: NesCpuDebugState;
	mapper: NesMapperDebugState;
}

export interface NesCore {
	loadRom(rom: Uint8Array): void;
	tick(): void;
	getFrameBuffer(): FrameBuffer;
	setButton(button: NesButton, pressed: boolean): void;
	getSram(): Uint8Array | null;
	setSram(sram: Uint8Array): void;
	isSramDirty(): boolean;
	markSramSaved(): void;
	getAudioWarning(): string | null;
	getDebugState(): NesDebugState | null;
	dispose(): void;
}

export interface CreateNesCoreOptions {
	enableAudio?: boolean;
}

interface NativeNesInstance {
	setRom(rom: Uint8Array): void;
	bootup(): void;
	stepFrame(): void;
	refreshFramebuffer(): void;
	pressButton(button: number): void;
	releaseButton(button: number): void;
	hasBatteryBackedRam(): boolean;
	getSram(): Uint8Array;
	setSram(data: Uint8Array): void;
	isSramDirty(): boolean;
	markSramSaved(): void;
	getDebugState(): NesDebugState;
	getFramebuffer(): Uint8Array;
}

interface NativeNesModule {
	isAvailable: boolean;
	loadError: unknown | null;
	NativeNes: new () => NativeNesInstance;
}

let nativeModule: NativeNesModule | null | undefined;

function getNativeModule(): NativeNesModule | null {
	if (nativeModule !== undefined) {
		return nativeModule;
	}
	try {
		const loaded = require("./native/nes-core/index.js") as NativeNesModule;
		nativeModule = loaded?.isAvailable ? loaded : null;
	} catch {
		nativeModule = null;
	}
	return nativeModule;
}

const NATIVE_BUTTON_MAP: Record<NesButton, number> = {
	select: 0,
	start: 1,
	a: 2,
	b: 3,
	up: 4,
	down: 5,
	left: 6,
	right: 7,
};

class NativeNesCore implements NesCore {
	private readonly nes: NativeNesInstance;
	private readonly audioWarning: string | null;
	private readonly frameBuffer: Uint8Array;
	private hasSram = false;

	constructor(enableAudio: boolean) {
		this.audioWarning = enableAudio
			? "Audio output is disabled (no safe dependency available)."
			: null;
		const module = getNativeModule();
		if (!module) {
			throw new Error("Native NES core addon is not available.");
		}
		this.nes = new module.NativeNes();
		this.frameBuffer = this.nes.getFramebuffer();
	}

	loadRom(rom: Uint8Array): void {
		this.nes.setRom(rom);
		this.hasSram = this.nes.hasBatteryBackedRam();
		this.nes.bootup();
	}

	tick(): void {
		this.nes.stepFrame();
		this.nes.refreshFramebuffer();
	}

	getFrameBuffer(): FrameBuffer {
		return { data: this.frameBuffer };
	}

	setButton(button: NesButton, pressed: boolean): void {
		const mapped = NATIVE_BUTTON_MAP[button];
		if (pressed) {
			this.nes.pressButton(mapped);
		} else {
			this.nes.releaseButton(mapped);
		}
	}

	getSram(): Uint8Array | null {
		if (!this.hasSram) {
			return null;
		}
		return this.nes.getSram();
	}

	setSram(sram: Uint8Array): void {
		if (!this.hasSram) {
			return;
		}
		this.nes.setSram(sram);
	}

	isSramDirty(): boolean {
		if (!this.hasSram) {
			return false;
		}
		return this.nes.isSramDirty();
	}

	markSramSaved(): void {
		if (!this.hasSram) {
			return;
		}
		this.nes.markSramSaved();
	}

	getAudioWarning(): string | null {
		return this.audioWarning;
	}

	getDebugState(): NesDebugState | null {
		return this.nes.getDebugState();
	}

	dispose(): void {
		// No explicit native teardown required; napi instance is GC-managed.
		this.hasSram = false;
	}
}

export function createNesCore(options: CreateNesCoreOptions = {}): NesCore {
	return new NativeNesCore(options.enableAudio ?? false);
}
