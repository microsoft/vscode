import { EventEmitter } from "./events.js";
export interface Domain extends EventEmitter {
    members: unknown[];
    add(emitter: EventEmitter): void;
    remove(emitter: EventEmitter): void;
    bind<F extends (...args: unknown[]) => unknown>(fn: F): F;
    intercept<F extends (...args: unknown[]) => unknown>(fn: F): F;
    run<T>(fn: () => T): T;
    dispose(): void;
    enter(): void;
    exit(): void;
}
export declare const Domain: {
    new(): Domain;
    prototype: any;
};
export declare function create(): Domain;
export declare let active: Domain | null;
declare const _default: {
    Domain: {
        new(): Domain;
        prototype: any;
    };
    create: typeof create;
    active: null;
};
export default _default;
