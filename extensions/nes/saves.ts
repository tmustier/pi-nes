import { promises as fs } from "node:fs";
import path from "node:path";
import { getRomDisplayName } from "./roms.js";

export function getSavePath(saveDir: string, romPath: string): string {
	const romName = getRomDisplayName(romPath);
	return path.join(saveDir, `${romName}.sav`);
}

export async function loadSram(saveDir: string, romPath: string): Promise<Uint8Array | null> {
	const savePath = getSavePath(saveDir, romPath);
	try {
		const data = await fs.readFile(savePath);
		return new Uint8Array(data);
	} catch {
		return null;
	}
}

export async function saveSram(saveDir: string, romPath: string, data: Uint8Array): Promise<void> {
	await fs.mkdir(saveDir, { recursive: true });
	const savePath = getSavePath(saveDir, romPath);
	await fs.writeFile(savePath, data);
}
