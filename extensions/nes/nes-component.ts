import type { Component, TUI } from "@mariozechner/pi-tui";
import { isKeyRelease, matchesKey, truncateToWidth } from "@mariozechner/pi-tui";
import type { InputMapping } from "./input-map.js";
import { DEFAULT_INPUT_MAPPING, getMappedButtons } from "./input-map.js";
import type { NesButton, FrameBuffer, NesCore } from "./nes-core.js";
import type { NesSessionStats } from "./nes-session.js";
import type { RendererMode } from "./config.js";
import { FRAME_HEIGHT, FRAME_WIDTH, NesImageRenderer } from "./renderer.js";

function readRgb(frameBuffer: FrameBuffer, index: number): [number, number, number] {
	const data = frameBuffer.data;
	const base = index * 3;
	return [data[base] ?? 0, data[base + 1] ?? 0, data[base + 2] ?? 0];
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
	private readonly tapTimers = new Map<"start" | "select", ReturnType<typeof setTimeout>>();
	private readonly heldButtons = new Set<NesButton>();
	private readonly imageRenderer = new NesImageRenderer();
	private readonly rendererMode: RendererMode;
	private readonly pixelScale: number;
	private readonly windowed: boolean;
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
		windowed = false,
		debug = false,
		statsProvider?: () => NesSessionStats,
		debugLabel?: string,
	) {
		this.inputMapping = inputMapping;
		this.rendererMode = rendererMode;
		this.pixelScale = pixelScale;
		this.windowed = windowed;
		this.debug = debug;
		this.statsProvider = statsProvider;
		this.debugLabel = debugLabel;
	}

	handleInput(data: string): void {
		const released = isKeyRelease(data);
		if (!released && matchesKey(data, "ctrl+q")) {
			this.releaseAllButtons();
			this.cleanupImage();
			this.onDetach();
			return;
		}
		if (!released && (matchesKey(data, "q") || matchesKey(data, "shift+q"))) {
			this.releaseAllButtons();
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
			if (released) {
				this.heldButtons.delete(button);
			} else {
				this.heldButtons.add(button);
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
		const debugLines = this.debug ? this.buildDebugLines() : [];
		const footerRows = this.debug ? 1 + debugLines.length : 1;

		if (this.rendererMode === "image") {
			const lines = this.renderImage(frameBuffer, width, footerRows);
			return this.appendFooter(lines, width, debugLines, footer, "");
		}

		const { lines, padPrefix } = this.renderText(frameBuffer, width, footerRows);
		return this.appendFooter(lines, width, debugLines, footer, padPrefix);
	}

	invalidate(): void {}

	dispose(): void {
		this.releaseAllButtons();
		this.cleanupImage();
	}

	private renderImage(frameBuffer: FrameBuffer, width: number, footerRows: number): string[] {
		return this.imageRenderer.render(
			frameBuffer,
			this.tui,
			width,
			footerRows,
			this.pixelScale,
			!this.windowed,
		);
	}

	private renderText(
		frameBuffer: FrameBuffer,
		width: number,
		footerRows: number,
	): { lines: string[]; padPrefix: string } {
		const maxFrameRows = Math.max(1, this.tui.terminal.rows - footerRows);
		const scaleX = Math.max(1, Math.ceil(FRAME_WIDTH / width));
		const scaleY = Math.max(1, Math.ceil(FRAME_HEIGHT / (maxFrameRows * 2)));
		const targetRows = Math.max(1, Math.floor(FRAME_HEIGHT / (scaleY * 2)));
		const targetCols = Math.max(1, Math.floor(FRAME_WIDTH / scaleX));
		const padLeft = Math.max(0, Math.floor((width - targetCols) / 2));
		const padPrefix = padLeft > 0 ? " ".repeat(padLeft) : "";

		const rawLines = renderHalfBlock(frameBuffer, targetCols, targetRows, scaleX, scaleY);
		const lines = rawLines.map((line) => truncateToWidth(`${padPrefix}${line}`, width));
		return { lines, padPrefix };
	}

	private appendFooter(
		lines: string[],
		width: number,
		debugLines: string[],
		footer: string,
		padPrefix: string,
	): string[] {
		const output = [...lines];
		for (const line of debugLines) {
			output.push(truncateToWidth(`${padPrefix}${line}`, width));
		}
		output.push(truncateToWidth(`\x1b[2m${padPrefix}${footer}\x1b[0m`, width));
		return output;
	}

	private cleanupImage(): void {
		if (this.rendererMode !== "image" || this.imageCleared) {
			return;
		}
		this.imageRenderer.dispose(this.tui);
		this.imageCleared = true;
	}

	private releaseAllButtons(): void {
		for (const button of this.heldButtons) {
			this.core.setButton(button, false);
		}
		this.heldButtons.clear();
		for (const [button, timer] of this.tapTimers.entries()) {
			clearTimeout(timer);
			this.core.setButton(button, false);
		}
		this.tapTimers.clear();
	}

	private buildDebugLines(): string[] {
		const stats = this.statsProvider?.();
		if (!stats) {
			return [];
		}
		const label = this.debugLabel ? ` core=${this.debugLabel}` : "";
		const mem = stats.memory;
		const lines: string[] = [];
		const statsLine = `DEBUG${label} fps=${stats.tickFps.toFixed(1)} render=${stats.renderFps.toFixed(1)} `
			+ `frames/tick=${stats.avgFramesPerTick.toFixed(2)} dropped=${stats.droppedFrames} `
			+ `catch=${stats.lastCatchUpFrames}/${stats.maxCatchUpFrames} `
			+ `eld=${stats.eventLoopDelayMs.toFixed(2)}ms `
			+ `mem=${mem.heapUsedMb.toFixed(1)}/${mem.rssMb.toFixed(1)}MB ext=${mem.externalMb.toFixed(1)}MB ab=${mem.arrayBuffersMb.toFixed(1)}MB`;
		lines.push(`\x1b[33m${statsLine}\x1b[0m`);

		const debugState = this.core.getDebugState();
		if (debugState) {
			const cpu = debugState.cpu;
			const mapper = debugState.mapper;
			const cpuLine = `CPU pc=${this.formatHex(cpu.pc, 4)} op=${this.formatHex(cpu.lastOpcode, 2)} `
				+ `a=${this.formatHex(cpu.a, 2)} x=${this.formatHex(cpu.x, 2)} y=${this.formatHex(cpu.y, 2)} `
				+ `sp=${this.formatHex(cpu.sp, 2)} p=${this.formatHex(cpu.p, 2)} `
				+ `last=${this.formatHex(cpu.lastPc, 4)}`;
			const mapperLine = `MMC1 ctrl=${this.formatHex(mapper.control, 2)} prg=${this.formatHex(mapper.prg, 2)} `
				+ `chr0=${this.formatHex(mapper.chr0, 2)} chr1=${this.formatHex(mapper.chr1, 2)} `
				+ `prgMode=${mapper.prgMode} chrMode=${mapper.chrMode} outer=${mapper.outerPrg}`;
			lines.push(`\x1b[36m${cpuLine}\x1b[0m`);
			lines.push(`\x1b[36m${mapperLine}\x1b[0m`);
		}
		return lines;
	}

	private formatHex(value: number, width: number): string {
		return value.toString(16).padStart(width, "0");
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
