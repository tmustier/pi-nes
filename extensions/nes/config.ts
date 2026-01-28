import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DEFAULT_INPUT_MAPPING, type InputMapping } from "./input-map.js";

export type RendererMode = "image" | "text";
export type NesCoreType = "jsnes" | "wasm" | "native";

export interface NesConfig {
	romDir: string;
	saveDir: string;
	enableAudio: boolean;
	core: NesCoreType;
	renderer: RendererMode;
	pixelScale: number;
	keybindings: InputMapping;
}

export const DEFAULT_CONFIG: NesConfig = {
	romDir: path.join(path.sep, "roms", "nes"),
	saveDir: path.join(os.homedir(), ".pi", "nes", "saves"),
	enableAudio: false,
	core: "native",
	renderer: "image",
	pixelScale: 1.2,
	keybindings: cloneMapping(DEFAULT_INPUT_MAPPING),
};

interface RawConfig {
	romDir?: unknown;
	saveDir?: unknown;
	enableAudio?: unknown;
	core?: unknown;
	renderer?: unknown;
	pixelScale?: unknown;
	keybindings?: unknown;
}

export function getConfigPath(): string {
	return path.join(os.homedir(), ".pi", "nes", "config.json");
}

export function normalizeConfig(raw: unknown): NesConfig {
	const parsed = typeof raw === "object" && raw !== null ? (raw as RawConfig) : {};
	return {
		romDir: typeof parsed.romDir === "string" && parsed.romDir.length > 0 ? parsed.romDir : DEFAULT_CONFIG.romDir,
		saveDir:
			typeof parsed.saveDir === "string" && parsed.saveDir.length > 0 ? parsed.saveDir : DEFAULT_CONFIG.saveDir,
		enableAudio: typeof parsed.enableAudio === "boolean" ? parsed.enableAudio : DEFAULT_CONFIG.enableAudio,
		core:
			parsed.core === "native"
				? "native"
				: parsed.core === "wasm"
					? "wasm"
					: DEFAULT_CONFIG.core,
		renderer: parsed.renderer === "text" ? "text" : DEFAULT_CONFIG.renderer,
		pixelScale: normalizePixelScale(parsed.pixelScale),
		keybindings: normalizeKeybindings(parsed.keybindings),
	};
}

export function formatConfig(config: NesConfig): string {
	return JSON.stringify(config, null, 2);
}

export async function loadConfig(): Promise<NesConfig> {
	const configPath = getConfigPath();
	try {
		const raw = await fs.readFile(configPath, "utf8");
		return normalizeConfig(JSON.parse(raw));
	} catch {
		return DEFAULT_CONFIG;
	}
}

export async function configExists(): Promise<boolean> {
	try {
		await fs.access(getConfigPath());
		return true;
	} catch {
		return false;
	}
}

export async function saveConfig(config: NesConfig): Promise<void> {
	const configPath = getConfigPath();
	await fs.mkdir(path.dirname(configPath), { recursive: true });
	await fs.writeFile(configPath, formatConfig(config));
}

function normalizePixelScale(raw: unknown): number {
	if (typeof raw !== "number" || Number.isNaN(raw)) {
		return DEFAULT_CONFIG.pixelScale;
	}
	return Math.min(4, Math.max(0.5, raw));
}

function normalizeKeybindings(raw: unknown): InputMapping {
	const mapping = cloneMapping(DEFAULT_INPUT_MAPPING);
	if (!raw || typeof raw !== "object") {
		return mapping;
	}

	const entries = Object.entries(raw as Record<string, unknown>);
	for (const [key, value] of entries) {
		if (!(key in mapping)) {
			continue;
		}
		if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
			mapping[key as keyof InputMapping] = [...value];
		}
	}

	return mapping;
}

function cloneMapping(mapping: InputMapping): InputMapping {
	const result: Partial<InputMapping> = {};
	for (const [key, value] of Object.entries(mapping)) {
		result[key as keyof InputMapping] = [...value];
	}
	return result as InputMapping;
}
