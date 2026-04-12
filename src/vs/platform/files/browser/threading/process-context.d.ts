import type { MemoryVolume } from "../memory-volume.d.ts";
export interface ProcessWriter {
    write(data: string): void;
}
export interface ProcessReader {
    on(event: string, cb: (...args: unknown[]) => void): void;
    emit(event: string, ...args: unknown[]): void;
}
export interface ProcessContext {
    pid: number;
    cwd: string;
    env: Record<string, string>;
    stdoutSink: ((text: string) => void) | null;
    stderrSink: ((text: string) => void) | null;
    liveStdin: {
        emit: (e: string, ...a: unknown[]) => void;
    } | null;
    abortController: AbortController;
    volume: MemoryVolume;
    refCount: number;
    drainListeners: Set<() => void>;
    termCols: (() => number) | null;
    termRows: (() => number) | null;
    fdCounter: number;
    openFiles: Map<number, OpenFileEntry>;
}
export interface OpenFileEntry {
    filePath: string;
    cursor: number;
    mode: string;
    data: Uint8Array;
}
export declare function createProcessContext(opts: {
    volume: MemoryVolume;
    cwd?: string;
    env?: Record<string, string>;
    pid?: number;
}): ProcessContext;
export declare function getActiveContext(): ProcessContext | null;
export declare function setActiveContext(ctx: ProcessContext | null): void;
