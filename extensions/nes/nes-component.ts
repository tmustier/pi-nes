import type { Component, TUI } from "@mariozechner/pi-tui";
import { isKeyRelease, matchesKey, truncateToWidth } from "@mariozechner/pi-tui";
import type { InputMapping } from "./input-map.js";
import { DEFAULT_INPUT_MAPPING, getMappedButtons } from "./input-map.js";
import type { NesCore } from "./nes-core.js";

const FRAME_WIDTH = 256;
const FRAME_HEIGHT = 240;
const ASPECT_RATIO = FRAME_WIDTH / (FRAME_HEIGHT / 2);
const MIN_ROWS = 10;
const FRAME_INTERVAL_MS = 1000 / 60;

function renderHalfBlock(frameBuffer: ReadonlyArray<number>, targetCols: number, targetRows: number): string[] {
	const lines: string[] = [];
	const scaleX = FRAME_WIDTH / targetCols;
	const scaleY = FRAME_HEIGHT / (targetRows * 2);

	for (let row = 0; row < targetRows; row += 1) {
		let line = "";
		const srcY1 = Math.floor(row * 2 * scaleY);
		const srcY2 = Math.floor((row * 2 + 1) * scaleY);

		for (let col = 0; col < targetCols; col += 1) {
			const srcX = Math.floor(col * scaleX);
			const idx1 = srcY1 * FRAME_WIDTH + srcX;
			const idx2 = srcY2 * FRAME_WIDTH + srcX;
			const color1 = frameBuffer[idx1] ?? 0;
			const color2 = frameBuffer[idx2] ?? 0;
			const r1 = (color1 >> 16) & 0xff;
			const g1 = (color1 >> 8) & 0xff;
			const b1 = color1 & 0xff;
			const r2 = (color2 >> 16) & 0xff;
			const g2 = (color2 >> 8) & 0xff;
			const b2 = color2 & 0xff;
			line += `\x1b[38;2;${r1};${g1};${b1}m\x1b[48;2;${r2};${g2};${b2}m▀`;
		}
		line += "\x1b[0m";
		lines.push(line);
	}

	return lines;
}

export class NesOverlayComponent implements Component {
	wantsKeyRelease = true;
	private interval: ReturnType<typeof setInterval> | null = null;
	private readonly inputMapping: InputMapping;

	constructor(
		private readonly tui: TUI,
		private readonly core: NesCore,
		private readonly onExit: () => void,
		inputMapping: InputMapping = DEFAULT_INPUT_MAPPING,
	) {
		this.inputMapping = inputMapping;
		this.startLoop();
	}

	handleInput(data: string): void {
		const released = isKeyRelease(data);
		if (!released && (data === "q" || data === "Q" || matchesKey(data, "escape"))) {
			this.dispose();
			this.onExit();
			return;
		}

		const buttons = getMappedButtons(data, this.inputMapping);
		if (buttons.length === 0) {
			return;
		}

		for (const button of buttons) {
			this.core.setButton(button, !released);
		}
	}

	render(width: number): string[] {
		if (width <= 0) {
			return [];
		}
		const targetCols = Math.max(1, width);
		const targetRows = Math.max(MIN_ROWS, Math.floor(width / ASPECT_RATIO));
		const lines = renderHalfBlock(this.core.getFrameBuffer(), targetCols, targetRows);

		const footer = " NES | Q=Quit | WASD/Arrows=Move | Z/X=A/B | Enter=Start | Tab=Select";
		lines.push(truncateToWidth(`\x1b[2m${footer}\x1b[0m`, width));
		return lines;
	}

	invalidate(): void {}

	dispose(): void {
		if (this.interval) {
			clearInterval(this.interval);
			this.interval = null;
		}
	}

	private startLoop(): void {
		this.interval = setInterval(() => {
			try {
				this.core.tick();
				this.tui.requestRender();
			} catch {
				this.dispose();
				this.onExit();
			}
		}, FRAME_INTERVAL_MS);
	}
}
