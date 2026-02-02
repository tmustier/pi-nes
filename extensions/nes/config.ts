import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DEFAULT_INPUT_MAPPING, type InputMapping } from "./input-map.js";
import { normalizePath } from "./paths.js";

export type RendererMode = "image" | "text";
export type ImageQuality = "balanced" | "high";
export type VideoFilter = "off" | "ntsc-composite" | "ntsc-svideo" | "ntsc-rgb";

export interface NesConfig {
	romDir: string;
	saveDir: string;
	enableAudio: boolean;
	renderer: RendererMode;
	imageQuality: ImageQuality;
	videoFilter: VideoFilter;
	pixelScale: number;
	keybindings: InputMapping;
}

const DEFAULT_ROM_DIR = path.join(path.sep, "roms", "nes");

export function getDefaultSaveDir(romDir: string): string {
	return path.join(romDir, "saves");
}

export const DEFAULT_CONFIG: NesConfig = {
	romDir: DEFAULT_ROM_DIR,
	saveDir: getDefaultSaveDir(DEFAULT_ROM_DIR),
	enableAudio: false,
	renderer: "image",
	imageQuality: "balanced",
	videoFilter: "off",
	pixelScale: 1.0,
	keybindings: cloneMapping(DEFAULT_INPUT_MAPPING),
};

interface RawConfig {
	romDir?: unknown;
	saveDir?: unknown;
	enableAudio?: unknown;
	renderer?: unknown;
	imageQuality?: unknown;
	videoFilter?: unknown;
	pixelScale?: unknown;
	keybindings?: unknown;
}

export function getConfigPath(): string {
	return path.join(os.homedir(), ".pi", "nes", "config.json");
}

function resolveConfigPath(value: string): string {
	if (path.isAbsolute(value)) {
		return value;
	}
	return path.resolve(path.dirname(getConfigPath()), value);
}

export function normalizeConfig(raw: unknown): NesConfig {
	const parsed = typeof raw === "object" && raw !== null ? (raw as RawConfig) : {};
	const romDirInput =
		typeof parsed.romDir === "string" && parsed.romDir.length > 0
			? parsed.romDir
			: DEFAULT_CONFIG.romDir;
	const romDir = resolveConfigPath(normalizePath(romDirInput, DEFAULT_CONFIG.romDir));
	const saveDirFallback = getDefaultSaveDir(romDir);
	const saveDirInput =
		typeof parsed.saveDir === "string" && parsed.saveDir.length > 0
			? parsed.saveDir
			: saveDirFallback;
	const saveDir = resolveConfigPath(normalizePath(saveDirInput, saveDirFallback));
	const imageQuality = normalizeImageQuality(parsed.imageQuality);
	const videoFilter = normalizeVideoFilter(parsed.videoFilter);
	const pixelScale = normalizePixelScale(parsed.pixelScale);
	return {
		romDir,
		saveDir,
		enableAudio: typeof parsed.enableAudio === "boolean" ? parsed.enableAudio : DEFAULT_CONFIG.enableAudio,
		renderer: parsed.renderer === "text" ? "text" : DEFAULT_CONFIG.renderer,
		imageQuality,
		videoFilter,
		pixelScale,
		keybindings: normalizeKeybindings(parsed.keybindings),
	};
}

export function formatConfig(config: NesConfig): string {
	return JSON.stringify(config, null, 2);
}

export async function loadConfig(): Promise<NesConfig> {
	const configPath = getConfigPath();
	let config: NesConfig;
	try {
		const raw = await fs.readFile(configPath, "utf8");
		const parsed = JSON.parse(raw);
		const normalized = normalizeConfig(parsed);
		if (raw.trim() !== formatConfig(normalized)) {
			await saveConfig(normalized);
		}
		config = normalized;
	} catch {
		config = DEFAULT_CONFIG;
	}
	await ensureDirectory(config.saveDir);
	return config;
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

async function ensureDirectory(dirPath: string): Promise<void> {
	try {
		await fs.mkdir(dirPath, { recursive: true });
	} catch {
		// ignore
	}
}

function normalizePixelScale(raw: unknown): number {
	if (typeof raw !== "number" || Number.isNaN(raw)) {
		return DEFAULT_CONFIG.pixelScale;
	}
	return Math.min(4, Math.max(0.5, raw));
}

function normalizeImageQuality(raw: unknown): ImageQuality {
	return raw === "high" ? "high" : "balanced";
}

function normalizeVideoFilter(raw: unknown): VideoFilter {
	switch (raw) {
		case "ntsc-composite":
		case "ntsc-svideo":
		case "ntsc-rgb":
			return raw;
		default:
			return "off";
	}
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
