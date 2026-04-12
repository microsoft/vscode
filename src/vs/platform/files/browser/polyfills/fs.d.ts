import type { MemoryVolume, FileStat, FileWatchHandle, WatchCallback, WatchEventKind } from "../memory-volume.d.ts";
export type { FileStat, FileWatchHandle, WatchCallback, WatchEventKind };
export type PathArg = string | URL;
export interface Dirent {
    name: string;
    parentPath: string;
    path: string;
    _dir: boolean;
    _file: boolean;
    isDirectory(): boolean;
    isFile(): boolean;
    isBlockDevice(): boolean;
    isCharacterDevice(): boolean;
    isFIFO(): boolean;
    isSocket(): boolean;
    isSymbolicLink(): boolean;
}
interface DirentConstructor {
    new(entryName: string, isDir: boolean, isFile: boolean, parentPath?: string): Dirent;
    (this: any, entryName: string, isDir: boolean, isFile: boolean, parentPath?: string): void;
    prototype: any;
}
export declare const Dirent: DirentConstructor;
export interface Dir {
    readonly path: string;
    _entries: Dirent[];
    _pos: number;
    _closed: boolean;
    readSync(): Dirent | null;
    read(): Promise<Dirent | null>;
    read(cb: (err: Error | null, dirent: Dirent | null) => void): void;
    closeSync(): void;
    close(): Promise<void>;
    close(cb: (err: Error | null) => void): void;
    [Symbol.asyncIterator](): AsyncIterableIterator<Dirent>;
}
interface DirConstructor {
    new(dirPath: string, entries: Dirent[]): Dir;
    (this: any, dirPath: string, entries: Dirent[]): void;
    prototype: any;
}
export declare const Dir: DirConstructor;
export declare class StatFs {
    type: number;
    bsize: number;
    blocks: number;
    bfree: number;
    bavail: number;
    files: number;
    ffree: number;
    constructor();
}
export declare class StatWatcher {
    private _listeners;
    private _interval;
    start(_filename: string, _persistent?: boolean, _interval?: number): void;
    stop(): void;
    ref(): this;
    unref(): this;
    on(event: string, listener: (...args: unknown[]) => void): this;
    once(event: string, listener: (...args: unknown[]) => void): this;
    removeListener(event: string, listener: (...args: unknown[]) => void): this;
    off(event: string, listener: (...args: unknown[]) => void): this;
    addListener(event: string, listener: (...args: unknown[]) => void): this;
    removeAllListeners(event?: string): this;
    emit(event: string, ...args: unknown[]): boolean;
    private _emit;
}
interface FsConstantsShape {
    F_OK: number;
    R_OK: number;
    W_OK: number;
    X_OK: number;
    O_RDONLY: number;
    O_WRONLY: number;
    O_RDWR: number;
    O_CREAT: number;
    O_EXCL: number;
    O_TRUNC: number;
    O_APPEND: number;
    O_DIRECTORY: number;
    O_NOFOLLOW: number;
    O_SYNC: number;
    O_DSYNC: number;
    O_NONBLOCK: number;
    O_NOCTTY: number;
    S_IFMT: number;
    S_IFREG: number;
    S_IFDIR: number;
    S_IFLNK: number;
    S_IFCHR: number;
    S_IFBLK: number;
    S_IFIFO: number;
    S_IFSOCK: number;
    S_IRWXU: number;
    S_IRUSR: number;
    S_IWUSR: number;
    S_IXUSR: number;
    S_IRWXG: number;
    S_IRGRP: number;
    S_IWGRP: number;
    S_IXGRP: number;
    S_IRWXO: number;
    S_IROTH: number;
    S_IWOTH: number;
    S_IXOTH: number;
    COPYFILE_EXCL: number;
    COPYFILE_FICLONE: number;
    COPYFILE_FICLONE_FORCE: number;
    UV_FS_SYMLINK_DIR: number;
    UV_FS_SYMLINK_JUNCTION: number;
}
interface FsPromisesShape {
    readFile(target: PathArg): Promise<Buffer>;
    readFile(target: PathArg, enc: "utf8" | "utf-8"): Promise<string>;
    readFile(target: PathArg, opts: {
        encoding: "utf8" | "utf-8";
    }): Promise<string>;
    writeFile(target: PathArg, data: string | Uint8Array): Promise<void>;
    appendFile(target: PathArg, data: string | Uint8Array): Promise<void>;
    stat(target: PathArg): Promise<FileStat>;
    lstat(target: PathArg): Promise<FileStat>;
    readdir(target: PathArg): Promise<string[]>;
    mkdir(target: PathArg, opts?: {
        recursive?: boolean;
    }): Promise<void>;
    unlink(target: PathArg): Promise<void>;
    rmdir(target: PathArg): Promise<void>;
    rm(target: PathArg, opts?: {
        recursive?: boolean;
        force?: boolean;
    }): Promise<void>;
    rename(src: PathArg, dest: PathArg): Promise<void>;
    access(target: PathArg, mode?: number): Promise<void>;
    realpath(target: PathArg): Promise<string>;
    copyFile(src: PathArg, dest: PathArg): Promise<void>;
    symlink(target: PathArg, path: PathArg, type?: string): Promise<void>;
    readlink(target: PathArg): Promise<string>;
    link(existingPath: PathArg, newPath: PathArg): Promise<void>;
    chmod(target: PathArg, mode: number): Promise<void>;
    chown(target: PathArg, uid: number, gid: number): Promise<void>;
    lchown(target: PathArg, uid: number, gid: number): Promise<void>;
    truncate(target: PathArg, len?: number): Promise<void>;
    utimes(target: PathArg, atime: unknown, mtime: unknown): Promise<void>;
    lutimes(target: PathArg, atime: unknown, mtime: unknown): Promise<void>;
    glob(pattern: string | string[], opts?: {
        cwd?: string;
        exclude?: string[] | ((p: string) => boolean);
    }): AsyncIterable<string>;
}
export interface FsBridge {
    readFileSync(target: PathArg): Buffer;
    readFileSync(target: PathArg, enc: "utf8" | "utf-8"): string;
    readFileSync(target: PathArg, opts: {
        encoding: "utf8" | "utf-8";
    }): string;
    readFileSync(target: PathArg, opts: {
        encoding?: null;
    }): Buffer;
    writeFileSync(target: PathArg, data: string | Uint8Array): void;
    appendFileSync(target: PathArg, data: string | Uint8Array): void;
    existsSync(target: PathArg): boolean;
    mkdirSync(target: PathArg, opts?: {
        recursive?: boolean;
    }): void;
    readdirSync(target: PathArg): string[];
    readdirSync(target: PathArg, opts: {
        withFileTypes: true;
    }): Dirent[];
    readdirSync(target: PathArg, opts?: {
        withFileTypes?: boolean;
        encoding?: string;
    } | string): string[] | Dirent[];
    statSync(target: PathArg): FileStat;
    lstatSync(target: PathArg): FileStat;
    fstatSync(fd: number): FileStat;
    unlinkSync(target: PathArg): void;
    rmdirSync(target: PathArg): void;
    renameSync(src: PathArg, dest: PathArg): void;
    realpathSync: ((target: PathArg) => string) & {
        native: (target: PathArg) => string;
    };
    accessSync(target: PathArg, mode?: number): void;
    copyFileSync(src: PathArg, dest: PathArg): void;
    symlinkSync(target: PathArg, path: PathArg, type?: string): void;
    readlinkSync(target: PathArg): string;
    linkSync(existingPath: PathArg, newPath: PathArg): void;
    chmodSync(target: PathArg, mode: number): void;
    chownSync(target: PathArg, uid: number, gid: number): void;
    truncateSync(target: PathArg, len?: number): void;
    openSync(target: string, flags: string | number, mode?: number): number;
    closeSync(fd: number): void;
    readSync(fd: number, buf: Buffer | Uint8Array, off: number, len: number, pos: number | null): number;
    writeSync(fd: number, buf: Buffer | Uint8Array | string, off?: number, len?: number, pos?: number | null): number;
    ftruncateSync(fd: number, len?: number): void;
    fsyncSync(fd: number): void;
    fdatasyncSync(fd: number): void;
    mkdtempSync(prefix: string): string;
    rmSync(target: string, opts?: {
        recursive?: boolean;
        force?: boolean;
    }): void;
    opendirSync(target: unknown): Dir;
    watch(filename: string, opts?: {
        persistent?: boolean;
        recursive?: boolean;
    }, listener?: WatchCallback): FileWatchHandle;
    watch(filename: string, listener?: WatchCallback): FileWatchHandle;
    readFile(target: string, cb: (err: Error | null, data?: Uint8Array) => void): void;
    readFile(target: string, opts: {
        encoding: string;
    }, cb: (err: Error | null, data?: string) => void): void;
    writeFile(target: string, data: string | Uint8Array, cb: (err: Error | null) => void): void;
    appendFile(target: string, data: string | Uint8Array, cb: (err: Error | null) => void): void;
    stat(target: string, cb: (err: Error | null, stats?: FileStat) => void): void;
    lstat(target: string, cb: (err: Error | null, stats?: FileStat) => void): void;
    readdir(target: string, cb: (err: Error | null, entries?: string[]) => void): void;
    mkdir(target: string, opts: {
        recursive?: boolean;
    }, cb: (err: Error | null) => void): void;
    unlink(target: string, cb: (err: Error | null) => void): void;
    rmdir(target: string, cb: (err: Error | null) => void): void;
    rename(oldPath: string, newPath: string, cb: (err: Error | null) => void): void;
    realpath(target: string, cb: (err: Error | null, resolved?: string) => void): void;
    access(target: string, cb: (err: Error | null) => void): void;
    access(target: string, mode: number, cb: (err: Error | null) => void): void;
    symlink(target: string, path: string, cb: (err: Error | null) => void): void;
    symlink(target: string, path: string, type: string, cb: (err: Error | null) => void): void;
    readlink(target: string, cb: (err: Error | null, linkTarget?: string) => void): void;
    link(existingPath: string, newPath: string, cb: (err: Error | null) => void): void;
    chmod(target: string, mode: number, cb: (err: Error | null) => void): void;
    chown(target: string, uid: number, gid: number, cb: (err: Error | null) => void): void;
    createReadStream(target: string, opts?: {
        encoding?: string;
        start?: number;
        end?: number;
    }): import("./stream.d.ts").Readable;
    createWriteStream(target: string, opts?: {
        encoding?: string;
        flags?: string;
    }): import("./stream.d.ts").Writable;
    cpSync(src: unknown, dest: unknown, opts?: {
        recursive?: boolean;
        force?: boolean;
        errorOnExist?: boolean;
    }): void;
    cp(src: unknown, dest: unknown, optsOrCb?: unknown, cb?: (err: Error | null) => void): void;
    readvSync(fd: number, buffers: ArrayBufferView[], pos?: number | null): number;
    readv(fd: number, buffers: ArrayBufferView[], posOrCb?: unknown, cb?: unknown): void;
    globSync(pattern: string | string[], opts?: {
        cwd?: string;
        exclude?: string[] | ((p: string) => boolean);
    }): string[];
    glob(pattern: string | string[], optsOrCb?: unknown, cb?: unknown): void;
    statfsSync(target: unknown, opts?: unknown): StatFs;
    statfs(target: unknown, optsOrCb?: unknown, cb?: unknown): void;
    openAsBlob(target: unknown, opts?: {
        type?: string;
    }): Promise<Blob>;
    exists(target: unknown, cb: (exists: boolean) => void): void;
    lchmodSync(target: unknown, mode: number): void;
    lchmod(target: unknown, mode: number, cb: (err: Error | null) => void): void;
    fdatasync(fd: number, cb: (err: Error | null) => void): void;
    fsync(fd: number, cb: (err: Error | null) => void): void;
    ftruncate(fd: number, lenOrCb?: unknown, cb?: unknown): void;
    truncate(target: unknown, lenOrCb?: unknown, cb?: unknown): void;
    mkdtemp(prefix: string, optsOrCb?: unknown, cb?: unknown): void;
    StatFs: typeof StatFs;
    StatWatcher: typeof StatWatcher;
    promises: FsPromisesShape;
    constants: FsConstantsShape;
}
export declare function buildFileSystemBridge(volume: MemoryVolume, getCwd?: () => string): FsBridge;
export default buildFileSystemBridge;
