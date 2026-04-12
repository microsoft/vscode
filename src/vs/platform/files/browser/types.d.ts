import type { VolumeSnapshot } from "./engine-types.d.ts";
import type { MemoryHandlerOptions } from "./memory-handler.d.ts";
export interface NodepodOptions {
    files?: Record<string, string | Uint8Array>;
    env?: Record<string, string>;
    workdir?: string;
    swUrl?: string;
    onServerReady?: (port: number, url: string) => void;
    /** Show a small "nodepod" watermark link in preview iframes. Defaults to true. */
    watermark?: boolean;
    /** Memory optimization settings. Omit to use defaults. */
    memory?: MemoryHandlerOptions;
    /** Cache installed node_modules in IndexedDB for faster re-boots. Default: true. */
    enableSnapshotCache?: boolean;
    /** domains allowed through the cors proxy. merged with built-in defaults
     *  (npm, github, esm.sh etc). pass null to allow everything */
    allowedFetchDomains?: string[] | null;
}
export interface TerminalTheme {
    background?: string;
    foreground?: string;
    cursor?: string;
    selectionBackground?: string;
    black?: string;
    red?: string;
    green?: string;
    yellow?: string;
    blue?: string;
    magenta?: string;
    cyan?: string;
    white?: string;
    brightBlack?: string;
    brightRed?: string;
    brightGreen?: string;
    brightYellow?: string;
    brightBlue?: string;
    brightMagenta?: string;
    brightCyan?: string;
    brightWhite?: string;
}
export interface TerminalOptions {
    Terminal: any;
    FitAddon?: any;
    WebglAddon?: any;
    theme?: TerminalTheme;
    fontSize?: number;
    fontFamily?: string;
    prompt?: (cwd: string) => string;
}
export interface StatResult {
    isFile: boolean;
    isDirectory: boolean;
    size: number;
    mtime: number;
}
export type Snapshot = VolumeSnapshot;
export interface SnapshotOptions {
    /** Exclude node_modules and other auto-installable dirs. Default: true */
    shallow?: boolean;
    /** Auto-install deps from package.json after restoring a shallow snapshot. Default: true */
    autoInstall?: boolean;
}
export interface SpawnOptions {
    cwd?: string;
    env?: Record<string, string>;
    signal?: AbortSignal;
}
