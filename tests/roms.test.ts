import { test, describe } from "node:test";
import assert from "node:assert";
import { getRomDisplayName } from "../extensions/nes/roms.js";

describe("roms", () => {
	describe("getRomDisplayName", () => {
		test("strips .nes extension", () => {
			assert.strictEqual(getRomDisplayName("/path/to/Super Mario Bros.nes"), "Super Mario Bros");
		});

		test("strips .NES extension (uppercase)", () => {
			assert.strictEqual(getRomDisplayName("/roms/ZELDA.NES"), "ZELDA");
		});

		test("handles paths with multiple dots", () => {
			assert.strictEqual(getRomDisplayName("/roms/Game v1.0.nes"), "Game v1.0");
		});

		test("handles simple filename", () => {
			assert.strictEqual(getRomDisplayName("game.nes"), "game");
		});

		test("handles path with spaces", () => {
			assert.strictEqual(getRomDisplayName("/my roms/Legend of Zelda.nes"), "Legend of Zelda");
		});
	});
});
