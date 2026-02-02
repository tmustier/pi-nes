import { test, describe } from "node:test";
import assert from "node:assert";
import { normalizeConfig, DEFAULT_CONFIG, formatConfig } from "../extensions/nes/config.js";

describe("config", () => {
	describe("normalizeConfig", () => {
		test("returns defaults for empty object", () => {
			const config = normalizeConfig({});
			assert.strictEqual(config.enableAudio, DEFAULT_CONFIG.enableAudio);
			assert.strictEqual(config.renderer, DEFAULT_CONFIG.renderer);
			assert.strictEqual(config.imageQuality, DEFAULT_CONFIG.imageQuality);
			assert.strictEqual(config.videoFilter, DEFAULT_CONFIG.videoFilter);
			assert.strictEqual(config.pixelScale, DEFAULT_CONFIG.pixelScale);
		});

		test("returns defaults for null", () => {
			const config = normalizeConfig(null);
			assert.strictEqual(config.renderer, "image");
		});

		test("returns defaults for non-object", () => {
			const config = normalizeConfig("invalid");
			assert.strictEqual(config.renderer, "image");
		});

		test("accepts valid renderer value", () => {
			const config = normalizeConfig({ renderer: "text" });
			assert.strictEqual(config.renderer, "text");
		});

		test("defaults invalid renderer to image", () => {
			const config = normalizeConfig({ renderer: "invalid" });
			assert.strictEqual(config.renderer, "image");
		});

		test("accepts valid imageQuality", () => {
			const config = normalizeConfig({ imageQuality: "high" });
			assert.strictEqual(config.imageQuality, "high");
		});

		test("defaults invalid imageQuality to balanced", () => {
			const config = normalizeConfig({ imageQuality: "ultra" });
			assert.strictEqual(config.imageQuality, "balanced");
		});

		test("accepts valid videoFilter", () => {
			const config = normalizeConfig({ videoFilter: "ntsc-composite" });
			assert.strictEqual(config.videoFilter, "ntsc-composite");
		});

		test("defaults invalid videoFilter to off", () => {
			const config = normalizeConfig({ videoFilter: "crt" });
			assert.strictEqual(config.videoFilter, "off");
		});

		test("clamps pixelScale to valid range", () => {
			assert.strictEqual(normalizeConfig({ pixelScale: 0.1 }).pixelScale, 0.5);
			assert.strictEqual(normalizeConfig({ pixelScale: 10 }).pixelScale, 4);
			assert.strictEqual(normalizeConfig({ pixelScale: 2 }).pixelScale, 2);
		});

		test("handles NaN pixelScale", () => {
			const config = normalizeConfig({ pixelScale: NaN });
			assert.strictEqual(config.pixelScale, DEFAULT_CONFIG.pixelScale);
		});

		test("preserves valid keybindings", () => {
			const config = normalizeConfig({
				keybindings: { a: ["k", "l"] }
			});
			assert.deepStrictEqual(config.keybindings.a, ["k", "l"]);
			// Other keys should have defaults
			assert.ok(config.keybindings.up.length > 0);
		});

		test("ignores invalid keybinding values", () => {
			const config = normalizeConfig({
				keybindings: { a: "not-an-array" }
			});
			// Should fall back to default
			assert.deepStrictEqual(config.keybindings.a, DEFAULT_CONFIG.keybindings.a);
		});

		test("accepts boolean enableAudio", () => {
			assert.strictEqual(normalizeConfig({ enableAudio: true }).enableAudio, true);
			assert.strictEqual(normalizeConfig({ enableAudio: false }).enableAudio, false);
		});

		test("defaults non-boolean enableAudio", () => {
			const config = normalizeConfig({ enableAudio: "yes" });
			assert.strictEqual(config.enableAudio, DEFAULT_CONFIG.enableAudio);
		});
	});

	describe("formatConfig", () => {
		test("produces valid JSON", () => {
			const json = formatConfig(DEFAULT_CONFIG);
			const parsed = JSON.parse(json);
			assert.strictEqual(parsed.renderer, DEFAULT_CONFIG.renderer);
		});

		test("is pretty-printed", () => {
			const json = formatConfig(DEFAULT_CONFIG);
			assert.ok(json.includes("\n"), "Should be multi-line");
		});
	});
});
