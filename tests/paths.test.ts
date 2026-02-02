import { test, describe } from "node:test";
import assert from "node:assert";
import os from "node:os";
import path from "node:path";
import { displayPath, expandHomePath, normalizePath, resolvePathInput } from "../extensions/nes/paths.js";

const HOME = os.homedir();

describe("paths", () => {
	describe("displayPath", () => {
		test("replaces home directory with ~", () => {
			assert.strictEqual(displayPath(`${HOME}/roms/nes`), "~/roms/nes");
		});

		test("leaves non-home paths unchanged", () => {
			assert.strictEqual(displayPath("/usr/local/bin"), "/usr/local/bin");
		});

		test("handles home directory exactly", () => {
			assert.strictEqual(displayPath(HOME), "~");
		});
	});

	describe("expandHomePath", () => {
		test("expands ~ to home directory", () => {
			assert.strictEqual(expandHomePath("~"), HOME);
		});

		test("expands ~/path to home + path", () => {
			assert.strictEqual(expandHomePath("~/roms/nes"), path.join(HOME, "roms/nes"));
		});

		test("leaves absolute paths unchanged", () => {
			assert.strictEqual(expandHomePath("/usr/local"), "/usr/local");
		});

		test("leaves relative paths unchanged", () => {
			assert.strictEqual(expandHomePath("roms/nes"), "roms/nes");
		});
	});

	describe("normalizePath", () => {
		test("returns fallback for empty string", () => {
			assert.strictEqual(normalizePath("", "/default"), "/default");
		});

		test("returns fallback for whitespace-only", () => {
			assert.strictEqual(normalizePath("   ", "/default"), "/default");
		});

		test("expands ~ and returns path", () => {
			assert.strictEqual(normalizePath("~/roms", "/default"), path.join(HOME, "roms"));
		});

		test("trims whitespace", () => {
			assert.strictEqual(normalizePath("  /roms  ", "/default"), "/roms");
		});
	});

	describe("resolvePathInput", () => {
		test("returns cwd for empty input", () => {
			assert.strictEqual(resolvePathInput("", "/home/user"), "/home/user");
		});

		test("expands ~ paths", () => {
			assert.strictEqual(resolvePathInput("~/roms", "/cwd"), path.join(HOME, "roms"));
		});

		test("resolves relative paths against cwd", () => {
			const result = resolvePathInput("roms/nes", "/home/user");
			assert.strictEqual(result, "/home/user/roms/nes");
		});

		test("keeps absolute paths as-is", () => {
			assert.strictEqual(resolvePathInput("/absolute/path", "/cwd"), "/absolute/path");
		});
	});
});
