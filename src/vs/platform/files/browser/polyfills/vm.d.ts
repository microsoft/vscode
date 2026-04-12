export interface Script {
    runInThisContext(_opts?: object): unknown;
    runInNewContext(ctx?: object, _opts?: object): unknown;
    runInContext(ctx: object, _opts?: object): unknown;
    createCachedData(): Uint8Array;
}
export declare const Script: {
    new (src: string, _opts?: object): Script;
    prototype: any;
};
export declare function createContext(sandbox?: object, _opts?: object): object;
export declare function isContext(_box: object): boolean;
export declare function runInThisContext(code: string, _opts?: object): unknown;
export declare function runInNewContext(code: string, ctx?: object, _opts?: object): unknown;
export declare function runInContext(code: string, ctx: object, _opts?: object): unknown;
export declare function compileFunction(body: string, params?: string[], _opts?: object): Function;
export interface Module {
    link(_linker: unknown): Promise<void>;
    evaluate(_opts?: object): Promise<unknown>;
    readonly status: string;
    readonly identifier: string;
    readonly context: object;
    readonly namespace: object;
}
export declare const Module: {
    new (_code: string, _opts?: object): Module;
    prototype: any;
};
export interface SourceTextModule extends Module {
}
export declare const SourceTextModule: {
    new (_code: string, _opts?: object): SourceTextModule;
    prototype: any;
};
export interface SyntheticModule extends Module {
    setExport(_name: string, _value: unknown): void;
}
export declare const SyntheticModule: {
    new (_code: string, _opts?: object): SyntheticModule;
    prototype: any;
};
declare const _default: {
    Script: {
        new (src: string, _opts?: object): Script;
        prototype: any;
    };
    createContext: typeof createContext;
    isContext: typeof isContext;
    runInThisContext: typeof runInThisContext;
    runInNewContext: typeof runInNewContext;
    runInContext: typeof runInContext;
    compileFunction: typeof compileFunction;
    Module: {
        new (_code: string, _opts?: object): Module;
        prototype: any;
    };
    SourceTextModule: {
        new (_code: string, _opts?: object): SourceTextModule;
        prototype: any;
    };
    SyntheticModule: {
        new (_code: string, _opts?: object): SyntheticModule;
        prototype: any;
    };
};
export default _default;
