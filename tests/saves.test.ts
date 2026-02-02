import { test, describe } from "node:test";
import assert from "node:assert";
import path from "node:path";
import { getSavePath } from "../extensions/nes/saves.js";

describe("saves", () => {
	describe("getSavePath", () => {
		test("creates save path with rom name and hash", () => {
			const result = getSavePath("/saves", "/roms/Zelda.nes");
			// Should be /saves/Zelda-<hash>.sav
			assert.ok(result.startsWith("/saves/Zelda-"), `Expected path to start with /saves/Zelda-, got: ${result}`);
			assert.ok(result.endsWith(".sav"), `Expected path to end with .sav, got: ${result}`);
		});

		test("different rom paths produce different hashes", () => {
			const save1 = getSavePath("/saves", "/roms/Zelda.nes");
			const save2 = getSavePath("/saves", "/other/Zelda.nes");
			assert.notStrictEqual(save1, save2, "Same ROM name from different paths should have different hashes");
		});

		test("same rom path produces consistent hash", () => {
			const save1 = getSavePath("/saves", "/roms/Zelda.nes");
			const save2 = getSavePath("/saves", "/roms/Zelda.nes");
			assert.strictEqual(save1, save2, "Same ROM path should produce same save path");
		});

		test("uses provided save directory", () => {
			const result = getSavePath("/custom/saves", "/roms/Game.nes");
			assert.ok(result.startsWith("/custom/saves/"), `Expected custom save dir, got: ${result}`);
		});
	});
});
