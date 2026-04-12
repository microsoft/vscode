interface WasiFileStat {
    isFile(): boolean;
    isDirectory(): boolean;
    isSymbolicLink(): boolean;
    size: number;
    mtimeMs: number;
    atimeMs: number;
    ctimeMs: number;
    ino?: number;
    nlink?: number;
}
interface WasiFS {
    readFileSync(p: string): Uint8Array;
    writeFileSync(p: string, data: string | Uint8Array): void;
    mkdirSync(p: string, options?: {
        recursive?: boolean;
    }): void;
    statSync(p: string): WasiFileStat;
    readdirSync(p: string): string[];
    unlinkSync(p: string): void;
    rmdirSync(p: string): void;
    renameSync(from: string, to: string): void;
    existsSync(p: string): boolean;
    symlinkSync?(target: string, linkPath: string): void;
    readlinkSync?(p: string): string;
}
export declare class ExitStatus extends Error {
    readonly code: number;
    constructor(code: number);
}
export interface WASIOptions {
    version?: "preview1" | "unstable";
    args?: string[];
    env?: Record<string, string>;
    preopens?: Record<string, string>;
    returnOnExit?: boolean;
    stdin?: number;
    stdout?: number;
    stderr?: number;
    fs?: WasiFS;
}
export interface WASI {
    readonly wasiImport: Record<string, Function>;
    start(instance: object): number;
    initialize(instance: object): void;
    getImportObject(): Record<string, Record<string, Function>>;
}
interface WASIConstructor {
    new (options?: WASIOptions): WASI;
    (this: any, options?: WASIOptions): void;
    prototype: any;
}
export declare const WASI: WASIConstructor;
declare const _default: {
    WASI: WASIConstructor;
};
export default _default;
