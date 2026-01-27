import { performance } from "node:perf_hooks";
import type { NesCore } from "./nes-core.js";
import { saveSram } from "./saves.js";

const DEFAULT_FRAME_INTERVAL_MS = 1000 / 60;
const DEFAULT_RENDER_INTERVAL_MS = DEFAULT_FRAME_INTERVAL_MS;
const DEFAULT_SAVE_INTERVAL_MS = 5000;
const DEFAULT_MAX_CATCH_UP_FRAMES = 12;

export interface NesSessionOptions {
	core: NesCore;
	romPath: string;
	saveDir: string;
	frameIntervalMs?: number;
	renderIntervalMs?: number;
	saveIntervalMs?: number;
	maxCatchUpFrames?: number;
}

export class NesSession {
	readonly romPath: string;
	readonly core: NesCore;
	private readonly saveDir: string;
	private readonly frameIntervalMs: number;
	private renderIntervalMs: number;
	private readonly saveIntervalMs: number;
	private readonly maxCatchUpFrames: number;
	private renderHook: (() => void) | null = null;
	private tickTimer: ReturnType<typeof setInterval> | null = null;
	private saveTimer: ReturnType<typeof setInterval> | null = null;
	private saveInFlight = false;
	private stopping = false;
	private lastTickTime = 0;
	private accumulatedTime = 0;
	private lastRenderTime = 0;

	constructor(options: NesSessionOptions) {
		this.core = options.core;
		this.romPath = options.romPath;
		this.saveDir = options.saveDir;
		this.frameIntervalMs = options.frameIntervalMs ?? DEFAULT_FRAME_INTERVAL_MS;
		this.renderIntervalMs = options.renderIntervalMs ?? DEFAULT_RENDER_INTERVAL_MS;
		this.saveIntervalMs = options.saveIntervalMs ?? DEFAULT_SAVE_INTERVAL_MS;
		this.maxCatchUpFrames = options.maxCatchUpFrames ?? DEFAULT_MAX_CATCH_UP_FRAMES;
	}

	start(): void {
		if (this.tickTimer) {
			return;
		}
		this.lastTickTime = performance.now();
		this.lastRenderTime = this.lastTickTime;
		this.accumulatedTime = 0;
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

	setRenderIntervalMs(intervalMs: number): void {
		this.renderIntervalMs = Math.max(0, intervalMs);
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
			const now = performance.now();
			const delta = now - this.lastTickTime;
			this.lastTickTime = now;
			this.accumulatedTime += delta;

			const framesDue = Math.floor(this.accumulatedTime / this.frameIntervalMs);
			if (framesDue <= 0) {
				return;
			}

			let framesToRun = framesDue;
			if (framesDue > this.maxCatchUpFrames) {
				framesToRun = this.maxCatchUpFrames;
				this.accumulatedTime = 0;
			} else {
				this.accumulatedTime -= framesDue * this.frameIntervalMs;
			}

			for (let i = 0; i < framesToRun; i += 1) {
				this.core.tick();
			}

			if (this.renderHook && now - this.lastRenderTime >= this.renderIntervalMs) {
				this.lastRenderTime = now;
				this.renderHook();
			}
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
