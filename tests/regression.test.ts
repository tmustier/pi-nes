/**
 * ROM Regression Tests
 * 
 * Runs scripted smoke tests against ROMs.
 * Set NES_ROM_DIR to enable.
 * 
 * Usage:
 *   NES_ROM_DIR=~/roms/nes npm run test:regression
 */
import { test, describe } from "node:test";
import assert from "node:assert";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { createNesCore, type NesCore, type NesButton } from "../extensions/nes/nes-core.js";
import { findScript, type GameScript, type ScriptAction } from "./game-scripts.js";

const ROM_DIR = process.env.NES_ROM_DIR;
const SKIP_REASON = "Set NES_ROM_DIR=/path/to/roms to run regression tests";

// Default test for ROMs without a script
const DEFAULT_FRAMES = 300;
const DEFAULT_POST_SEQUENCE_FRAMES = 60;

interface RomResult {
	name: string;
	loaded: boolean;
	framesRun: number;
	froze: boolean;
	scriptUsed: boolean;
	scriptDescription?: string;
	error?: string;
}

function hashFramebuffer(data: Uint8Array): number {
	let hash = 0;
	for (let i = 0; i < data.length; i += 500) {
		hash = ((hash << 5) - hash + data[i]) | 0;
	}
	return hash;
}

/**
 * Execute a scripted input sequence
 */
function executeScript(core: NesCore, script: GameScript): { framesRun: number; froze: boolean } {
	let totalFrames = 0;
	const heldButtons = new Set<NesButton>();

	// Execute each action in sequence
	for (const action of script.sequence) {
		switch (action.type) {
			case "wait":
				for (let i = 0; i < action.frames; i++) {
					core.tick();
					totalFrames++;
				}
				break;

			case "press": {
				// Tap: press, run a few frames, release
				const holdFrames = action.frames ?? 5;
				core.setButton(action.button, true);
				for (let i = 0; i < holdFrames; i++) {
					core.tick();
					totalFrames++;
				}
				core.setButton(action.button, false);
				break;
			}

			case "hold":
				core.setButton(action.button, true);
				heldButtons.add(action.button);
				for (let i = 0; i < action.frames; i++) {
					core.tick();
					totalFrames++;
				}
				core.setButton(action.button, false);
				heldButtons.delete(action.button);
				break;

			case "release":
				core.setButton(action.button, false);
				heldButtons.delete(action.button);
				break;
		}
	}

	// Release any still-held buttons
	for (const button of heldButtons) {
		core.setButton(button, false);
	}

	// Run post-sequence frames and check for freeze
	const postFrames = script.postSequenceFrames ?? DEFAULT_POST_SEQUENCE_FRAMES;
	const hashes: number[] = [];
	
	for (let i = 0; i < postFrames; i++) {
		core.tick();
		totalFrames++;
		
		// Sample hash every 10 frames
		if (i % 10 === 0) {
			const fb = core.getFrameBuffer();
			hashes.push(hashFramebuffer(fb.data));
		}
	}

	// Check if frames changed during post-sequence
	const uniqueHashes = new Set(hashes);
	const froze = uniqueHashes.size <= 1;

	return { framesRun: totalFrames, froze };
}

/**
 * Run default test (no script) - just run frames and check for freeze
 */
function executeDefault(core: NesCore): { framesRun: number; froze: boolean } {
	let lastHash = 0;
	let sameHashCount = 0;
	let froze = false;

	for (let i = 0; i < DEFAULT_FRAMES; i++) {
		core.tick();

		// Check for freeze every 30 frames
		if (i % 30 === 0) {
			const fb = core.getFrameBuffer();
			const hash = hashFramebuffer(fb.data);
			if (hash === lastHash) {
				sameHashCount++;
				if (sameHashCount >= 4) {
					froze = true;
					// Don't break - continue to verify no crash
				}
			} else {
				sameHashCount = 0;
			}
			lastHash = hash;
		}
	}

	return { framesRun: DEFAULT_FRAMES, froze };
}

async function testRom(romPath: string): Promise<RomResult> {
	const filename = path.basename(romPath);
	const name = filename.replace(/\.nes$/i, "");
	const result: RomResult = { name, loaded: false, framesRun: 0, froze: false, scriptUsed: false };

	let core: NesCore | null = null;
	try {
		const romData = new Uint8Array(await readFile(romPath));
		core = createNesCore();
		core.loadRom(romData);
		result.loaded = true;

		const script = findScript(filename);
		if (script) {
			result.scriptUsed = true;
			result.scriptDescription = script.description;
			const { framesRun, froze } = executeScript(core, script);
			result.framesRun = framesRun;
			result.froze = froze;
		} else {
			const { framesRun, froze } = executeDefault(core);
			result.framesRun = framesRun;
			result.froze = froze;
		}
	} catch (err) {
		result.error = err instanceof Error ? err.message : String(err);
	} finally {
		core?.dispose();
	}

	return result;
}

describe("regression", { skip: !ROM_DIR ? SKIP_REASON : undefined }, () => {
	test("all ROMs load and run without crashing", async () => {
		if (!ROM_DIR) return;

		const entries = await readdir(ROM_DIR, { withFileTypes: true });
		const romFiles = entries
			.filter(e => e.isFile() && e.name.toLowerCase().endsWith(".nes"))
			.map(e => path.join(ROM_DIR, e.name));

		if (romFiles.length === 0) {
			console.log(`No .nes files found in ${ROM_DIR}`);
			return;
		}

		console.log(`\nTesting ${romFiles.length} ROMs from ${ROM_DIR}\n`);

		const results: RomResult[] = [];
		for (const romPath of romFiles) {
			const result = await testRom(romPath);
			results.push(result);

			const status = result.error ? "❌ ERROR" 
				: result.froze ? "⚠️  FROZE" 
				: "✅ OK";
			
			const scriptInfo = result.scriptUsed ? " [scripted]" : "";
			console.log(`  ${status} ${result.name}${scriptInfo} (${result.framesRun} frames)`);
			
			if (result.scriptDescription) {
				console.log(`       Script: ${result.scriptDescription}`);
			}
			if (result.error) {
				console.log(`       Error: ${result.error}`);
			}
			if (result.froze && result.scriptUsed) {
				console.log(`       ⚠️  Game appears frozen after scripted input - possible sprite/rendering issue`);
			}
		}

		const failed = results.filter(r => r.error);
		const frozen = results.filter(r => r.froze && !r.error);
		const passed = results.filter(r => !r.error && !r.froze);

		console.log(`\n${"─".repeat(60)}`);
		console.log(`Summary: ${passed.length} passed, ${frozen.length} frozen, ${failed.length} failed`);
		
		if (frozen.length > 0) {
			console.log(`\nFrozen games (may indicate rendering issues):`);
			for (const r of frozen) {
				console.log(`  - ${r.name}${r.scriptUsed ? " (scripted)" : ""}`);
			}
		}
		console.log();

		// Fail if any ROM crashes on load or during execution
		assert.strictEqual(failed.length, 0, 
			`${failed.length} ROMs failed: ${failed.map(r => r.name).join(", ")}`);
		
		// Also fail if scripted games freeze (they should work after input)
		const scriptedFrozen = frozen.filter(r => r.scriptUsed);
		assert.strictEqual(scriptedFrozen.length, 0,
			`${scriptedFrozen.length} scripted games froze (possible rendering bug): ${scriptedFrozen.map(r => r.name).join(", ")}`);
	});
});
