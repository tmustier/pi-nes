import { promises as fs } from "node:fs";
import path from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { NesOverlayComponent } from "./nes-component.js";
import { createNesCore } from "./nes-core.js";
import {
	DEFAULT_CONFIG,
	configExists,
	formatConfig,
	getConfigPath,
	getDefaultSaveDir,
	loadConfig,
	normalizeConfig,
	saveConfig,
	type VideoFilter,
} from "./config.js";
import { displayPath, resolvePathInput } from "./paths.js";
import { NesSession } from "./nes-session.js";
import { listRoms } from "./roms.js";
import { selectRomWithFilter } from "./rom-selector.js";
import { loadSram } from "./saves.js";

const IMAGE_RENDER_INTERVAL_BALANCED_MS = 1000 / 30;
const IMAGE_RENDER_INTERVAL_HIGH_MS = 1000 / 60;
const TEXT_RENDER_INTERVAL_MS = 1000 / 60;

let activeSession: NesSession | null = null;

// ROM selection helpers.
async function selectRom(
	args: string | undefined,
	romDir: string,
	configPath: string,
	cwd: string,
	ctx: ExtensionCommandContext,
): Promise<string | null> {
	const trimmed = args?.trim();
	if (trimmed) {
		return resolvePathInput(trimmed, cwd);
	}

	try {
		const roms = await listRoms(romDir);
		if (roms.length === 0) {
			ctx.ui.notify(`No ROMs found in ${romDir}. Update ${configPath} to set romDir.`, "warning");
			return null;
		}

		const selection = await selectRomWithFilter(ctx, roms);
		return selection;
	} catch {
		ctx.ui.notify(`Failed to read ROM directory: ${romDir}. Update ${configPath} to set romDir.`, "error");
		return null;
	}
}

// Command argument parsing.
function parseArgs(args?: string): { debug: boolean; romArg?: string } {
	if (!args) {
		return { debug: false, romArg: undefined };
	}
	const trimmed = args.trim();
	if (!trimmed) {
		return { debug: false, romArg: undefined };
	}
	const lower = trimmed.toLowerCase();
	if (lower === "debug") {
		return { debug: true, romArg: undefined };
	}
	if (lower.startsWith("debug ")) {
		return { debug: true, romArg: trimmed.slice(5).trim() || undefined };
	}
	if (lower.startsWith("--debug")) {
		return { debug: true, romArg: trimmed.slice(7).trim() || undefined };
	}
	return { debug: false, romArg: trimmed };
}

// ROM directory validation/creation.
async function ensureRomDir(pathValue: string, ctx: ExtensionCommandContext): Promise<boolean> {
	try {
		const stat = await fs.stat(pathValue);
		if (!stat.isDirectory()) {
			ctx.ui.notify(`ROM directory is not a folder: ${pathValue}`, "error");
			return false;
		}
		return true;
	} catch {
		try {
			await fs.mkdir(pathValue, { recursive: true });
			return true;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			ctx.ui.notify(`Failed to create ROM directory ${pathValue}: ${message}`, "error");
			return false;
		}
	}
}

// Config UI.
async function editConfigJson(
	ctx: ExtensionCommandContext,
	config: Awaited<ReturnType<typeof loadConfig>>,
): Promise<void> {
	const initial = formatConfig(config);
	const edited = await ctx.ui.editor("NES config", initial);
	if (edited === undefined) {
		return;
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(edited);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		ctx.ui.notify(`Invalid JSON: ${message}`, "error");
		return;
	}

	const normalized = normalizeConfig(parsed);
	await saveConfig(normalized);
	ctx.ui.notify(`Saved config to ${getConfigPath()}`, "info");
}

async function configureWithWizard(
	ctx: ExtensionCommandContext,
	config: Awaited<ReturnType<typeof loadConfig>>,
): Promise<boolean> {
	const romDirDisplay = displayPath(config.romDir);
	const romDirDefaultLabel = config.romDir === DEFAULT_CONFIG.romDir ? "Use default" : "Use current";
	const romDirOptions = [
		`${romDirDefaultLabel} (${romDirDisplay}) — creates if missing`,
		"Enter a custom path (creates if missing)",
	];
	const romDirChoice = await ctx.ui.select("ROM directory", romDirOptions);
	if (!romDirChoice) {
		return false;
	}

	let romDir = config.romDir;
	if (romDirChoice === romDirOptions[1]) {
		const romDirInput = await ctx.ui.input("ROM directory (must exist)", romDirDisplay);
		if (romDirInput === undefined) {
			return false;
		}
		const trimmedRomDir = romDirInput.trim();
		if (!trimmedRomDir) {
			ctx.ui.notify("ROM directory cannot be empty.", "error");
			return false;
		}
		romDir = resolvePathInput(trimmedRomDir, ctx.cwd);
		const ensured = await ensureRomDir(romDir, ctx);
		if (!ensured) {
			return false;
		}
	} else {
		const ensured = await ensureRomDir(romDir, ctx);
		if (!ensured) {
			return false;
		}
	}

	const qualityChoice = await ctx.ui.select("Quality", [
		"Balanced (recommended) — 30 fps",
		"High — 60 fps",
	]);
	if (!qualityChoice) {
		return false;
	}

	const isHighQuality = qualityChoice.startsWith("High");
	const imageQuality = isHighQuality ? "high" : "balanced";

	const filterOptions: Array<{ label: string; value: VideoFilter }> = [
		{ label: "CRT Classic (default) — authentic scanlines + color bleed", value: "ntsc-composite" },
		{ label: "CRT Soft — subtle retro look", value: "ntsc-rgb" },
		{ label: "Sharp — pixel-perfect, no filtering", value: "off" },
	];
	const filterChoice = await ctx.ui.select(
		"Display style",
		filterOptions.map((option) => option.label),
	);
	if (!filterChoice) {
		return false;
	}
	const videoFilter =
		filterOptions.find((option) => option.label === filterChoice)?.value ?? DEFAULT_CONFIG.videoFilter;
	const pixelScale = config.pixelScale;

	const defaultSaveDir = getDefaultSaveDir(config.romDir);
	const shouldSyncSaveDir = config.saveDir === defaultSaveDir;
	const saveDir = shouldSyncSaveDir ? getDefaultSaveDir(romDir) : config.saveDir;
	const normalized = normalizeConfig({
		...config,
		romDir,
		saveDir,
		imageQuality,
		videoFilter,
		pixelScale,
	});
	await saveConfig(normalized);
	ctx.ui.notify(`Saved config to ${getConfigPath()}`, "info");
	return true;
}

async function editConfig(ctx: ExtensionCommandContext): Promise<void> {
	if (!ctx.hasUI) {
		ctx.ui.notify("NES config requires interactive mode", "error");
		return;
	}
	const config = await loadConfig();
	const choice = await ctx.ui.select("NES configuration", [
		"Quick setup",
		"Advanced (edit config JSON)",
		"Reset to defaults",
	]);
	if (!choice) {
		return;
	}
	if (choice === "Quick setup") {
		await configureWithWizard(ctx, config);
		return;
	}
	if (choice === "Advanced (edit config JSON)") {
		await editConfigJson(ctx, config);
		return;
	}

	const confirm = await ctx.ui.confirm("Reset NES config", "Restore defaults?");
	if (!confirm) {
		return;
	}
	await saveConfig(DEFAULT_CONFIG);
	ctx.ui.notify(`Saved config to ${getConfigPath()}`, "info");
}

// Session lifecycle.
async function createSession(romPath: string, ctx: ExtensionCommandContext, config: Awaited<ReturnType<typeof loadConfig>>): Promise<NesSession | null> {
	let romData: Uint8Array;
	try {
		romData = new Uint8Array(await fs.readFile(romPath));
	} catch {
		ctx.ui.notify(`Failed to read ROM: ${romPath}`, "error");
		return null;
	}

	let core;
	try {
		core = createNesCore({ enableAudio: config.enableAudio, videoFilter: config.videoFilter });
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		ctx.ui.notify(`Failed to initialize NES core: ${message}`, "error");
		ctx.ui.notify(
			"Build native core: cd extensions/nes/native/nes-core && npm install && npm run build",
			"warning",
		);
		return null;
	}
	try {
		core.loadRom(romData);
	} catch {
		core.dispose();
		ctx.ui.notify(`Failed to load ROM: ${romPath}`, "error");
		return null;
	}

	const audioWarning = core.getAudioWarning();
	if (audioWarning) {
		ctx.ui.notify(audioWarning, "warning");
	}

	const savedSram = await loadSram(config.saveDir, romPath);
	if (savedSram) {
		core.setSram(savedSram);
	}

	const session = new NesSession({
		core,
		romPath,
		saveDir: config.saveDir,
	});
	session.start();
	return session;
}

async function attachSession(
	session: NesSession,
	ctx: ExtensionCommandContext,
	config: Awaited<ReturnType<typeof loadConfig>>,
	debug = false,
): Promise<boolean> {
	let shouldStop = false;
	try {
		const isImageRenderer = config.renderer === "image";
		const overlayOptions = {
			overlay: true,
			overlayOptions: {
				width: isImageRenderer ? "90%" : "85%",
				maxHeight: "90%",
				anchor: "center",
				margin: { top: 1 },
			},
		};

		const renderIntervalMs = config.renderer === "image"
			? config.imageQuality === "high"
				? IMAGE_RENDER_INTERVAL_HIGH_MS
				: IMAGE_RENDER_INTERVAL_BALANCED_MS
			: TEXT_RENDER_INTERVAL_MS;
		session.setRenderIntervalMs(renderIntervalMs);

		await ctx.ui.custom(
			(tui, _theme, _keybindings, done) => {
				session.setRenderHook(() => tui.requestRender());
				return new NesOverlayComponent(
					tui,
					session.core,
					() => done(undefined),
					() => {
						shouldStop = true;
						done(undefined);
					},
					config.keybindings,
					config.renderer,
					config.pixelScale,
					isImageRenderer,
					debug,
					() => session.getStats(),
					"native",
				);
			},
			overlayOptions,
		);
	} finally {
		session.setRenderHook(null);
	}
	return shouldStop;
}

// Command registration.
export default function (pi: ExtensionAPI) {
	pi.on("session_shutdown", async () => {
		if (activeSession) {
			await activeSession.stop();
			activeSession = null;
		}
	});

	pi.registerCommand("nes", {
		description: "Play NES games in an overlay (Ctrl+Q to detach)",
		handler: async (args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("NES requires interactive mode", "error");
				return;
			}

			const trimmedArgs = args?.trim();
			if (trimmedArgs) {
				const lower = trimmedArgs.toLowerCase();
				if (lower === "config" || lower.startsWith("config ")) {
					await editConfig(ctx);
					return;
				}
			}

			const hasConfig = await configExists();
			if (!hasConfig) {
				const configured = await configureWithWizard(ctx, DEFAULT_CONFIG);
				if (!configured) {
					return;
				}
			}

			const config = await loadConfig();
			const configPath = getConfigPath();
			const { debug, romArg } = parseArgs(args);

			if (!romArg && activeSession) {
				const shouldStop = await attachSession(activeSession, ctx, config, debug);
				if (shouldStop) {
					await activeSession.stop();
					activeSession = null;
				}
				return;
			}

			const romPath = await selectRom(romArg, config.romDir, configPath, ctx.cwd, ctx);
			if (!romPath) {
				return;
			}
			const resolvedRomPath = path.resolve(romPath);

			if (activeSession && activeSession.romPath !== resolvedRomPath) {
				await activeSession.stop();
				activeSession = null;
			}

			if (!activeSession) {
				const session = await createSession(resolvedRomPath, ctx, config);
				if (!session) {
					return;
				}
				activeSession = session;
			}

			const shouldStop = await attachSession(activeSession, ctx, config, debug);
			if (shouldStop) {
				await activeSession.stop();
				activeSession = null;
			}
		},
	});

	pi.registerCommand("nes-config", {
		description: "Edit NES configuration",
		handler: async (_args, ctx) => {
			await editConfig(ctx);
		},
	});
}
