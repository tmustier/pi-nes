import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { PNG } from "pngjs";
import type { TUI } from "@mariozechner/pi-tui";
import { Image } from "@mariozechner/pi-tui";
import { allocateImageId, deleteKittyImage, getCapabilities, getCellDimensions } from "@mariozechner/pi-tui";
import type { FrameBuffer } from "./nes-core.js";

const FRAME_WIDTH = 256;
const FRAME_HEIGHT = 240;
const RAW_FRAME_BYTES = FRAME_WIDTH * FRAME_HEIGHT * 3;
const FALLBACK_TMP_DIR = "/tmp";
const SHM_DIR = "/dev/shm";

const require = createRequire(import.meta.url);

interface SharedMemoryHandle {
	name: string;
	size: number;
	buffer: Uint8Array;
}

interface KittyShmModule {
	isAvailable: boolean;
	loadError: unknown | null;
	createSharedMemory: (size: number) => SharedMemoryHandle;
	closeSharedMemory: (name: string) => boolean;
}

let kittyShmModule: KittyShmModule | null | undefined;

function getKittyShmModule(): KittyShmModule | null {
	if (kittyShmModule !== undefined) {
		return kittyShmModule;
	}
	try {
		const loaded = require("./native/kitty-shm/index.js") as KittyShmModule;
		kittyShmModule = loaded?.isAvailable ? loaded : null;
	} catch {
		kittyShmModule = null;
	}
	return kittyShmModule;
}

export type RendererMode = "image" | "text";

export class NesImageRenderer {
	private readonly imageId = allocateImageId();
	private cachedImage?: { base64: string; width: number; height: number };
	private cachedRaw?: { sequence: string; columns: number; rows: number };
	private readonly rawBuffer = Buffer.alloc(RAW_FRAME_BYTES);
	private readonly rawFileDir = resolveRawDir();
	private readonly rawFilePath = path.join(this.rawFileDir, `pi-nes-tty-graphics-${this.imageId}.raw`);
	private readonly rawFilePathBase64 = Buffer.from(this.rawFilePath).toString("base64");
	private rawFileFd: number | null = null;
	private readonly sharedMemoryQueue: SharedMemoryHandle[] = [];
	private sharedMemoryDisabled = false;
	private sharedMemoryModule: KittyShmModule | null = null;
	private lastFrameHash = 0;
	private rawVersion = 0;

	render(
		frameBuffer: FrameBuffer,
		tui: TUI,
		widthCells: number,
		footerRows = 1,
		pixelScale = 1,
	): string[] {
		const caps = getCapabilities();
		if (caps.images === "kitty") {
			const shared = this.renderKittySharedMemory(frameBuffer, tui, widthCells, footerRows, pixelScale);
			if (shared) {
				return shared;
			}
			return this.renderKittyRaw(frameBuffer, tui, widthCells, footerRows, pixelScale);
		}

		return this.renderPng(frameBuffer, tui, widthCells, footerRows, pixelScale);
	}

	dispose(tui: TUI): void {
		if (getCapabilities().images === "kitty") {
			tui.terminal.write(deleteKittyImage(this.imageId));
		}
		this.cachedImage = undefined;
		this.cachedRaw = undefined;
		this.lastFrameHash = 0;
		if (this.sharedMemoryQueue.length > 0 && this.sharedMemoryModule) {
			for (const handle of this.sharedMemoryQueue) {
				try {
					this.sharedMemoryModule.closeSharedMemory(handle.name);
				} catch {
					// ignore
				}
			}
			this.sharedMemoryQueue.length = 0;
		}
		this.sharedMemoryModule = null;
		this.sharedMemoryDisabled = false;
		if (this.rawFileFd !== null) {
			try {
				fs.closeSync(this.rawFileFd);
			} catch {
				// ignore
			}
			this.rawFileFd = null;
		}
		try {
			fs.unlinkSync(this.rawFilePath);
		} catch {
			// ignore
		}
	}

	private renderKittySharedMemory(
		frameBuffer: FrameBuffer,
		tui: TUI,
		widthCells: number,
		footerRows: number,
		pixelScale: number,
	): string[] | null {
		const module = this.getSharedMemoryModule();
		if (!module) {
			return null;
		}
		const shared = this.createSharedMemoryFrame(module);
		if (!shared) {
			return null;
		}

		const maxRows = Math.max(1, tui.terminal.rows - footerRows);
		const cell = getCellDimensions();
		const maxWidthByRows = Math.floor(
			(maxRows * cell.heightPx * FRAME_WIDTH) / (FRAME_HEIGHT * cell.widthPx),
		);
		const maxWidthCells = Math.max(1, Math.min(widthCells, maxWidthByRows));
		const maxWidthPx = Math.max(1, maxWidthCells * cell.widthPx);
		const maxHeightPx = Math.max(1, maxRows * cell.heightPx);
		const maxScale = Math.min(maxWidthPx / FRAME_WIDTH, maxHeightPx / FRAME_HEIGHT);
		const requestedScale = Math.max(0.5, pixelScale) * maxScale;
		const scale = Math.min(maxScale, requestedScale);
		const columns = Math.max(1, Math.min(maxWidthCells, Math.floor((FRAME_WIDTH * scale) / cell.widthPx)));
		const rows = Math.max(1, Math.min(maxRows, Math.floor((FRAME_HEIGHT * scale) / cell.heightPx)));

		this.fillRawBufferTarget(frameBuffer, shared.buffer);
		const base64Name = Buffer.from(shared.name).toString("base64");
		const sequence = encodeKittyRawSharedMemory(base64Name, {
			widthPx: FRAME_WIDTH,
			heightPx: FRAME_HEIGHT,
			dataSize: RAW_FRAME_BYTES,
			columns,
			rows,
			imageId: this.imageId,
			zIndex: -1,
		});

		const lines: string[] = [];
		for (let i = 0; i < rows - 1; i += 1) {
			lines.push("");
		}
		const moveUp = rows > 1 ? `\x1b[${rows - 1}A` : "";
		this.rawVersion += 1;
		const marker = `\x1b_pi:nes:${this.rawVersion}\x07`;
		lines.push(`${moveUp}${sequence}${marker}`);

		return lines;
	}

	private renderKittyRaw(
		frameBuffer: FrameBuffer,
		tui: TUI,
		widthCells: number,
		footerRows: number,
		pixelScale: number,
	): string[] {
		const maxRows = Math.max(1, tui.terminal.rows - footerRows);
		const cell = getCellDimensions();
		const maxWidthByRows = Math.floor(
			(maxRows * cell.heightPx * FRAME_WIDTH) / (FRAME_HEIGHT * cell.widthPx),
		);
		const maxWidthCells = Math.max(1, Math.min(widthCells, maxWidthByRows));
		const maxWidthPx = Math.max(1, maxWidthCells * cell.widthPx);
		const maxHeightPx = Math.max(1, maxRows * cell.heightPx);
		const maxScale = Math.min(maxWidthPx / FRAME_WIDTH, maxHeightPx / FRAME_HEIGHT);
		const requestedScale = Math.max(0.5, pixelScale) * maxScale;
		const scale = Math.min(maxScale, requestedScale);
		const columns = Math.max(1, Math.min(maxWidthCells, Math.floor((FRAME_WIDTH * scale) / cell.widthPx)));
		const rows = Math.max(1, Math.min(maxRows, Math.floor((FRAME_HEIGHT * scale) / cell.heightPx)));

		this.fillRawBuffer(frameBuffer);
		const fd = this.ensureRawFile();
		fs.writeSync(fd, this.rawBuffer, 0, this.rawBuffer.length, 0);

		let cached = this.cachedRaw;
		if (!cached || cached.columns !== columns || cached.rows !== rows) {
			cached = {
				sequence: encodeKittyRawFile(this.rawFilePathBase64, {
					widthPx: FRAME_WIDTH,
					heightPx: FRAME_HEIGHT,
					dataSize: RAW_FRAME_BYTES,
					columns,
					rows,
					imageId: this.imageId,
					zIndex: -1,
				}),
				columns,
				rows,
			};
			this.cachedRaw = cached;
		}

		const lines: string[] = [];
		for (let i = 0; i < rows - 1; i += 1) {
			lines.push("");
		}
		const moveUp = rows > 1 ? `\x1b[${rows - 1}A` : "";
		this.rawVersion += 1;
		const marker = `\x1b_pi:nes:${this.rawVersion}\x07`;
		lines.push(`${moveUp}${cached.sequence}${marker}`);

		return lines;
	}

	private renderPng(
		frameBuffer: FrameBuffer,
		tui: TUI,
		widthCells: number,
		footerRows: number,
		pixelScale: number,
	): string[] {
		const maxRows = Math.max(1, tui.terminal.rows - footerRows);
		const cell = getCellDimensions();
		const maxWidthByRows = Math.floor(
			(maxRows * cell.heightPx * FRAME_WIDTH) / (FRAME_HEIGHT * cell.widthPx),
		);
		const maxWidthCells = Math.max(1, Math.min(widthCells, maxWidthByRows));
		const maxWidthPx = Math.max(1, maxWidthCells * cell.widthPx);
		const maxHeightPx = Math.max(1, maxRows * cell.heightPx);
		const scale = Math.min(
			maxWidthPx / FRAME_WIDTH,
			maxHeightPx / FRAME_HEIGHT,
		) * pixelScale;
		const targetWidth = Math.max(1, Math.floor(FRAME_WIDTH * scale));
		const targetHeight = Math.max(1, Math.floor(FRAME_HEIGHT * scale));

		const hash = hashFrame(frameBuffer, targetWidth, targetHeight);
		if (!this.cachedImage || this.lastFrameHash !== hash) {
			const png = new PNG({ width: targetWidth, height: targetHeight });
			for (let y = 0; y < targetHeight; y += 1) {
				const srcY = Math.floor((y / targetHeight) * FRAME_HEIGHT);
				for (let x = 0; x < targetWidth; x += 1) {
					const srcX = Math.floor((x / targetWidth) * FRAME_WIDTH);
					const [r, g, b] = readRgb(frameBuffer, srcY * FRAME_WIDTH + srcX);
					const idx = (y * targetWidth + x) * 4;
					png.data[idx] = r;
					png.data[idx + 1] = g;
					png.data[idx + 2] = b;
					png.data[idx + 3] = 0xff;
				}
			}
			const buffer = PNG.sync.write(png, { deflateLevel: 0, filterType: 0 });
			this.cachedImage = {
				base64: buffer.toString("base64"),
				width: targetWidth,
				height: targetHeight,
			};
			this.lastFrameHash = hash;
		}

		const image = new Image(
			this.cachedImage.base64,
			"image/png",
			{ fallbackColor: (str) => str },
			{ imageId: this.imageId, maxWidthCells },
			{ widthPx: this.cachedImage.width, heightPx: this.cachedImage.height },
		);

		return image.render(widthCells);
	}

	private fillRawBuffer(frameBuffer: FrameBuffer): void {
		this.fillRawBufferTarget(frameBuffer, this.rawBuffer);
	}

	private fillRawBufferTarget(frameBuffer: FrameBuffer, target: Uint8Array): void {
		if (frameBuffer.format === "rgb") {
			const source = frameBuffer.data as ReadonlyArray<number>;
			if (source instanceof Uint8Array) {
				target.set(source.subarray(0, RAW_FRAME_BYTES));
				return;
			}
			const max = Math.min(source.length, RAW_FRAME_BYTES);
			for (let i = 0; i < max; i += 1) {
				target[i] = source[i] ?? 0;
			}
			return;
		}

		let offset = 0;
		const source = frameBuffer.data as ReadonlyArray<number>;
		for (let i = 0; i < FRAME_WIDTH * FRAME_HEIGHT; i += 1) {
			const color = source[i] ?? 0;
			target[offset] = color & 0xff;
			target[offset + 1] = (color >> 8) & 0xff;
			target[offset + 2] = (color >> 16) & 0xff;
			offset += 3;
		}
	}

	private getSharedMemoryModule(): KittyShmModule | null {
		if (this.sharedMemoryDisabled) {
			return null;
		}
		if (this.sharedMemoryModule) {
			return this.sharedMemoryModule;
		}
		const module = getKittyShmModule();
		if (!module) {
			this.sharedMemoryDisabled = true;
			return null;
		}
		this.sharedMemoryModule = module;
		return module;
	}

	private createSharedMemoryFrame(module: KittyShmModule): SharedMemoryHandle | null {
		try {
			const handle = module.createSharedMemory(RAW_FRAME_BYTES);
			if (!handle?.buffer || handle.buffer.byteLength < RAW_FRAME_BYTES) {
				this.sharedMemoryDisabled = true;
				return null;
			}
			this.sharedMemoryQueue.push(handle);
			if (this.sharedMemoryQueue.length > 2) {
				const stale = this.sharedMemoryQueue.shift();
				if (stale) {
					try {
						module.closeSharedMemory(stale.name);
					} catch {
						// ignore
					}
				}
			}
			return handle;
		} catch {
			this.sharedMemoryDisabled = true;
			return null;
		}
	}

	private ensureRawFile(): number {
		if (this.rawFileFd !== null) {
			return this.rawFileFd;
		}
		try {
			fs.mkdirSync(this.rawFileDir, { recursive: true });
		} catch {
			// ignore
		}
		this.rawFileFd = fs.openSync(this.rawFilePath, "w+");
		return this.rawFileFd;
	}
}

function encodeKittyRawFile(
	base64Path: string,
	options: {
		widthPx: number;
		heightPx: number;
		dataSize: number;
		columns?: number;
		rows?: number;
		imageId?: number;
		zIndex?: number;
	},
): string {
	const params: string[] = [
		"a=T",
		"f=24",
		"t=f",
		"p=1",
		`q=2`,
		`s=${options.widthPx}`,
		`v=${options.heightPx}`,
		`S=${options.dataSize}`,
	];
	if (options.columns) params.push(`c=${options.columns}`);
	if (options.rows) params.push(`r=${options.rows}`);
	if (options.imageId) params.push(`i=${options.imageId}`);
	if (options.zIndex !== undefined) params.push(`z=${options.zIndex}`);

	return `\x1b_G${params.join(",")};${base64Path}\x1b\\`;
}

function encodeKittyRawSharedMemory(
	base64Name: string,
	options: {
		widthPx: number;
		heightPx: number;
		dataSize: number;
		columns?: number;
		rows?: number;
		imageId?: number;
		zIndex?: number;
	},
): string {
	const params: string[] = [
		"a=T",
		"f=24",
		"t=s",
		"p=1",
		`q=2`,
		`s=${options.widthPx}`,
		`v=${options.heightPx}`,
		`S=${options.dataSize}`,
	];
	if (options.columns) params.push(`c=${options.columns}`);
	if (options.rows) params.push(`r=${options.rows}`);
	if (options.imageId) params.push(`i=${options.imageId}`);
	if (options.zIndex !== undefined) params.push(`z=${options.zIndex}`);

	return `\x1b_G${params.join(",")};${base64Name}\x1b\\`;
}

function resolveRawDir(): string {
	const candidates = [process.env.TMPDIR, SHM_DIR, FALLBACK_TMP_DIR, os.tmpdir()].filter(
		(value): value is string => Boolean(value && value.length > 0),
	);
	for (const candidate of candidates) {
		try {
			if (!fs.existsSync(candidate)) {
				continue;
			}
			fs.accessSync(candidate, fs.constants.W_OK);
			return candidate;
		} catch {
			// keep trying
		}
	}
	return os.tmpdir();
}

function readRgb(frameBuffer: FrameBuffer, index: number): [number, number, number] {
	if (frameBuffer.format === "rgb") {
		const data = frameBuffer.data as ReadonlyArray<number>;
		const base = index * 3;
		return [data[base] ?? 0, data[base + 1] ?? 0, data[base + 2] ?? 0];
	}
	const data = frameBuffer.data as ReadonlyArray<number>;
	const color = data[index] ?? 0;
	return [color & 0xff, (color >> 8) & 0xff, (color >> 16) & 0xff];
}

function readPacked(frameBuffer: FrameBuffer, index: number): number {
	if (frameBuffer.format === "packed") {
		const data = frameBuffer.data as ReadonlyArray<number>;
		return data[index] ?? 0;
	}
	const data = frameBuffer.data as ReadonlyArray<number>;
	const base = index * 3;
	const r = data[base] ?? 0;
	const g = data[base + 1] ?? 0;
	const b = data[base + 2] ?? 0;
	return r | (g << 8) | (b << 16);
}

function hashFrame(frameBuffer: FrameBuffer, width: number, height: number): number {
	let hash = width ^ (height << 16);
	const stepX = Math.max(1, Math.floor(FRAME_WIDTH / 64));
	const stepY = Math.max(1, Math.floor(FRAME_HEIGHT / 64));
	for (let y = 0; y < FRAME_HEIGHT; y += stepY) {
		const rowOffset = y * FRAME_WIDTH;
		for (let x = 0; x < FRAME_WIDTH; x += stepX) {
			const color = readPacked(frameBuffer, rowOffset + x);
			hash = ((hash << 5) - hash + color) | 0;
		}
	}
	return hash;
}
