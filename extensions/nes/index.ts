import { promises as fs } from "node:fs";
import path from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { NesOverlayComponent } from "./nes-component.js";
import { createNesCore } from "./nes-core.js";
import { DEFAULT_CONFIG, formatConfig, getConfigPath, loadConfig, normalizeConfig, saveConfig } from "./config.js";
import { NesSession } from "./nes-session.js";
import { listRoms } from "./roms.js";
import { loadSram } from "./saves.js";

const IMAGE_RENDER_INTERVAL_MS = 1000 / 30;
const TEXT_RENDER_INTERVAL_MS = 1000 / 60;

let activeSession: NesSession | null = null;

async function selectRom(
	args: string | undefined,
	romDir: string,
	configPath: string,
	cwd: string,
	ctx: ExtensionCommandContext,
): Promise<string | null> {
	const trimmed = args?.trim();
	if (trimmed) {
		return path.isAbsolute(trimmed) ? trimmed : path.resolve(cwd, trimmed);
	}

	try {
		const roms = await listRoms(romDir);
		if (roms.length === 0) {
			ctx.ui.notify(`No ROMs found in ${romDir}. Update ${configPath} to set romDir.`, "warning");
			return null;
		}

		const selection = await ctx.ui.select(
			"Select a ROM",
			roms.map((rom) => rom.name),
		);
		if (!selection) {
			return null;
		}
		const match = roms.find((rom) => rom.name === selection);
		return match?.path ?? null;
	} catch {
		ctx.ui.notify(`Failed to read ROM directory: ${romDir}. Update ${configPath} to set romDir.`, "error");
		return null;
	}
}

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
): Promise<void> {
	const romDirInput = await ctx.ui.input("ROM directory", config.romDir);
	if (romDirInput === undefined) {
		return;
	}
	const saveDirInput = await ctx.ui.input("Save directory", config.saveDir);
	if (saveDirInput === undefined) {
		return;
	}
	const coreChoice = await ctx.ui.select("Core", ["native", "wasm", "jsnes"]);
	if (!coreChoice) {
		return;
	}
	const rendererChoice = await ctx.ui.select("Renderer", ["image", "text"]);
	if (!rendererChoice) {
		return;
	}
	const pixelScaleInput = await ctx.ui.input("Pixel scale (0.5 - 4)", config.pixelScale.toString());
	if (pixelScaleInput === undefined) {
		return;
	}
	const pixelScaleValue = pixelScaleInput.trim() === "" ? config.pixelScale : Number(pixelScaleInput);
	if (Number.isNaN(pixelScaleValue)) {
		ctx.ui.notify("Pixel scale must be a number.", "error");
		return;
	}
	const audioChoice = await ctx.ui.select("Audio", ["disabled (recommended)", "enabled (no output)"]);
	if (!audioChoice) {
		return;
	}
	const enableAudio = audioChoice.startsWith("enabled");

	const normalized = normalizeConfig({
		...config,
		romDir: romDirInput.trim() || config.romDir,
		saveDir: saveDirInput.trim() || config.saveDir,
		core: coreChoice,
		renderer: rendererChoice,
		pixelScale: pixelScaleValue,
		enableAudio,
	});
	await saveConfig(normalized);
	ctx.ui.notify(`Saved config to ${getConfigPath()}`, "info");
}

async function editConfig(ctx: ExtensionCommandContext): Promise<void> {
	if (!ctx.hasUI) {
		ctx.ui.notify("NES config requires interactive mode", "error");
		return;
	}
	const config = await loadConfig();
	const choice = await ctx.ui.select("NES configuration", [
		"Guided setup",
		"Edit JSON",
		"Reset to defaults",
	]);
	if (!choice) {
		return;
	}
	if (choice === "Guided setup") {
		await configureWithWizard(ctx, config);
		return;
	}
	if (choice === "Edit JSON") {
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

async function createSession(romPath: string, ctx: ExtensionCommandContext, config: Awaited<ReturnType<typeof loadConfig>>): Promise<NesSession | null> {
	let romData: Uint8Array;
	try {
		romData = new Uint8Array(await fs.readFile(romPath));
	} catch {
		ctx.ui.notify(`Failed to read ROM: ${romPath}`, "error");
		return null;
	}

	const core = createNesCore({ enableAudio: config.enableAudio, core: config.core });
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
	if (config.core === "wasm") {
		ctx.ui.notify("WASM core does not support battery saves yet; in-game saves won't persist.", "warning");
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
		const useOverlay = config.renderer !== "image";
		const overlayOptions = useOverlay
			? {
					overlay: true,
					overlayOptions: {
						width: "85%",
						maxHeight: "90%",
						anchor: "center",
						margin: { top: 1 },
					},
				}
			: undefined;

		const renderIntervalMs = config.renderer === "image" ? IMAGE_RENDER_INTERVAL_MS : TEXT_RENDER_INTERVAL_MS;
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
					debug,
					() => session.getStats(),
					config.core,
				);
			},
			overlayOptions,
		);
	} finally {
		session.setRenderHook(null);
	}
	return shouldStop;
}

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
