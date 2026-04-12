import type { FileStat } from './memory-volume.d.ts';
export declare class LRUCache<K, V> {
    private _map;
    private _capacity;
    constructor(capacity: number);
    get(key: K): V | undefined;
    set(key: K, value: V): void;
    has(key: K): boolean;
    delete(key: K): boolean;
    clear(): void;
    get size(): number;
    keys(): IterableIterator<K>;
    values(): IterableIterator<V>;
}
export interface MemoryHandlerOptions {
    /** LRU capacity for path normalization cache. Default: 2048 */
    pathNormCacheSize?: number;
    /** LRU capacity for stat result cache. Default: 512 */
    statCacheSize?: number;
    /** LRU capacity for module resolve cache. Default: 4096 */
    resolveCacheSize?: number;
    /** LRU capacity for package.json manifest cache. Default: 256 */
    manifestCacheSize?: number;
    /** LRU capacity for source transform cache. Default: 512 */
    transformCacheSize?: number;
    /** Max modules before trimming node_modules entries. Default: 512 */
    moduleSoftCacheSize?: number;
    /** Heap usage threshold in MB to trigger pressure callbacks. Default: 350 */
    heapWarnThresholdMB?: number;
    /** Monitoring poll interval in ms. Default: 30000 */
    monitorIntervalMs?: number;
    /** Max process stdout/stderr accumulation in bytes. Default: 4194304 (4MB) */
    maxProcessOutputBytes?: number;
}
export declare class MemoryHandler {
    readonly options: Required<MemoryHandlerOptions>;
    readonly pathNormCache: LRUCache<string, string>;
    readonly statCache: LRUCache<string, FileStat>;
    readonly transformCache: LRUCache<string, string>;
    private _monitorTimer;
    private _pressureCallbacks;
    private _destroyed;
    constructor(opts?: MemoryHandlerOptions);
    /** Invalidate a cached stat entry (call on file write/delete). */
    invalidateStat(normalizedPath: string): void;
    /** Register a callback to be invoked when heap pressure is detected. Returns unsubscribe fn. */
    onPressure(cb: () => void): () => void;
    /** Start periodic heap monitoring. */
    startMonitoring(): void;
    /** Stop monitoring. */
    stopMonitoring(): void;
    /** Clear all owned caches. */
    flush(): void;
    /** Full cleanup — stop monitoring, flush caches. */
    destroy(): void;
    private _checkHeap;
}
