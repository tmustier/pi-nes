import { test, describe } from "node:test";
import assert from "node:assert";
import { getMappedButtons, DEFAULT_INPUT_MAPPING } from "../extensions/nes/input-map.js";

describe("input-map", () => {
	describe("DEFAULT_INPUT_MAPPING", () => {
		test("has all required buttons", () => {
			const buttons = ["up", "down", "left", "right", "a", "b", "start", "select"];
			for (const button of buttons) {
				assert.ok(button in DEFAULT_INPUT_MAPPING, `Missing button: ${button}`);
				assert.ok(Array.isArray(DEFAULT_INPUT_MAPPING[button as keyof typeof DEFAULT_INPUT_MAPPING]));
			}
		});
	});

	describe("getMappedButtons", () => {
		test("maps 'z' to 'a' button", () => {
			const buttons = getMappedButtons("z");
			assert.ok(buttons.includes("a"), `Expected 'a' in ${JSON.stringify(buttons)}`);
		});

		test("maps 'x' to 'b' button", () => {
			const buttons = getMappedButtons("x");
			assert.ok(buttons.includes("b"), `Expected 'b' in ${JSON.stringify(buttons)}`);
		});

		test("maps 'w' to 'up' button", () => {
			const buttons = getMappedButtons("w");
			assert.ok(buttons.includes("up"), `Expected 'up' in ${JSON.stringify(buttons)}`);
		});

		test("returns empty for unmapped key", () => {
			const buttons = getMappedButtons("q");
			assert.strictEqual(buttons.length, 0);
		});

		test("uses custom mapping when provided", () => {
			const customMapping = {
				...DEFAULT_INPUT_MAPPING,
				a: ["k"],
			};
			const buttons = getMappedButtons("k", customMapping);
			assert.ok(buttons.includes("a"));
		});
	});
});
