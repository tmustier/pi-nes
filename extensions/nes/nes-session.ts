import type { NesCore } from "./nes-core.js";
import { saveSram } from "./saves.js";

const DEFAULT_FRAME_INTERVAL_MS = 1000 / 60;
const DEFAULT_SAVE_INTERVAL_MS = 5000;

export interface NesSessionOptions {
	core: NesCore;
	romPath: string;
	saveDir: string;
	frameIntervalMs?: number;
	saveIntervalMs?: number;
}

export class NesSession {
	readonly romPath: string;
	readonly core: NesCore;
	private readonly saveDir: string;
	private readonly frameIntervalMs: number;
	private readonly saveIntervalMs: number;
	private renderHook: (() => void) | null = null;
	private tickTimer: ReturnType<typeof setInterval> | null = null;
	private saveTimer: ReturnType<typeof setInterval> | null = null;
	private saveInFlight = false;
	private stopping = false;

	constructor(options: NesSessionOptions) {
		this.core = options.core;
		this.romPath = options.romPath;
		this.saveDir = options.saveDir;
		this.frameIntervalMs = options.frameIntervalMs ?? DEFAULT_FRAME_INTERVAL_MS;
		this.saveIntervalMs = options.saveIntervalMs ?? DEFAULT_SAVE_INTERVAL_MS;
	}

	start(): void {
		if (this.tickTimer) {
			return;
		}
		this.tickTimer = setInterval(() => {
			this.tick();
		}, this.frameIntervalMs);

		this.saveTimer = setInterval(() => {
			void this.saveIfNeeded(false);
		}, this.saveIntervalMs);
	}

	setRenderHook(hook: (() => void) | null): void {
		this.renderHook = hook;
	}

	async stop(): Promise<void> {
		if (this.stopping) {
			return;
		}
		this.stopping = true;
		if (this.tickTimer) {
			clearInterval(this.tickTimer);
			this.tickTimer = null;
		}
		if (this.saveTimer) {
			clearInterval(this.saveTimer);
			this.saveTimer = null;
		}
		await this.saveIfNeeded(true);
		this.core.dispose();
	}

	private tick(): void {
		if (this.stopping) {
			return;
		}
		try {
			this.core.tick();
			this.renderHook?.();
		} catch {
			void this.stop();
		}
	}

	private async saveIfNeeded(force: boolean): Promise<void> {
		if (this.saveInFlight) {
			return;
		}
		if (!force && !this.core.isSramDirty()) {
			return;
		}
		const sram = this.core.getSram();
		if (!sram) {
			return;
		}
		this.saveInFlight = true;
		try {
			await saveSram(this.saveDir, this.romPath, sram);
			this.core.markSramSaved();
		} finally {
			this.saveInFlight = false;
		}
	}
}
