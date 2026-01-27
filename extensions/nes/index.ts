import { promises as fs } from "node:fs";
import path from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { NesOverlayComponent } from "./nes-component.js";
import { createNesCore } from "./nes-core.js";
import { formatConfig, getConfigPath, loadConfig, normalizeConfig, saveConfig } from "./config.js";
import { listRoms } from "./roms.js";
import { loadSram, saveSram } from "./saves.js";

const SAVE_INTERVAL_MS = 5000;

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

export default function (pi: ExtensionAPI) {
	pi.registerCommand("nes", {
		description: "Play NES games in an overlay",
		handler: async (args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("NES requires interactive mode", "error");
				return;
			}

			const config = await loadConfig();
			const configPath = getConfigPath();
			const romPath = await selectRom(args, config.romDir, configPath, ctx.cwd, ctx);
			if (!romPath) {
				return;
			}

			let romData: Uint8Array;
			try {
				romData = new Uint8Array(await fs.readFile(romPath));
			} catch {
				ctx.ui.notify(`Failed to read ROM: ${romPath}`, "error");
				return;
			}

			const core = createNesCore({ enableAudio: config.enableAudio });
			try {
				core.loadRom(romData);
			} catch {
				core.dispose();
				ctx.ui.notify(`Failed to load ROM: ${romPath}`, "error");
				return;
			}

			const audioWarning = core.getAudioWarning();
			if (audioWarning) {
				ctx.ui.notify(audioWarning, "warning");
			}

			const savedSram = await loadSram(config.saveDir, romPath);
			if (savedSram) {
				core.setSram(savedSram);
			}

			let saveInFlight = false;
			const saveIfNeeded = async (force: boolean): Promise<void> => {
				if (saveInFlight) {
					return;
				}
				if (!force && !core.isSramDirty()) {
					return;
				}
				const sram = core.getSram();
				if (!sram) {
					return;
				}
				saveInFlight = true;
				try {
					await saveSram(config.saveDir, romPath, sram);
					core.markSramSaved();
				} finally {
					saveInFlight = false;
				}
			};

			const saveTimer = setInterval(() => {
				void saveIfNeeded(false);
			}, SAVE_INTERVAL_MS);

			let component: NesOverlayComponent | null = null;
			try {
				await ctx.ui.custom(
					(tui, _theme, _keybindings, done) => {
						component = new NesOverlayComponent(tui, core, () => done(undefined), config.keybindings);
						return component;
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
				component?.dispose();
				clearInterval(saveTimer);
				await saveIfNeeded(true);
				core.dispose();
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
