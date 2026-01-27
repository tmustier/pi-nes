import type { Component, TUI } from "@mariozechner/pi-tui";
import { isKeyRelease, matchesKey, truncateToWidth } from "@mariozechner/pi-tui";
import type { InputMapping } from "./input-map.js";
import { DEFAULT_INPUT_MAPPING, getMappedButtons } from "./input-map.js";
import type { NesCore } from "./nes-core.js";

const FRAME_WIDTH = 256;
const FRAME_HEIGHT = 240;
const ASPECT_RATIO = FRAME_WIDTH / (FRAME_HEIGHT / 2);
const MIN_ROWS = 10;

function renderHalfBlock(
	frameBuffer: ReadonlyArray<number>,
	targetCols: number,
	targetRows: number,
	scaleFactor: number,
): string[] {
	const lines: string[] = [];
	const offset = Math.floor(scaleFactor / 2);

	for (let row = 0; row < targetRows; row += 1) {
		let line = "";
		const srcY1 = row * 2 * scaleFactor + offset;
		const srcY2 = row * 2 * scaleFactor + scaleFactor + offset;
		const safeY1 = Math.min(srcY1, FRAME_HEIGHT - 1);
		const safeY2 = Math.min(srcY2, FRAME_HEIGHT - 1);

		for (let col = 0; col < targetCols; col += 1) {
			const srcX = col * scaleFactor + offset;
			const safeX = Math.min(srcX, FRAME_WIDTH - 1);
			const idx1 = safeY1 * FRAME_WIDTH + safeX;
			const idx2 = safeY2 * FRAME_WIDTH + safeX;
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
	private readonly inputMapping: InputMapping;

	constructor(
		private readonly tui: TUI,
		private readonly core: NesCore,
		private readonly onDetach: () => void,
		private readonly onQuit: () => void,
		inputMapping: InputMapping = DEFAULT_INPUT_MAPPING,
	) {
		this.inputMapping = inputMapping;
	}

	handleInput(data: string): void {
		const released = isKeyRelease(data);
		if (!released && matchesKey(data, "ctrl+q")) {
			this.onDetach();
			return;
		}
		if (!released && (data === "q" || data === "Q")) {
			this.onQuit();
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
		const availableRows = Math.max(1, Math.floor(this.tui.terminal.rows * 0.8));
		const maxFrameRows = Math.max(1, availableRows - 1);
		const scaleFactor = Math.max(
			1,
			Math.ceil(FRAME_WIDTH / width),
			Math.ceil(FRAME_HEIGHT / (maxFrameRows * 2)),
		);
		const targetRows = Math.max(1, Math.floor(FRAME_HEIGHT / (scaleFactor * 2)));
		const targetCols = Math.max(1, Math.floor(FRAME_WIDTH / scaleFactor));
		const padLeft = Math.max(0, Math.floor((width - targetCols) / 2));
		const padPrefix = padLeft > 0 ? " ".repeat(padLeft) : "";

		const rawLines = renderHalfBlock(this.core.getFrameBuffer(), targetCols, targetRows, scaleFactor);
		const lines = rawLines.map((line) => truncateToWidth(`${padPrefix}${line}`, width));

		const footer = " NES | Ctrl+Q=Detach | Q=Quit | WASD/Arrows=Move | Z/X=A/B | Enter=Start | Tab=Select";
		lines.push(truncateToWidth(`\x1b[2m${padPrefix}${footer}\x1b[0m`, width));
		return lines;
	}

	invalidate(): void {}

	dispose(): void {}
}
