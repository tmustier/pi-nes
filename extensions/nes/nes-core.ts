import { Buffer } from "node:buffer";
import Speaker from "speaker";
import jsnes from "jsnes";

const { NES, Controller } = jsnes;

const FRAME_WIDTH = 256;
const FRAME_HEIGHT = 240;
const FRAMEBUFFER_SIZE = FRAME_WIDTH * FRAME_HEIGHT;
const SRAM_SIZE = 0x2000;
const AUDIO_SAMPLE_RATE = 44100;
const AUDIO_CHANNELS = 2;
const AUDIO_BUFFER_FRAMES = 1024;
const AUDIO_FLUSH_INTERVAL_MS = 40;

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

class AudioOutput {
	private readonly speaker: Speaker;
	private readonly pendingSamples: number[] = [];
	private readonly pendingBuffers: Buffer[] = [];
	private flushTimer: ReturnType<typeof setInterval> | null = null;
	private writing = false;
	private closed = false;

	private constructor(speaker: Speaker) {
		this.speaker = speaker;
		this.flushTimer = setInterval(() => {
			this.flush();
		}, AUDIO_FLUSH_INTERVAL_MS);
	}

	static create(): { output: AudioOutput | null; warning: string | null } {
		try {
			const speaker = new Speaker({
				channels: AUDIO_CHANNELS,
				bitDepth: 16,
				sampleRate: AUDIO_SAMPLE_RATE,
				signed: true,
				float: false,
				endian: "little",
			});
			return { output: new AudioOutput(speaker), warning: null };
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return { output: null, warning: `Audio disabled: ${message}` };
		}
	}

	addSample(left: number, right: number): void {
		if (this.closed) {
			return;
		}
		this.pendingSamples.push(floatToInt16(left), floatToInt16(right));
		if (this.pendingSamples.length >= AUDIO_BUFFER_FRAMES * AUDIO_CHANNELS) {
			this.flush();
		}
	}

	close(): void {
		if (this.closed) {
			return;
		}
		this.closed = true;
		this.flush();
		if (this.flushTimer) {
			clearInterval(this.flushTimer);
			this.flushTimer = null;
		}
		this.speaker.end();
	}

	private flush(): void {
		if (this.pendingSamples.length === 0) {
			return;
		}

		const buffer = Buffer.allocUnsafe(this.pendingSamples.length * 2);
		for (let i = 0; i < this.pendingSamples.length; i += 1) {
			buffer.writeInt16LE(this.pendingSamples[i] ?? 0, i * 2);
		}
		this.pendingSamples.length = 0;
		this.pendingBuffers.push(buffer);
		this.flushQueue();
	}

	private flushQueue(): void {
		if (this.writing || this.closed) {
			return;
		}
		const buffer = this.pendingBuffers.shift();
		if (!buffer) {
			return;
		}
		this.writing = true;
		const ok = this.speaker.write(buffer);
		if (ok) {
			this.writing = false;
			setImmediate(() => this.flushQueue());
			return;
		}
		this.speaker.once("drain", () => {
			this.writing = false;
			this.flushQueue();
		});
	}
}

class JsnesCore implements NesCore {
	private readonly nes: InstanceType<typeof NES>;
	private frameBuffer: ReadonlyArray<number> = new Array(FRAMEBUFFER_SIZE).fill(0);
	private sram: Uint8Array | null = null;
	private hasBatteryRam = false;
	private sramDirty = false;
	private readonly audioOutput: AudioOutput | null;
	private readonly audioWarning: string | null;

	constructor(enableAudio: boolean) {
		const audioResult = enableAudio ? AudioOutput.create() : { output: null, warning: null };
		this.audioOutput = audioResult.output;
		this.audioWarning = audioResult.warning;
		const emulateSound = Boolean(this.audioOutput);

		this.nes = new NES({
			onFrame: (framebuffer24) => {
				this.frameBuffer = framebuffer24;
			},
			onAudioSample: emulateSound
				? (left, right) => {
					this.audioOutput?.addSample(left, right);
				}
				: null,
			emulateSound,
			sampleRate: AUDIO_SAMPLE_RATE,
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

	dispose(): void {
		this.audioOutput?.close();
	}

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

function floatToInt16(sample: number): number {
	const clamped = Math.max(-1, Math.min(1, sample));
	return clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff);
}

export function createNesCore(options: CreateNesCoreOptions = {}): NesCore {
	return new JsnesCore(options.enableAudio ?? false);
}
