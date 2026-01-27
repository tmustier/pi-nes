import type { Component, TUI } from "@mariozechner/pi-tui";
import { isKeyRelease, matchesKey, truncateToWidth } from "@mariozechner/pi-tui";
import type { InputMapping } from "./input-map.js";
import { DEFAULT_INPUT_MAPPING, getMappedButtons } from "./input-map.js";
import type { FrameBuffer, NesCore } from "./nes-core.js";
import type { NesSessionStats } from "./nes-session.js";
import type { RendererMode } from "./renderer.js";
import { NesImageRenderer } from "./renderer.js";

const FRAME_WIDTH = 256;
const FRAME_HEIGHT = 240;

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

function renderHalfBlock(
	frameBuffer: FrameBuffer,
	targetCols: number,
	targetRows: number,
	scaleX: number,
	scaleY: number,
): string[] {
	const lines: string[] = [];
	const blockWidth = Math.max(1, scaleX);
	const blockHeight = Math.max(1, scaleY);

	for (let row = 0; row < targetRows; row += 1) {
		let line = "";
		const baseY1 = row * 2 * blockHeight;
		const baseY2 = baseY1 + blockHeight;

		for (let col = 0; col < targetCols; col += 1) {
			const baseX = col * blockWidth;
			const [r1, g1, b1] = averageBlock(frameBuffer, baseX, baseY1, blockWidth, blockHeight);
			const [r2, g2, b2] = averageBlock(frameBuffer, baseX, baseY2, blockWidth, blockHeight);
			line += `\x1b[38;2;${r1};${g1};${b1}m\x1b[48;2;${r2};${g2};${b2}m▀`;
		}
		line += "\x1b[0m";
		lines.push(line);
	}

	return lines;
}

function averageBlock(
	frameBuffer: FrameBuffer,
	startX: number,
	startY: number,
	blockWidth: number,
	blockHeight: number,
): [number, number, number] {
	const endX = Math.min(startX + blockWidth, FRAME_WIDTH);
	const endY = Math.min(startY + blockHeight, FRAME_HEIGHT);
	let rSum = 0;
	let gSum = 0;
	let bSum = 0;
	let count = 0;

	for (let y = startY; y < endY; y += 1) {
		const rowOffset = y * FRAME_WIDTH;
		for (let x = startX; x < endX; x += 1) {
			const [r, g, b] = readRgb(frameBuffer, rowOffset + x);
			rSum += r;
			gSum += g;
			bSum += b;
			count += 1;
		}
	}

	if (count === 0) {
		return [0, 0, 0];
	}

	return [Math.round(rSum / count), Math.round(gSum / count), Math.round(bSum / count)];
}

export class NesOverlayComponent implements Component {
	wantsKeyRelease = true;
	private readonly inputMapping: InputMapping;
	private readonly tapTimers = new Map<string, ReturnType<typeof setTimeout>>();
	private readonly imageRenderer = new NesImageRenderer();
	private readonly rendererMode: RendererMode;
	private readonly pixelScale: number;
	private readonly debug: boolean;
	private readonly statsProvider?: () => NesSessionStats;
	private readonly debugLabel?: string;
	private imageCleared = false;

	constructor(
		private readonly tui: TUI,
		private readonly core: NesCore,
		private readonly onDetach: () => void,
		private readonly onQuit: () => void,
		inputMapping: InputMapping = DEFAULT_INPUT_MAPPING,
		rendererMode: RendererMode = "image",
		pixelScale = 1,
		debug = false,
		statsProvider?: () => NesSessionStats,
		debugLabel?: string,
	) {
		this.inputMapping = inputMapping;
		this.rendererMode = rendererMode;
		this.pixelScale = pixelScale;
		this.debug = debug;
		this.statsProvider = statsProvider;
		this.debugLabel = debugLabel;
	}

	handleInput(data: string): void {
		const released = isKeyRelease(data);
		if (!released && matchesKey(data, "ctrl+q")) {
			this.cleanupImage();
			this.onDetach();
			return;
		}
		if (!released && (matchesKey(data, "q") || matchesKey(data, "shift+q"))) {
			this.cleanupImage();
			this.onQuit();
			return;
		}

		const buttons = getMappedButtons(data, this.inputMapping);
		if (buttons.length === 0) {
			return;
		}

		for (const button of buttons) {
			if (button === "start" || button === "select") {
				if (!released) {
					this.tapButton(button);
				}
				continue;
			}
			this.core.setButton(button, !released);
		}
	}

	render(width: number): string[] {
		if (width <= 0) {
			return [];
		}

		const footer = " NES | Ctrl+Q=Detach | Q=Quit | WASD/Arrows=Move | Z/X=A/B | Enter/Space=Start | Tab=Select";
		const frameBuffer = this.core.getFrameBuffer();
		const debugLine = this.debug ? this.buildDebugLine() : null;
		const footerRows = this.debug ? 2 : 1;
		if (this.rendererMode === "image") {
			const lines = this.imageRenderer.render(
				frameBuffer,
				this.tui,
				width,
				footerRows,
				this.pixelScale,
			);
			if (debugLine) {
				lines.push(truncateToWidth(debugLine, width));
			}
			lines.push(truncateToWidth(`\x1b[2m${footer}\x1b[0m`, width));
			return lines;
		}

		const maxFrameRows = Math.max(1, this.tui.terminal.rows - footerRows);
		const scaleX = Math.max(1, Math.ceil(FRAME_WIDTH / width));
		const scaleY = Math.max(1, Math.ceil(FRAME_HEIGHT / (maxFrameRows * 2)));
		const targetRows = Math.max(1, Math.floor(FRAME_HEIGHT / (scaleY * 2)));
		const targetCols = Math.max(1, Math.floor(FRAME_WIDTH / scaleX));
		const padLeft = Math.max(0, Math.floor((width - targetCols) / 2));
		const padPrefix = padLeft > 0 ? " ".repeat(padLeft) : "";

		const rawLines = renderHalfBlock(frameBuffer, targetCols, targetRows, scaleX, scaleY);
		const lines = rawLines.map((line) => truncateToWidth(`${padPrefix}${line}`, width));
		if (debugLine) {
			lines.push(truncateToWidth(`${padPrefix}${debugLine}`, width));
		}
		lines.push(truncateToWidth(`\x1b[2m${padPrefix}${footer}\x1b[0m`, width));
		return lines;
	}

	invalidate(): void {}

	dispose(): void {
		this.cleanupImage();
		for (const timer of this.tapTimers.values()) {
			clearTimeout(timer);
		}
		this.tapTimers.clear();
	}

	private cleanupImage(): void {
		if (this.rendererMode !== "image" || this.imageCleared) {
			return;
		}
		this.imageRenderer.dispose(this.tui);
		this.imageCleared = true;
	}

	private buildDebugLine(): string | null {
		const stats = this.statsProvider?.();
		if (!stats) {
			return null;
		}
		const label = this.debugLabel ? ` core=${this.debugLabel}` : "";
		const mem = stats.memory;
		const line = `DEBUG${label} fps=${stats.tickFps.toFixed(1)} render=${stats.renderFps.toFixed(1)} `
			+ `frames/tick=${stats.avgFramesPerTick.toFixed(2)} dropped=${stats.droppedFrames} `
			+ `catch=${stats.lastCatchUpFrames}/${stats.maxCatchUpFrames} `
			+ `eld=${stats.eventLoopDelayMs.toFixed(2)}ms `
			+ `mem=${mem.heapUsedMb.toFixed(1)}/${mem.rssMb.toFixed(1)}MB ext=${mem.externalMb.toFixed(1)}MB ab=${mem.arrayBuffersMb.toFixed(1)}MB`;
		return `\x1b[33m${line}\x1b[0m`;
	}

	private tapButton(button: "start" | "select"): void {
		this.core.setButton(button, true);
		const existing = this.tapTimers.get(button);
		if (existing) {
			clearTimeout(existing);
		}
		const timer = setTimeout(() => {
			this.core.setButton(button, false);
			this.tapTimers.delete(button);
		}, 80);
		this.tapTimers.set(button, timer);
	}
}
