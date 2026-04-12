export interface Console {
    _out: {
        write: (s: string) => void;
    } | null;
    _err: {
        write: (s: string) => void;
    } | null;
    _emit(target: "out" | "err", args: unknown[]): void;
    log(...a: unknown[]): void;
    error(...a: unknown[]): void;
    warn(...a: unknown[]): void;
    info(...a: unknown[]): void;
    debug(...a: unknown[]): void;
    trace(...a: unknown[]): void;
    dir(o: unknown): void;
    time(): void;
    timeEnd(): void;
    timeLog(): void;
    assert(v: unknown, ...a: unknown[]): void;
    clear(): void;
    count(): void;
    countReset(): void;
    group(): void;
    groupCollapsed(): void;
    groupEnd(): void;
    table(d: unknown): void;
}
interface ConsoleConstructor {
    new (stdout?: unknown, stderr?: unknown): Console;
    (this: any, stdout?: unknown, stderr?: unknown): void;
    prototype: any;
}
export declare const Console: ConsoleConstructor;
export declare const log: (...data: any[]) => void;
export declare const error: (...data: any[]) => void;
export declare const warn: (...data: any[]) => void;
export declare const info: (...data: any[]) => void;
export declare const debug: (...data: any[]) => void;
export declare const trace: (...data: any[]) => void;
export declare const dir: (item?: any, options?: any) => void;
export declare const time: (label?: string) => void;
export declare const timeEnd: (label?: string) => void;
export declare const timeLog: (label?: string, ...data: any[]) => void;
export declare const clear: () => void;
export declare const count: (label?: string) => void;
export declare const countReset: (label?: string) => void;
export declare const group: (...data: any[]) => void;
export declare const groupCollapsed: (...data: any[]) => void;
export declare const groupEnd: () => void;
export declare const table: (tabularData?: any, properties?: string[]) => void;
declare const _default: {
    Console: ConsoleConstructor;
    log: (...data: any[]) => void;
    error: (...data: any[]) => void;
    warn: (...data: any[]) => void;
    info: (...data: any[]) => void;
    debug: (...data: any[]) => void;
    trace: (...data: any[]) => void;
    dir: (item?: any, options?: any) => void;
    time: (label?: string) => void;
    timeEnd: (label?: string) => void;
    timeLog: (label?: string, ...data: any[]) => void;
    assert: (condition?: boolean, ...data: any[]) => void;
    clear: () => void;
    count: (label?: string) => void;
    countReset: (label?: string) => void;
    group: (...data: any[]) => void;
    groupCollapsed: (...data: any[]) => void;
    groupEnd: () => void;
    table: (tabularData?: any, properties?: string[]) => void;
};
export default _default;
