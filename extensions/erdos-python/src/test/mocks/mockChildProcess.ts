/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Serializable, SendHandle, MessageOptions } from 'child_process';
import { EventEmitter } from 'node:events';
import { Writable, Readable, Pipe } from 'stream';
import { FakeReadableStream } from './helper';

export class MockChildProcess extends EventEmitter {
    constructor(spawnfile: string, spawnargs: string[]) {
        super();
        this.spawnfile = spawnfile;
        this.spawnargs = spawnargs;
        this.stdin = new Writable();
        this.stdout = new FakeReadableStream();
        this.stderr = new FakeReadableStream();
        this.channel = null;
        this.stdio = [this.stdin, this.stdout, this.stdout, this.stderr, null];
        this.killed = false;
        this.connected = false;
        this.exitCode = null;
        this.signalCode = null;
        this.eventMap = new Map();
    }

    stdin: Writable | null;

    stdout: Readable | null;

    stderr: Readable | null;

    eventMap: Map<string, any>;

    readonly channel?: Pipe | null | undefined;

    readonly stdio: [
        Writable | null,
        // stdin
        Readable | null,
        // stdout
        Readable | null,
        // stderr
        Readable | Writable | null | undefined,
        // extra
        Readable | Writable | null | undefined, // extra
    ];

    readonly killed: boolean;

    readonly pid?: number | undefined;

    readonly connected: boolean;

    readonly exitCode: number | null;

    readonly signalCode: NodeJS.Signals | null;

    readonly spawnargs: string[];

    readonly spawnfile: string;

    signal?: NodeJS.Signals | number;

    send(message: Serializable, callback?: (error: Error | null) => void): boolean;

    send(message: Serializable, sendHandle?: SendHandle, callback?: (error: Error | null) => void): boolean;

    send(
        message: Serializable,
        sendHandle?: SendHandle,
        options?: MessageOptions,
        callback?: (error: Error | null) => void,
    ): boolean;

    send(
        message: Serializable,
        _sendHandleOrCallback?: SendHandle | ((error: Error | null) => void),
        _optionsOrCallback?: MessageOptions | ((error: Error | null) => void),
        _callback?: (error: Error | null) => void,
    ): boolean {
        // Implementation of the send method
        // For example, you might want to emit a 'message' event
        this.stdout?.push(message.toString());
        return true;
    }

    // eslint-disable-next-line class-methods-use-this
    disconnect(): void {
        /* noop */
    }

    // eslint-disable-next-line class-methods-use-this
    unref(): void {
        /* noop */
    }

    // eslint-disable-next-line class-methods-use-this
    ref(): void {
        /* noop */
    }

    addListener(event: 'close', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;

    addListener(event: 'disconnect', listener: () => void): this;

    addListener(event: 'error', listener: (err: Error) => void): this;

    addListener(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;

    addListener(event: 'message', listener: (message: Serializable, sendHandle: SendHandle) => void): this;

    addListener(event: 'spawn', listener: () => void): this;

    addListener(event: string, listener: (...args: any[]) => void): this {
        if (this.eventMap.has(event)) {
            this.eventMap.get(event).push(listener);
        } else {
            this.eventMap.set(event, [listener]);
        }
        return this;
    }

    emit(event: 'close', code: number | null, signal: NodeJS.Signals | null): boolean;

    emit(event: 'disconnect'): boolean;

    emit(event: 'error', err: Error): boolean;

    emit(event: 'exit', code: number | null, signal: NodeJS.Signals | null): boolean;

    emit(event: 'message', message: Serializable, sendHandle: SendHandle): boolean;

    emit(event: 'spawn', listener: () => void): boolean;

    emit(event: string | symbol, ...args: unknown[]): boolean {
        if (this.eventMap.has(event.toString())) {
            this.eventMap.get(event.toString()).forEach((listener: (...arg0: unknown[]) => void) => {
                const argsArray: unknown[] = Array.isArray(args) ? args : [args];
                listener(...argsArray);
            });
        }
        return true;
    }

    on(event: 'close', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;

    on(event: 'disconnect', listener: () => void): this;

    on(event: 'error', listener: (err: Error) => void): this;

    on(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;

    on(event: 'message', listener: (message: Serializable, sendHandle: SendHandle) => void): this;

    on(event: 'spawn', listener: () => void): this;

    on(event: string, listener: (...args: any[]) => void): this {
        if (this.eventMap.has(event)) {
            this.eventMap.get(event).push(listener);
        } else {
            this.eventMap.set(event, [listener]);
        }
        return this;
    }

    once(event: 'close', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;

    once(event: 'disconnect', listener: () => void): this;

    once(event: 'error', listener: (err: Error) => void): this;

    once(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;

    once(event: 'message', listener: (message: Serializable, sendHandle: SendHandle) => void): this;

    once(event: 'spawn', listener: () => void): this;

    once(event: string, listener: (...args: any[]) => void): this {
        if (this.eventMap.has(event)) {
            this.eventMap.get(event).push(listener);
        } else {
            this.eventMap.set(event, [listener]);
        }
        return this;
    }

    prependListener(event: 'close', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;

    prependListener(event: 'disconnect', listener: () => void): this;

    prependListener(event: 'error', listener: (err: Error) => void): this;

    prependListener(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;

    prependListener(event: 'message', listener: (message: Serializable, sendHandle: SendHandle) => void): this;

    prependListener(event: 'spawn', listener: () => void): this;

    prependListener(event: string, listener: (...args: any[]) => void): this {
        if (this.eventMap.has(event)) {
            this.eventMap.get(event).push(listener);
        } else {
            this.eventMap.set(event, [listener]);
        }
        return this;
    }

    prependOnceListener(event: 'close', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;

    prependOnceListener(event: 'disconnect', listener: () => void): this;

    prependOnceListener(event: 'error', listener: (err: Error) => void): this;

    prependOnceListener(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;

    prependOnceListener(event: 'message', listener: (message: Serializable, sendHandle: SendHandle) => void): this;

    prependOnceListener(event: 'spawn', listener: () => void): this;

    prependOnceListener(event: string, listener: (...args: any[]) => void): this {
        if (this.eventMap.has(event)) {
            this.eventMap.get(event).push(listener);
        } else {
            this.eventMap.set(event, [listener]);
        }
        return this;
    }

    trigger(event: string): Array<any> {
        if (this.eventMap.has(event)) {
            return this.eventMap.get(event);
        }
        return [];
    }

    kill(_signal?: NodeJS.Signals | number): boolean {
        this.stdout?.destroy();
        return true;
    }

    dispose(): void {
        this.stdout?.destroy();
    }
}
