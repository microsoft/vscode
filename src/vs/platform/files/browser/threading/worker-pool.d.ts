import { type Remote } from "comlink";
import type { OffloadWorkerEndpoint, PoolConfig } from "./offload-types.d.ts";
interface PooledWorker {
    thread: Worker;
    endpoint: Remote<OffloadWorkerEndpoint>;
    busy: boolean;
    initialized: boolean;
    initPromise: Promise<void> | null;
    lastUsed: number;
    id: number;
}
export declare class WorkerPool {
    private workers;
    private waitQueue;
    private nextId;
    private config;
    private idleTimer;
    private disposed;
    broken: boolean;
    constructor(config?: PoolConfig);
    acquire(): Promise<{
        worker: PooledWorker;
        release: () => void;
    }>;
    dispose(): void;
    stats(): {
        total: number;
        busy: number;
        idle: number;
        initialized: number;
    };
    private rejectAllWaiters;
    private release;
    private tryCreateWorker;
    private reapIdle;
    private terminateWorker;
}
export { };
