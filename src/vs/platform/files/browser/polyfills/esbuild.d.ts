import type { MemoryVolume } from "../memory-volume.d.ts";
export interface TransformConfig {
    loader?: "js" | "jsx" | "ts" | "tsx" | "json" | "css";
    format?: "iife" | "cjs" | "esm";
    target?: string | string[];
    minify?: boolean;
    sourcemap?: boolean | "inline" | "external";
    jsx?: "transform" | "preserve";
    jsxFactory?: string;
    jsxFragment?: string;
}
export interface TransformOutput {
    code: string;
    map: string;
    warnings: unknown[];
}
export interface BundleConfig {
    entryPoints?: string[];
    stdin?: {
        contents: string;
        resolveDir?: string;
        loader?: "js" | "jsx" | "ts" | "tsx" | "json" | "css";
    };
    bundle?: boolean;
    outdir?: string;
    outfile?: string;
    format?: "iife" | "cjs" | "esm";
    platform?: "browser" | "node" | "neutral";
    target?: string | string[];
    minify?: boolean;
    sourcemap?: boolean | "inline" | "external";
    external?: string[];
    write?: boolean;
    plugins?: unknown[];
    absWorkingDir?: string;
    conditions?: string[];
    mainFields?: string[];
}
export interface BundleOutput {
    errors: unknown[];
    warnings: unknown[];
    outputFiles?: Array<{
        path: string;
        contents: Uint8Array;
        text: string;
    }>;
    metafile?: {
        inputs?: Record<string, unknown>;
        outputs?: Record<string, unknown>;
    };
}
export declare function setVolume(vol: MemoryVolume): void;
export declare function setWasmUrl(url: string): void;
export declare function initialize(opts?: {
    wasmURL?: string;
}): Promise<void>;
export declare function transform(source: string, cfg?: TransformConfig): Promise<TransformOutput>;
export declare function build(cfg: BundleConfig): Promise<BundleOutput>;
export declare function formatMessages(messages: unknown[], opts?: {
    kind?: "error" | "warning";
    color?: boolean;
}): Promise<string[]>;
export declare const version = "0.21.5";
export declare function context(cfg: BundleConfig): Promise<{
    rebuild: () => Promise<BundleOutput>;
    watch: (opts?: unknown) => Promise<void>;
    serve: (opts?: unknown) => Promise<{
        host: string;
        port: number;
    }>;
    cancel: () => Promise<void>;
    dispose: () => Promise<void>;
}>;
export declare function stop(): void;
export declare function analyzeMetafile(metafile: string | {
    inputs?: Record<string, unknown>;
    outputs?: Record<string, unknown>;
}, _opts?: {
    verbose?: boolean;
    color?: boolean;
}): Promise<string>;
export declare function analyzeMetafileSync(metafile: string | {
    inputs?: Record<string, unknown>;
    outputs?: Record<string, unknown>;
}, _opts?: {
    verbose?: boolean;
    color?: boolean;
}): string;
export declare function transformSync(source: string, cfg?: TransformConfig): TransformOutput;
export declare function buildSync(cfg: BundleConfig): BundleOutput;
declare const _default: {
    initialize: typeof initialize;
    transform: typeof transform;
    transformSync: typeof transformSync;
    build: typeof build;
    buildSync: typeof buildSync;
    context: typeof context;
    stop: typeof stop;
    formatMessages: typeof formatMessages;
    analyzeMetafile: typeof analyzeMetafile;
    analyzeMetafileSync: typeof analyzeMetafileSync;
    version: string;
    setVolume: typeof setVolume;
    setWasmUrl: typeof setWasmUrl;
};
export default _default;
