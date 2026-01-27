export interface SharedMemoryHandle {
  name: string;
  size: number;
  buffer: Uint8Array;
}

export function native_version(): string;
export function create_shared_memory(size: number): SharedMemoryHandle;
export function close_shared_memory(name: string): boolean;

export const isAvailable: boolean;
export const loadError: unknown | null;
