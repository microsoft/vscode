import type { ShellResult, ShellCommand } from "./shell-types.d.ts";
import type { MemoryVolume } from "../memory-volume.d.ts";
export type SpawnChildCallback = (command: string, args: string[], opts?: {
    cwd?: string;
    env?: Record<string, string>;
    stdio?: "pipe" | "inherit";
}) => Promise<{
    pid: number;
    exitCode: number;
    stdout: string;
    stderr: string;
}>;
export declare class NodepodShell {
    private volume;
    private cwd;
    private env;
    private commands;
    private lastExit;
    private aliases;
    private _execQueue;
    private _spawnChild;
    constructor(volume: MemoryVolume, opts?: {
        cwd?: string;
        env?: Record<string, string>;
    });
    registerCommand(cmd: ShellCommand): void;
    setSpawnChildCallback(cb: SpawnChildCallback | null): void;
    getSpawnChildCallback(): SpawnChildCallback | null;
    getCwd(): string;
    setCwd(cwd: string): void;
    getEnv(): Record<string, string>;
    exec(command: string, opts?: {
        cwd?: string;
        env?: Record<string, string>;
    }): Promise<ShellResult>;
    private _execInner;
    private execList;
    private execPipeline;
    private execCommand;
    private buildContext;
    private resolvePath;
    private resolveFromPath;
    private normalizePath;
    private applyRedirects;
    private expandCommandSubstitution;
    private handleAlias;
    private handleSource;
}
