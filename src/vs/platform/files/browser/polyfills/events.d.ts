export type EventHandler = (...args: any[]) => void;
export interface EventEmitter {
    _registry: Map<string, EventHandler[]>;
    _ceiling: number;
    addListener(name: string, handler: EventHandler): this;
    on(name: string, handler: EventHandler): this;
    once(name: string, handler: EventHandler): this;
    removeListener(name: string, handler: EventHandler): this;
    off(name: string, handler: EventHandler): this;
    removeAllListeners(name?: string): this;
    emit(name: string, ...payload: unknown[]): boolean;
    listeners(name: string): EventHandler[];
    rawListeners(name: string): EventHandler[];
    listenerCount(name: string): number;
    eventNames(): string[];
    setMaxListeners(limit: number): this;
    getMaxListeners(): number;
    prependListener(name: string, handler: EventHandler): this;
    prependOnceListener(name: string, handler: EventHandler): this;
}
export interface EventEmitterConstructor {
    new (): EventEmitter;
    (): void;
    prototype: EventEmitter;
    EventEmitter: EventEmitterConstructor;
    listenerCount(target: EventEmitter, name: string): number;
    once(target: EventEmitter, name: string): Promise<unknown[]>;
    on(target: EventEmitter, name: string): AsyncIterable<unknown[]>;
    getEventListeners(target: EventEmitter, name: string): EventHandler[];
}
export declare const EventEmitter: EventEmitterConstructor;
declare const moduleFacade: EventEmitterConstructor & {
    EventEmitter: EventEmitterConstructor;
    once: (target: EventEmitter, name: string) => Promise<unknown[]>;
    on: (target: EventEmitter, name: string) => AsyncIterable<unknown[]>;
    getEventListeners: (target: EventEmitter, name: string) => EventHandler[];
    listenerCount: (target: EventEmitter, name: string) => number;
};
export default moduleFacade;
