export interface AsyncResource {
    runInAsyncScope<R>(fn: (...a: any[]) => R, thisArg?: unknown, ...args: any[]): R;
    emitDestroy(): this;
    asyncId(): number;
    triggerAsyncId(): number;
}
export declare const AsyncResource: {
    new (_kind: string, _opts?: object): AsyncResource;
    prototype: any;
    bind<F extends (...a: any[]) => any>(fn: F, _kind?: string): F;
};
export interface AsyncLocalStorage<T> {
    disable(): void;
    getStore(): T | undefined;
    run<R>(store: T, fn: (...args: any[]) => R, ...args: any[]): R;
    exit<R>(fn: (...args: any[]) => R, ...args: any[]): R;
    enterWith(store: T): void;
}
export declare const AsyncLocalStorage: {
    new <T>(): AsyncLocalStorage<T>;
    prototype: any;
};
export interface AsyncHook {
    enable(): AsyncHook;
    disable(): AsyncHook;
}
export declare function createHook(_callbacks: object): AsyncHook;
export declare function executionAsyncId(): number;
export declare function executionAsyncResource(): object;
export declare function triggerAsyncId(): number;
declare const _default: {
    AsyncResource: {
        new (_kind: string, _opts?: object): AsyncResource;
        prototype: any;
        bind<F extends (...a: any[]) => any>(fn: F, _kind?: string): F;
    };
    AsyncLocalStorage: {
        new <T>(): AsyncLocalStorage<T>;
        prototype: any;
    };
    createHook: typeof createHook;
    executionAsyncId: typeof executionAsyncId;
    executionAsyncResource: typeof executionAsyncResource;
    triggerAsyncId: typeof triggerAsyncId;
};
export default _default;
