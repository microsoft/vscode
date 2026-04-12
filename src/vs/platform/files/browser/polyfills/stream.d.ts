import { EventEmitter } from "./events.js";
export interface Readable extends EventEmitter {
    readable: boolean;
    readableEnded: boolean;
    readableFlowing: boolean | null;
    destroyed: boolean;
    closed: boolean;
    errored: Error | null;
    readableObjectMode: boolean;
    readableHighWaterMark: number;
    readableDidRead: boolean;
    readableAborted: boolean;
    _readableState: any;
    _read(size: number): void;
    _destroy(err: Error | null, cb: (err?: Error | null) => void): void;
    readonly readableLength: number;
    readonly readableEncoding: BufferEncoding | null;
    _rawBind(evt: string | symbol, fn: (...args: unknown[]) => void): this;
    on(evt: string | symbol, fn: (...args: any[]) => void): this;
    addListener(evt: string | symbol, fn: (...args: any[]) => void): this;
    once(evt: string | symbol, fn: (...args: any[]) => void): this;
    push(chunk: any): boolean;
    unshift(chunk: any): void;
    read(amount?: number): any;
    resume(): this;
    pause(): this;
    isPaused(): boolean;
    pipe(target: any): any;
    unpipe(target?: any): this;
    setEncoding(enc: string): this;
    close(cb?: (err?: Error | null) => void): void;
    destroy(fault?: Error): this;
    wrap(oldStream: EventEmitter): this;
    [Symbol.asyncIterator](): AsyncIterableIterator<unknown>;
}
interface ReadableConstructor {
    new(opts?: any): Readable;
    (this: any, opts?: any): void;
    prototype: any;
    toWeb(readable: Readable): ReadableStream<Uint8Array>;
    fromWeb(webStream: ReadableStream, opts?: any): Readable;
    from(source: Iterable<unknown> | AsyncIterable<unknown>, opts?: any): Readable;
}
export declare const Readable: ReadableConstructor;
export interface Writable extends EventEmitter {
    writable: boolean;
    writableEnded: boolean;
    writableFinished: boolean;
    writableNeedDrain: boolean;
    destroyed: boolean;
    closed: boolean;
    errored: Error | null;
    writableObjectMode: boolean;
    writableHighWaterMark: number;
    writableCorked: number;
    _writableState: any;
    _write(chunk: any, encoding: string, callback: (err?: Error | null) => void): void;
    _writev?(chunks: Array<{
        chunk: any;
        encoding: string;
    }>, callback: (err?: Error | null) => void): void;
    _final(callback: (err?: Error | null) => void): void;
    _destroy(err: Error | null, cb: (err?: Error | null) => void): void;
    readonly writableLength: number;
    write(chunk: any, encOrCb?: any, cb?: any): boolean;
    end(chunkOrCb?: any, encOrCb?: any, cb?: any): this;
    getBuffer(): Buffer;
    getBufferAsString(enc?: BufferEncoding): string;
    close(cb?: (err?: Error | null) => void): void;
    destroy(fault?: Error): this;
    cork(): void;
    uncork(): void;
    setDefaultEncoding(enc: string): this;
}
interface WritableConstructor {
    new(opts?: any): Writable;
    (this: any, opts?: any): void;
    prototype: any;
    toWeb(writable: Writable): WritableStream<Uint8Array>;
    fromWeb(webStream: WritableStream, opts?: any): Writable;
}
export declare const Writable: WritableConstructor;
export interface Duplex extends Readable {
    writable: boolean;
    writableEnded: boolean;
    writableFinished: boolean;
    writableNeedDrain: boolean;
    writableObjectMode: boolean;
    writableHighWaterMark: number;
    writableCorked: number;
    allowHalfOpen: boolean;
    _writableState: any;
    _write(chunk: any, encoding: string, callback: (err?: Error | null) => void): void;
    _writev?(chunks: Array<{
        chunk: any;
        encoding: string;
    }>, callback: (err?: Error | null) => void): void;
    _final(callback: (err?: Error | null) => void): void;
    readonly writableLength: number;
    write(chunk: any, encOrCb?: any, cb?: any): boolean;
    end(chunkOrCb?: any, encOrCb?: any, cb?: any): this;
    cork(): void;
    uncork(): void;
    setDefaultEncoding(enc: string): this;
}
interface DuplexConstructor {
    new(opts?: any): Duplex;
    (this: any, opts?: any): void;
    prototype: any;
    from(source: any, opts?: any): Duplex;
    toWeb(duplex: any): any;
    fromWeb(source: any, opts?: any): any;
}
export declare const Duplex: DuplexConstructor;
export interface PassThrough extends Duplex {
}
interface PassThroughConstructor {
    new(opts?: any): PassThrough;
    (this: any, opts?: any): void;
    prototype: any;
}
export declare const PassThrough: PassThroughConstructor;
export interface Transform extends Duplex {
    _transform(chunk: any, encoding: string, done: (err?: Error | null, output?: any) => void): void;
    _flush(done: (err?: Error | null, output?: any) => void): void;
}
interface TransformConstructor {
    new(opts?: any): Transform;
    (this: any, opts?: any): void;
    prototype: any;
}
export declare const Transform: TransformConstructor;
export interface Stream extends EventEmitter {
    pipe(dest: any): any;
}
interface StreamConstructor {
    new(): Stream;
    (this: any): void;
    prototype: any;
}
export declare const Stream: StreamConstructor;
export declare function addAbortSignal(signal: AbortSignal, stream: any): any;
export declare function pipeline(...args: unknown[]): unknown;
export declare function finished(stream: unknown, optsOrCb?: {
    error?: boolean;
} | ((err?: Error) => void), cb?: (err?: Error) => void): () => void;
export declare function getDefaultHighWaterMark(objectMode?: boolean): number;
export declare function setDefaultHighWaterMark(objectMode: boolean, value: number): void;
export declare const promises: {
    pipeline: (...streams: unknown[]) => Promise<void>;
    finished: (stream: unknown, opts?: {
        error?: boolean;
    }) => Promise<void>;
};
export declare function compose(..._streams: unknown[]): Duplex;
export declare function isReadable(stream: unknown): boolean;
export declare function isWritable(stream: unknown): boolean;
export declare function isDisturbed(stream: unknown): boolean;
export declare function isErrored(stream: unknown): boolean;
export default Stream;
