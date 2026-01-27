import { promises as fs } from "node:fs";
import path from "node:path";

export interface RomEntry {
	path: string;
	name: string;
}

export function getRomDisplayName(romPath: string): string {
	return path.basename(romPath, path.extname(romPath));
}

export async function listRoms(romDir: string): Promise<RomEntry[]> {
	const entries = await fs.readdir(romDir, { withFileTypes: true });
	return entries
		.filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".nes"))
		.map((entry) => {
			const fullPath = path.join(romDir, entry.name);
			return {
				path: fullPath,
				name: getRomDisplayName(entry.name),
			};
		})
		.sort((a, b) => a.name.localeCompare(b.name));
}

export async function resolveRomPath(args: string | undefined, romDir: string): Promise<string | null> {
	const trimmed = args?.trim();
	if (trimmed && trimmed.length > 0) {
		return path.resolve(trimmed);
	}

	try {
		const roms = await listRoms(romDir);
		return roms.length > 0 ? roms[0]?.path ?? null : null;
	} catch {
		return null;
	}
}
