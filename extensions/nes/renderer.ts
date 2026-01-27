import { PNG } from "pngjs";
import type { TUI } from "@mariozechner/pi-tui";
import { Image } from "@mariozechner/pi-tui";
import { allocateImageId, deleteKittyImage, getCapabilities, getCellDimensions } from "@mariozechner/pi-tui";

const FRAME_WIDTH = 256;
const FRAME_HEIGHT = 240;

export type RendererMode = "image" | "text";

export class NesImageRenderer {
	private readonly imageId = allocateImageId();
	private cachedImage?: { base64: string; width: number; height: number };
	private lastFrameHash = 0;

	render(
		frameBuffer: ReadonlyArray<number>,
		tui: TUI,
		widthCells: number,
		footerRows = 1,
		pixelScale = 1,
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
			const buffer = PNG.sync.write(png);
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

	dispose(tui: TUI): void {
		if (getCapabilities().images === "kitty") {
			tui.terminal.write(deleteKittyImage(this.imageId));
		}
		this.cachedImage = undefined;
		this.lastFrameHash = 0;
	}
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
