declare function ensureRollup(): Promise<unknown>;
export declare const VERSION: string;
export declare function rollup(inputOptions: unknown): Promise<unknown>;
export declare function watch(watchOptions: unknown): Promise<unknown>;
export declare function defineConfig<T>(config: T): T;
export declare function parseAst(source: string, opts?: {
    allowReturnOutsideFunction?: boolean;
    jsx?: boolean;
}): unknown;
export declare function parseAstAsync(source: string, opts?: {
    allowReturnOutsideFunction?: boolean;
    jsx?: boolean;
    signal?: AbortSignal;
}): Promise<unknown>;
export declare function getPackageBase(): string;
export { ensureRollup as loadRollup };
export interface Plugin {
    name: string;
    [key: string]: unknown;
}
export interface PluginContext {
    meta: {
        rollupVersion: string;
    };
    parse: (code: string) => unknown;
    [key: string]: unknown;
}
declare const _default: {
    VERSION: string;
    rollup: typeof rollup;
    watch: typeof watch;
    defineConfig: typeof defineConfig;
    parseAst: typeof parseAst;
    parseAstAsync: typeof parseAstAsync;
    loadRollup: typeof ensureRollup;
};
export default _default;
