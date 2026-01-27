import { promises as fs } from "node:fs";
import path from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { NesOverlayComponent } from "./nes-component.js";
import { createNesCore } from "./nes-core.js";
import { formatConfig, getConfigPath, loadConfig, normalizeConfig, saveConfig } from "./config.js";
import { NesSession } from "./nes-session.js";
import { listRoms } from "./roms.js";
import { loadSram } from "./saves.js";

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

async function createSession(romPath: string, ctx: ExtensionCommandContext, config: Awaited<ReturnType<typeof loadConfig>>): Promise<NesSession | null> {
	let romData: Uint8Array;
	try {
		romData = new Uint8Array(await fs.readFile(romPath));
	} catch {
		ctx.ui.notify(`Failed to read ROM: ${romPath}`, "error");
		return null;
	}

	const core = createNesCore({ enableAudio: config.enableAudio });
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
): Promise<boolean> {
	let shouldStop = false;
	try {
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
				);
			},
			{
				overlay: true,
				overlayOptions: {
					width: "85%",
					maxHeight: "90%",
					anchor: "center",
					margin: { top: 1 },
				},
			},
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

			const config = await loadConfig();
			const configPath = getConfigPath();

			if (!args?.trim() && activeSession) {
				const shouldStop = await attachSession(activeSession, ctx, config);
				if (shouldStop) {
					await activeSession.stop();
					activeSession = null;
				}
				return;
			}

			const romPath = await selectRom(args, config.romDir, configPath, ctx.cwd, ctx);
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

			const shouldStop = await attachSession(activeSession, ctx, config);
			if (shouldStop) {
				await activeSession.stop();
				activeSession = null;
			}
		},
	});

	pi.registerCommand("nes-config", {
		description: "Edit NES configuration",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("NES config requires interactive mode", "error");
				return;
			}
			const config = await loadConfig();
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
		},
	});
}
