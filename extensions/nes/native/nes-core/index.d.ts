export function nativeVersion(): string;

export class NativeNes {
  constructor();
  setRom(data: Uint8Array): void;
  bootup(): void;
  stepFrame(): void;
  refreshFramebuffer(): void;
  reset(): void;
  pressButton(button: number): void;
  releaseButton(button: number): void;
  hasBatteryBackedRam(): boolean;
  getSram(): Uint8Array;
  setSram(data: Uint8Array): void;
  isSramDirty(): boolean;
  markSramSaved(): void;
  getFramebuffer(): Uint8Array;
}

export const isAvailable: boolean;
export const loadError: unknown | null;
