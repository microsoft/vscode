import type { OffloadTask, OffloadResult, PoolConfig, TransformTask, TransformResult, ExtractTask, ExtractResult, BuildTask, BuildResult } from "./offload-types.d.ts";
export type { TaskPriority } from "./offload-types.d.ts";
export type { TransformTask, TransformResult, ExtractTask, ExtractResult, BuildTask, BuildResult, OffloadTask, OffloadResult, PoolConfig, } from "./offload-types.d.ts";
export declare function taskId(): string;
export declare function offload<T extends OffloadTask>(task: T): Promise<T extends TransformTask ? TransformResult : T extends ExtractTask ? ExtractResult : T extends BuildTask ? BuildResult : OffloadResult>;
export declare function offloadBatch(tasks: OffloadTask[]): Promise<OffloadResult[]>;
export declare function cancelTask(id: string): boolean;
export declare function poolStats(): {
    total: number;
    busy: number;
    idle: number;
    initialized: number;
    fallback: boolean;
};
export declare function disposePool(): void;
export declare function configurePool(config: PoolConfig): void;
