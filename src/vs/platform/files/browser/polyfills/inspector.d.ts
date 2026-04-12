import type { EventEmitter } from "./events.js";
export interface Session extends EventEmitter {
    connect(): void;
    connectToMainThread(): void;
    disconnect(): void;
    post(_method: string, _params?: object, _cb?: (err: Error | null, result?: object) => void): void;
}
export declare const Session: {
    new(): Session;
    prototype: any;
};
export declare function open(_port?: number, _host?: string, _wait?: boolean): void;
export declare function close(): void;
export declare function url(): string | undefined;
export declare function waitForDebugger(): void;
declare const nativeConsole: Console;
export { nativeConsole as console };
declare const _default: {
    Session: {
        new(): Session;
        prototype: any;
    };
    open: typeof open;
    close: typeof close;
    url: typeof url;
    waitForDebugger: typeof waitForDebugger;
    console: Console;
};
export default _default;
