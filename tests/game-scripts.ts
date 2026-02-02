import type { NesButton } from "../extensions/nes/nes-core.js";

/**
 * Input action in a game script
 */
export type ScriptAction =
	| { type: "wait"; frames: number }
	| { type: "press"; button: NesButton; frames?: number }  // tap (default 5 frames)
	| { type: "hold"; button: NesButton; frames: number }    // hold for duration
	| { type: "release"; button: NesButton };

/**
 * Script for testing a specific game
 */
export interface GameScript {
	/** Input sequence to execute */
	sequence: ScriptAction[];
	/** Description of what the script does */
	description: string;
	/** Frames to run after sequence to check for freeze (default 60) */
	postSequenceFrames?: number;
}

// Helper to convert seconds to frames (at 60fps)
const sec = (s: number) => Math.round(s * 60);

/**
 * Game-specific test scripts
 * Keys should match ROM filename (without extension, case-insensitive)
 */
export const GAME_SCRIPTS: Record<string, GameScript> = {
	"dragon quest iii": {
		description: "Wait for title, press Start, wait for game to load",
		sequence: [
			{ type: "wait", frames: sec(3) },      // Wait for title screen
			{ type: "press", button: "start" },    // Press Start
			{ type: "wait", frames: sec(3) },      // Wait for game to load
		],
		postSequenceFrames: 60,
	},

	"super mario bros": {
		description: "Start game, move Mario right to verify sprites render",
		sequence: [
			{ type: "wait", frames: sec(2) },      // Wait for title
			{ type: "press", button: "start" },    // Press Start (1 player game)
			{ type: "wait", frames: sec(3) },      // Wait for level to load
			{ type: "hold", button: "right", frames: 30 },  // Move right
			{ type: "wait", frames: 10 },
			{ type: "hold", button: "right", frames: 30 },  // Move right again
			{ type: "wait", frames: 10 },
			{ type: "hold", button: "right", frames: 30 },  // Move right again
		],
		postSequenceFrames: 60,
	},

	// Multi-cart version
	"super mario bros. + duck hunt + world class track meet (usa) (rev 1)": {
		description: "Select SMB from menu, start game, move Mario",
		sequence: [
			{ type: "wait", frames: sec(2) },      // Wait for menu
			{ type: "press", button: "start" },    // Select first game (SMB)
			{ type: "wait", frames: sec(2) },      // Wait for SMB title
			{ type: "press", button: "start" },    // Start game
			{ type: "wait", frames: sec(3) },      // Wait for level
			{ type: "hold", button: "right", frames: 30 },
			{ type: "wait", frames: 10 },
			{ type: "hold", button: "right", frames: 30 },
		],
		postSequenceFrames: 60,
	},

	"legend of zelda": {
		description: "Start game, select file, begin playing",
		sequence: [
			{ type: "wait", frames: sec(3) },      // Wait for title
			{ type: "press", button: "start" },    // Press Start
			{ type: "wait", frames: sec(1) },      // Wait for file select
			{ type: "press", button: "start" },    // Select first file
			{ type: "wait", frames: sec(2) },      // Wait for game
			{ type: "hold", button: "up", frames: 20 },     // Move up
			{ type: "wait", frames: 10 },
			{ type: "hold", button: "down", frames: 20 },   // Move down
		],
		postSequenceFrames: 60,
	},

	"metroid": {
		description: "Start game, move Samus",
		sequence: [
			{ type: "wait", frames: sec(3) },      // Wait for title
			{ type: "press", button: "start" },    // Press Start
			{ type: "wait", frames: sec(2) },      // Wait for game
			{ type: "hold", button: "right", frames: 30 },  // Move right
			{ type: "wait", frames: 10 },
			{ type: "hold", button: "left", frames: 30 },   // Move left
		],
		postSequenceFrames: 60,
	},
};

/**
 * Find a script for a ROM by filename
 */
export function findScript(romFilename: string): GameScript | null {
	const baseName = romFilename
		.replace(/\.nes$/i, "")
		.toLowerCase();
	
	// Exact match first
	if (GAME_SCRIPTS[baseName]) {
		return GAME_SCRIPTS[baseName];
	}

	// Partial match (for ROMs with extra suffixes)
	for (const [key, script] of Object.entries(GAME_SCRIPTS)) {
		if (baseName.includes(key) || key.includes(baseName)) {
			return script;
		}
	}

	return null;
}
