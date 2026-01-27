declare module "speaker" {
	import type { Writable } from "node:stream";

	export interface SpeakerOptions {
		channels?: number;
		bitDepth?: number;
		sampleRate?: number;
		signed?: boolean;
		float?: boolean;
		endian?: "little" | "big";
	}

	export default class Speaker extends Writable {
		constructor(options?: SpeakerOptions);
	}
}
