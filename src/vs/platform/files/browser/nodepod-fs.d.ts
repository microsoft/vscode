import type { MemoryVolume } from "./memory-volume.d.ts";
import type { StatResult } from "./types.d.ts";
export declare class NodepodFS {
    private _vol;
    constructor(_vol: MemoryVolume);
    writeFile(path: string, data: string | Uint8Array): Promise<void>;
    readFile(path: string, encoding?: "utf-8" | "utf8"): Promise<string>;
    readFile(path: string): Promise<Uint8Array>;
    mkdir(path: string, opts?: {
        recursive?: boolean;
    }): Promise<void>;
    readdir(path: string): Promise<string[]>;
    exists(path: string): Promise<boolean>;
    stat(path: string): Promise<StatResult>;
    unlink(path: string): Promise<void>;
    rmdir(path: string, opts?: {
        recursive?: boolean;
    }): Promise<void>;
    rename(from: string, to: string): Promise<void>;
    watch(path: string, optionsOrCb?: {
        recursive?: boolean;
    } | ((event: string, filename: string | null) => void), cb?: (event: string, filename: string | null) => void): {
        close(): void;
    };
    get volume(): MemoryVolume;
    private _removeRecursive;
}
