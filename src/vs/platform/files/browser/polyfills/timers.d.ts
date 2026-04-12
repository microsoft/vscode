export declare const setTimeout: typeof globalThis.setTimeout;
export declare const setInterval: typeof globalThis.setInterval;
export declare const setImmediate: (fn: (...args: unknown[]) => void, ...args: unknown[]) => NodeJS.Timeout;
export declare const clearTimeout: typeof globalThis.clearTimeout;
export declare const clearInterval: typeof globalThis.clearInterval;
export declare const clearImmediate: typeof globalThis.clearTimeout;
export declare const promises: {
    setTimeout: (ms: number, value?: unknown) => Promise<unknown>;
    setInterval: typeof globalThis.setInterval;
    setImmediate: (value?: unknown) => Promise<unknown>;
    scheduler: {
        wait: (ms: number) => Promise<unknown>;
    };
};
declare const _default: {
    setTimeout: typeof globalThis.setTimeout;
    setInterval: typeof globalThis.setInterval;
    setImmediate: (fn: (...args: unknown[]) => void, ...args: unknown[]) => NodeJS.Timeout;
    clearTimeout: typeof globalThis.clearTimeout;
    clearInterval: typeof globalThis.clearInterval;
    clearImmediate: typeof globalThis.clearTimeout;
};
export default _default;
