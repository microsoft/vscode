import type { ShellResult, ShellContext } from "../shell/shell-types.d.ts";
import type { EventEmitter } from "./events.js";
import type { Readable, Writable } from "./stream.d.ts";
import type { MemoryVolume } from "../memory-volume.d.ts";
import type { SyncChannelWorker } from "../threading/sync-channel.d.ts";
export declare function setStreamingCallbacks(cfg: {
    onStdout?: (t: string) => void;
    onStderr?: (t: string) => void;
    signal?: AbortSignal;
    getCols?: () => number;
    getRows?: () => number;
    onRawModeChange?: (isRaw: boolean) => void;
}): void;
export declare function clearStreamingCallbacks(): void;
export declare function setSyncChannel(channel: SyncChannelWorker): void;
export type SpawnChildCallback = (command: string, args: string[], opts?: {
    cwd?: string;
    env?: Record<string, string>;
    stdio?: "pipe" | "inherit";
    onStdout?: (data: string) => void;
    onStderr?: (data: string) => void;
}) => Promise<{
    pid: number;
    exitCode: number;
    stdout: string;
    stderr: string;
}>;
export declare function setSpawnChildCallback(fn: SpawnChildCallback): void;
export type ForkChildCallback = (modulePath: string, args: string[], opts: {
    cwd: string;
    env: Record<string, string>;
    onStdout?: (data: string) => void;
    onStderr?: (data: string) => void;
    onIPC?: (data: unknown) => void;
    onExit?: (exitCode: number) => void;
}) => {
    sendIPC: (data: unknown) => void;
    disconnect: () => void;
    requestId: number;
};
export declare function setForkChildCallback(fn: ForkChildCallback): void;
export declare function setIPCSend(fn: (data: unknown) => void): void;
export declare function setIPCReceiveHandler(fn: (data: unknown) => void): void;
export declare function handleIPCFromParent(data: unknown): void;
export declare function getShellCwd(): string;
export declare function setShellCwd(dir: string): void;
export declare function shellExec(cmd: string, opts: {
    cwd?: string;
    env?: Record<string, string>;
}, callback: (error: Error | null, stdout: string, stderr: string) => void): void;
export declare function isStdinRaw(): boolean;
export declare function sendStdin(text: string): void;
export declare function initShellExec(volume: MemoryVolume, opts?: {
    cwd?: string;
    env?: Record<string, string>;
}): void;
export declare function executeNodeBinary(filePath: string, args: string[], ctx: ShellContext, opts?: {
    isFork?: boolean;
    workerThreadsOverride?: {
        isMainThread: boolean;
        parentPort: unknown;
        workerData: unknown;
        threadId: number;
    };
}): Promise<ShellResult>;
export interface RunOptions {
    cwd?: string;
    env?: Record<string, string>;
    encoding?: BufferEncoding | "buffer";
    timeout?: number;
    maxBuffer?: number;
    shell?: string | boolean;
}
export type RunCallback = (err: Error | null, stdout: string | Buffer, stderr: string | Buffer) => void;
export interface SpawnConfig {
    cwd?: string;
    env?: Record<string, string>;
    shell?: boolean | string;
    stdio?: "pipe" | "inherit" | "ignore" | Array<"pipe" | "inherit" | "ignore">;
}
export declare function exec(command: string, optsOrCb?: RunOptions | RunCallback, cb?: RunCallback): ShellProcess;
export declare function execSync(cmd: string, opts?: RunOptions): string | Buffer;
export declare function spawn(command: string, argsOrOpts?: string[] | SpawnConfig, opts?: SpawnConfig): ShellProcess;
export declare function spawnSync(cmd: string, args?: string[] | SpawnConfig, opts?: SpawnConfig): {
    stdout: Buffer;
    stderr: Buffer;
    status: number;
    signal: null;
    pid: number;
    output: [null, Buffer, Buffer];
    error?: Error;
};
export declare function execFileSync(file: string, args?: string[], opts?: RunOptions): string | Buffer;
export declare function execFile(file: string, argsOrOpts?: string[] | RunOptions | RunCallback, optsOrCb?: RunOptions | RunCallback, cb?: RunCallback): ShellProcess;
export declare function fork(modulePath: string, argsOrOpts?: string[] | Record<string, unknown>, opts?: Record<string, unknown>): ShellProcess;
export interface ShellProcess extends EventEmitter {
    pid: number;
    connected: boolean;
    killed: boolean;
    exitCode: number | null;
    signalCode: string | null;
    spawnargs: string[];
    spawnfile: string;
    stdin: Writable | null;
    stdout: Readable | null;
    stderr: Readable | null;
    kill(sig?: string): boolean;
    disconnect(): void;
    send(msg: unknown, cb?: (e: Error | null) => void): boolean;
    ref(): this;
    unref(): this;
}
interface ShellProcessConstructor {
    new(): ShellProcess;
    (this: any): void;
    prototype: any;
}
export declare const ShellProcess: ShellProcessConstructor;
declare const _default: {
    exec: typeof exec;
    execSync: typeof execSync;
    execFile: typeof execFile;
    execFileSync: typeof execFileSync;
    spawn: typeof spawn;
    spawnSync: typeof spawnSync;
    fork: typeof fork;
    ShellProcess: ShellProcessConstructor;
    initShellExec: typeof initShellExec;
    shellExec: typeof shellExec;
    setStreamingCallbacks: typeof setStreamingCallbacks;
    clearStreamingCallbacks: typeof clearStreamingCallbacks;
    sendStdin: typeof sendStdin;
    setSyncChannel: typeof setSyncChannel;
    setSpawnChildCallback: typeof setSpawnChildCallback;
    setForkChildCallback: typeof setForkChildCallback;
    setIPCSend: typeof setIPCSend;
    setIPCReceiveHandler: typeof setIPCReceiveHandler;
    handleIPCFromParent: typeof handleIPCFromParent;
    executeNodeBinary: typeof executeNodeBinary;
};
export default _default;
