import type { EventEmitter } from "./events.js";
export declare let isMainThread: boolean;
export declare let parentPort: MessagePort | null;
export declare let workerData: unknown;
export declare let threadId: number;
export type WorkerThreadForkFn = (modulePath: string, opts: {
    workerData: unknown;
    threadId: number;
    isEval?: boolean;
    cwd: string;
    env: Record<string, string>;
    onMessage: (data: unknown) => void;
    onError: (err: Error) => void;
    onExit: (code: number) => void;
    onStdout?: (data: string) => void;
    onStderr?: (data: string) => void;
}) => {
    postMessage: (data: unknown) => void;
    terminate: () => void;
    requestId: number;
};
export declare function setWorkerThreadForkCallback(fn: WorkerThreadForkFn): void;
export interface MessagePort extends EventEmitter {
    postMessage(_val: unknown, _transfer?: unknown[]): void;
    start(): void;
    close(): void;
    ref(): void;
    unref(): void;
}
interface MessagePortConstructor {
    new(): MessagePort;
    (this: any): void;
    prototype: any;
}
export declare const MessagePort: MessagePortConstructor;
export interface MessageChannel {
    port1: MessagePort;
    port2: MessagePort;
}
interface MessageChannelConstructor {
    new(): MessageChannel;
    (this: any): void;
    prototype: any;
}
export declare const MessageChannel: MessageChannelConstructor;
export interface Worker extends EventEmitter {
    threadId: number;
    resourceLimits: object;
    _handle: ReturnType<WorkerThreadForkFn> | null;
    _terminated: boolean;
    _isReffed: boolean;
    postMessage(value: unknown, _transferListOrOptions?: unknown): void;
    terminate(): Promise<number>;
    ref(): this;
    unref(): this;
    getHeapSnapshot(): Promise<unknown>;
}
interface WorkerConstructor {
    new(script: string | URL, opts?: {
        workerData?: unknown;
        eval?: boolean;
        env?: Record<string, string> | symbol;
        argv?: string[];
        execArgv?: string[];
        resourceLimits?: Record<string, number>;
        name?: string;
        transferList?: unknown[];
    }): Worker;
    (this: any, script: string | URL, opts?: any): void;
    prototype: any;
}
export declare const Worker: WorkerConstructor;
export interface BroadcastChannel extends EventEmitter {
    name: string;
    postMessage(_msg: unknown): void;
    close(): void;
    ref(): void;
    unref(): void;
}
interface BroadcastChannelConstructor {
    new(label: string): BroadcastChannel;
    (this: any, label: string): void;
    prototype: any;
}
export declare const BroadcastChannel: BroadcastChannelConstructor;
export declare function moveMessagePortToContext(port: MessagePort, _ctx: unknown): MessagePort;
export declare function receiveMessageOnPort(_port: MessagePort): {
    message: unknown;
} | undefined;
export declare const SHARE_ENV: unique symbol;
export declare function markAsUntransferable(_obj: unknown): void;
export declare function getEnvironmentData(_key: unknown): unknown;
export declare function setEnvironmentData(_key: unknown, _val: unknown): void;
declare const _default: {
    isMainThread: boolean;
    parentPort: null;
    workerData: unknown;
    threadId: number;
    Worker: WorkerConstructor;
    MessageChannel: MessageChannelConstructor;
    MessagePort: MessagePortConstructor;
    BroadcastChannel: BroadcastChannelConstructor;
    moveMessagePortToContext: typeof moveMessagePortToContext;
    receiveMessageOnPort: typeof receiveMessageOnPort;
    SHARE_ENV: symbol;
    markAsUntransferable: typeof markAsUntransferable;
    getEnvironmentData: typeof getEnvironmentData;
    setEnvironmentData: typeof setEnvironmentData;
    setWorkerThreadForkCallback: typeof setWorkerThreadForkCallback;
};
export default _default;
