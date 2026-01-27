export function nativeVersion(): string;

export class NativeNes {
  constructor();
  setRom(data: Uint8Array): void;
  bootup(): void;
  stepFrame(): void;
  reset(): void;
  pressButton(button: number): void;
  releaseButton(button: number): void;
  getFramebuffer(): Uint8Array;
}

export const isAvailable: boolean;
export const loadError: unknown | null;
