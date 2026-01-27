export interface SharedMemoryHandle {
  name: string;
  size: number;
  buffer: Uint8Array;
}

export function nativeVersion(): string;
export function createSharedMemory(size: number): SharedMemoryHandle;
export function closeSharedMemory(name: string): boolean;

export const isAvailable: boolean;
export const loadError: unknown | null;
