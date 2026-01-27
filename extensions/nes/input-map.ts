import { matchesKey } from "@mariozechner/pi-tui";
import type { NesButton } from "./nes-core.js";

export type InputMapping = Record<NesButton, string[]>;

export const DEFAULT_INPUT_MAPPING: InputMapping = {
	up: ["up", "w", "W"],
	down: ["down", "s", "S"],
	left: ["left", "a", "A"],
	right: ["right", "d", "D"],
	a: ["z", "Z"],
	b: ["x", "X"],
	start: ["enter", "space"],
	select: ["tab"],
};

export function getMappedButtons(data: string, mapping: InputMapping = DEFAULT_INPUT_MAPPING): NesButton[] {
	const matches = (keys: string[]) => keys.some((key) => matchesKey(data, key) || data === key);
	return (Object.keys(mapping) as NesButton[]).filter((button) => matches(mapping[button]));
}
