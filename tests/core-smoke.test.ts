import { test, describe, before, after } from "node:test";
import assert from "node:assert";
import { readFile } from "node:fs/promises";
import { createNesCore, type NesCore } from "../extensions/nes/nes-core.js";

const TEST_ROM = process.env.NES_TEST_ROM;
const SKIP_REASON = "Set NES_TEST_ROM=/path/to/rom.nes to run core tests";

function hashFramebuffer(data: Uint8Array): number {
	let hash = 0;
	// Sample every 1000th byte for speed
	for (let i = 0; i < data.length; i += 1000) {
		hash = ((hash << 5) - hash + data[i]) | 0;
	}
	return hash;
}

describe("core-smoke", { skip: !TEST_ROM ? SKIP_REASON : undefined }, () => {
	let core: NesCore;
	let romData: Uint8Array;

	before(async () => {
		if (!TEST_ROM) return;
		romData = new Uint8Array(await readFile(TEST_ROM));
	});

	after(() => {
		core?.dispose();
	});

	test("native core is available", () => {
		// This will throw if native module not built
		core = createNesCore();
		assert.ok(core, "Core should be created");
	});

	test("loads ROM without crashing", () => {
		core.loadRom(romData);
		// If we get here, it loaded
		assert.ok(true);
	});

	test("runs 60 frames without crashing", () => {
		for (let i = 0; i < 60; i++) {
			core.tick();
		}
		assert.ok(true);
	});

	test("framebuffer contains data", () => {
		const fb = core.getFrameBuffer();
		assert.ok(fb.data.length > 0, "Framebuffer should have data");
		// Check it's not all zeros (at least some pixels rendered)
		const hasNonZero = fb.data.some(b => b !== 0);
		assert.ok(hasNonZero, "Framebuffer should have non-zero pixels");
	});

	test("frames change over time (not frozen)", () => {
		const hashes: number[] = [];
		for (let i = 0; i < 30; i++) {
			core.tick();
			const fb = core.getFrameBuffer();
			hashes.push(hashFramebuffer(fb.data));
		}
		const uniqueHashes = new Set(hashes);
		// Should have at least a few different frames
		assert.ok(uniqueHashes.size > 1, `Expected frame changes, got ${uniqueHashes.size} unique frames out of 30`);
	});

	test("button input does not crash", () => {
		core.setButton("a", true);
		core.tick();
		core.setButton("a", false);
		core.setButton("start", true);
		core.tick();
		core.setButton("start", false);
		core.tick();
		assert.ok(true);
	});

	// Note: reset() exists in native but isn't exposed via NesCore interface
});

describe("sram-roundtrip", { skip: !TEST_ROM ? SKIP_REASON : undefined }, () => {
	test("SRAM save and restore", async () => {
		if (!TEST_ROM) return;

		const romData = new Uint8Array(await readFile(TEST_ROM));
		const core = createNesCore();
		
		try {
			core.loadRom(romData);

			// Run some frames
			for (let i = 0; i < 60; i++) {
				core.tick();
			}

			const sram = core.getSram();
			if (!sram) {
				// ROM doesn't have battery-backed SRAM, skip
				return;
			}

			// Modify SRAM dirty state
			assert.strictEqual(typeof core.isSramDirty(), "boolean");

			// Create new core and restore SRAM
			const core2 = createNesCore();
			try {
				core2.loadRom(romData);
				core2.setSram(sram);

				const restored = core2.getSram();
				assert.ok(restored, "Should be able to get SRAM after setting");
				assert.strictEqual(restored.length, sram.length, "SRAM length should match");
			} finally {
				core2.dispose();
			}
		} finally {
			core.dispose();
		}
	});
});
