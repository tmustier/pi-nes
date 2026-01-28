import os from "node:os";
import path from "node:path";

export function displayPath(value: string): string {
	const home = os.homedir();
	if (value.startsWith(home)) {
		return `~${value.slice(home.length)}`;
	}
	return value;
}

export function expandHomePath(value: string): string {
	if (value === "~") {
		return os.homedir();
	}
	if (value.startsWith("~/") || value.startsWith("~\\")) {
		return path.join(os.homedir(), value.slice(2));
	}
	return value;
}

export function normalizePath(value: string, fallback: string): string {
	const trimmed = value.trim();
	if (!trimmed) {
		return fallback;
	}
	return expandHomePath(trimmed);
}

export function resolvePathInput(input: string, cwd: string): string {
	const trimmed = input.trim();
	if (!trimmed) {
		return cwd;
	}
	const expanded = expandHomePath(trimmed);
	if (path.isAbsolute(expanded)) {
		return expanded;
	}
	return path.resolve(cwd, expanded);
}
