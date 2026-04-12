import { EventEmitter } from "./events.js";
export declare const isMaster = true;
export declare const isPrimary = true;
export declare const isWorker = false;
export interface Worker extends EventEmitter {
    id: number;
    process: null;
    send(_msg: unknown, _cb?: (err: Error | null) => void): boolean;
    kill(_sig?: string): void;
    disconnect(): void;
    isDead(): boolean;
    isConnected(): boolean;
}
export declare const Worker: {
    new(): Worker;
    prototype: any;
};
export declare const worker: Worker | null;
export declare const workers: Record<number, Worker>;
export declare const settings: Record<string, unknown>;
export declare const SCHED_NONE = 1;
export declare const SCHED_RR = 2;
export declare let schedulingPolicy: number;
export declare function fork(_env?: object): Worker;
export declare function disconnect(done?: () => void): void;
export declare function setupMaster(_cfg?: object): void;
export declare function setupPrimary(_cfg?: object): void;
export declare const on: (name: string, handler: import("./events.js").EventHandler) => EventEmitter;
export declare const once: (name: string, handler: import("./events.js").EventHandler) => EventEmitter;
export declare const emit: (name: string, ...payload: unknown[]) => boolean;
export declare const removeListener: (name: string, handler: import("./events.js").EventHandler) => EventEmitter;
declare const _default: {
    isMaster: boolean;
    isPrimary: boolean;
    isWorker: boolean;
    Worker: {
        new(): Worker;
        prototype: any;
    };
    worker: null;
    workers: Record<number, Worker>;
    fork: typeof fork;
    disconnect: typeof disconnect;
    settings: Record<string, unknown>;
    SCHED_NONE: number;
    SCHED_RR: number;
    schedulingPolicy: number;
    setupMaster: typeof setupMaster;
    setupPrimary: typeof setupPrimary;
    on: (name: string, handler: import("./events.js").EventHandler) => EventEmitter;
    once: (name: string, handler: import("./events.js").EventHandler) => EventEmitter;
    emit: (name: string, ...payload: unknown[]) => boolean;
    removeListener: (name: string, handler: import("./events.js").EventHandler) => EventEmitter;
};
export default _default;
