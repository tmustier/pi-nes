/**
 * Debug script to visually inspect what a game looks like after scripted input
 * 
 * Usage:
 *   npx tsx tests/debug-game.ts ~/roms/nes/Mario.nes
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createNesCore, type NesCore, type NesButton } from "../extensions/nes/nes-core.js";
import { findScript, type GameScript } from "./game-scripts.js";

const FRAME_WIDTH = 256;
const FRAME_HEIGHT = 240;

function hashFramebuffer(data: Uint8Array): number {
	let hash = 0;
	for (let i = 0; i < data.length; i += 500) {
		hash = ((hash << 5) - hash + data[i]) | 0;
	}
	return hash;
}

function analyzeFrame(data: Uint8Array): { nonZeroPixels: number; uniqueColors: number; brightness: number } {
	let nonZeroPixels = 0;
	let totalBrightness = 0;
	const colors = new Set<number>();

	for (let i = 0; i < data.length; i += 3) {
		const r = data[i];
		const g = data[i + 1];
		const b = data[i + 2];
		
		if (r !== 0 || g !== 0 || b !== 0) {
			nonZeroPixels++;
		}
		
		const color = (r << 16) | (g << 8) | b;
		colors.add(color);
		totalBrightness += (r + g + b) / 3;
	}

	return {
		nonZeroPixels,
		uniqueColors: colors.size,
		brightness: totalBrightness / (FRAME_WIDTH * FRAME_HEIGHT),
	};
}

function renderFrameAscii(data: Uint8Array, width: number = 64, height: number = 24): string[] {
	const lines: string[] = [];
	const scaleX = FRAME_WIDTH / width;
	const scaleY = FRAME_HEIGHT / height;
	const chars = " .:-=+*#%@";

	for (let y = 0; y < height; y++) {
		let line = "";
		for (let x = 0; x < width; x++) {
			const srcX = Math.floor(x * scaleX);
			const srcY = Math.floor(y * scaleY);
			const idx = (srcY * FRAME_WIDTH + srcX) * 3;
			const r = data[idx] || 0;
			const g = data[idx + 1] || 0;
			const b = data[idx + 2] || 0;
			const brightness = (r + g + b) / 3 / 255;
			const charIdx = Math.min(chars.length - 1, Math.floor(brightness * chars.length));
			line += chars[charIdx];
		}
		lines.push(line);
	}
	return lines;
}

async function debugGame(romPath: string) {
	const filename = path.basename(romPath);
	console.log(`\n${"=".repeat(70)}`);
	console.log(`Debugging: ${filename}`);
	console.log(`${"=".repeat(70)}\n`);

	const romData = new Uint8Array(await readFile(romPath));
	const core = createNesCore();
	
	try {
		core.loadRom(romData);
		console.log("✅ ROM loaded successfully\n");

		const script = findScript(filename);
		if (!script) {
			console.log("⚠️  No script found for this ROM, running default frames\n");
			for (let i = 0; i < 300; i++) {
				core.tick();
			}
		} else {
			console.log(`📜 Script: ${script.description}\n`);
			console.log("Executing script...\n");

			let totalFrames = 0;
			for (const action of script.sequence) {
				switch (action.type) {
					case "wait":
						console.log(`  ⏳ Wait ${action.frames} frames (${(action.frames / 60).toFixed(1)}s)`);
						for (let i = 0; i < action.frames; i++) {
							core.tick();
							totalFrames++;
						}
						break;
					case "press":
						console.log(`  🎮 Press ${action.button}`);
						core.setButton(action.button, true);
						for (let i = 0; i < (action.frames ?? 5); i++) {
							core.tick();
							totalFrames++;
						}
						core.setButton(action.button, false);
						break;
					case "hold":
						console.log(`  🎮 Hold ${action.button} for ${action.frames} frames`);
						core.setButton(action.button, true);
						for (let i = 0; i < action.frames; i++) {
							core.tick();
							totalFrames++;
						}
						core.setButton(action.button, false);
						break;
					case "release":
						console.log(`  🎮 Release ${action.button}`);
						core.setButton(action.button, false);
						break;
				}
			}
			console.log(`\n✅ Script complete, ran ${totalFrames} frames\n`);
		}

		// Analyze current frame
		const fb = core.getFrameBuffer();
		const analysis = analyzeFrame(fb.data);
		
		console.log("Frame Analysis (after script):");
		console.log(`  Non-zero pixels: ${analysis.nonZeroPixels.toLocaleString()} / ${(FRAME_WIDTH * FRAME_HEIGHT).toLocaleString()} (${(analysis.nonZeroPixels / (FRAME_WIDTH * FRAME_HEIGHT) * 100).toFixed(1)}%)`);
		console.log(`  Unique colors: ${analysis.uniqueColors}`);
		console.log(`  Average brightness: ${analysis.brightness.toFixed(1)}`);
		console.log(`  Frame hash: ${hashFramebuffer(fb.data)}`);
		
		console.log("\nASCII Preview:");
		console.log("┌" + "─".repeat(64) + "┐");
		for (const line of renderFrameAscii(fb.data)) {
			console.log("│" + line + "│");
		}
		console.log("└" + "─".repeat(64) + "┘");

		// Run more frames and check for changes
		console.log("\nRunning 60 more frames to check for animation...\n");
		const hashes: number[] = [hashFramebuffer(fb.data)];
		
		for (let i = 0; i < 60; i++) {
			core.tick();
			if (i % 10 === 0) {
				const currentFb = core.getFrameBuffer();
				hashes.push(hashFramebuffer(currentFb.data));
			}
		}

		const uniqueHashes = new Set(hashes);
		console.log(`Frame hashes sampled: ${hashes.length}`);
		console.log(`Unique hashes: ${uniqueHashes.size}`);
		console.log(`Hashes: ${hashes.join(", ")}`);
		
		if (uniqueHashes.size <= 1) {
			console.log("\n⚠️  FROZEN: No frame changes detected!");
		} else {
			console.log("\n✅ ANIMATED: Frames are changing");
		}

		// Final frame
		const finalFb = core.getFrameBuffer();
		const finalAnalysis = analyzeFrame(finalFb.data);
		
		console.log("\nFinal Frame Analysis:");
		console.log(`  Non-zero pixels: ${finalAnalysis.nonZeroPixels.toLocaleString()} (${(finalAnalysis.nonZeroPixels / (FRAME_WIDTH * FRAME_HEIGHT) * 100).toFixed(1)}%)`);
		console.log(`  Unique colors: ${finalAnalysis.uniqueColors}`);

		console.log("\nFinal ASCII Preview:");
		console.log("┌" + "─".repeat(64) + "┐");
		for (const line of renderFrameAscii(finalFb.data)) {
			console.log("│" + line + "│");
		}
		console.log("└" + "─".repeat(64) + "┘");

	} finally {
		core.dispose();
	}
}

// Main
const romPath = process.argv[2];
if (!romPath) {
	console.error("Usage: npx tsx tests/debug-game.ts <rom-path>");
	process.exit(1);
}

debugGame(romPath).catch(err => {
	console.error("Error:", err);
	process.exit(1);
});
