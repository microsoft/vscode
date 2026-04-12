import type { MemoryVolume, FileWatchHandle } from "../memory-volume.d.ts";
export declare function setVolume(vol: MemoryVolume): void;
type Listener = (...args: unknown[]) => void;
interface MiniEmitter {
    handlers: Map<string, Set<Listener>>;
    on(name: string, fn: Listener): this;
    off(name: string, fn: Listener): this;
    fire(name: string, ...args: unknown[]): void;
}
interface MiniEmitterConstructor {
    new(): MiniEmitter;
    (this: any): void;
    prototype: any;
}
declare const MiniEmitter: MiniEmitterConstructor;
export interface WatcherConfig {
    persistent?: boolean;
    ignored?: string | RegExp | ((p: string) => boolean) | Array<string | RegExp | ((p: string) => boolean)>;
    ignoreInitial?: boolean;
    followSymlinks?: boolean;
    cwd?: string;
    disableGlobbing?: boolean;
    usePolling?: boolean;
    interval?: number;
    binaryInterval?: number;
    alwaysStat?: boolean;
    depth?: number;
    awaitWriteFinish?: boolean | {
        stabilityThreshold?: number;
        pollInterval?: number;
    };
    ignorePermissionErrors?: boolean;
    atomic?: boolean | number;
}
export interface PathWatcher extends MiniEmitter {
    vol: MemoryVolume;
    cfg: WatcherConfig;
    handles: Map<string, FileWatchHandle>;
    terminated: boolean;
    initialised: boolean;
    add(targets: string | readonly string[]): this;
    unwatch(targets: string | readonly string[]): this;
    close(): Promise<void>;
    getWatched(): Record<string, string[]>;
    resolvePath(raw: string): string;
    isExcluded(target: string): boolean;
    gatherInitial(dir: string, queue: Array<() => void>): void;
    attachWatcher(target: string, filterFor?: string): void;
    watchSubtree(dir: string, level?: number): void;
}
interface PathWatcherConstructor {
    new(cfg?: WatcherConfig): PathWatcher;
    (this: any, cfg?: WatcherConfig): void;
    prototype: any;
}
export declare const PathWatcher: PathWatcherConstructor;
export declare function watch(targets: string | readonly string[], options?: WatcherConfig): PathWatcher;
declare const _default: {
    watch: typeof watch;
    PathWatcher: PathWatcherConstructor;
    setVolume: typeof setVolume;
};
export default _default;
