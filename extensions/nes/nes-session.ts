import { monitorEventLoopDelay, performance } from "node:perf_hooks";
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

export interface NesSessionStats {
	tickFps: number;
	renderFps: number;
	avgFramesPerTick: number;
	droppedFrames: number;
	lastCatchUpFrames: number;
	maxCatchUpFrames: number;
	frameIntervalMs: number;
	renderIntervalMs: number;
	eventLoopDelayMs: number;
	memory: {
		heapUsedMb: number;
		externalMb: number;
		rssMb: number;
		arrayBuffersMb: number;
	};
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
	private lastCatchUpFrames = 0;
	private stats: NesSessionStats;
	private statsWindow = {
		startTime: 0,
		frames: 0,
		renders: 0,
		ticks: 0,
		dropped: 0,
	};
	private readonly loopDelay = monitorEventLoopDelay({ resolution: 10 });
	private fatalErrorLogged = false;
	private saveErrorLogged = false;

	constructor(options: NesSessionOptions) {
		this.core = options.core;
		this.romPath = options.romPath;
		this.saveDir = options.saveDir;
		this.frameIntervalMs = options.frameIntervalMs ?? DEFAULT_FRAME_INTERVAL_MS;
		this.renderIntervalMs = options.renderIntervalMs ?? DEFAULT_RENDER_INTERVAL_MS;
		this.saveIntervalMs = options.saveIntervalMs ?? DEFAULT_SAVE_INTERVAL_MS;
		this.maxCatchUpFrames = options.maxCatchUpFrames ?? DEFAULT_MAX_CATCH_UP_FRAMES;
		this.stats = {
			tickFps: 0,
			renderFps: 0,
			avgFramesPerTick: 0,
			droppedFrames: 0,
			lastCatchUpFrames: 0,
			maxCatchUpFrames: this.maxCatchUpFrames,
			frameIntervalMs: this.frameIntervalMs,
			renderIntervalMs: this.renderIntervalMs,
			eventLoopDelayMs: 0,
			memory: {
				heapUsedMb: 0,
				externalMb: 0,
				rssMb: 0,
				arrayBuffersMb: 0,
			},
		};
	}

	start(): void {
		if (this.tickTimer) {
			return;
		}
		this.lastTickTime = performance.now();
		this.lastRenderTime = this.lastTickTime;
		this.accumulatedTime = 0;
		this.statsWindow.startTime = this.lastTickTime;
		this.statsWindow.frames = 0;
		this.statsWindow.renders = 0;
		this.statsWindow.ticks = 0;
		this.statsWindow.dropped = 0;
		this.loopDelay.reset();
		this.loopDelay.enable();
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
		this.stats.renderIntervalMs = this.renderIntervalMs;
	}

	getStats(): NesSessionStats {
		return this.stats;
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
		this.loopDelay.disable();
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

			const droppedFrames = Math.max(0, framesDue - framesToRun);
			this.lastCatchUpFrames = framesDue;
			this.statsWindow.frames += framesToRun;
			this.statsWindow.ticks += 1;
			this.statsWindow.dropped += droppedFrames;

			for (let i = 0; i < framesToRun; i += 1) {
				this.core.tick();
			}

			if (this.renderHook && now - this.lastRenderTime >= this.renderIntervalMs) {
				this.lastRenderTime = now;
				this.statsWindow.renders += 1;
				this.renderHook();
			}

			const windowDuration = now - this.statsWindow.startTime;
			if (windowDuration >= 1000) {
				const seconds = windowDuration / 1000;
				const mem = process.memoryUsage();
				this.stats = {
					tickFps: this.statsWindow.frames / seconds,
					renderFps: this.statsWindow.renders / seconds,
					avgFramesPerTick: this.statsWindow.ticks > 0 ? this.statsWindow.frames / this.statsWindow.ticks : 0,
					droppedFrames: this.statsWindow.dropped,
					lastCatchUpFrames: this.lastCatchUpFrames,
					maxCatchUpFrames: this.maxCatchUpFrames,
					frameIntervalMs: this.frameIntervalMs,
					renderIntervalMs: this.renderIntervalMs,
					eventLoopDelayMs: this.loopDelay.mean / 1e6,
					memory: {
						heapUsedMb: mem.heapUsed / 1024 / 1024,
						externalMb: mem.external / 1024 / 1024,
						rssMb: mem.rss / 1024 / 1024,
						arrayBuffersMb: mem.arrayBuffers / 1024 / 1024,
					},
				};
				this.loopDelay.reset();
				this.statsWindow.startTime = now;
				this.statsWindow.frames = 0;
				this.statsWindow.renders = 0;
				this.statsWindow.ticks = 0;
				this.statsWindow.dropped = 0;
			}
		} catch (error) {
			if (!this.fatalErrorLogged) {
				this.fatalErrorLogged = true;
				const message = error instanceof Error ? error.message : String(error);
				console.error(`NES session crashed: ${message}`);
			}
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
		} catch (error) {
			if (!this.saveErrorLogged) {
				this.saveErrorLogged = true;
				const message = error instanceof Error ? error.message : String(error);
				console.warn(`NES save failed: ${message}`);
			}
		} finally {
			this.saveInFlight = false;
		}
	}
}
