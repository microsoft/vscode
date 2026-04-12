import type { VFSBinarySnapshot } from "./worker-protocol.d.ts";
export declare class WorkerVFS {
    private _files;
    private _dirs;
    private _onWrite;
    private _onDelete;
    private _decoder;
    private _encoder;
    constructor();
    initFromSnapshot(snapshot: VFSBinarySnapshot): void;
    setWriteCallback(cb: (path: string, content: Uint8Array, isDir: boolean) => void): void;
    setDeleteCallback(cb: (path: string) => void): void;
    readFileSync(path: string, encoding?: string): string | Uint8Array;
    existsSync(path: string): boolean;
    statSync(path: string): {
        isFile: () => boolean;
        isDirectory: () => boolean;
        size: number;
    };
    readdirSync(path: string): string[];
    writeFileSync(path: string, content: string | Uint8Array): void;
    mkdirSync(path: string, opts?: {
        recursive?: boolean;
    }): void;
    unlinkSync(path: string): void;
    rmdirSync(path: string): void;
    renameSync(src: string, dest: string): void;
    appendFileSync(path: string, content: string | Uint8Array): void;
    copyFileSync(src: string, dest: string): void;
    applySync(path: string, content: ArrayBuffer | null, isDirectory: boolean): void;
    private _ensureParentDirs;
    get fileCount(): number;
    get dirCount(): number;
}
