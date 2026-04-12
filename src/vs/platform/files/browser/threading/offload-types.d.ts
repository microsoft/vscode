export declare enum TaskPriority {
    HIGH = 0,// runtime transforms (user waiting)
    NORMAL = 1,// install-time bulk transforms
    LOW = 2
}
export interface TransformTask {
    type: "transform";
    id: string;
    source: string;
    filePath: string;
    options?: {
        loader?: "js" | "jsx" | "ts" | "tsx";
        format?: "cjs" | "esm";
        target?: string;
        platform?: string;
        define?: Record<string, string>;
    };
    priority: TaskPriority;
}
export interface TransformResult {
    type: "transform";
    id: string;
    code: string;
    warnings: string[];
}
export interface ExtractTask {
    type: "extract";
    id: string;
    tarballUrl: string;
    stripComponents: number;
    priority: TaskPriority;
    expectedShasum?: string;
}
export interface ExtractedFile {
    path: string;
    data: string;
    isBinary: boolean;
}
export interface ExtractResult {
    type: "extract";
    id: string;
    files: ExtractedFile[];
}
export interface BuildTask {
    type: "build";
    id: string;
    files: Record<string, string>;
    entryPoints?: string[];
    stdin?: {
        contents: string;
        resolveDir?: string;
        loader?: string;
    };
    bundle?: boolean;
    format?: "iife" | "cjs" | "esm";
    platform?: "browser" | "node" | "neutral";
    target?: string | string[];
    minify?: boolean;
    external?: string[];
    absWorkingDir?: string;
    priority: TaskPriority;
}
export interface BuildOutputFile {
    path: string;
    text: string;
}
export interface BuildResult {
    type: "build";
    id: string;
    outputFiles: BuildOutputFile[];
    errors: string[];
    warnings: string[];
}
export type OffloadTask = TransformTask | ExtractTask | BuildTask;
export type OffloadResult = TransformResult | ExtractResult | BuildResult;
export interface OffloadWorkerEndpoint {
    init(): Promise<void>;
    transform(task: TransformTask): Promise<TransformResult>;
    extract(task: ExtractTask): Promise<ExtractResult>;
    build(task: BuildTask): Promise<BuildResult>;
    ping(): boolean;
}
export interface PoolConfig {
    minWorkers?: number;
    maxWorkers?: number;
    idleTimeoutMs?: number;
    warmUpOnCreate?: boolean;
}
