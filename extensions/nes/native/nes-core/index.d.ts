export interface CpuDebugState {
  pc: number;
  a: number;
  x: number;
  y: number;
  sp: number;
  p: number;
  lastPc: number;
  lastOpcode: number;
}

export interface MapperDebugState {
  mapperNum: number;
  control: number;
  prg: number;
  chr0: number;
  chr1: number;
  prgMode: number;
  chrMode: number;
  outerPrg: number;
}

export interface NesDebugState {
  cpu: CpuDebugState;
  mapper: MapperDebugState;
}

export class NativeNes {
  constructor();
  setRom(data: Uint8Array): void;
  bootup(): void;
  stepFrame(): void;
  refreshFramebuffer(): void;
  setVideoFilter(mode: number): void;
  pressButton(button: number): void;
  releaseButton(button: number): void;
  hasBatteryBackedRam(): boolean;
  getSram(): Uint8Array;
  setSram(data: Uint8Array): void;
  isSramDirty(): boolean;
  markSramSaved(): void;
  getDebugState(): NesDebugState;
  getFramebuffer(): Uint8Array;
}

export const isAvailable: boolean;
export const loadError: unknown | null;
