import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PNG } from "pngjs";
import type { TUI } from "@mariozechner/pi-tui";
import { Image } from "@mariozechner/pi-tui";
import { allocateImageId, deleteKittyImage, getCapabilities, getCellDimensions } from "@mariozechner/pi-tui";

const FRAME_WIDTH = 256;
const FRAME_HEIGHT = 240;
const RAW_FRAME_BYTES = FRAME_WIDTH * FRAME_HEIGHT * 3;
const KITTY_CHUNK_SIZE = 4096;

export type RendererMode = "image" | "text";

export class NesImageRenderer {
	private readonly imageId = allocateImageId();
	private cachedImage?: { base64: string; width: number; height: number };
	private cachedRaw?: { sequence: string; columns: number; rows: number };
	private readonly rawBuffer = Buffer.alloc(RAW_FRAME_BYTES);
	private readonly rawFilePath = path.join(os.tmpdir(), `pi-nes-tty-graphics-${this.imageId}.raw`);
	private readonly rawFilePathBase64 = Buffer.from(this.rawFilePath).toString("base64");
	private lastFrameHash = 0;
	private rawVersion = 0;

	render(
		frameBuffer: ReadonlyArray<number>,
		tui: TUI,
		widthCells: number,
		footerRows = 1,
		pixelScale = 1,
	): string[] {
		const caps = getCapabilities();
		if (caps.images === "kitty") {
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
		try {
			fs.unlinkSync(this.rawFilePath);
		} catch {
			// ignore
		}
	}

	private renderKittyRaw(
		frameBuffer: ReadonlyArray<number>,
		tui: TUI,
		widthCells: number,
		footerRows: number,
		pixelScale: number,
	): string[] {
		const maxRows = Math.max(1, tui.terminal.rows - footerRows - 1);
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
		fs.writeFileSync(this.rawFilePath, this.rawBuffer);

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
		const marker = `\x1b_f${this.rawVersion}\x07`;
		lines.push(`${moveUp}${cached.sequence}${marker}`);

		return lines;
	}

	private renderPng(
		frameBuffer: ReadonlyArray<number>,
		tui: TUI,
		widthCells: number,
		footerRows: number,
		pixelScale: number,
	): string[] {
		const maxRows = Math.max(1, tui.terminal.rows - footerRows - 1);
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
					const color = frameBuffer[srcY * FRAME_WIDTH + srcX] ?? 0;
					const idx = (y * targetWidth + x) * 4;
					png.data[idx] = color & 0xff;
					png.data[idx + 1] = (color >> 8) & 0xff;
					png.data[idx + 2] = (color >> 16) & 0xff;
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

	private fillRawBuffer(frameBuffer: ReadonlyArray<number>): void {
		let offset = 0;
		for (let i = 0; i < FRAME_WIDTH * FRAME_HEIGHT; i += 1) {
			const color = frameBuffer[i] ?? 0;
			this.rawBuffer[offset] = color & 0xff;
			this.rawBuffer[offset + 1] = (color >> 8) & 0xff;
			this.rawBuffer[offset + 2] = (color >> 16) & 0xff;
			offset += 3;
		}
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

function hashFrame(frameBuffer: ReadonlyArray<number>, width: number, height: number): number {
	let hash = width ^ (height << 16);
	const stepX = Math.max(1, Math.floor(FRAME_WIDTH / 64));
	const stepY = Math.max(1, Math.floor(FRAME_HEIGHT / 64));
	for (let y = 0; y < FRAME_HEIGHT; y += stepY) {
		const rowOffset = y * FRAME_WIDTH;
		for (let x = 0; x < FRAME_WIDTH; x += stepX) {
			const color = frameBuffer[rowOffset + x] ?? 0;
			hash = ((hash << 5) - hash + color) | 0;
		}
	}
	return hash;
}
