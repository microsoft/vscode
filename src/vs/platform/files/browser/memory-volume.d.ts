import type { VolumeSnapshot } from './engine-types.d.ts';
import type { MemoryHandler } from './memory-handler.d.ts';
export interface VolumeNode {
    kind: 'file' | 'directory' | 'symlink';
    content?: Uint8Array;
    children?: Map<string, VolumeNode>;
    target?: string;
    modified: number;
}
type FileChangeHandler = (filePath: string, content: string) => void;
type FileDeleteHandler = (filePath: string) => void;
export interface FileStat {
    isFile(): boolean;
    isDirectory(): boolean;
    isSymbolicLink(): boolean;
    isBlockDevice(): boolean;
    isCharacterDevice(): boolean;
    isFIFO(): boolean;
    isSocket(): boolean;
    size: number;
    mode: number;
    mtime: Date;
    atime: Date;
    ctime: Date;
    birthtime: Date;
    mtimeMs: number;
    atimeMs: number;
    ctimeMs: number;
    birthtimeMs: number;
    nlink: number;
    uid: number;
    gid: number;
    dev: number;
    ino: number;
    rdev: number;
    blksize: number;
    blocks: number;
    atimeNs: bigint;
    mtimeNs: bigint;
    ctimeNs: bigint;
    birthtimeNs: bigint;
}
export type WatchEventKind = 'change' | 'rename';
export type WatchCallback = (event: WatchEventKind, name: string | null) => void;
export interface FileWatchHandle {
    close(): void;
    ref(): this;
    unref(): this;
    on(event: string, listener: (...args: unknown[]) => void): this;
    once(event: string, listener: (...args: unknown[]) => void): this;
    removeListener(event: string, listener: (...args: unknown[]) => void): this;
    off(event: string, listener: (...args: unknown[]) => void): this;
    addListener(event: string, listener: (...args: unknown[]) => void): this;
    removeAllListeners(event?: string): this;
    emit(event: string, ...args: unknown[]): boolean;
}
export interface SystemError extends Error {
    code: string;
    errno: number;
    syscall: string;
    path?: string;
}
export declare function makeSystemError(code: 'ENOENT' | 'ENOTDIR' | 'EISDIR' | 'EEXIST' | 'ENOTEMPTY', syscall: string, targetPath: string, detail?: string): SystemError;
export declare class MemoryVolume {
    private tree;
    private textEncoder;
    private textDecoder;
    private activeWatchers;
    private subscribers;
    private _handler;
    constructor(handler?: MemoryHandler | null);
    on(event: 'change', handler: FileChangeHandler): this;
    on(event: 'delete', handler: FileDeleteHandler): this;
    off(event: 'change', handler: FileChangeHandler): this;
    off(event: 'delete', handler: FileDeleteHandler): this;
    private broadcast;
    getStats(): {
        fileCount: number;
        totalBytes: number;
        dirCount: number;
        watcherCount: number;
    };
    /** Clean up all watchers, subscribers, and global listeners. */
    dispose(): void;
    toSnapshot(excludePrefixes?: string[], excludeDirNames?: Set<string>): VolumeSnapshot;
    private collectEntries;
    static fromBinarySnapshot(snapshot: {
        manifest: Array<{
            path: string;
            offset: number;
            length: number;
            isDirectory: boolean;
        }>;
        data: ArrayBuffer;
    }): MemoryVolume;
    static fromSnapshot(snapshot: VolumeSnapshot): MemoryVolume;
    private normalize;
    private segments;
    private parentOf;
    private nameOf;
    private locateRaw;
    private locate;
    private ensureDir;
    private writeInternal;
    existsSync(p: string): boolean;
    statSync(p: string): FileStat;
    lstatSync(p: string): FileStat;
    readFileSync(p: string): Uint8Array;
    readFileSync(p: string, encoding: 'utf8' | 'utf-8'): string;
    writeFileSync(p: string, data: string | Uint8Array): void;
    mkdirSync(p: string, options?: {
        recursive?: boolean;
    }): void;
    readdirSync(p: string): string[];
    unlinkSync(p: string): void;
    rmdirSync(p: string): void;
    renameSync(from: string, to: string): void;
    accessSync(p: string, _mode?: number): void;
    copyFileSync(src: string, dest: string): void;
    realpathSync(p: string): string;
    symlinkSync(target: string, linkPath: string, _type?: string): void;
    readlinkSync(p: string): string;
    linkSync(existingPath: string, newPath: string): void;
    chmodSync(_p: string, _mode: number): void;
    chownSync(_p: string, _uid: number, _gid: number): void;
    appendFileSync(p: string, data: string | Uint8Array): void;
    truncateSync(p: string, len?: number): void;
    readFile(p: string, optionsOrCb?: {
        encoding?: string;
    } | ((err: Error | null, data?: Uint8Array | string) => void), cb?: (err: Error | null, data?: Uint8Array | string) => void): void;
    stat(p: string, cb?: (err: Error | null, stats?: FileStat) => void): void;
    lstat(p: string, cb?: (err: Error | null, stats?: FileStat) => void): void;
    readdir(p: string, optionsOrCb?: {
        withFileTypes?: boolean;
    } | ((err: Error | null, files?: string[]) => void), cb?: (err: Error | null, files?: string[]) => void): void;
    realpath(p: string, cb?: (err: Error | null, resolved?: string) => void): void;
    access(p: string, modeOrCb?: number | ((err: Error | null) => void), cb?: (err: Error | null) => void): void;
    watch(target: string, optionsOrCb?: {
        persistent?: boolean;
        recursive?: boolean;
        encoding?: string;
    } | WatchCallback, cb?: WatchCallback): FileWatchHandle;
    private triggerWatchers;
    private globalChangeListeners;
    onGlobalChange(cb: (path: string, event: string) => void): () => void;
    private notifyGlobalListeners;
    createReadStream(p: string): {
        on: (event: string, cb: (...args: unknown[]) => void) => void;
        pipe: (dest: unknown) => unknown;
    };
    createWriteStream(p: string): {
        write: (data: string | Uint8Array) => boolean;
        end: (data?: string | Uint8Array) => void;
        on: (event: string, cb: (...args: unknown[]) => void) => void;
    };
}
export { };
