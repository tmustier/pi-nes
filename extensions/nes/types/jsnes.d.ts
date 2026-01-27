declare module "jsnes" {
	export interface NesOptions {
		onFrame?: (framebuffer24: number[]) => void;
		onAudioSample?: ((left: number, right: number) => void) | null;
		onStatusUpdate?: (status: string) => void;
		onBatteryRamWrite?: (address: number, value: number) => void;
		preferredFrameRate?: number;
		emulateSound?: boolean;
		sampleRate?: number;
	}

	export interface NesRom {
		batteryRam: boolean | Uint8Array | number[] | null;
	}

	export interface NesMapper {
		loadBatteryRam?: () => void;
	}

	export class NES {
		constructor(options?: NesOptions);
		frame(): void;
		reset(): void;
		loadROM(data: string): void;
		buttonDown(controller: number, button: number): void;
		buttonUp(controller: number, button: number): void;
		setFramerate(rate: number): void;
		getFPS(): number | null;
		rom: NesRom;
		mmap: NesMapper | null;
	}

	export class Controller {
		static BUTTON_A: number;
		static BUTTON_B: number;
		static BUTTON_SELECT: number;
		static BUTTON_START: number;
		static BUTTON_UP: number;
		static BUTTON_DOWN: number;
		static BUTTON_LEFT: number;
		static BUTTON_RIGHT: number;
	}

	const jsnes: {
		NES: typeof NES;
		Controller: typeof Controller;
	};

	export default jsnes;
}
