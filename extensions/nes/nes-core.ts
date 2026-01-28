import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export type NesButton = "up" | "down" | "left" | "right" | "a" | "b" | "start" | "select";

export interface FrameBuffer {
	data: Uint8Array;
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
	reset(): void;
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
	reset(): void;
	pressButton(button: number): void;
	releaseButton(button: number): void;
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

	dispose(): void {}
}

export function createNesCore(options: CreateNesCoreOptions = {}): NesCore {
	return new NativeNesCore(options.enableAudio ?? false);
}
