import type { MemoryVolume, FileStat } from "../memory-volume.d.ts";
export declare function setVolume(vol: MemoryVolume): void;
export interface ScanOptions {
    root?: string;
    fileFilter?: string | string[] | ((entry: ScanEntry) => boolean);
    directoryFilter?: string | string[] | ((entry: ScanEntry) => boolean);
    depth?: number;
    type?: "files" | "directories" | "files_directories" | "all";
    lstat?: boolean;
    alwaysStat?: boolean;
}
export interface ScanEntry {
    path: string;
    fullPath: string;
    basename: string;
    stats?: FileStat;
    dirent?: {
        isFile(): boolean;
        isDirectory(): boolean;
        name: string;
    };
}
interface DirectoryScanner {
    cfg: ScanOptions;
    rootDir: string;
    results: ScanEntry[];
    scanned: boolean;
    handlerMap: Map<string, Array<(...args: unknown[]) => void>>;
    [Symbol.asyncIterator](): AsyncIterableIterator<ScanEntry>;
    toArray(): Promise<ScanEntry[]>;
    on(event: string, handler: (...args: unknown[]) => void): this;
    once(event: string, handler: (...args: unknown[]) => void): this;
    off(event: string, handler: (...args: unknown[]) => void): this;
    fireEvent(event: string, ...args: unknown[]): void;
    runScan(): void;
    crawl(dir: string, level: number, relative: string): void;
    applyFilter(entry: ScanEntry, filter?: string | string[] | ((e: ScanEntry) => boolean)): boolean;
    globMatch(filename: string, pattern: string): boolean;
}
interface DirectoryScannerConstructor {
    new(root: string, cfg?: ScanOptions): DirectoryScanner;
    (this: any, root: string, cfg?: ScanOptions): void;
    prototype: any;
}
declare const DirectoryScanner: DirectoryScannerConstructor;
export default function readdirp(root: string, options?: ScanOptions): DirectoryScanner;
export declare function readdirpPromise(root: string, options?: ScanOptions): Promise<ScanEntry[]>;
export { readdirp, DirectoryScanner };
