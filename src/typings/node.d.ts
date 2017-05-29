// Type definitions for Node.js v6.x
// Project: http://nodejs.org/
// Definitions by: Microsoft TypeScript <http://typescriptlang.org>, DefinitelyTyped <https://github.com/DefinitelyTyped/DefinitelyTyped>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped

/************************************************
*                                               *
*               Node.js v6.x API                *
*                                               *
************************************************/

// This needs to be global to avoid TS2403 in case lib.dom.d.ts is present in the same build
interface Console {
    Console: typeof NodeJS.Console;
    assert(value: any, message?: string, ...optionalParams: any[]): void;
    dir(obj: any, options?: { showHidden?: boolean, depth?: number, colors?: boolean }): void;
    error(message?: any, ...optionalParams: any[]): void;
    info(message?: any, ...optionalParams: any[]): void;
    log(message?: any, ...optionalParams: any[]): void;
    time(label: string): void;
    timeEnd(label: string): void;
    trace(message?: any, ...optionalParams: any[]): void;
    warn(message?: any, ...optionalParams: any[]): void;
}

interface Error {
    stack?: string;
}

interface ErrorConstructor {
    captureStackTrace(targetObject: Object, constructorOpt?: Function): void;
    stackTraceLimit: number;
}

// compat for TypeScript 1.8
// if you use with --target es3 or --target es5 and use below definitions,
// use the lib.es6.d.ts that is bundled with TypeScript 1.8.
interface MapConstructor { }
interface WeakMapConstructor { }
interface SetConstructor { }
interface WeakSetConstructor { }

/************************************************
*                                               *
*                   GLOBAL                      *
*                                               *
************************************************/
declare var process: NodeJS.Process;
declare var global: any;
declare var console: Console;

// Don't use these!! :)
// declare var __filename: string;
// declare var __dirname: string;

// declare function setTimeout(callback: (...args: any[]) => void, ms: number, ...args: any[]): NodeJS.Timer;
// declare function clearTimeout(timeoutId: NodeJS.Timer): void;
// declare function setInterval(callback: (...args: any[]) => void, ms: number, ...args: any[]): NodeJS.Timer;
// declare function clearInterval(intervalId: NodeJS.Timer): void;
declare function setImmediate(callback: (...args: any[]) => void, ...args: any[]): any;
declare function clearImmediate(immediateId: any): void;

interface NodeRequireFunction {
    (id: string): any;
}

// interface NodeRequire extends NodeRequireFunction {
//     resolve(id: string): string;
//     cache: any;
//     extensions: any;
//     main: NodeModule | undefined;
// }

// declare var require: NodeRequire;

interface NodeModule {
    exports: any;
    require: NodeRequireFunction;
    id: string;
    filename: string;
    loaded: boolean;
    parent: NodeModule | null;
    children: NodeModule[];
}

// declare var module: NodeModule;

// Same as module.exports
declare var exports: any;
declare var SlowBuffer: {
    new (str: string, encoding?: string): Buffer;
    new (size: number): Buffer;
    new (size: Uint8Array): Buffer;
    new (array: any[]): Buffer;
    prototype: Buffer;
    isBuffer(obj: any): boolean;
    byteLength(string: string, encoding?: string): number;
    concat(list: Buffer[], totalLength?: number): Buffer;
};


// Buffer class
type BufferEncoding = "ascii" | "utf8" | "utf16le" | "ucs2" | "binary" | "hex";
interface Buffer extends NodeBuffer { }

/**
 * Raw data is stored in instances of the Buffer class.
 * A Buffer is similar to an array of integers but corresponds to a raw memory allocation outside the V8 heap.  A Buffer cannot be resized.
 * Valid string encodings: 'ascii'|'utf8'|'utf16le'|'ucs2'(alias of 'utf16le')|'base64'|'binary'(deprecated)|'hex'
 */
declare var Buffer: {
    /**
     * Allocates a new buffer containing the given {str}.
     *
     * @param str String to store in buffer.
     * @param encoding encoding to use, optional.  Default is 'utf8'
     */
    new (str: string, encoding?: string): Buffer;
    /**
     * Allocates a new buffer of {size} octets.
     *
     * @param size count of octets to allocate.
     */
    new (size: number): Buffer;
    /**
     * Allocates a new buffer containing the given {array} of octets.
     *
     * @param array The octets to store.
     */
    new (array: Uint8Array): Buffer;
    /**
     * Produces a Buffer backed by the same allocated memory as
     * the given {ArrayBuffer}.
     *
     *
     * @param arrayBuffer The ArrayBuffer with which to share memory.
     */
    new (arrayBuffer: ArrayBuffer): Buffer;
    /**
     * Allocates a new buffer containing the given {array} of octets.
     *
     * @param array The octets to store.
     */
    new (array: any[]): Buffer;
    /**
     * Copies the passed {buffer} data onto a new {Buffer} instance.
     *
     * @param buffer The buffer to copy.
     */
    new (buffer: Buffer): Buffer;
    prototype: Buffer;
    /**
     * Allocates a new Buffer using an {array} of octets.
     *
     * @param array
     */
    from(array: any[]): Buffer;
    /**
     * When passed a reference to the .buffer property of a TypedArray instance,
     * the newly created Buffer will share the same allocated memory as the TypedArray.
     * The optional {byteOffset} and {length} arguments specify a memory range
     * within the {arrayBuffer} that will be shared by the Buffer.
     *
     * @param arrayBuffer The .buffer property of a TypedArray or a new ArrayBuffer()
     * @param byteOffset
     * @param length
     */
    from(arrayBuffer: ArrayBuffer, byteOffset?: number, length?: number): Buffer;
    /**
     * Copies the passed {buffer} data onto a new Buffer instance.
     *
     * @param buffer
     */
    from(buffer: Buffer): Buffer;
    /**
     * Creates a new Buffer containing the given JavaScript string {str}.
     * If provided, the {encoding} parameter identifies the character encoding.
     * If not provided, {encoding} defaults to 'utf8'.
     *
     * @param str
     */
    from(str: string, encoding?: string): Buffer;
    /**
     * Returns true if {obj} is a Buffer
     *
     * @param obj object to test.
     */
    isBuffer(obj: any): obj is Buffer;
    /**
     * Returns true if {encoding} is a valid encoding argument.
     * Valid string encodings in Node 0.12: 'ascii'|'utf8'|'utf16le'|'ucs2'(alias of 'utf16le')|'base64'|'binary'(deprecated)|'hex'
     *
     * @param encoding string to test.
     */
    isEncoding(encoding: string): boolean;
    /**
     * Gives the actual byte length of a string. encoding defaults to 'utf8'.
     * This is not the same as String.prototype.length since that returns the number of characters in a string.
     *
     * @param string string to test.
     * @param encoding encoding used to evaluate (defaults to 'utf8')
     */
    byteLength(string: string, encoding?: string): number;
    /**
     * Returns a buffer which is the result of concatenating all the buffers in the list together.
     *
     * If the list has no items, or if the totalLength is 0, then it returns a zero-length buffer.
     * If the list has exactly one item, then the first item of the list is returned.
     * If the list has more than one item, then a new Buffer is created.
     *
     * @param list An array of Buffer objects to concatenate
     * @param totalLength Total length of the buffers when concatenated.
     *   If totalLength is not provided, it is read from the buffers in the list. However, this adds an additional loop to the function, so it is faster to provide the length explicitly.
     */
    concat(list: Buffer[], totalLength?: number): Buffer;
    /**
     * The same as buf1.compare(buf2).
     */
    compare(buf1: Buffer, buf2: Buffer): number;
    /**
     * Allocates a new buffer of {size} octets.
     *
     * @param size count of octets to allocate.
     * @param fill if specified, buffer will be initialized by calling buf.fill(fill).
     *    If parameter is omitted, buffer will be filled with zeros.
     * @param encoding encoding used for call to buf.fill while initalizing
     */
    alloc(size: number, fill?: string | Buffer | number, encoding?: string): Buffer;
    /**
     * Allocates a new buffer of {size} octets, leaving memory not initialized, so the contents
     * of the newly created Buffer are unknown and may contain sensitive data.
     *
     * @param size count of octets to allocate
     */
    allocUnsafe(size: number): Buffer;
    /**
     * Allocates a new non-pooled buffer of {size} octets, leaving memory not initialized, so the contents
     * of the newly created Buffer are unknown and may contain sensitive data.
     *
     * @param size count of octets to allocate
     */
    allocUnsafeSlow(size: number): Buffer;
};

/************************************************
*                                               *
*               GLOBAL INTERFACES               *
*                                               *
************************************************/
declare namespace NodeJS {
    export var Console: {
        prototype: Console;
        new (stdout: WritableStream, stderr?: WritableStream): Console;
    }

    export interface ErrnoException extends Error {
        errno?: number;
        code?: string;
        path?: string;
        syscall?: string;
        stack?: string;
    }

    export class EventEmitter {
        addListener(event: string | symbol, listener: Function): this;
        on(event: string | symbol, listener: Function): this;
        once(event: string | symbol, listener: Function): this;
        removeListener(event: string | symbol, listener: Function): this;
        removeAllListeners(event?: string | symbol): this;
        setMaxListeners(n: number): this;
        getMaxListeners(): number;
        listeners(event: string | symbol): Function[];
        emit(event: string | symbol, ...args: any[]): boolean;
        listenerCount(type: string | symbol): number;
        // Added in Node 6...
        prependListener(event: string | symbol, listener: Function): this;
        prependOnceListener(event: string | symbol, listener: Function): this;
        eventNames(): (string | symbol)[];
    }

    export interface ReadableStream extends EventEmitter {
        readable: boolean;
        isTTY?: boolean;
        read(size?: number): string | Buffer;
        setEncoding(encoding: string | null): void;
        pause(): ReadableStream;
        resume(): ReadableStream;
        isPaused(): boolean;
        pipe<T extends WritableStream>(destination: T, options?: { end?: boolean; }): T;
        unpipe<T extends WritableStream>(destination?: T): void;
        unshift(chunk: string): void;
        unshift(chunk: Buffer): void;
        wrap(oldStream: ReadableStream): ReadableStream;
    }

    export interface WritableStream extends EventEmitter {
        writable: boolean;
        isTTY?: boolean;
        write(buffer: Buffer | string, cb?: Function): boolean;
        write(str: string, encoding?: string, cb?: Function): boolean;
        end(): void;
        end(buffer: Buffer, cb?: Function): void;
        end(str: string, cb?: Function): void;
        end(str: string, encoding?: string, cb?: Function): void;
    }

    export interface ReadWriteStream extends ReadableStream, WritableStream {
        pause(): ReadWriteStream;
        resume(): ReadWriteStream;
    }

    export interface Events extends EventEmitter { }

    export interface Domain extends Events {
        run(fn: Function): void;
        add(emitter: Events): void;
        remove(emitter: Events): void;
        bind(cb: (err: Error, data: any) => any): any;
        intercept(cb: (data: any) => any): any;
        dispose(): void;

        addListener(event: string, listener: Function): this;
        on(event: string, listener: Function): this;
        once(event: string, listener: Function): this;
        removeListener(event: string, listener: Function): this;
        removeAllListeners(event?: string): this;
    }

    export interface MemoryUsage {
        rss: number;
        heapTotal: number;
        heapUsed: number;
    }

    export interface CpuUsage {
        user: number;
        system: number;
    }

    export interface ProcessVersions {
        http_parser: string;
        node: string;
        v8: string;
        ares: string;
        uv: string;
        zlib: string;
        modules: string;
        openssl: string;
    }

    type Platform = 'aix'
        | 'android'
        | 'darwin'
        | 'freebsd'
        | 'linux'
        | 'openbsd'
        | 'sunos'
        | 'win32';

    export interface Process extends EventEmitter {
        stdout: WritableStream;
        stderr: WritableStream;
        stdin: ReadableStream;
        argv: string[];
        argv0: string;
        execArgv: string[];
        execPath: string;
        abort(): void;
        chdir(directory: string): void;
        cwd(): string;
        env: any;
        exit(code?: number): void;
        exitCode: number;
        getgid(): number;
        setgid(id: number): void;
        setgid(id: string): void;
        getuid(): number;
        setuid(id: number): void;
        setuid(id: string): void;
        version: string;
        versions: ProcessVersions;
        config: {
            target_defaults: {
                cflags: any[];
                default_configuration: string;
                defines: string[];
                include_dirs: string[];
                libraries: string[];
            };
            variables: {
                clang: number;
                host_arch: string;
                node_install_npm: boolean;
                node_install_waf: boolean;
                node_prefix: string;
                node_shared_openssl: boolean;
                node_shared_v8: boolean;
                node_shared_zlib: boolean;
                node_use_dtrace: boolean;
                node_use_etw: boolean;
                node_use_openssl: boolean;
                target_arch: string;
                v8_no_strict_aliasing: number;
                v8_use_snapshot: boolean;
                visibility: string;
            };
        };
        kill(pid: number, signal?: string | number): void;
        pid: number;
        title: string;
        arch: string;
        platform: Platform;
        mainModule?: NodeModule;
        memoryUsage(): MemoryUsage;
        cpuUsage(previousValue?: CpuUsage): CpuUsage;
        nextTick(callback: Function, ...args: any[]): void;
        umask(mask?: number): number;
        uptime(): number;
        hrtime(time?: [number, number]): [number, number];
        domain: Domain;

        // Worker
        send?(message: any, sendHandle?: any): void;
        disconnect(): void;
        connected: boolean;
    }

    export interface Global {
        Array: typeof Array;
        ArrayBuffer: typeof ArrayBuffer;
        Boolean: typeof Boolean;
        Buffer: typeof Buffer;
        DataView: typeof DataView;
        Date: typeof Date;
        Error: typeof Error;
        EvalError: typeof EvalError;
        Float32Array: typeof Float32Array;
        Float64Array: typeof Float64Array;
        Function: typeof Function;
        GLOBAL: Global;
        Infinity: typeof Infinity;
        Int16Array: typeof Int16Array;
        Int32Array: typeof Int32Array;
        Int8Array: typeof Int8Array;
        Intl: typeof Intl;
        JSON: typeof JSON;
        Map: MapConstructor;
        Math: typeof Math;
        NaN: typeof NaN;
        Number: typeof Number;
        Object: typeof Object;
        Promise: Function;
        RangeError: typeof RangeError;
        ReferenceError: typeof ReferenceError;
        RegExp: typeof RegExp;
        Set: SetConstructor;
        String: typeof String;
        Symbol: Function;
        SyntaxError: typeof SyntaxError;
        TypeError: typeof TypeError;
        URIError: typeof URIError;
        Uint16Array: typeof Uint16Array;
        Uint32Array: typeof Uint32Array;
        Uint8Array: typeof Uint8Array;
        Uint8ClampedArray: Function;
        WeakMap: WeakMapConstructor;
        WeakSet: WeakSetConstructor;
        clearImmediate: (immediateId: any) => void;
        clearInterval: (intervalId: NodeJS.Timer) => void;
        clearTimeout: (timeoutId: NodeJS.Timer) => void;
        console: typeof console;
        decodeURI: typeof decodeURI;
        decodeURIComponent: typeof decodeURIComponent;
        encodeURI: typeof encodeURI;
        encodeURIComponent: typeof encodeURIComponent;
        escape: (str: string) => string;
        eval: typeof eval;
        global: Global;
        isFinite: typeof isFinite;
        isNaN: typeof isNaN;
        parseFloat: typeof parseFloat;
        parseInt: typeof parseInt;
        process: Process;
        root: Global;
        setImmediate: (callback: (...args: any[]) => void, ...args: any[]) => any;
        setInterval: (callback: (...args: any[]) => void, ms: number, ...args: any[]) => NodeJS.Timer;
        setTimeout: (callback: (...args: any[]) => void, ms: number, ...args: any[]) => NodeJS.Timer;
        undefined: typeof undefined;
        unescape: (str: string) => string;
        gc: () => void;
        v8debug?: any;
    }

    export interface Timer {
        ref(): void;
        unref(): void;
    }
}

interface IterableIterator<T> { }

/**
 * @deprecated
 */
interface NodeBuffer extends Uint8Array {
    write(string: string, offset?: number, length?: number, encoding?: string): number;
    toString(encoding?: string, start?: number, end?: number): string;
    toJSON(): { type: 'Buffer', data: any[] };
    equals(otherBuffer: Buffer): boolean;
    compare(otherBuffer: Buffer, targetStart?: number, targetEnd?: number, sourceStart?: number, sourceEnd?: number): number;
    copy(targetBuffer: Buffer, targetStart?: number, sourceStart?: number, sourceEnd?: number): number;
    slice(start?: number, end?: number): Buffer;
    writeUIntLE(value: number, offset: number, byteLength: number, noAssert?: boolean): number;
    writeUIntBE(value: number, offset: number, byteLength: number, noAssert?: boolean): number;
    writeIntLE(value: number, offset: number, byteLength: number, noAssert?: boolean): number;
    writeIntBE(value: number, offset: number, byteLength: number, noAssert?: boolean): number;
    readUIntLE(offset: number, byteLength: number, noAssert?: boolean): number;
    readUIntBE(offset: number, byteLength: number, noAssert?: boolean): number;
    readIntLE(offset: number, byteLength: number, noAssert?: boolean): number;
    readIntBE(offset: number, byteLength: number, noAssert?: boolean): number;
    readUInt8(offset: number, noAssert?: boolean): number;
    readUInt16LE(offset: number, noAssert?: boolean): number;
    readUInt16BE(offset: number, noAssert?: boolean): number;
    readUInt32LE(offset: number, noAssert?: boolean): number;
    readUInt32BE(offset: number, noAssert?: boolean): number;
    readInt8(offset: number, noAssert?: boolean): number;
    readInt16LE(offset: number, noAssert?: boolean): number;
    readInt16BE(offset: number, noAssert?: boolean): number;
    readInt32LE(offset: number, noAssert?: boolean): number;
    readInt32BE(offset: number, noAssert?: boolean): number;
    readFloatLE(offset: number, noAssert?: boolean): number;
    readFloatBE(offset: number, noAssert?: boolean): number;
    readDoubleLE(offset: number, noAssert?: boolean): number;
    readDoubleBE(offset: number, noAssert?: boolean): number;
    swap16(): Buffer;
    swap32(): Buffer;
    swap64(): Buffer;
    writeUInt8(value: number, offset: number, noAssert?: boolean): number;
    writeUInt16LE(value: number, offset: number, noAssert?: boolean): number;
    writeUInt16BE(value: number, offset: number, noAssert?: boolean): number;
    writeUInt32LE(value: number, offset: number, noAssert?: boolean): number;
    writeUInt32BE(value: number, offset: number, noAssert?: boolean): number;
    writeInt8(value: number, offset: number, noAssert?: boolean): number;
    writeInt16LE(value: number, offset: number, noAssert?: boolean): number;
    writeInt16BE(value: number, offset: number, noAssert?: boolean): number;
    writeInt32LE(value: number, offset: number, noAssert?: boolean): number;
    writeInt32BE(value: number, offset: number, noAssert?: boolean): number;
    writeFloatLE(value: number, offset: number, noAssert?: boolean): number;
    writeFloatBE(value: number, offset: number, noAssert?: boolean): number;
    writeDoubleLE(value: number, offset: number, noAssert?: boolean): number;
    writeDoubleBE(value: number, offset: number, noAssert?: boolean): number;
    fill(value: any, offset?: number, end?: number): this;
    indexOf(value: string | number | Buffer, byteOffset?: number, encoding?: string): number;
    lastIndexOf(value: string | number | Buffer, byteOffset?: number, encoding?: string): number;
    entries(): IterableIterator<[number, number]>;
    includes(value: string | number | Buffer, byteOffset?: number, encoding?: string): boolean;
    keys(): IterableIterator<number>;
    values(): IterableIterator<number>;
}

/************************************************
*                                               *
*                   MODULES                     *
*                                               *
************************************************/
declare module "buffer" {
    export var INSPECT_MAX_BYTES: number;
    var BuffType: typeof Buffer;
    var SlowBuffType: typeof SlowBuffer;
    export { BuffType as Buffer, SlowBuffType as SlowBuffer };
}

declare module "querystring" {
    export interface StringifyOptions {
        encodeURIComponent?: Function;
    }

    export interface ParseOptions {
        maxKeys?: number;
        decodeURIComponent?: Function;
    }

    export function stringify<T>(obj: T, sep?: string, eq?: string, options?: StringifyOptions): string;
    export function parse(str: string, sep?: string, eq?: string, options?: ParseOptions): any;
    export function parse<T extends {}>(str: string, sep?: string, eq?: string, options?: ParseOptions): T;
    export function escape(str: string): string;
    export function unescape(str: string): string;
}

declare module "events" {
    class internal extends NodeJS.EventEmitter { }

    namespace internal {
        export class EventEmitter extends internal {
            static listenerCount(emitter: EventEmitter, event: string | symbol): number; // deprecated
            static defaultMaxListeners: number;

            addListener(event: string | symbol, listener: Function): this;
            on(event: string | symbol, listener: Function): this;
            once(event: string | symbol, listener: Function): this;
            prependListener(event: string | symbol, listener: Function): this;
            prependOnceListener(event: string | symbol, listener: Function): this;
            removeListener(event: string | symbol, listener: Function): this;
            removeAllListeners(event?: string | symbol): this;
            setMaxListeners(n: number): this;
            getMaxListeners(): number;
            listeners(event: string | symbol): Function[];
            emit(event: string | symbol, ...args: any[]): boolean;
            eventNames(): (string | symbol)[];
            listenerCount(type: string | symbol): number;
        }
    }

    export = internal;
}

declare module "http" {
    import * as events from "events";
    import * as net from "net";
    import * as stream from "stream";

    export interface RequestOptions {
        protocol?: string;
        host?: string;
        hostname?: string;
        family?: number;
        port?: number;
        localAddress?: string;
        socketPath?: string;
        method?: string;
        path?: string;
        headers?: { [key: string]: any };
        auth?: string;
        agent?: Agent | boolean;
    }

    export interface Server extends net.Server {
        setTimeout(msecs: number, callback: Function): void;
        maxHeadersCount: number;
        timeout: number;
        listening: boolean;
    }
    /**
     * @deprecated Use IncomingMessage
     */
    export interface ServerRequest extends IncomingMessage {
        connection: net.Socket;
    }
    export interface ServerResponse extends stream.Writable {
        // Extended base methods
        write(buffer: Buffer): boolean;
        write(buffer: Buffer, cb?: Function): boolean;
        write(str: string, cb?: Function): boolean;
        write(str: string, encoding?: string, cb?: Function): boolean;
        write(str: string, encoding?: string, fd?: string): boolean;

        writeContinue(): void;
        writeHead(statusCode: number, reasonPhrase?: string, headers?: any): void;
        writeHead(statusCode: number, headers?: any): void;
        statusCode: number;
        statusMessage: string;
        headersSent: boolean;
        setHeader(name: string, value: string | string[]): void;
        setTimeout(msecs: number, callback: Function): ServerResponse;
        sendDate: boolean;
        getHeader(name: string): string;
        removeHeader(name: string): void;
        write(chunk: any, encoding?: string): any;
        addTrailers(headers: any): void;
        finished: boolean;

        // Extended base methods
        end(): void;
        end(buffer: Buffer, cb?: Function): void;
        end(str: string, cb?: Function): void;
        end(str: string, encoding?: string, cb?: Function): void;
        end(data?: any, encoding?: string): void;
    }
    export interface ClientRequest extends stream.Writable {
        // Extended base methods
        write(buffer: Buffer): boolean;
        write(buffer: Buffer, cb?: Function): boolean;
        write(str: string, cb?: Function): boolean;
        write(str: string, encoding?: string, cb?: Function): boolean;
        write(str: string, encoding?: string, fd?: string): boolean;

        write(chunk: any, encoding?: string): void;
        abort(): void;
        setTimeout(timeout: number, callback?: Function): void;
        setNoDelay(noDelay?: boolean): void;
        setSocketKeepAlive(enable?: boolean, initialDelay?: number): void;

        setHeader(name: string, value: string | string[]): void;
        getHeader(name: string): string;
        removeHeader(name: string): void;
        addTrailers(headers: any): void;

        // Extended base methods
        end(): void;
        end(buffer: Buffer, cb?: Function): void;
        end(str: string, cb?: Function): void;
        end(str: string, encoding?: string, cb?: Function): void;
        end(data?: any, encoding?: string): void;
    }
    export interface IncomingMessage extends stream.Readable {
        httpVersion: string;
        httpVersionMajor: number;
        httpVersionMinor: number;
        connection: net.Socket;
        headers: any;
        rawHeaders: string[];
        trailers: any;
        rawTrailers: any;
        setTimeout(msecs: number, callback: Function): NodeJS.Timer;
        /**
         * Only valid for request obtained from http.Server.
         */
        method?: string;
        /**
         * Only valid for request obtained from http.Server.
         */
        url?: string;
        /**
         * Only valid for response obtained from http.ClientRequest.
         */
        statusCode?: number;
        /**
         * Only valid for response obtained from http.ClientRequest.
         */
        statusMessage?: string;
        socket: net.Socket;
        destroy(error?: Error): void;
    }
    /**
     * @deprecated Use IncomingMessage
     */
    export interface ClientResponse extends IncomingMessage { }

    export interface AgentOptions {
        /**
         * Keep sockets around in a pool to be used by other requests in the future. Default = false
         */
        keepAlive?: boolean;
        /**
         * When using HTTP KeepAlive, how often to send TCP KeepAlive packets over sockets being kept alive. Default = 1000.
         * Only relevant if keepAlive is set to true.
         */
        keepAliveMsecs?: number;
        /**
         * Maximum number of sockets to allow per host. Default for Node 0.10 is 5, default for Node 0.12 is Infinity
         */
        maxSockets?: number;
        /**
         * Maximum number of sockets to leave open in a free state. Only relevant if keepAlive is set to true. Default = 256.
         */
        maxFreeSockets?: number;
    }

    export class Agent {
        maxSockets: number;
        sockets: any;
        requests: any;

        constructor(opts?: AgentOptions);

        /**
         * Destroy any sockets that are currently in use by the agent.
         * It is usually not necessary to do this. However, if you are using an agent with KeepAlive enabled,
         * then it is best to explicitly shut down the agent when you know that it will no longer be used. Otherwise,
         * sockets may hang open for quite a long time before the server terminates them.
         */
        destroy(): void;
    }

    export var METHODS: string[];

    export var STATUS_CODES: {
        [errorCode: number]: string;
        [errorCode: string]: string;
    };
    export function createServer(requestListener?: (request: IncomingMessage, response: ServerResponse) => void): Server;
    export function createClient(port?: number, host?: string): any;
    export function request(options: RequestOptions, callback?: (res: IncomingMessage) => void): ClientRequest;
    export function get(options: any, callback?: (res: IncomingMessage) => void): ClientRequest;
    export var globalAgent: Agent;
}

declare module "cluster" {
    import * as child from "child_process";
    import * as events from "events";
    import * as net from "net";

    // interfaces
    export interface ClusterSettings {
        execArgv?: string[]; // default: process.execArgv
        exec?: string;
        args?: string[];
        silent?: boolean;
        stdio?: any[];
        uid?: number;
        gid?: number;
    }

    export interface ClusterSetupMasterSettings {
        exec?: string;  // default: process.argv[1]
        args?: string[];  // default: process.argv.slice(2)
        silent?: boolean;  // default: false
        stdio?: any[];
    }

    export interface Address {
        address: string;
        port: number;
        addressType: number | "udp4" | "udp6";  // 4, 6, -1, "udp4", "udp6"
    }

    export class Worker extends events.EventEmitter {
        id: string;
        process: child.ChildProcess;
        suicide: boolean;
        send(message: any, sendHandle?: any): boolean;
        kill(signal?: string): void;
        destroy(signal?: string): void;
        disconnect(): void;
        isConnected(): boolean;
        isDead(): boolean;
        exitedAfterDisconnect: boolean;

        /**
         * events.EventEmitter
         *   1. disconnect
         *   2. error
         *   3. exit
         *   4. listening
         *   5. message
         *   6. online
         */
        addListener(event: string, listener: Function): this;
        addListener(event: "disconnect", listener: () => void): this;
        addListener(event: "error", listener: (code: number, signal: string) => void): this;
        addListener(event: "exit", listener: (code: number, signal: string) => void): this;
        addListener(event: "listening", listener: (address: Address) => void): this;
        addListener(event: "message", listener: (message: any, handle: net.Socket | net.Server) => void): this;  // the handle is a net.Socket or net.Server object, or undefined.
        addListener(event: "online", listener: () => void): this;

        emit(event: string, listener: Function): boolean
        emit(event: "disconnect", listener: () => void): boolean
        emit(event: "error", listener: (code: number, signal: string) => void): boolean
        emit(event: "exit", listener: (code: number, signal: string) => void): boolean
        emit(event: "listening", listener: (address: Address) => void): boolean
        emit(event: "message", listener: (message: any, handle: net.Socket | net.Server) => void): boolean
        emit(event: "online", listener: () => void): boolean

        on(event: string, listener: Function): this;
        on(event: "disconnect", listener: () => void): this;
        on(event: "error", listener: (code: number, signal: string) => void): this;
        on(event: "exit", listener: (code: number, signal: string) => void): this;
        on(event: "listening", listener: (address: Address) => void): this;
        on(event: "message", listener: (message: any, handle: net.Socket | net.Server) => void): this;  // the handle is a net.Socket or net.Server object, or undefined.
        on(event: "online", listener: () => void): this;

        once(event: string, listener: Function): this;
        once(event: "disconnect", listener: () => void): this;
        once(event: "error", listener: (code: number, signal: string) => void): this;
        once(event: "exit", listener: (code: number, signal: string) => void): this;
        once(event: "listening", listener: (address: Address) => void): this;
        once(event: "message", listener: (message: any, handle: net.Socket | net.Server) => void): this;  // the handle is a net.Socket or net.Server object, or undefined.
        once(event: "online", listener: () => void): this;

        prependListener(event: string, listener: Function): this;
        prependListener(event: "disconnect", listener: () => void): this;
        prependListener(event: "error", listener: (code: number, signal: string) => void): this;
        prependListener(event: "exit", listener: (code: number, signal: string) => void): this;
        prependListener(event: "listening", listener: (address: Address) => void): this;
        prependListener(event: "message", listener: (message: any, handle: net.Socket | net.Server) => void): this;  // the handle is a net.Socket or net.Server object, or undefined.
        prependListener(event: "online", listener: () => void): this;

        prependOnceListener(event: string, listener: Function): this;
        prependOnceListener(event: "disconnect", listener: () => void): this;
        prependOnceListener(event: "error", listener: (code: number, signal: string) => void): this;
        prependOnceListener(event: "exit", listener: (code: number, signal: string) => void): this;
        prependOnceListener(event: "listening", listener: (address: Address) => void): this;
        prependOnceListener(event: "message", listener: (message: any, handle: net.Socket | net.Server) => void): this;  // the handle is a net.Socket or net.Server object, or undefined.
        prependOnceListener(event: "online", listener: () => void): this;
    }

    export interface Cluster extends events.EventEmitter {
        Worker: Worker;
        disconnect(callback?: Function): void;
        fork(env?: any): Worker;
        isMaster: boolean;
        isWorker: boolean;
        // TODO: cluster.schedulingPolicy
        settings: ClusterSettings;
        setupMaster(settings?: ClusterSetupMasterSettings): void;
        worker: Worker;
        workers: {
            [index: string]: Worker
        };

        /**
         * events.EventEmitter
         *   1. disconnect
         *   2. exit
         *   3. fork
         *   4. listening
         *   5. message
         *   6. online
         *   7. setup
         */
        addListener(event: string, listener: Function): this;
        addListener(event: "disconnect", listener: (worker: Worker) => void): this;
        addListener(event: "exit", listener: (worker: Worker, code: number, signal: string) => void): this;
        addListener(event: "fork", listener: (worker: Worker) => void): this;
        addListener(event: "listening", listener: (worker: Worker, address: Address) => void): this;
        addListener(event: "message", listener: (worker: Worker, message: any, handle: net.Socket | net.Server) => void): this;  // the handle is a net.Socket or net.Server object, or undefined.
        addListener(event: "online", listener: (worker: Worker) => void): this;
        addListener(event: "setup", listener: (settings: any) => void): this;

        emit(event: string, listener: Function): boolean;
        emit(event: "disconnect", listener: (worker: Worker) => void): boolean;
        emit(event: "exit", listener: (worker: Worker, code: number, signal: string) => void): boolean;
        emit(event: "fork", listener: (worker: Worker) => void): boolean;
        emit(event: "listening", listener: (worker: Worker, address: Address) => void): boolean;
        emit(event: "message", listener: (worker: Worker, message: any, handle: net.Socket | net.Server) => void): boolean;
        emit(event: "online", listener: (worker: Worker) => void): boolean;
        emit(event: "setup", listener: (settings: any) => void): boolean;

        on(event: string, listener: Function): this;
        on(event: "disconnect", listener: (worker: Worker) => void): this;
        on(event: "exit", listener: (worker: Worker, code: number, signal: string) => void): this;
        on(event: "fork", listener: (worker: Worker) => void): this;
        on(event: "listening", listener: (worker: Worker, address: Address) => void): this;
        on(event: "message", listener: (worker: Worker, message: any, handle: net.Socket | net.Server) => void): this;  // the handle is a net.Socket or net.Server object, or undefined.
        on(event: "online", listener: (worker: Worker) => void): this;
        on(event: "setup", listener: (settings: any) => void): this;

        once(event: string, listener: Function): this;
        once(event: "disconnect", listener: (worker: Worker) => void): this;
        once(event: "exit", listener: (worker: Worker, code: number, signal: string) => void): this;
        once(event: "fork", listener: (worker: Worker) => void): this;
        once(event: "listening", listener: (worker: Worker, address: Address) => void): this;
        once(event: "message", listener: (worker: Worker, message: any, handle: net.Socket | net.Server) => void): this;  // the handle is a net.Socket or net.Server object, or undefined.
        once(event: "online", listener: (worker: Worker) => void): this;
        once(event: "setup", listener: (settings: any) => void): this;

        prependListener(event: string, listener: Function): this;
        prependListener(event: "disconnect", listener: (worker: Worker) => void): this;
        prependListener(event: "exit", listener: (worker: Worker, code: number, signal: string) => void): this;
        prependListener(event: "fork", listener: (worker: Worker) => void): this;
        prependListener(event: "listening", listener: (worker: Worker, address: Address) => void): this;
        prependListener(event: "message", listener: (worker: Worker, message: any, handle: net.Socket | net.Server) => void): this;  // the handle is a net.Socket or net.Server object, or undefined.
        prependListener(event: "online", listener: (worker: Worker) => void): this;
        prependListener(event: "setup", listener: (settings: any) => void): this;

        prependOnceListener(event: string, listener: Function): this;
        prependOnceListener(event: "disconnect", listener: (worker: Worker) => void): this;
        prependOnceListener(event: "exit", listener: (worker: Worker, code: number, signal: string) => void): this;
        prependOnceListener(event: "fork", listener: (worker: Worker) => void): this;
        prependOnceListener(event: "listening", listener: (worker: Worker, address: Address) => void): this;
        prependOnceListener(event: "message", listener: (worker: Worker, message: any, handle: net.Socket | net.Server) => void): this;  // the handle is a net.Socket or net.Server object, or undefined.
        prependOnceListener(event: "online", listener: (worker: Worker) => void): this;
        prependOnceListener(event: "setup", listener: (settings: any) => void): this;

    }

    export function disconnect(callback?: Function): void;
    export function fork(env?: any): Worker;
    export var isMaster: boolean;
    export var isWorker: boolean;
    // TODO: cluster.schedulingPolicy
    export var settings: ClusterSettings;
    export function setupMaster(settings?: ClusterSetupMasterSettings): void;
    export var worker: Worker;
    export var workers: {
        [index: string]: Worker
    };

    /**
     * events.EventEmitter
     *   1. disconnect
     *   2. exit
     *   3. fork
     *   4. listening
     *   5. message
     *   6. online
     *   7. setup
     */
    export function addListener(event: string, listener: Function): Cluster;
    export function addListener(event: "disconnect", listener: (worker: Worker) => void): Cluster;
    export function addListener(event: "exit", listener: (worker: Worker, code: number, signal: string) => void): Cluster;
    export function addListener(event: "fork", listener: (worker: Worker) => void): Cluster;
    export function addListener(event: "listening", listener: (worker: Worker, address: Address) => void): Cluster;
    export function addListener(event: "message", listener: (worker: Worker, message: any, handle: net.Socket | net.Server) => void): Cluster;  // the handle is a net.Socket or net.Server object, or undefined.
    export function addListener(event: "online", listener: (worker: Worker) => void): Cluster;
    export function addListener(event: "setup", listener: (settings: any) => void): Cluster;

    export function emit(event: string, listener: Function): boolean;
    export function emit(event: "disconnect", listener: (worker: Worker) => void): boolean;
    export function emit(event: "exit", listener: (worker: Worker, code: number, signal: string) => void): boolean;
    export function emit(event: "fork", listener: (worker: Worker) => void): boolean;
    export function emit(event: "listening", listener: (worker: Worker, address: Address) => void): boolean;
    export function emit(event: "message", listener: (worker: Worker, message: any, handle: net.Socket | net.Server) => void): boolean;
    export function emit(event: "online", listener: (worker: Worker) => void): boolean;
    export function emit(event: "setup", listener: (settings: any) => void): boolean;

    export function on(event: string, listener: Function): Cluster;
    export function on(event: "disconnect", listener: (worker: Worker) => void): Cluster;
    export function on(event: "exit", listener: (worker: Worker, code: number, signal: string) => void): Cluster;
    export function on(event: "fork", listener: (worker: Worker) => void): Cluster;
    export function on(event: "listening", listener: (worker: Worker, address: Address) => void): Cluster;
    export function on(event: "message", listener: (worker: Worker, message: any, handle: net.Socket | net.Server) => void): Cluster;  // the handle is a net.Socket or net.Server object, or undefined.
    export function on(event: "online", listener: (worker: Worker) => void): Cluster;
    export function on(event: "setup", listener: (settings: any) => void): Cluster;

    export function once(event: string, listener: Function): Cluster;
    export function once(event: "disconnect", listener: (worker: Worker) => void): Cluster;
    export function once(event: "exit", listener: (worker: Worker, code: number, signal: string) => void): Cluster;
    export function once(event: "fork", listener: (worker: Worker) => void): Cluster;
    export function once(event: "listening", listener: (worker: Worker, address: Address) => void): Cluster;
    export function once(event: "message", listener: (worker: Worker, message: any, handle: net.Socket | net.Server) => void): Cluster;  // the handle is a net.Socket or net.Server object, or undefined.
    export function once(event: "online", listener: (worker: Worker) => void): Cluster;
    export function once(event: "setup", listener: (settings: any) => void): Cluster;

    export function removeListener(event: string, listener: Function): Cluster;
    export function removeAllListeners(event?: string): Cluster;
    export function setMaxListeners(n: number): Cluster;
    export function getMaxListeners(): number;
    export function listeners(event: string): Function[];
    export function listenerCount(type: string): number;

    export function prependListener(event: string, listener: Function): Cluster;
    export function prependListener(event: "disconnect", listener: (worker: Worker) => void): Cluster;
    export function prependListener(event: "exit", listener: (worker: Worker, code: number, signal: string) => void): Cluster;
    export function prependListener(event: "fork", listener: (worker: Worker) => void): Cluster;
    export function prependListener(event: "listening", listener: (worker: Worker, address: Address) => void): Cluster;
    export function prependListener(event: "message", listener: (worker: Worker, message: any, handle: net.Socket | net.Server) => void): Cluster;  // the handle is a net.Socket or net.Server object, or undefined.
    export function prependListener(event: "online", listener: (worker: Worker) => void): Cluster;
    export function prependListener(event: "setup", listener: (settings: any) => void): Cluster;

    export function prependOnceListener(event: string, listener: Function): Cluster;
    export function prependOnceListener(event: "disconnect", listener: (worker: Worker) => void): Cluster;
    export function prependOnceListener(event: "exit", listener: (worker: Worker, code: number, signal: string) => void): Cluster;
    export function prependOnceListener(event: "fork", listener: (worker: Worker) => void): Cluster;
    export function prependOnceListener(event: "listening", listener: (worker: Worker, address: Address) => void): Cluster;
    export function prependOnceListener(event: "message", listener: (worker: Worker, message: any, handle: net.Socket | net.Server) => void): Cluster;  // the handle is a net.Socket or net.Server object, or undefined.
    export function prependOnceListener(event: "online", listener: (worker: Worker) => void): Cluster;
    export function prependOnceListener(event: "setup", listener: (settings: any) => void): Cluster;

    export function eventNames(): string[];
}

declare module "zlib" {
    import * as stream from "stream";
    export interface ZlibOptions { chunkSize?: number; windowBits?: number; level?: number; memLevel?: number; strategy?: number; dictionary?: any; finishFlush?: number }

    export interface Gzip extends stream.Transform { }
    export interface Gunzip extends stream.Transform { }
    export interface Deflate extends stream.Transform { }
    export interface Inflate extends stream.Transform { }
    export interface DeflateRaw extends stream.Transform { }
    export interface InflateRaw extends stream.Transform { }
    export interface Unzip extends stream.Transform { }

    export function createGzip(options?: ZlibOptions): Gzip;
    export function createGunzip(options?: ZlibOptions): Gunzip;
    export function createDeflate(options?: ZlibOptions): Deflate;
    export function createInflate(options?: ZlibOptions): Inflate;
    export function createDeflateRaw(options?: ZlibOptions): DeflateRaw;
    export function createInflateRaw(options?: ZlibOptions): InflateRaw;
    export function createUnzip(options?: ZlibOptions): Unzip;

    export function deflate(buf: Buffer | string, callback: (error: Error, result: Buffer) => void): void;
    export function deflateSync(buf: Buffer | string, options?: ZlibOptions): Buffer;
    export function deflateRaw(buf: Buffer | string, callback: (error: Error, result: Buffer) => void): void;
    export function deflateRawSync(buf: Buffer | string, options?: ZlibOptions): Buffer;
    export function gzip(buf: Buffer, callback: (error: Error, result: Buffer) => void): void;
    export function gzipSync(buf: Buffer, options?: ZlibOptions): Buffer;
    export function gunzip(buf: Buffer, callback: (error: Error, result: Buffer) => void): void;
    export function gunzipSync(buf: Buffer, options?: ZlibOptions): Buffer;
    export function inflate(buf: Buffer, callback: (error: Error, result: Buffer) => void): void;
    export function inflateSync(buf: Buffer, options?: ZlibOptions): Buffer;
    export function inflateRaw(buf: Buffer, callback: (error: Error, result: Buffer) => void): void;
    export function inflateRawSync(buf: Buffer, options?: ZlibOptions): Buffer;
    export function unzip(buf: Buffer, callback: (error: Error, result: Buffer) => void): void;
    export function unzipSync(buf: Buffer, options?: ZlibOptions): Buffer;

    // Constants
    export var Z_NO_FLUSH: number;
    export var Z_PARTIAL_FLUSH: number;
    export var Z_SYNC_FLUSH: number;
    export var Z_FULL_FLUSH: number;
    export var Z_FINISH: number;
    export var Z_BLOCK: number;
    export var Z_TREES: number;
    export var Z_OK: number;
    export var Z_STREAM_END: number;
    export var Z_NEED_DICT: number;
    export var Z_ERRNO: number;
    export var Z_STREAM_ERROR: number;
    export var Z_DATA_ERROR: number;
    export var Z_MEM_ERROR: number;
    export var Z_BUF_ERROR: number;
    export var Z_VERSION_ERROR: number;
    export var Z_NO_COMPRESSION: number;
    export var Z_BEST_SPEED: number;
    export var Z_BEST_COMPRESSION: number;
    export var Z_DEFAULT_COMPRESSION: number;
    export var Z_FILTERED: number;
    export var Z_HUFFMAN_ONLY: number;
    export var Z_RLE: number;
    export var Z_FIXED: number;
    export var Z_DEFAULT_STRATEGY: number;
    export var Z_BINARY: number;
    export var Z_TEXT: number;
    export var Z_ASCII: number;
    export var Z_UNKNOWN: number;
    export var Z_DEFLATED: number;
    export var Z_NULL: number;
}

declare module "os" {
    export interface CpuInfo {
        model: string;
        speed: number;
        times: {
            user: number;
            nice: number;
            sys: number;
            idle: number;
            irq: number;
        };
    }

    export interface NetworkInterfaceInfo {
        address: string;
        netmask: string;
        family: string;
        mac: string;
        internal: boolean;
    }

    export function hostname(): string;
    export function loadavg(): number[];
    export function uptime(): number;
    export function freemem(): number;
    export function totalmem(): number;
    export function cpus(): CpuInfo[];
    export function type(): string;
    export function release(): string;
    export function networkInterfaces(): { [index: string]: NetworkInterfaceInfo[] };
    export function homedir(): string;
    export function userInfo(options?: { encoding: string }): { username: string, uid: number, gid: number, shell: any, homedir: string }
    export var constants: {
        UV_UDP_REUSEADDR: number,
        errno: {
            SIGHUP: number;
            SIGINT: number;
            SIGQUIT: number;
            SIGILL: number;
            SIGTRAP: number;
            SIGABRT: number;
            SIGIOT: number;
            SIGBUS: number;
            SIGFPE: number;
            SIGKILL: number;
            SIGUSR1: number;
            SIGSEGV: number;
            SIGUSR2: number;
            SIGPIPE: number;
            SIGALRM: number;
            SIGTERM: number;
            SIGCHLD: number;
            SIGSTKFLT: number;
            SIGCONT: number;
            SIGSTOP: number;
            SIGTSTP: number;
            SIGTTIN: number;
            SIGTTOU: number;
            SIGURG: number;
            SIGXCPU: number;
            SIGXFSZ: number;
            SIGVTALRM: number;
            SIGPROF: number;
            SIGWINCH: number;
            SIGIO: number;
            SIGPOLL: number;
            SIGPWR: number;
            SIGSYS: number;
            SIGUNUSED: number;
        },
        signals: {
            E2BIG: number;
            EACCES: number;
            EADDRINUSE: number;
            EADDRNOTAVAIL: number;
            EAFNOSUPPORT: number;
            EAGAIN: number;
            EALREADY: number;
            EBADF: number;
            EBADMSG: number;
            EBUSY: number;
            ECANCELED: number;
            ECHILD: number;
            ECONNABORTED: number;
            ECONNREFUSED: number;
            ECONNRESET: number;
            EDEADLK: number;
            EDESTADDRREQ: number;
            EDOM: number;
            EDQUOT: number;
            EEXIST: number;
            EFAULT: number;
            EFBIG: number;
            EHOSTUNREACH: number;
            EIDRM: number;
            EILSEQ: number;
            EINPROGRESS: number;
            EINTR: number;
            EINVAL: number;
            EIO: number;
            EISCONN: number;
            EISDIR: number;
            ELOOP: number;
            EMFILE: number;
            EMLINK: number;
            EMSGSIZE: number;
            EMULTIHOP: number;
            ENAMETOOLONG: number;
            ENETDOWN: number;
            ENETRESET: number;
            ENETUNREACH: number;
            ENFILE: number;
            ENOBUFS: number;
            ENODATA: number;
            ENODEV: number;
            ENOENT: number;
            ENOEXEC: number;
            ENOLCK: number;
            ENOLINK: number;
            ENOMEM: number;
            ENOMSG: number;
            ENOPROTOOPT: number;
            ENOSPC: number;
            ENOSR: number;
            ENOSTR: number;
            ENOSYS: number;
            ENOTCONN: number;
            ENOTDIR: number;
            ENOTEMPTY: number;
            ENOTSOCK: number;
            ENOTSUP: number;
            ENOTTY: number;
            ENXIO: number;
            EOPNOTSUPP: number;
            EOVERFLOW: number;
            EPERM: number;
            EPIPE: number;
            EPROTO: number;
            EPROTONOSUPPORT: number;
            EPROTOTYPE: number;
            ERANGE: number;
            EROFS: number;
            ESPIPE: number;
            ESRCH: number;
            ESTALE: number;
            ETIME: number;
            ETIMEDOUT: number;
            ETXTBSY: number;
            EWOULDBLOCK: number;
            EXDEV: number;
        },
    };
    export function arch(): string;
    export function platform(): NodeJS.Platform;
    export function tmpdir(): string;
    export var EOL: string;
    export function endianness(): "BE" | "LE";
}

declare module "https" {
    import * as tls from "tls";
    import * as events from "events";
    import * as http from "http";

    export interface ServerOptions {
        pfx?: any;
        key?: any;
        passphrase?: string;
        cert?: any;
        ca?: any;
        crl?: any;
        ciphers?: string;
        honorCipherOrder?: boolean;
        requestCert?: boolean;
        rejectUnauthorized?: boolean;
        NPNProtocols?: any;
        SNICallback?: (servername: string, cb: (err: Error, ctx: tls.SecureContext) => any) => any;
    }

    export interface RequestOptions extends http.RequestOptions {
        pfx?: any;
        key?: any;
        passphrase?: string;
        cert?: any;
        ca?: any;
        ciphers?: string;
        rejectUnauthorized?: boolean;
        secureProtocol?: string;
    }

    export interface Agent extends http.Agent { }

    export interface AgentOptions extends http.AgentOptions {
        pfx?: any;
        key?: any;
        passphrase?: string;
        cert?: any;
        ca?: any;
        ciphers?: string;
        rejectUnauthorized?: boolean;
        secureProtocol?: string;
        maxCachedSessions?: number;
    }

    export var Agent: {
        new (options?: AgentOptions): Agent;
    };
    export interface Server extends tls.Server { }
    export function createServer(options: ServerOptions, requestListener?: Function): Server;
    export function request(options: RequestOptions, callback?: (res: http.IncomingMessage) => void): http.ClientRequest;
    export function get(options: RequestOptions, callback?: (res: http.IncomingMessage) => void): http.ClientRequest;
    export var globalAgent: Agent;
}

declare module "punycode" {
    export function decode(string: string): string;
    export function encode(string: string): string;
    export function toUnicode(domain: string): string;
    export function toASCII(domain: string): string;
    export var ucs2: ucs2;
    interface ucs2 {
        decode(string: string): number[];
        encode(codePoints: number[]): string;
    }
    export var version: any;
}

declare module "repl" {
    import * as stream from "stream";
    import * as readline from "readline";

    export interface ReplOptions {
        prompt?: string;
        input?: NodeJS.ReadableStream;
        output?: NodeJS.WritableStream;
        terminal?: boolean;
        eval?: Function;
        useColors?: boolean;
        useGlobal?: boolean;
        ignoreUndefined?: boolean;
        writer?: Function;
        completer?: Function;
        replMode?: any;
        breakEvalOnSigint?: any;
    }

    export interface REPLServer extends readline.ReadLine {
        defineCommand(keyword: string, cmd: Function | { help: string, action: Function }): void;
        displayPrompt(preserveCursor?: boolean): void;

        context: any;

        /**
         * events.EventEmitter
         * 1. exit
         * 2. reset
         **/

        addListener(event: string, listener: Function): this;
        addListener(event: "exit", listener: () => void): this;
        addListener(event: "reset", listener: Function): this;

        emit(event: string, ...args: any[]): boolean;
        emit(event: "exit"): boolean;
        emit(event: "reset", context: any): boolean;

        on(event: string, listener: Function): this;
        on(event: "exit", listener: () => void): this;
        on(event: "reset", listener: Function): this;

        once(event: string, listener: Function): this;
        once(event: "exit", listener: () => void): this;
        once(event: "reset", listener: Function): this;

        prependListener(event: string, listener: Function): this;
        prependListener(event: "exit", listener: () => void): this;
        prependListener(event: "reset", listener: Function): this;

        prependOnceListener(event: string, listener: Function): this;
        prependOnceListener(event: "exit", listener: () => void): this;
        prependOnceListener(event: "reset", listener: Function): this;
    }

    export function start(options: ReplOptions): REPLServer;
}

declare module "readline" {
    import * as events from "events";
    import * as stream from "stream";

    export interface Key {
        sequence?: string;
        name?: string;
        ctrl?: boolean;
        meta?: boolean;
        shift?: boolean;
    }

    export interface ReadLine extends events.EventEmitter {
        setPrompt(prompt: string): void;
        prompt(preserveCursor?: boolean): void;
        question(query: string, callback: (answer: string) => void): void;
        pause(): ReadLine;
        resume(): ReadLine;
        close(): void;
        write(data: string | Buffer, key?: Key): void;

        /**
         * events.EventEmitter
         * 1. close
         * 2. line
         * 3. pause
         * 4. resume
         * 5. SIGCONT
         * 6. SIGINT
         * 7. SIGTSTP
         **/

        addListener(event: string, listener: Function): this;
        addListener(event: "close", listener: () => void): this;
        addListener(event: "line", listener: (input: any) => void): this;
        addListener(event: "pause", listener: () => void): this;
        addListener(event: "resume", listener: () => void): this;
        addListener(event: "SIGCONT", listener: () => void): this;
        addListener(event: "SIGINT", listener: () => void): this;
        addListener(event: "SIGTSTP", listener: () => void): this;

        emit(event: string, ...args: any[]): boolean;
        emit(event: "close"): boolean;
        emit(event: "line", input: any): boolean;
        emit(event: "pause"): boolean;
        emit(event: "resume"): boolean;
        emit(event: "SIGCONT"): boolean;
        emit(event: "SIGINT"): boolean;
        emit(event: "SIGTSTP"): boolean;

        on(event: string, listener: Function): this;
        on(event: "close", listener: () => void): this;
        on(event: "line", listener: (input: any) => void): this;
        on(event: "pause", listener: () => void): this;
        on(event: "resume", listener: () => void): this;
        on(event: "SIGCONT", listener: () => void): this;
        on(event: "SIGINT", listener: () => void): this;
        on(event: "SIGTSTP", listener: () => void): this;

        once(event: string, listener: Function): this;
        once(event: "close", listener: () => void): this;
        once(event: "line", listener: (input: any) => void): this;
        once(event: "pause", listener: () => void): this;
        once(event: "resume", listener: () => void): this;
        once(event: "SIGCONT", listener: () => void): this;
        once(event: "SIGINT", listener: () => void): this;
        once(event: "SIGTSTP", listener: () => void): this;

        prependListener(event: string, listener: Function): this;
        prependListener(event: "close", listener: () => void): this;
        prependListener(event: "line", listener: (input: any) => void): this;
        prependListener(event: "pause", listener: () => void): this;
        prependListener(event: "resume", listener: () => void): this;
        prependListener(event: "SIGCONT", listener: () => void): this;
        prependListener(event: "SIGINT", listener: () => void): this;
        prependListener(event: "SIGTSTP", listener: () => void): this;

        prependOnceListener(event: string, listener: Function): this;
        prependOnceListener(event: "close", listener: () => void): this;
        prependOnceListener(event: "line", listener: (input: any) => void): this;
        prependOnceListener(event: "pause", listener: () => void): this;
        prependOnceListener(event: "resume", listener: () => void): this;
        prependOnceListener(event: "SIGCONT", listener: () => void): this;
        prependOnceListener(event: "SIGINT", listener: () => void): this;
        prependOnceListener(event: "SIGTSTP", listener: () => void): this;
    }

    export interface Completer {
        (line: string): CompleterResult;
        (line: string, callback: (err: any, result: CompleterResult) => void): any;
    }

    export type CompleterResult = [string[], string];

    export interface ReadLineOptions {
        input: NodeJS.ReadableStream;
        output?: NodeJS.WritableStream;
        completer?: Completer;
        terminal?: boolean;
        historySize?: number;
    }

    export function createInterface(input: NodeJS.ReadableStream, output?: NodeJS.WritableStream, completer?: Completer, terminal?: boolean): ReadLine;
    export function createInterface(options: ReadLineOptions): ReadLine;

    export function cursorTo(stream: NodeJS.WritableStream, x: number, y?: number): void;
    export function moveCursor(stream: NodeJS.WritableStream, dx: number | string, dy: number | string): void;
    export function clearLine(stream: NodeJS.WritableStream, dir: number): void;
    export function clearScreenDown(stream: NodeJS.WritableStream): void;
}

declare module "vm" {
    export interface Context { }
    export interface ScriptOptions {
        filename?: string;
        lineOffset?: number;
        columnOffset?: number;
        displayErrors?: boolean;
        timeout?: number;
        cachedData?: Buffer;
        produceCachedData?: boolean;
    }
    export interface RunningScriptOptions {
        filename?: string;
        lineOffset?: number;
        columnOffset?: number;
        displayErrors?: boolean;
        timeout?: number;
    }
    export class Script {
        constructor(code: string, options?: ScriptOptions);
        runInContext(contextifiedSandbox: Context, options?: RunningScriptOptions): any;
        runInNewContext(sandbox?: Context, options?: RunningScriptOptions): any;
        runInThisContext(options?: RunningScriptOptions): any;
    }
    export function createContext(sandbox?: Context): Context;
    export function isContext(sandbox: Context): boolean;
    export function runInContext(code: string, contextifiedSandbox: Context, options?: RunningScriptOptions): any;
    export function runInDebugContext(code: string): any;
    export function runInNewContext(code: string, sandbox?: Context, options?: RunningScriptOptions): any;
    export function runInThisContext(code: string, options?: RunningScriptOptions): any;
}

declare module "child_process" {
    import * as events from "events";
    import * as stream from "stream";
    import * as net from "net";

    export interface ChildProcess extends events.EventEmitter {
        stdin: stream.Writable;
        stdout: stream.Readable;
        stderr: stream.Readable;
        stdio: [stream.Writable, stream.Readable, stream.Readable];
        pid: number;
        kill(signal?: string): void;
        send(message: any, sendHandle?: any): boolean;
        connected: boolean;
        disconnect(): void;
        unref(): void;
        ref(): void;

        /**
         * events.EventEmitter
         * 1. close
         * 2. disconnect
         * 3. error
         * 4. exit
         * 5. message
         **/

        addListener(event: string, listener: Function): this;
        addListener(event: "close", listener: (code: number, signal: string) => void): this;
        addListener(event: "disconnect", listener: () => void): this;
        addListener(event: "error", listener: (err: Error) => void): this;
        addListener(event: "exit", listener: (code: number, signal: string) => void): this;
        addListener(event: "message", listener: (message: any, sendHandle: net.Socket | net.Server) => void): this;

        emit(event: string, ...args: any[]): boolean;
        emit(event: "close", code: number, signal: string): boolean;
        emit(event: "disconnect"): boolean;
        emit(event: "error", err: Error): boolean;
        emit(event: "exit", code: number, signal: string): boolean;
        emit(event: "message", message: any, sendHandle: net.Socket | net.Server): boolean;

        on(event: string, listener: Function): this;
        on(event: "close", listener: (code: number, signal: string) => void): this;
        on(event: "disconnect", listener: () => void): this;
        on(event: "error", listener: (err: Error) => void): this;
        on(event: "exit", listener: (code: number, signal: string) => void): this;
        on(event: "message", listener: (message: any, sendHandle: net.Socket | net.Server) => void): this;

        once(event: string, listener: Function): this;
        once(event: "close", listener: (code: number, signal: string) => void): this;
        once(event: "disconnect", listener: () => void): this;
        once(event: "error", listener: (err: Error) => void): this;
        once(event: "exit", listener: (code: number, signal: string) => void): this;
        once(event: "message", listener: (message: any, sendHandle: net.Socket | net.Server) => void): this;

        prependListener(event: string, listener: Function): this;
        prependListener(event: "close", listener: (code: number, signal: string) => void): this;
        prependListener(event: "disconnect", listener: () => void): this;
        prependListener(event: "error", listener: (err: Error) => void): this;
        prependListener(event: "exit", listener: (code: number, signal: string) => void): this;
        prependListener(event: "message", listener: (message: any, sendHandle: net.Socket | net.Server) => void): this;

        prependOnceListener(event: string, listener: Function): this;
        prependOnceListener(event: "close", listener: (code: number, signal: string) => void): this;
        prependOnceListener(event: "disconnect", listener: () => void): this;
        prependOnceListener(event: "error", listener: (err: Error) => void): this;
        prependOnceListener(event: "exit", listener: (code: number, signal: string) => void): this;
        prependOnceListener(event: "message", listener: (message: any, sendHandle: net.Socket | net.Server) => void): this;
    }

    export interface SpawnOptions {
        cwd?: string;
        env?: any;
        stdio?: any;
        detached?: boolean;
        uid?: number;
        gid?: number;
        shell?: boolean | string;
    }
    export function spawn(command: string, args?: string[], options?: SpawnOptions): ChildProcess;

    export interface ExecOptions {
        cwd?: string;
        env?: any;
        shell?: string;
        timeout?: number;
        maxBuffer?: number;
        killSignal?: string;
        uid?: number;
        gid?: number;
    }
    export interface ExecOptionsWithStringEncoding extends ExecOptions {
        encoding: BufferEncoding;
    }
    export interface ExecOptionsWithBufferEncoding extends ExecOptions {
        encoding: string; // specify `null`.
    }
    export function exec(command: string, callback?: (error: Error, stdout: string, stderr: string) => void): ChildProcess;
    export function exec(command: string, options: ExecOptionsWithStringEncoding, callback?: (error: Error, stdout: string, stderr: string) => void): ChildProcess;
    // usage. child_process.exec("tsc", {encoding: null as string}, (err, stdout, stderr) => {});
    export function exec(command: string, options: ExecOptionsWithBufferEncoding, callback?: (error: Error, stdout: Buffer, stderr: Buffer) => void): ChildProcess;
    export function exec(command: string, options: ExecOptions, callback?: (error: Error, stdout: string, stderr: string) => void): ChildProcess;

    export interface ExecFileOptions {
        cwd?: string;
        env?: any;
        timeout?: number;
        maxBuffer?: number;
        killSignal?: string;
        uid?: number;
        gid?: number;
    }
    export interface ExecFileOptionsWithStringEncoding extends ExecFileOptions {
        encoding: BufferEncoding;
    }
    export interface ExecFileOptionsWithBufferEncoding extends ExecFileOptions {
        encoding: string; // specify `null`.
    }
    export function execFile(file: string, callback?: (error: Error, stdout: string, stderr: string) => void): ChildProcess;
    export function execFile(file: string, options?: ExecFileOptionsWithStringEncoding, callback?: (error: Error, stdout: string, stderr: string) => void): ChildProcess;
    // usage. child_process.execFile("file.sh", {encoding: null as string}, (err, stdout, stderr) => {});
    export function execFile(file: string, options?: ExecFileOptionsWithBufferEncoding, callback?: (error: Error, stdout: Buffer, stderr: Buffer) => void): ChildProcess;
    export function execFile(file: string, options?: ExecFileOptions, callback?: (error: Error, stdout: string, stderr: string) => void): ChildProcess;
    export function execFile(file: string, args?: string[], callback?: (error: Error, stdout: string, stderr: string) => void): ChildProcess;
    export function execFile(file: string, args?: string[], options?: ExecFileOptionsWithStringEncoding, callback?: (error: Error, stdout: string, stderr: string) => void): ChildProcess;
    // usage. child_process.execFile("file.sh", ["foo"], {encoding: null as string}, (err, stdout, stderr) => {});
    export function execFile(file: string, args?: string[], options?: ExecFileOptionsWithBufferEncoding, callback?: (error: Error, stdout: Buffer, stderr: Buffer) => void): ChildProcess;
    export function execFile(file: string, args?: string[], options?: ExecFileOptions, callback?: (error: Error, stdout: string, stderr: string) => void): ChildProcess;

    export interface ForkOptions {
        cwd?: string;
        env?: any;
        execPath?: string;
        execArgv?: string[];
        silent?: boolean;
        uid?: number;
        gid?: number;
    }
    export function fork(modulePath: string, args?: string[], options?: ForkOptions): ChildProcess;

    export interface SpawnSyncOptions {
        cwd?: string;
        input?: string | Buffer;
        stdio?: any;
        env?: any;
        uid?: number;
        gid?: number;
        timeout?: number;
        killSignal?: string;
        maxBuffer?: number;
        encoding?: string;
        shell?: boolean | string;
    }
    export interface SpawnSyncOptionsWithStringEncoding extends SpawnSyncOptions {
        encoding: BufferEncoding;
    }
    export interface SpawnSyncOptionsWithBufferEncoding extends SpawnSyncOptions {
        encoding: string; // specify `null`.
    }
    export interface SpawnSyncReturns<T> {
        pid: number;
        output: string[];
        stdout: T;
        stderr: T;
        status: number;
        signal: string;
        error: Error;
    }
    export function spawnSync(command: string): SpawnSyncReturns<Buffer>;
    export function spawnSync(command: string, options?: SpawnSyncOptionsWithStringEncoding): SpawnSyncReturns<string>;
    export function spawnSync(command: string, options?: SpawnSyncOptionsWithBufferEncoding): SpawnSyncReturns<Buffer>;
    export function spawnSync(command: string, options?: SpawnSyncOptions): SpawnSyncReturns<Buffer>;
    export function spawnSync(command: string, args?: string[], options?: SpawnSyncOptionsWithStringEncoding): SpawnSyncReturns<string>;
    export function spawnSync(command: string, args?: string[], options?: SpawnSyncOptionsWithBufferEncoding): SpawnSyncReturns<Buffer>;
    export function spawnSync(command: string, args?: string[], options?: SpawnSyncOptions): SpawnSyncReturns<Buffer>;

    export interface ExecSyncOptions {
        cwd?: string;
        input?: string | Buffer;
        stdio?: any;
        env?: any;
        shell?: string;
        uid?: number;
        gid?: number;
        timeout?: number;
        killSignal?: string;
        maxBuffer?: number;
        encoding?: string;
    }
    export interface ExecSyncOptionsWithStringEncoding extends ExecSyncOptions {
        encoding: BufferEncoding;
    }
    export interface ExecSyncOptionsWithBufferEncoding extends ExecSyncOptions {
        encoding: string; // specify `null`.
    }
    export function execSync(command: string): Buffer;
    export function execSync(command: string, options?: ExecSyncOptionsWithStringEncoding): string;
    export function execSync(command: string, options?: ExecSyncOptionsWithBufferEncoding): Buffer;
    export function execSync(command: string, options?: ExecSyncOptions): Buffer;

    export interface ExecFileSyncOptions {
        cwd?: string;
        input?: string | Buffer;
        stdio?: any;
        env?: any;
        uid?: number;
        gid?: number;
        timeout?: number;
        killSignal?: string;
        maxBuffer?: number;
        encoding?: string;
    }
    export interface ExecFileSyncOptionsWithStringEncoding extends ExecFileSyncOptions {
        encoding: BufferEncoding;
    }
    export interface ExecFileSyncOptionsWithBufferEncoding extends ExecFileSyncOptions {
        encoding: string; // specify `null`.
    }
    export function execFileSync(command: string): Buffer;
    export function execFileSync(command: string, options?: ExecFileSyncOptionsWithStringEncoding): string;
    export function execFileSync(command: string, options?: ExecFileSyncOptionsWithBufferEncoding): Buffer;
    export function execFileSync(command: string, options?: ExecFileSyncOptions): Buffer;
    export function execFileSync(command: string, args?: string[], options?: ExecFileSyncOptionsWithStringEncoding): string;
    export function execFileSync(command: string, args?: string[], options?: ExecFileSyncOptionsWithBufferEncoding): Buffer;
    export function execFileSync(command: string, args?: string[], options?: ExecFileSyncOptions): Buffer;
}

declare module "url" {
    export interface Url {
        href?: string;
        protocol?: string;
        auth?: string;
        hostname?: string;
        port?: string;
        host?: string;
        pathname?: string;
        search?: string;
        query?: string | any;
        slashes?: boolean;
        hash?: string;
        path?: string;
    }

    export function parse(urlStr: string, parseQueryString?: boolean, slashesDenoteHost?: boolean): Url;
    export function format(url: Url): string;
    export function resolve(from: string, to: string): string;
}

declare module "dns" {
    export interface MxRecord {
        exchange: string,
        priority: number
    }

    export function lookup(domain: string, family: number, callback: (err: Error, address: string, family: number) => void): string;
    export function lookup(domain: string, callback: (err: Error, address: string, family: number) => void): string;
    export function resolve(domain: string, rrtype: string, callback: (err: Error, addresses: string[]) => void): string[];
    export function resolve(domain: string, callback: (err: Error, addresses: string[]) => void): string[];
    export function resolve4(domain: string, callback: (err: Error, addresses: string[]) => void): string[];
    export function resolve6(domain: string, callback: (err: Error, addresses: string[]) => void): string[];
    export function resolveMx(domain: string, callback: (err: Error, addresses: MxRecord[]) => void): string[];
    export function resolveTxt(domain: string, callback: (err: Error, addresses: string[]) => void): string[];
    export function resolveSrv(domain: string, callback: (err: Error, addresses: string[]) => void): string[];
    export function resolveNs(domain: string, callback: (err: Error, addresses: string[]) => void): string[];
    export function resolveCname(domain: string, callback: (err: Error, addresses: string[]) => void): string[];
    export function reverse(ip: string, callback: (err: Error, domains: string[]) => void): string[];
    export function setServers(servers: string[]): void;

    //Error codes
    export var NODATA: string;
    export var FORMERR: string;
    export var SERVFAIL: string;
    export var NOTFOUND: string;
    export var NOTIMP: string;
    export var REFUSED: string;
    export var BADQUERY: string;
    export var BADNAME: string;
    export var BADFAMILY: string;
    export var BADRESP: string;
    export var CONNREFUSED: string;
    export var TIMEOUT: string;
    export var EOF: string;
    export var FILE: string;
    export var NOMEM: string;
    export var DESTRUCTION: string;
    export var BADSTR: string;
    export var BADFLAGS: string;
    export var NONAME: string;
    export var BADHINTS: string;
    export var NOTINITIALIZED: string;
    export var LOADIPHLPAPI: string;
    export var ADDRGETNETWORKPARAMS: string;
    export var CANCELLED: string;
}

declare module "net" {
    import * as stream from "stream";
    import * as events from "events";

    export interface Socket extends stream.Duplex {
        // Extended base methods
        write(buffer: Buffer): boolean;
        write(buffer: Buffer, cb?: Function): boolean;
        write(str: string, cb?: Function): boolean;
        write(str: string, encoding?: string, cb?: Function): boolean;
        write(str: string, encoding?: string, fd?: string): boolean;

        connect(port: number, host?: string, connectionListener?: Function): void;
        connect(path: string, connectionListener?: Function): void;
        bufferSize: number;
        setEncoding(encoding?: string): void;
        write(data: any, encoding?: string, callback?: Function): void;
        destroy(): void;
        pause(): Socket;
        resume(): Socket;
        setTimeout(timeout: number, callback?: Function): void;
        setNoDelay(noDelay?: boolean): void;
        setKeepAlive(enable?: boolean, initialDelay?: number): void;
        address(): { port: number; family: string; address: string; };
        unref(): void;
        ref(): void;

        remoteAddress: string;
        remoteFamily: string;
        remotePort: number;
        localAddress: string;
        localPort: number;
        bytesRead: number;
        bytesWritten: number;
        destroyed: boolean;

        // Extended base methods
        end(): void;
        end(buffer: Buffer, cb?: Function): void;
        end(str: string, cb?: Function): void;
        end(str: string, encoding?: string, cb?: Function): void;
        end(data?: any, encoding?: string): void;

        /**
         * events.EventEmitter
         *   1. close
         *   2. connect
         *   3. data
         *   4. drain
         *   5. end
         *   6. error
         *   7. lookup
         *   8. timeout
         */
        addListener(event: string, listener: Function): this;
        addListener(event: "close", listener: (had_error: boolean) => void): this;
        addListener(event: "connect", listener: () => void): this;
        addListener(event: "data", listener: (data: Buffer) => void): this;
        addListener(event: "drain", listener: () => void): this;
        addListener(event: "end", listener: () => void): this;
        addListener(event: "error", listener: (err: Error) => void): this;
        addListener(event: "lookup", listener: (err: Error, address: string, family: string | number, host: string) => void): this;
        addListener(event: "timeout", listener: () => void): this;

        emit(event: string, ...args: any[]): boolean;
        emit(event: "close", had_error: boolean): boolean;
        emit(event: "connect"): boolean;
        emit(event: "data", data: Buffer): boolean;
        emit(event: "drain"): boolean;
        emit(event: "end"): boolean;
        emit(event: "error", err: Error): boolean;
        emit(event: "lookup", err: Error, address: string, family: string | number, host: string): boolean;
        emit(event: "timeout"): boolean;

        on(event: string, listener: Function): this;
        on(event: "close", listener: (had_error: boolean) => void): this;
        on(event: "connect", listener: () => void): this;
        on(event: "data", listener: (data: Buffer) => void): this;
        on(event: "drain", listener: () => void): this;
        on(event: "end", listener: () => void): this;
        on(event: "error", listener: (err: Error) => void): this;
        on(event: "lookup", listener: (err: Error, address: string, family: string | number, host: string) => void): this;
        on(event: "timeout", listener: () => void): this;

        once(event: string, listener: Function): this;
        once(event: "close", listener: (had_error: boolean) => void): this;
        once(event: "connect", listener: () => void): this;
        once(event: "data", listener: (data: Buffer) => void): this;
        once(event: "drain", listener: () => void): this;
        once(event: "end", listener: () => void): this;
        once(event: "error", listener: (err: Error) => void): this;
        once(event: "lookup", listener: (err: Error, address: string, family: string | number, host: string) => void): this;
        once(event: "timeout", listener: () => void): this;

        prependListener(event: string, listener: Function): this;
        prependListener(event: "close", listener: (had_error: boolean) => void): this;
        prependListener(event: "connect", listener: () => void): this;
        prependListener(event: "data", listener: (data: Buffer) => void): this;
        prependListener(event: "drain", listener: () => void): this;
        prependListener(event: "end", listener: () => void): this;
        prependListener(event: "error", listener: (err: Error) => void): this;
        prependListener(event: "lookup", listener: (err: Error, address: string, family: string | number, host: string) => void): this;
        prependListener(event: "timeout", listener: () => void): this;

        prependOnceListener(event: string, listener: Function): this;
        prependOnceListener(event: "close", listener: (had_error: boolean) => void): this;
        prependOnceListener(event: "connect", listener: () => void): this;
        prependOnceListener(event: "data", listener: (data: Buffer) => void): this;
        prependOnceListener(event: "drain", listener: () => void): this;
        prependOnceListener(event: "end", listener: () => void): this;
        prependOnceListener(event: "error", listener: (err: Error) => void): this;
        prependOnceListener(event: "lookup", listener: (err: Error, address: string, family: string | number, host: string) => void): this;
        prependOnceListener(event: "timeout", listener: () => void): this;
    }

    export var Socket: {
        new (options?: { fd?: string; type?: string; allowHalfOpen?: boolean; }): Socket;
    };

    export interface ListenOptions {
        port?: number;
        host?: string;
        backlog?: number;
        path?: string;
        exclusive?: boolean;
    }

    export interface Server extends events.EventEmitter {
        listen(port: number, hostname?: string, backlog?: number, listeningListener?: Function): Server;
        listen(port: number, hostname?: string, listeningListener?: Function): Server;
        listen(port: number, backlog?: number, listeningListener?: Function): Server;
        listen(port: number, listeningListener?: Function): Server;
        listen(path: string, backlog?: number, listeningListener?: Function): Server;
        listen(path: string, listeningListener?: Function): Server;
        listen(options: ListenOptions, listeningListener?: Function): Server;
        listen(handle: any, backlog?: number, listeningListener?: Function): Server;
        listen(handle: any, listeningListener?: Function): Server;
        close(callback?: Function): Server;
        address(): { port: number; family: string; address: string; };
        getConnections(cb: (error: Error, count: number) => void): void;
        ref(): Server;
        unref(): Server;
        maxConnections: number;
        connections: number;

        /**
         * events.EventEmitter
         *   1. close
         *   2. connection
         *   3. error
         *   4. listening
         */
        addListener(event: string, listener: Function): this;
        addListener(event: "close", listener: () => void): this;
        addListener(event: "connection", listener: (socket: Socket) => void): this;
        addListener(event: "error", listener: (err: Error) => void): this;
        addListener(event: "listening", listener: () => void): this;

        emit(event: string, ...args: any[]): boolean;
        emit(event: "close"): boolean;
        emit(event: "connection", socket: Socket): boolean;
        emit(event: "error", err: Error): boolean;
        emit(event: "listening"): boolean;

        on(event: string, listener: Function): this;
        on(event: "close", listener: () => void): this;
        on(event: "connection", listener: (socket: Socket) => void): this;
        on(event: "error", listener: (err: Error) => void): this;
        on(event: "listening", listener: () => void): this;

        once(event: string, listener: Function): this;
        once(event: "close", listener: () => void): this;
        once(event: "connection", listener: (socket: Socket) => void): this;
        once(event: "error", listener: (err: Error) => void): this;
        once(event: "listening", listener: () => void): this;

        prependListener(event: string, listener: Function): this;
        prependListener(event: "close", listener: () => void): this;
        prependListener(event: "connection", listener: (socket: Socket) => void): this;
        prependListener(event: "error", listener: (err: Error) => void): this;
        prependListener(event: "listening", listener: () => void): this;

        prependOnceListener(event: string, listener: Function): this;
        prependOnceListener(event: "close", listener: () => void): this;
        prependOnceListener(event: "connection", listener: (socket: Socket) => void): this;
        prependOnceListener(event: "error", listener: (err: Error) => void): this;
        prependOnceListener(event: "listening", listener: () => void): this;
    }
    export function createServer(connectionListener?: (socket: Socket) => void): Server;
    export function createServer(options?: { allowHalfOpen?: boolean; }, connectionListener?: (socket: Socket) => void): Server;
    export function connect(options: { port: number, host?: string, localAddress?: string, localPort?: string, family?: number, allowHalfOpen?: boolean; }, connectionListener?: Function): Socket;
    export function connect(port: number, host?: string, connectionListener?: Function): Socket;
    export function connect(path: string, connectionListener?: Function): Socket;
    export function createConnection(options: { port: number, host?: string, localAddress?: string, localPort?: string, family?: number, allowHalfOpen?: boolean; }, connectionListener?: Function): Socket;
    export function createConnection(port: number, host?: string, connectionListener?: Function): Socket;
    export function createConnection(path: string, connectionListener?: Function): Socket;
    export function isIP(input: string): number;
    export function isIPv4(input: string): boolean;
    export function isIPv6(input: string): boolean;
}

declare module "dgram" {
    import * as events from "events";

    interface RemoteInfo {
        address: string;
        family: string;
        port: number;
    }

    interface AddressInfo {
        address: string;
        family: string;
        port: number;
    }

    interface BindOptions {
        port: number;
        address?: string;
        exclusive?: boolean;
    }

    interface SocketOptions {
        type: "udp4" | "udp6";
        reuseAddr?: boolean;
    }

    export function createSocket(type: string, callback?: (msg: Buffer, rinfo: RemoteInfo) => void): Socket;
    export function createSocket(options: SocketOptions, callback?: (msg: Buffer, rinfo: RemoteInfo) => void): Socket;

    export interface Socket extends events.EventEmitter {
        send(msg: Buffer | String | any[], port: number, address: string, callback?: (error: Error, bytes: number) => void): void;
        send(msg: Buffer | String | any[], offset: number, length: number, port: number, address: string, callback?: (error: Error, bytes: number) => void): void;
        bind(port?: number, address?: string, callback?: () => void): void;
        bind(options: BindOptions, callback?: Function): void;
        close(callback?: any): void;
        address(): AddressInfo;
        setBroadcast(flag: boolean): void;
        setTTL(ttl: number): void;
        setMulticastTTL(ttl: number): void;
        setMulticastLoopback(flag: boolean): void;
        addMembership(multicastAddress: string, multicastInterface?: string): void;
        dropMembership(multicastAddress: string, multicastInterface?: string): void;
        ref(): this;
        unref(): this;

        /**
         * events.EventEmitter
         * 1. close
         * 2. error
         * 3. listening
         * 4. message
         **/
        addListener(event: string, listener: Function): this;
        addListener(event: "close", listener: () => void): this;
        addListener(event: "error", listener: (err: Error) => void): this;
        addListener(event: "listening", listener: () => void): this;
        addListener(event: "message", listener: (msg: Buffer, rinfo: AddressInfo) => void): this;

        emit(event: string, ...args: any[]): boolean;
        emit(event: "close"): boolean;
        emit(event: "error", err: Error): boolean;
        emit(event: "listening"): boolean;
        emit(event: "message", msg: Buffer, rinfo: AddressInfo): boolean;

        on(event: string, listener: Function): this;
        on(event: "close", listener: () => void): this;
        on(event: "error", listener: (err: Error) => void): this;
        on(event: "listening", listener: () => void): this;
        on(event: "message", listener: (msg: Buffer, rinfo: AddressInfo) => void): this;

        once(event: string, listener: Function): this;
        once(event: "close", listener: () => void): this;
        once(event: "error", listener: (err: Error) => void): this;
        once(event: "listening", listener: () => void): this;
        once(event: "message", listener: (msg: Buffer, rinfo: AddressInfo) => void): this;

        prependListener(event: string, listener: Function): this;
        prependListener(event: "close", listener: () => void): this;
        prependListener(event: "error", listener: (err: Error) => void): this;
        prependListener(event: "listening", listener: () => void): this;
        prependListener(event: "message", listener: (msg: Buffer, rinfo: AddressInfo) => void): this;

        prependOnceListener(event: string, listener: Function): this;
        prependOnceListener(event: "close", listener: () => void): this;
        prependOnceListener(event: "error", listener: (err: Error) => void): this;
        prependOnceListener(event: "listening", listener: () => void): this;
        prependOnceListener(event: "message", listener: (msg: Buffer, rinfo: AddressInfo) => void): this;
    }
}

declare module "fs" {
    import * as stream from "stream";
    import * as events from "events";

    interface Stats {
        isFile(): boolean;
        isDirectory(): boolean;
        isBlockDevice(): boolean;
        isCharacterDevice(): boolean;
        isSymbolicLink(): boolean;
        isFIFO(): boolean;
        isSocket(): boolean;
        dev: number;
        ino: number;
        mode: number;
        nlink: number;
        uid: number;
        gid: number;
        rdev: number;
        size: number;
        blksize: number;
        blocks: number;
        atime: Date;
        mtime: Date;
        ctime: Date;
        birthtime: Date;
    }

    interface FSWatcher extends events.EventEmitter {
        close(): void;

        /**
         * events.EventEmitter
         *   1. change
         *   2. error
         */
        addListener(event: string, listener: Function): this;
        addListener(event: "change", listener: (eventType: string, filename: string | Buffer) => void): this;
        addListener(event: "error", listener: (code: number, signal: string) => void): this;

        on(event: string, listener: Function): this;
        on(event: "change", listener: (eventType: string, filename: string | Buffer) => void): this;
        on(event: "error", listener: (code: number, signal: string) => void): this;

        once(event: string, listener: Function): this;
        once(event: "change", listener: (eventType: string, filename: string | Buffer) => void): this;
        once(event: "error", listener: (code: number, signal: string) => void): this;

        prependListener(event: string, listener: Function): this;
        prependListener(event: "change", listener: (eventType: string, filename: string | Buffer) => void): this;
        prependListener(event: "error", listener: (code: number, signal: string) => void): this;

        prependOnceListener(event: string, listener: Function): this;
        prependOnceListener(event: "change", listener: (eventType: string, filename: string | Buffer) => void): this;
        prependOnceListener(event: "error", listener: (code: number, signal: string) => void): this;
    }

    export interface ReadStream extends stream.Readable {
        close(): void;
        destroy(): void;
        bytesRead: number;
        path: string | Buffer;

        /**
         * events.EventEmitter
         *   1. open
         *   2. close
         */
        addListener(event: string, listener: Function): this;
        addListener(event: "open", listener: (fd: number) => void): this;
        addListener(event: "close", listener: () => void): this;

        on(event: string, listener: Function): this;
        on(event: "open", listener: (fd: number) => void): this;
        on(event: "close", listener: () => void): this;

        once(event: string, listener: Function): this;
        once(event: "open", listener: (fd: number) => void): this;
        once(event: "close", listener: () => void): this;

        prependListener(event: string, listener: Function): this;
        prependListener(event: "open", listener: (fd: number) => void): this;
        prependListener(event: "close", listener: () => void): this;

        prependOnceListener(event: string, listener: Function): this;
        prependOnceListener(event: "open", listener: (fd: number) => void): this;
        prependOnceListener(event: "close", listener: () => void): this;
    }

    export interface WriteStream extends stream.Writable {
        close(): void;
        bytesWritten: number;
        path: string | Buffer;

        /**
         * events.EventEmitter
         *   1. open
         *   2. close
         */
        addListener(event: string, listener: Function): this;
        addListener(event: "open", listener: (fd: number) => void): this;
        addListener(event: "close", listener: () => void): this;

        on(event: string, listener: Function): this;
        on(event: "open", listener: (fd: number) => void): this;
        on(event: "close", listener: () => void): this;

        once(event: string, listener: Function): this;
        once(event: "open", listener: (fd: number) => void): this;
        once(event: "close", listener: () => void): this;

        prependListener(event: string, listener: Function): this;
        prependListener(event: "open", listener: (fd: number) => void): this;
        prependListener(event: "close", listener: () => void): this;

        prependOnceListener(event: string, listener: Function): this;
        prependOnceListener(event: "open", listener: (fd: number) => void): this;
        prependOnceListener(event: "close", listener: () => void): this;
    }

    /**
     * Asynchronous rename.
     * @param oldPath
     * @param newPath
     * @param callback No arguments other than a possible exception are given to the completion callback.
     */
    export function rename(oldPath: string, newPath: string, callback?: (err?: NodeJS.ErrnoException) => void): void;
    /**
     * Synchronous rename
     * @param oldPath
     * @param newPath
     */
    export function renameSync(oldPath: string, newPath: string): void;
    export function truncate(path: string | Buffer, callback?: (err?: NodeJS.ErrnoException) => void): void;
    export function truncate(path: string | Buffer, len: number, callback?: (err?: NodeJS.ErrnoException) => void): void;
    export function truncateSync(path: string | Buffer, len?: number): void;
    export function ftruncate(fd: number, callback?: (err?: NodeJS.ErrnoException) => void): void;
    export function ftruncate(fd: number, len: number, callback?: (err?: NodeJS.ErrnoException) => void): void;
    export function ftruncateSync(fd: number, len?: number): void;
    export function chown(path: string | Buffer, uid: number, gid: number, callback?: (err?: NodeJS.ErrnoException) => void): void;
    export function chownSync(path: string | Buffer, uid: number, gid: number): void;
    export function fchown(fd: number, uid: number, gid: number, callback?: (err?: NodeJS.ErrnoException) => void): void;
    export function fchownSync(fd: number, uid: number, gid: number): void;
    export function lchown(path: string | Buffer, uid: number, gid: number, callback?: (err?: NodeJS.ErrnoException) => void): void;
    export function lchownSync(path: string | Buffer, uid: number, gid: number): void;
    export function chmod(path: string | Buffer, mode: number, callback?: (err?: NodeJS.ErrnoException) => void): void;
    export function chmod(path: string | Buffer, mode: string, callback?: (err?: NodeJS.ErrnoException) => void): void;
    export function chmodSync(path: string | Buffer, mode: number): void;
    export function chmodSync(path: string | Buffer, mode: string): void;
    export function fchmod(fd: number, mode: number, callback?: (err?: NodeJS.ErrnoException) => void): void;
    export function fchmod(fd: number, mode: string, callback?: (err?: NodeJS.ErrnoException) => void): void;
    export function fchmodSync(fd: number, mode: number): void;
    export function fchmodSync(fd: number, mode: string): void;
    export function lchmod(path: string | Buffer, mode: number, callback?: (err?: NodeJS.ErrnoException) => void): void;
    export function lchmod(path: string | Buffer, mode: string, callback?: (err?: NodeJS.ErrnoException) => void): void;
    export function lchmodSync(path: string | Buffer, mode: number): void;
    export function lchmodSync(path: string | Buffer, mode: string): void;
    export function stat(path: string | Buffer, callback?: (err: NodeJS.ErrnoException, stats: Stats) => any): void;
    export function lstat(path: string | Buffer, callback?: (err: NodeJS.ErrnoException, stats: Stats) => any): void;
    export function fstat(fd: number, callback?: (err: NodeJS.ErrnoException, stats: Stats) => any): void;
    export function statSync(path: string | Buffer): Stats;
    export function lstatSync(path: string | Buffer): Stats;
    export function fstatSync(fd: number): Stats;
    export function link(srcpath: string | Buffer, dstpath: string | Buffer, callback?: (err?: NodeJS.ErrnoException) => void): void;
    export function linkSync(srcpath: string | Buffer, dstpath: string | Buffer): void;
    export function symlink(srcpath: string | Buffer, dstpath: string | Buffer, type?: string, callback?: (err?: NodeJS.ErrnoException) => void): void;
    export function symlinkSync(srcpath: string | Buffer, dstpath: string | Buffer, type?: string): void;
    export function readlink(path: string | Buffer, callback?: (err: NodeJS.ErrnoException, linkString: string) => any): void;
    export function readlinkSync(path: string | Buffer): string;
    export function realpath(path: string | Buffer, callback?: (err: NodeJS.ErrnoException, resolvedPath: string) => any): void;
    export function realpath(path: string | Buffer, cache: { [path: string]: string }, callback: (err: NodeJS.ErrnoException, resolvedPath: string) => any): void;
    export function realpathSync(path: string | Buffer, cache?: { [path: string]: string }): string;
    /*
     * Asynchronous unlink - deletes the file specified in {path}
     *
     * @param path
     * @param callback No arguments other than a possible exception are given to the completion callback.
     */
    export function unlink(path: string | Buffer, callback?: (err?: NodeJS.ErrnoException) => void): void;
    /*
     * Synchronous unlink - deletes the file specified in {path}
     *
     * @param path
     */
    export function unlinkSync(path: string | Buffer): void;
    /*
     * Asynchronous rmdir - removes the directory specified in {path}
     *
     * @param path
     * @param callback No arguments other than a possible exception are given to the completion callback.
     */
    export function rmdir(path: string | Buffer, callback?: (err?: NodeJS.ErrnoException) => void): void;
    /*
     * Synchronous rmdir - removes the directory specified in {path}
     *
     * @param path
     */
    export function rmdirSync(path: string | Buffer): void;
    /*
     * Asynchronous mkdir - creates the directory specified in {path}.  Parameter {mode} defaults to 0777.
     *
     * @param path
     * @param callback No arguments other than a possible exception are given to the completion callback.
     */
    export function mkdir(path: string | Buffer, callback?: (err?: NodeJS.ErrnoException) => void): void;
    /*
     * Asynchronous mkdir - creates the directory specified in {path}.  Parameter {mode} defaults to 0777.
     *
     * @param path
     * @param mode
     * @param callback No arguments other than a possible exception are given to the completion callback.
     */
    export function mkdir(path: string | Buffer, mode: number, callback?: (err?: NodeJS.ErrnoException) => void): void;
    /*
     * Asynchronous mkdir - creates the directory specified in {path}.  Parameter {mode} defaults to 0777.
     *
     * @param path
     * @param mode
     * @param callback No arguments other than a possible exception are given to the completion callback.
     */
    export function mkdir(path: string | Buffer, mode: string, callback?: (err?: NodeJS.ErrnoException) => void): void;
    /*
     * Synchronous mkdir - creates the directory specified in {path}.  Parameter {mode} defaults to 0777.
     *
     * @param path
     * @param mode
     * @param callback No arguments other than a possible exception are given to the completion callback.
     */
    export function mkdirSync(path: string | Buffer, mode?: number): void;
    /*
     * Synchronous mkdir - creates the directory specified in {path}.  Parameter {mode} defaults to 0777.
     *
     * @param path
     * @param mode
     * @param callback No arguments other than a possible exception are given to the completion callback.
     */
    export function mkdirSync(path: string | Buffer, mode?: string): void;
    /*
     * Asynchronous mkdtemp - Creates a unique temporary directory. Generates six random characters to be appended behind a required prefix to create a unique temporary directory.
     *
     * @param prefix
     * @param callback The created folder path is passed as a string to the callback's second parameter.
     */
    export function mkdtemp(prefix: string, callback?: (err: NodeJS.ErrnoException, folder: string) => void): void;
    /*
     * Synchronous mkdtemp - Creates a unique temporary directory. Generates six random characters to be appended behind a required prefix to create a unique temporary directory.
     *
     * @param prefix
     * @returns Returns the created folder path.
     */
    export function mkdtempSync(prefix: string): string;
    export function readdir(path: string | Buffer, callback?: (err: NodeJS.ErrnoException, files: string[]) => void): void;
    export function readdirSync(path: string | Buffer): string[];
    export function close(fd: number, callback?: (err?: NodeJS.ErrnoException) => void): void;
    export function closeSync(fd: number): void;
    export function open(path: string | Buffer, flags: string | number, callback: (err: NodeJS.ErrnoException, fd: number) => void): void;
    export function open(path: string | Buffer, flags: string | number, mode: number, callback: (err: NodeJS.ErrnoException, fd: number) => void): void;
    export function openSync(path: string | Buffer, flags: string | number, mode?: number): number;
    export function utimes(path: string | Buffer, atime: number, mtime: number, callback?: (err?: NodeJS.ErrnoException) => void): void;
    export function utimes(path: string | Buffer, atime: Date, mtime: Date, callback?: (err?: NodeJS.ErrnoException) => void): void;
    export function utimesSync(path: string | Buffer, atime: number, mtime: number): void;
    export function utimesSync(path: string | Buffer, atime: Date, mtime: Date): void;
    export function futimes(fd: number, atime: number, mtime: number, callback?: (err?: NodeJS.ErrnoException) => void): void;
    export function futimes(fd: number, atime: Date, mtime: Date, callback?: (err?: NodeJS.ErrnoException) => void): void;
    export function futimesSync(fd: number, atime: number, mtime: number): void;
    export function futimesSync(fd: number, atime: Date, mtime: Date): void;
    export function fsync(fd: number, callback?: (err?: NodeJS.ErrnoException) => void): void;
    export function fsyncSync(fd: number): void;
    export function write(fd: number, buffer: Buffer, offset: number, length: number, position: number, callback?: (err: NodeJS.ErrnoException, written: number, buffer: Buffer) => void): void;
    export function write(fd: number, buffer: Buffer, offset: number, length: number, callback?: (err: NodeJS.ErrnoException, written: number, buffer: Buffer) => void): void;
    export function write(fd: number, data: any, callback?: (err: NodeJS.ErrnoException, written: number, str: string) => void): void;
    export function write(fd: number, data: any, offset: number, callback?: (err: NodeJS.ErrnoException, written: number, str: string) => void): void;
    export function write(fd: number, data: any, offset: number, encoding: string, callback?: (err: NodeJS.ErrnoException, written: number, str: string) => void): void;
    export function writeSync(fd: number, buffer: Buffer, offset: number, length: number, position?: number): number;
    export function writeSync(fd: number, data: any, position?: number, enconding?: string): number;
    export function read(fd: number, buffer: Buffer, offset: number, length: number, position: number, callback?: (err: NodeJS.ErrnoException, bytesRead: number, buffer: Buffer) => void): void;
    export function readSync(fd: number, buffer: Buffer, offset: number, length: number, position: number): number;
    /*
     * Asynchronous readFile - Asynchronously reads the entire contents of a file.
     *
     * @param fileName
     * @param encoding
     * @param callback - The callback is passed two arguments (err, data), where data is the contents of the file.
     */
    export function readFile(filename: string, encoding: string, callback: (err: NodeJS.ErrnoException, data: string) => void): void;
    /*
     * Asynchronous readFile - Asynchronously reads the entire contents of a file.
     *
     * @param fileName
     * @param options An object with optional {encoding} and {flag} properties.  If {encoding} is specified, readFile returns a string; otherwise it returns a Buffer.
     * @param callback - The callback is passed two arguments (err, data), where data is the contents of the file.
     */
    export function readFile(filename: string, options: { encoding: string; flag?: string; }, callback: (err: NodeJS.ErrnoException, data: string) => void): void;
    /*
     * Asynchronous readFile - Asynchronously reads the entire contents of a file.
     *
     * @param fileName
     * @param options An object with optional {encoding} and {flag} properties.  If {encoding} is specified, readFile returns a string; otherwise it returns a Buffer.
     * @param callback - The callback is passed two arguments (err, data), where data is the contents of the file.
     */
    export function readFile(filename: string, options: { flag?: string; }, callback: (err: NodeJS.ErrnoException, data: Buffer) => void): void;
    /*
     * Asynchronous readFile - Asynchronously reads the entire contents of a file.
     *
     * @param fileName
     * @param callback - The callback is passed two arguments (err, data), where data is the contents of the file.
     */
    export function readFile(filename: string, callback: (err: NodeJS.ErrnoException, data: Buffer) => void): void;
    /*
     * Synchronous readFile - Synchronously reads the entire contents of a file.
     *
     * @param fileName
     * @param encoding
     */
    export function readFileSync(filename: string, encoding: string): string;
    /*
     * Synchronous readFile - Synchronously reads the entire contents of a file.
     *
     * @param fileName
     * @param options An object with optional {encoding} and {flag} properties.  If {encoding} is specified, readFileSync returns a string; otherwise it returns a Buffer.
     */
    export function readFileSync(filename: string, options: { encoding: string; flag?: string; }): string;
    /*
     * Synchronous readFile - Synchronously reads the entire contents of a file.
     *
     * @param fileName
     * @param options An object with optional {encoding} and {flag} properties.  If {encoding} is specified, readFileSync returns a string; otherwise it returns a Buffer.
     */
    export function readFileSync(filename: string, options?: { flag?: string; }): Buffer;
    export function writeFile(filename: string | number, data: any, callback?: (err: NodeJS.ErrnoException) => void): void;
    export function writeFile(filename: string | number, data: any, options: { encoding?: string; mode?: number; flag?: string; }, callback?: (err: NodeJS.ErrnoException) => void): void;
    export function writeFile(filename: string | number, data: any, options: { encoding?: string; mode?: string; flag?: string; }, callback?: (err: NodeJS.ErrnoException) => void): void;
    export function writeFileSync(filename: string, data: any, options?: { encoding?: string; mode?: number; flag?: string; }): void;
    export function writeFileSync(filename: string, data: any, options?: { encoding?: string; mode?: string; flag?: string; }): void;
    export function appendFile(filename: string, data: any, options: { encoding?: string; mode?: number; flag?: string; }, callback?: (err: NodeJS.ErrnoException) => void): void;
    export function appendFile(filename: string, data: any, options: { encoding?: string; mode?: string; flag?: string; }, callback?: (err: NodeJS.ErrnoException) => void): void;
    export function appendFile(filename: string, data: any, callback?: (err: NodeJS.ErrnoException) => void): void;
    export function appendFileSync(filename: string, data: any, options?: { encoding?: string; mode?: number; flag?: string; }): void;
    export function appendFileSync(filename: string, data: any, options?: { encoding?: string; mode?: string; flag?: string; }): void;
    export function watchFile(filename: string, listener: (curr: Stats, prev: Stats) => void): void;
    export function watchFile(filename: string, options: { persistent?: boolean; interval?: number; }, listener: (curr: Stats, prev: Stats) => void): void;
    export function unwatchFile(filename: string, listener?: (curr: Stats, prev: Stats) => void): void;
    export function watch(filename: string, listener?: (event: string, filename: string) => any): FSWatcher;
    export function watch(filename: string, encoding: string, listener?: (event: string, filename: string | Buffer) => any): FSWatcher;
    export function watch(filename: string, options: { persistent?: boolean; recursive?: boolean; encoding?: string }, listener?: (event: string, filename: string | Buffer) => any): FSWatcher;
    export function exists(path: string | Buffer, callback?: (exists: boolean) => void): void;
    export function existsSync(path: string | Buffer): boolean;

    export namespace constants {
        // File Access Constants

        /** Constant for fs.access(). File is visible to the calling process. */
        export const F_OK: number;

        /** Constant for fs.access(). File can be read by the calling process. */
        export const R_OK: number;

        /** Constant for fs.access(). File can be written by the calling process. */
        export const W_OK: number;

        /** Constant for fs.access(). File can be executed by the calling process. */
        export const X_OK: number;

        // File Open Constants

        /** Constant for fs.open(). Flag indicating to open a file for read-only access. */
        export const O_RDONLY: number;

        /** Constant for fs.open(). Flag indicating to open a file for write-only access. */
        export const O_WRONLY: number;

        /** Constant for fs.open(). Flag indicating to open a file for read-write access. */
        export const O_RDWR: number;

        /** Constant for fs.open(). Flag indicating to create the file if it does not already exist. */
        export const O_CREAT: number;

        /** Constant for fs.open(). Flag indicating that opening a file should fail if the O_CREAT flag is set and the file already exists. */
        export const O_EXCL: number;

        /** Constant for fs.open(). Flag indicating that if path identifies a terminal device, opening the path shall not cause that terminal to become the controlling terminal for the process (if the process does not already have one). */
        export const O_NOCTTY: number;

        /** Constant for fs.open(). Flag indicating that if the file exists and is a regular file, and the file is opened successfully for write access, its length shall be truncated to zero. */
        export const O_TRUNC: number;

        /** Constant for fs.open(). Flag indicating that data will be appended to the end of the file. */
        export const O_APPEND: number;

        /** Constant for fs.open(). Flag indicating that the open should fail if the path is not a directory. */
        export const O_DIRECTORY: number;

        /** Constant for fs.open(). Flag indicating reading accesses to the file system will no longer result in an update to the atime information associated with the file. This flag is available on Linux operating systems only. */
        export const O_NOATIME: number;

        /** Constant for fs.open(). Flag indicating that the open should fail if the path is a symbolic link. */
        export const O_NOFOLLOW: number;

        /** Constant for fs.open(). Flag indicating that the file is opened for synchronous I/O. */
        export const O_SYNC: number;

        /** Constant for fs.open(). Flag indicating to open the symbolic link itself rather than the resource it is pointing to. */
        export const O_SYMLINK: number;

        /** Constant for fs.open(). When set, an attempt will be made to minimize caching effects of file I/O. */
        export const O_DIRECT: number;

        /** Constant for fs.open(). Flag indicating to open the file in nonblocking mode when possible. */
        export const O_NONBLOCK: number;

        // File Type Constants

        /** Constant for fs.Stats mode property for determining a file's type. Bit mask used to extract the file type code. */
        export const S_IFMT: number;

        /** Constant for fs.Stats mode property for determining a file's type. File type constant for a regular file. */
        export const S_IFREG: number;

        /** Constant for fs.Stats mode property for determining a file's type. File type constant for a directory. */
        export const S_IFDIR: number;

        /** Constant for fs.Stats mode property for determining a file's type. File type constant for a character-oriented device file. */
        export const S_IFCHR: number;

        /** Constant for fs.Stats mode property for determining a file's type. File type constant for a block-oriented device file. */
        export const S_IFBLK: number;

        /** Constant for fs.Stats mode property for determining a file's type. File type constant for a FIFO/pipe. */
        export const S_IFIFO: number;

        /** Constant for fs.Stats mode property for determining a file's type. File type constant for a symbolic link. */
        export const S_IFLNK: number;

        /** Constant for fs.Stats mode property for determining a file's type. File type constant for a socket. */
        export const S_IFSOCK: number;

        // File Mode Constants

        /** Constant for fs.Stats mode property for determining access permissions for a file. File mode indicating readable, writable and executable by owner. */
        export const S_IRWXU: number;

        /** Constant for fs.Stats mode property for determining access permissions for a file. File mode indicating readable by owner. */
        export const S_IRUSR: number;

        /** Constant for fs.Stats mode property for determining access permissions for a file. File mode indicating writable by owner. */
        export const S_IWUSR: number;

        /** Constant for fs.Stats mode property for determining access permissions for a file. File mode indicating executable by owner. */
        export const S_IXUSR: number;

        /** Constant for fs.Stats mode property for determining access permissions for a file. File mode indicating readable, writable and executable by group. */
        export const S_IRWXG: number;

        /** Constant for fs.Stats mode property for determining access permissions for a file. File mode indicating readable by group. */
        export const S_IRGRP: number;

        /** Constant for fs.Stats mode property for determining access permissions for a file. File mode indicating writable by group. */
        export const S_IWGRP: number;

        /** Constant for fs.Stats mode property for determining access permissions for a file. File mode indicating executable by group. */
        export const S_IXGRP: number;

        /** Constant for fs.Stats mode property for determining access permissions for a file. File mode indicating readable, writable and executable by others. */
        export const S_IRWXO: number;

        /** Constant for fs.Stats mode property for determining access permissions for a file. File mode indicating readable by others. */
        export const S_IROTH: number;

        /** Constant for fs.Stats mode property for determining access permissions for a file. File mode indicating writable by others. */
        export const S_IWOTH: number;

        /** Constant for fs.Stats mode property for determining access permissions for a file. File mode indicating executable by others. */
        export const S_IXOTH: number;
    }

    /** Tests a user's permissions for the file specified by path. */
    export function access(path: string | Buffer, callback: (err: NodeJS.ErrnoException) => void): void;
    export function access(path: string | Buffer, mode: number, callback: (err: NodeJS.ErrnoException) => void): void;
    /** Synchronous version of fs.access. This throws if any accessibility checks fail, and does nothing otherwise. */
    export function accessSync(path: string | Buffer, mode?: number): void;
    export function createReadStream(path: string | Buffer, options?: {
        flags?: string;
        encoding?: string;
        fd?: number;
        mode?: number;
        autoClose?: boolean;
        start?: number;
        end?: number;
    }): ReadStream;
    export function createWriteStream(path: string | Buffer, options?: {
        flags?: string;
        encoding?: string;
        fd?: number;
        mode?: number;
        autoClose?: boolean;
        start?: number;
    }): WriteStream;
    export function fdatasync(fd: number, callback: Function): void;
    export function fdatasyncSync(fd: number): void;
}

declare module "path" {

    /**
     * A parsed path object generated by path.parse() or consumed by path.format().
     */
    export interface ParsedPath {
        /**
         * The root of the path such as '/' or 'c:\'
         */
        root: string;
        /**
         * The full directory path such as '/home/user/dir' or 'c:\path\dir'
         */
        dir: string;
        /**
         * The file name including extension (if any) such as 'index.html'
         */
        base: string;
        /**
         * The file extension (if any) such as '.html'
         */
        ext: string;
        /**
         * The file name without extension (if any) such as 'index'
         */
        name: string;
    }

    /**
     * Normalize a string path, reducing '..' and '.' parts.
     * When multiple slashes are found, they're replaced by a single one; when the path contains a trailing slash, it is preserved. On Windows backslashes are used.
     *
     * @param p string path to normalize.
     */
    export function normalize(p: string): string;
    /**
     * Join all arguments together and normalize the resulting path.
     * Arguments must be strings. In v0.8, non-string arguments were silently ignored. In v0.10 and up, an exception is thrown.
     *
     * @param paths paths to join.
     */
    export function join(...paths: string[]): string;
    /**
     * The right-most parameter is considered {to}.  Other parameters are considered an array of {from}.
     *
     * Starting from leftmost {from} paramter, resolves {to} to an absolute path.
     *
     * If {to} isn't already absolute, {from} arguments are prepended in right to left order, until an absolute path is found. If after using all {from} paths still no absolute path is found, the current working directory is used as well. The resulting path is normalized, and trailing slashes are removed unless the path gets resolved to the root directory.
     *
     * @param pathSegments string paths to join.  Non-string arguments are ignored.
     */
    export function resolve(...pathSegments: any[]): string;
    /**
     * Determines whether {path} is an absolute path. An absolute path will always resolve to the same location, regardless of the working directory.
     *
     * @param path path to test.
     */
    export function isAbsolute(path: string): boolean;
    /**
     * Solve the relative path from {from} to {to}.
     * At times we have two absolute paths, and we need to derive the relative path from one to the other. This is actually the reverse transform of path.resolve.
     *
     * @param from
     * @param to
     */
    export function relative(from: string, to: string): string;
    /**
     * Return the directory name of a path. Similar to the Unix dirname command.
     *
     * @param p the path to evaluate.
     */
    export function dirname(p: string): string;
    /**
     * Return the last portion of a path. Similar to the Unix basename command.
     * Often used to extract the file name from a fully qualified path.
     *
     * @param p the path to evaluate.
     * @param ext optionally, an extension to remove from the result.
     */
    export function basename(p: string, ext?: string): string;
    /**
     * Return the extension of the path, from the last '.' to end of string in the last portion of the path.
     * If there is no '.' in the last portion of the path or the first character of it is '.', then it returns an empty string
     *
     * @param p the path to evaluate.
     */
    export function extname(p: string): string;
    /**
     * The platform-specific file separator. '\\' or '/'.
     */
    export var sep: string;
    /**
     * The platform-specific file delimiter. ';' or ':'.
     */
    export var delimiter: string;
    /**
     * Returns an object from a path string - the opposite of format().
     *
     * @param pathString path to evaluate.
     */
    export function parse(pathString: string): ParsedPath;
    /**
     * Returns a path string from an object - the opposite of parse().
     *
     * @param pathString path to evaluate.
     */
    export function format(pathObject: ParsedPath): string;

    export module posix {
        export function normalize(p: string): string;
        export function join(...paths: any[]): string;
        export function resolve(...pathSegments: any[]): string;
        export function isAbsolute(p: string): boolean;
        export function relative(from: string, to: string): string;
        export function dirname(p: string): string;
        export function basename(p: string, ext?: string): string;
        export function extname(p: string): string;
        export var sep: string;
        export var delimiter: string;
        export function parse(p: string): ParsedPath;
        export function format(pP: ParsedPath): string;
    }

    export module win32 {
        export function normalize(p: string): string;
        export function join(...paths: any[]): string;
        export function resolve(...pathSegments: any[]): string;
        export function isAbsolute(p: string): boolean;
        export function relative(from: string, to: string): string;
        export function dirname(p: string): string;
        export function basename(p: string, ext?: string): string;
        export function extname(p: string): string;
        export var sep: string;
        export var delimiter: string;
        export function parse(p: string): ParsedPath;
        export function format(pP: ParsedPath): string;
    }
}

declare module "string_decoder" {
    export interface NodeStringDecoder {
        write(buffer: Buffer): string;
        end(buffer?: Buffer): string;
    }
    export var StringDecoder: {
        new (encoding?: string): NodeStringDecoder;
    };
}

declare module "tls" {
    import * as crypto from "crypto";
    import * as net from "net";
    import * as stream from "stream";

    var CLIENT_RENEG_LIMIT: number;
    var CLIENT_RENEG_WINDOW: number;

    export interface Certificate {
        /**
         * Country code.
         */
        C: string;
        /**
         * Street.
         */
        ST: string;
        /**
         * Locality.
         */
        L: string;
        /**
         * Organization.
         */
        O: string;
        /**
         * Organizational unit.
         */
        OU: string;
        /**
         * Common name.
         */
        CN: string;
    }

    export interface CipherNameAndProtocol {
        /**
         * The cipher name.
         */
        name: string;
        /**
         * SSL/TLS protocol version.
         */
        version: string;
    }

    export class TLSSocket extends stream.Duplex {
        /**
         * Construct a new tls.TLSSocket object from an existing TCP socket.
         */
        constructor(socket: net.Socket, options?: {
            /**
             * An optional TLS context object from tls.createSecureContext()
             */
            secureContext?: SecureContext,
            /**
             * If true the TLS socket will be instantiated in server-mode.
             * Defaults to false.
             */
            isServer?: boolean,
            /**
             * An optional net.Server instance.
             */
            server?: net.Server,
            /**
             * If true the server will request a certificate from clients that
             * connect and attempt to verify that certificate. Defaults to
             * false.
             */
            requestCert?: boolean,
            /**
             * If true the server will reject any connection which is not
             * authorized with the list of supplied CAs. This option only has an
             * effect if requestCert is true. Defaults to false.
             */
            rejectUnauthorized?: boolean,
            /**
             * An array of strings or a Buffer naming possible NPN protocols.
             * (Protocols should be ordered by their priority.)
             */
            NPNProtocols?: string[] | Buffer,
            /**
             * An array of strings or a Buffer naming possible ALPN protocols.
             * (Protocols should be ordered by their priority.) When the server
             * receives both NPN and ALPN extensions from the client, ALPN takes
             * precedence over NPN and the server does not send an NPN extension
             * to the client.
             */
            ALPNProtocols?: string[] | Buffer,
            /**
             * SNICallback(servername, cb) <Function> A function that will be
             * called if the client supports SNI TLS extension. Two arguments
             * will be passed when called: servername and cb. SNICallback should
             * invoke cb(null, ctx), where ctx is a SecureContext instance.
             * (tls.createSecureContext(...) can be used to get a proper
             * SecureContext.) If SNICallback wasn't provided the default callback
             * with high-level API will be used (see below).
             */
            SNICallback?: Function,
            /**
             * An optional Buffer instance containing a TLS session.
             */
            session?: Buffer,
            /**
             * If true, specifies that the OCSP status request extension will be
             * added to the client hello and an 'OCSPResponse' event will be
             * emitted on the socket before establishing a secure communication
             */
            requestOCSP?: boolean
        });
        /**
         * Returns the bound address, the address family name and port of the underlying socket as reported by
         * the operating system.
         * @returns {any} - An object with three properties, e.g. { port: 12346, family: 'IPv4', address: '127.0.0.1' }.
         */
        address(): { port: number; family: string; address: string };
        /**
         * A boolean that is true if the peer certificate was signed by one of the specified CAs, otherwise false.
         */
        authorized: boolean;
        /**
         * The reason why the peer's certificate has not been verified.
         * This property becomes available only when tlsSocket.authorized === false.
         */
        authorizationError: Error;
        /**
         * Static boolean value, always true.
         * May be used to distinguish TLS sockets from regular ones.
         */
        encrypted: boolean;
        /**
         * Returns an object representing the cipher name and the SSL/TLS protocol version of the current connection.
         * @returns {CipherNameAndProtocol} - Returns an object representing the cipher name
         * and the SSL/TLS protocol version of the current connection.
         */
        getCipher(): CipherNameAndProtocol;
        /**
         * Returns an object representing the peer's certificate.
         * The returned object has some properties corresponding to the field of the certificate.
         * If detailed argument is true the full chain with issuer property will be returned,
         * if false only the top certificate without issuer property.
         * If the peer does not provide a certificate, it returns null or an empty object.
         * @param {boolean} detailed - If true; the full chain with issuer property will be returned.
         * @returns {any} - An object representing the peer's certificate.
         */
        getPeerCertificate(detailed?: boolean): {
            subject: Certificate;
            issuerInfo: Certificate;
            issuer: Certificate;
            raw: any;
            valid_from: string;
            valid_to: string;
            fingerprint: string;
            serialNumber: string;
        };
        /**
         * Could be used to speed up handshake establishment when reconnecting to the server.
         * @returns {any} - ASN.1 encoded TLS session or undefined if none was negotiated.
         */
        getSession(): any;
        /**
         * NOTE: Works only with client TLS sockets.
         * Useful only for debugging, for session reuse provide session option to tls.connect().
         * @returns {any} - TLS session ticket or undefined if none was negotiated.
         */
        getTLSTicket(): any;
        /**
         * The string representation of the local IP address.
         */
        localAddress: string;
        /**
         * The numeric representation of the local port.
         */
        localPort: string;
        /**
         * The string representation of the remote IP address.
         * For example, '74.125.127.100' or '2001:4860:a005::68'.
         */
        remoteAddress: string;
        /**
         * The string representation of the remote IP family. 'IPv4' or 'IPv6'.
         */
        remoteFamily: string;
        /**
         * The numeric representation of the remote port. For example, 443.
         */
        remotePort: number;
        /**
         * Initiate TLS renegotiation process.
         *
         * NOTE: Can be used to request peer's certificate after the secure connection has been established.
         * ANOTHER NOTE: When running as the server, socket will be destroyed with an error after handshakeTimeout timeout.
         * @param {TlsOptions} options - The options may contain the following fields: rejectUnauthorized,
         * requestCert (See tls.createServer() for details).
         * @param {Function} callback - callback(err) will be executed with null as err, once the renegotiation
         * is successfully completed.
         */
        renegotiate(options: TlsOptions, callback: (err: Error) => any): any;
        /**
         * Set maximum TLS fragment size (default and maximum value is: 16384, minimum is: 512).
         * Smaller fragment size decreases buffering latency on the client: large fragments are buffered by
         * the TLS layer until the entire fragment is received and its integrity is verified;
         * large fragments can span multiple roundtrips, and their processing can be delayed due to packet
         * loss or reordering. However, smaller fragments add extra TLS framing bytes and CPU overhead,
         * which may decrease overall server throughput.
         * @param {number} size - TLS fragment size (default and maximum value is: 16384, minimum is: 512).
         * @returns {boolean} - Returns true on success, false otherwise.
         */
        setMaxSendFragment(size: number): boolean;

        /**
         * events.EventEmitter
         * 1. OCSPResponse
         * 2. secureConnect
         **/
        addListener(event: string, listener: Function): this;
        addListener(event: "OCSPResponse", listener: (response: Buffer) => void): this;
        addListener(event: "secureConnect", listener: () => void): this;

        emit(event: string, ...args: any[]): boolean;
        emit(event: "OCSPResponse", response: Buffer): boolean;
        emit(event: "secureConnect"): boolean;

        on(event: string, listener: Function): this;
        on(event: "OCSPResponse", listener: (response: Buffer) => void): this;
        on(event: "secureConnect", listener: () => void): this;

        once(event: string, listener: Function): this;
        once(event: "OCSPResponse", listener: (response: Buffer) => void): this;
        once(event: "secureConnect", listener: () => void): this;

        prependListener(event: string, listener: Function): this;
        prependListener(event: "OCSPResponse", listener: (response: Buffer) => void): this;
        prependListener(event: "secureConnect", listener: () => void): this;

        prependOnceListener(event: string, listener: Function): this;
        prependOnceListener(event: "OCSPResponse", listener: (response: Buffer) => void): this;
        prependOnceListener(event: "secureConnect", listener: () => void): this;
    }

    export interface TlsOptions {
        host?: string;
        port?: number;
        pfx?: string | Buffer[];
        key?: string | string[] | Buffer | any[];
        passphrase?: string;
        cert?: string | string[] | Buffer | Buffer[];
        ca?: string | string[] | Buffer | Buffer[];
        crl?: string | string[];
        ciphers?: string;
        honorCipherOrder?: boolean;
        requestCert?: boolean;
        rejectUnauthorized?: boolean;
        NPNProtocols?: string[] | Buffer;
        SNICallback?: (servername: string, cb: (err: Error, ctx: SecureContext) => any) => any;
        ecdhCurve?: string;
        dhparam?: string | Buffer;
        handshakeTimeout?: number;
        ALPNProtocols?: string[] | Buffer;
        sessionTimeout?: number;
        ticketKeys?: any;
        sessionIdContext?: string;
        secureProtocol?: string;
    }

    export interface ConnectionOptions {
        host?: string;
        port?: number;
        socket?: net.Socket;
        pfx?: string | Buffer
        key?: string | string[] | Buffer | Buffer[];
        passphrase?: string;
        cert?: string | string[] | Buffer | Buffer[];
        ca?: string | Buffer | (string | Buffer)[];
        rejectUnauthorized?: boolean;
        NPNProtocols?: (string | Buffer)[];
        servername?: string;
        path?: string;
        ALPNProtocols?: (string | Buffer)[];
        checkServerIdentity?: (servername: string, cert: string | Buffer | (string | Buffer)[]) => any;
        secureProtocol?: string;
        secureContext?: Object;
        session?: Buffer;
        minDHSize?: number;
    }

    export interface Server extends net.Server {
        close(callback?: Function): Server;
        address(): { port: number; family: string; address: string; };
        addContext(hostName: string, credentials: {
            key: string;
            cert: string;
            ca: string;
        }): void;
        maxConnections: number;
        connections: number;

        /**
         * events.EventEmitter
         * 1. tlsClientError
         * 2. newSession
         * 3. OCSPRequest
         * 4. resumeSession
         * 5. secureConnection
         **/
        addListener(event: string, listener: Function): this;
        addListener(event: "tlsClientError", listener: (err: Error, tlsSocket: TLSSocket) => void): this;
        addListener(event: "newSession", listener: (sessionId: any, sessionData: any, callback: (err: Error, resp: Buffer) => void) => void): this;
        addListener(event: "OCSPRequest", listener: (certificate: Buffer, issuer: Buffer, callback: Function) => void): this;
        addListener(event: "resumeSession", listener: (sessionId: any, callback: (err: Error, sessionData: any) => void) => void): this;
        addListener(event: "secureConnection", listener: (tlsSocket: TLSSocket) => void): this;

        emit(event: string, ...args: any[]): boolean;
        emit(event: "tlsClientError", err: Error, tlsSocket: TLSSocket): boolean;
        emit(event: "newSession", sessionId: any, sessionData: any, callback: (err: Error, resp: Buffer) => void): boolean;
        emit(event: "OCSPRequest", certificate: Buffer, issuer: Buffer, callback: Function): boolean;
        emit(event: "resumeSession", sessionId: any, callback: (err: Error, sessionData: any) => void): boolean;
        emit(event: "secureConnection", tlsSocket: TLSSocket): boolean;

        on(event: string, listener: Function): this;
        on(event: "tlsClientError", listener: (err: Error, tlsSocket: TLSSocket) => void): this;
        on(event: "newSession", listener: (sessionId: any, sessionData: any, callback: (err: Error, resp: Buffer) => void) => void): this;
        on(event: "OCSPRequest", listener: (certificate: Buffer, issuer: Buffer, callback: Function) => void): this;
        on(event: "resumeSession", listener: (sessionId: any, callback: (err: Error, sessionData: any) => void) => void): this;
        on(event: "secureConnection", listener: (tlsSocket: TLSSocket) => void): this;

        once(event: string, listener: Function): this;
        once(event: "tlsClientError", listener: (err: Error, tlsSocket: TLSSocket) => void): this;
        once(event: "newSession", listener: (sessionId: any, sessionData: any, callback: (err: Error, resp: Buffer) => void) => void): this;
        once(event: "OCSPRequest", listener: (certificate: Buffer, issuer: Buffer, callback: Function) => void): this;
        once(event: "resumeSession", listener: (sessionId: any, callback: (err: Error, sessionData: any) => void) => void): this;
        once(event: "secureConnection", listener: (tlsSocket: TLSSocket) => void): this;

        prependListener(event: string, listener: Function): this;
        prependListener(event: "tlsClientError", listener: (err: Error, tlsSocket: TLSSocket) => void): this;
        prependListener(event: "newSession", listener: (sessionId: any, sessionData: any, callback: (err: Error, resp: Buffer) => void) => void): this;
        prependListener(event: "OCSPRequest", listener: (certificate: Buffer, issuer: Buffer, callback: Function) => void): this;
        prependListener(event: "resumeSession", listener: (sessionId: any, callback: (err: Error, sessionData: any) => void) => void): this;
        prependListener(event: "secureConnection", listener: (tlsSocket: TLSSocket) => void): this;

        prependOnceListener(event: string, listener: Function): this;
        prependOnceListener(event: "tlsClientError", listener: (err: Error, tlsSocket: TLSSocket) => void): this;
        prependOnceListener(event: "newSession", listener: (sessionId: any, sessionData: any, callback: (err: Error, resp: Buffer) => void) => void): this;
        prependOnceListener(event: "OCSPRequest", listener: (certificate: Buffer, issuer: Buffer, callback: Function) => void): this;
        prependOnceListener(event: "resumeSession", listener: (sessionId: any, callback: (err: Error, sessionData: any) => void) => void): this;
        prependOnceListener(event: "secureConnection", listener: (tlsSocket: TLSSocket) => void): this;
    }

    export interface ClearTextStream extends stream.Duplex {
        authorized: boolean;
        authorizationError: Error;
        getPeerCertificate(): any;
        getCipher: {
            name: string;
            version: string;
        };
        address: {
            port: number;
            family: string;
            address: string;
        };
        remoteAddress: string;
        remotePort: number;
    }

    export interface SecurePair {
        encrypted: any;
        cleartext: any;
    }

    export interface SecureContextOptions {
        pfx?: string | Buffer;
        key?: string | Buffer;
        passphrase?: string;
        cert?: string | Buffer;
        ca?: string | Buffer;
        crl?: string | string[]
        ciphers?: string;
        honorCipherOrder?: boolean;
    }

    export interface SecureContext {
        context: any;
    }

    export function createServer(options: TlsOptions, secureConnectionListener?: (cleartextStream: ClearTextStream) => void): Server;
    export function connect(options: ConnectionOptions, secureConnectionListener?: () => void): ClearTextStream;
    export function connect(port: number, host?: string, options?: ConnectionOptions, secureConnectListener?: () => void): ClearTextStream;
    export function connect(port: number, options?: ConnectionOptions, secureConnectListener?: () => void): ClearTextStream;
    export function createSecurePair(credentials?: crypto.Credentials, isServer?: boolean, requestCert?: boolean, rejectUnauthorized?: boolean): SecurePair;
    export function createSecureContext(details: SecureContextOptions): SecureContext;
}

declare module "crypto" {
    export interface Certificate {
        exportChallenge(spkac: string | Buffer): Buffer;
        exportPublicKey(spkac: string | Buffer): Buffer;
        verifySpkac(spkac: Buffer): boolean;
    }
    export var Certificate: {
        new (): Certificate;
        (): Certificate;
    }

    export var fips: boolean;

    export interface CredentialDetails {
        pfx: string;
        key: string;
        passphrase: string;
        cert: string;
        ca: string | string[];
        crl: string | string[];
        ciphers: string;
    }
    export interface Credentials { context?: any; }
    export function createCredentials(details: CredentialDetails): Credentials;
    export function createHash(algorithm: string): Hash;
    export function createHmac(algorithm: string, key: string | Buffer): Hmac;

    type Utf8AsciiLatin1Encoding = "utf8" | "ascii" | "latin1";
    type HexBase64Latin1Encoding = "latin1" | "hex" | "base64";
    type Utf8AsciiBinaryEncoding = "utf8" | "ascii" | "binary";
    type HexBase64BinaryEncoding = "binary" | "base64" | "hex";
    type ECDHKeyFormat = "compressed" | "uncompressed" | "hybrid";

    export interface Hash extends NodeJS.ReadWriteStream {
        update(data: string | Buffer): Hash;
        update(data: string | Buffer, input_encoding: Utf8AsciiLatin1Encoding): Hash;
        digest(): Buffer;
        digest(encoding: HexBase64Latin1Encoding): string;
    }
    export interface Hmac extends NodeJS.ReadWriteStream {
        update(data: string | Buffer): Hmac;
        update(data: string | Buffer, input_encoding: Utf8AsciiLatin1Encoding): Hmac;
        digest(): Buffer;
        digest(encoding: HexBase64Latin1Encoding): string;
    }
    export function createCipher(algorithm: string, password: any): Cipher;
    export function createCipheriv(algorithm: string, key: any, iv: any): Cipher;
    export interface Cipher extends NodeJS.ReadWriteStream {
        update(data: Buffer): Buffer;
        update(data: string, input_encoding: Utf8AsciiBinaryEncoding): Buffer;
        update(data: Buffer, input_encoding: any, output_encoding: HexBase64BinaryEncoding): string;
        update(data: string, input_encoding: Utf8AsciiBinaryEncoding, output_encoding: HexBase64BinaryEncoding): string;
        final(): Buffer;
        final(output_encoding: string): string;
        setAutoPadding(auto_padding?: boolean): void;
        getAuthTag(): Buffer;
        setAAD(buffer: Buffer): void;
    }
    export function createDecipher(algorithm: string, password: any): Decipher;
    export function createDecipheriv(algorithm: string, key: any, iv: any): Decipher;
    export interface Decipher extends NodeJS.ReadWriteStream {
        update(data: Buffer): Buffer;
        update(data: string, input_encoding: HexBase64BinaryEncoding): Buffer;
        update(data: Buffer, input_encoding: any, output_encoding: Utf8AsciiBinaryEncoding): string;
        update(data: string, input_encoding: HexBase64BinaryEncoding, output_encoding: Utf8AsciiBinaryEncoding): string;
        final(): Buffer;
        final(output_encoding: string): string;
        setAutoPadding(auto_padding?: boolean): void;
        setAuthTag(tag: Buffer): void;
        setAAD(buffer: Buffer): void;
    }
    export function createSign(algorithm: string): Signer;
    export interface Signer extends NodeJS.WritableStream {
        update(data: string | Buffer): Signer;
        update(data: string | Buffer, input_encoding: Utf8AsciiLatin1Encoding): Signer;
        sign(private_key: string | { key: string; passphrase: string }): Buffer;
        sign(private_key: string | { key: string; passphrase: string }, output_format: HexBase64Latin1Encoding): string;
    }
    export function createVerify(algorith: string): Verify;
    export interface Verify extends NodeJS.WritableStream {
        update(data: string | Buffer): Verify;
        update(data: string | Buffer, input_encoding: Utf8AsciiLatin1Encoding): Verify;
        verify(object: string, signature: Buffer): boolean;
        verify(object: string, signature: string, signature_format: HexBase64Latin1Encoding): boolean;
    }
    export function createDiffieHellman(prime_length: number, generator?: number): DiffieHellman;
    export function createDiffieHellman(prime: Buffer): DiffieHellman;
    export function createDiffieHellman(prime: string, prime_encoding: HexBase64Latin1Encoding): DiffieHellman;
    export function createDiffieHellman(prime: string, prime_encoding: HexBase64Latin1Encoding, generator: number | Buffer): DiffieHellman;
    export function createDiffieHellman(prime: string, prime_encoding: HexBase64Latin1Encoding, generator: string, generator_encoding: HexBase64Latin1Encoding): DiffieHellman;
    export interface DiffieHellman {
        generateKeys(): Buffer;
        generateKeys(encoding: HexBase64Latin1Encoding): string;
        computeSecret(other_public_key: Buffer): Buffer;
        computeSecret(other_public_key: string, input_encoding: HexBase64Latin1Encoding): Buffer;
        computeSecret(other_public_key: string, input_encoding: HexBase64Latin1Encoding, output_encoding: HexBase64Latin1Encoding): string;
        getPrime(): Buffer;
        getPrime(encoding: HexBase64Latin1Encoding): string;
        getGenerator(): Buffer;
        getGenerator(encoding: HexBase64Latin1Encoding): string;
        getPublicKey(): Buffer;
        getPublicKey(encoding: HexBase64Latin1Encoding): string;
        getPrivateKey(): Buffer;
        getPrivateKey(encoding: HexBase64Latin1Encoding): string;
        setPublicKey(public_key: Buffer): void;
        setPublicKey(public_key: string, encoding: string): void;
        setPrivateKey(private_key: Buffer): void;
        setPrivateKey(private_key: string, encoding: string): void;
        verifyError: number;
    }
    export function getDiffieHellman(group_name: string): DiffieHellman;
    export function pbkdf2(password: string | Buffer, salt: string | Buffer, iterations: number, keylen: number, digest: string, callback: (err: Error, derivedKey: Buffer) => any): void;
    export function pbkdf2Sync(password: string | Buffer, salt: string | Buffer, iterations: number, keylen: number, digest: string): Buffer;
    export function randomBytes(size: number): Buffer;
    export function randomBytes(size: number, callback: (err: Error, buf: Buffer) => void): void;
    export function pseudoRandomBytes(size: number): Buffer;
    export function pseudoRandomBytes(size: number, callback: (err: Error, buf: Buffer) => void): void;
    export interface RsaPublicKey {
        key: string;
        padding?: number;
    }
    export interface RsaPrivateKey {
        key: string;
        passphrase?: string,
        padding?: number;
    }
    export function publicEncrypt(public_key: string | RsaPublicKey, buffer: Buffer): Buffer
    export function privateDecrypt(private_key: string | RsaPrivateKey, buffer: Buffer): Buffer
    export function privateEncrypt(private_key: string | RsaPrivateKey, buffer: Buffer): Buffer
    export function publicDecrypt(public_key: string | RsaPublicKey, buffer: Buffer): Buffer
    export function getCiphers(): string[];
    export function getCurves(): string[];
    export function getHashes(): string[];
    export interface ECDH {
        generateKeys(): Buffer;
        generateKeys(encoding: HexBase64Latin1Encoding): string;
        generateKeys(encoding: HexBase64Latin1Encoding, format: ECDHKeyFormat): string;
        computeSecret(other_public_key: Buffer): Buffer;
        computeSecret(other_public_key: string, input_encoding: HexBase64Latin1Encoding): Buffer;
        computeSecret(other_public_key: string, input_encoding: HexBase64Latin1Encoding, output_encoding: HexBase64Latin1Encoding): string;
        getPrivateKey(): Buffer;
        getPrivateKey(encoding: HexBase64Latin1Encoding): string;
        getPublicKey(): Buffer;
        getPublicKey(encoding: HexBase64Latin1Encoding): string;
        getPublicKey(encoding: HexBase64Latin1Encoding, format: ECDHKeyFormat): string;
        setPrivateKey(private_key: Buffer): void;
        setPrivateKey(private_key: string, encoding: HexBase64Latin1Encoding): void;
    }
    export function createECDH(curve_name: string): ECDH;
    export function timingSafeEqual(a: Buffer, b: Buffer): boolean;
    export var DEFAULT_ENCODING: string;
}

declare module "stream" {
    import * as events from "events";

    class internal extends events.EventEmitter {
        pipe<T extends NodeJS.WritableStream>(destination: T, options?: { end?: boolean; }): T;
    }
    namespace internal {

        export class Stream extends internal { }

        export interface ReadableOptions {
            highWaterMark?: number;
            encoding?: string;
            objectMode?: boolean;
            read?: (size?: number) => any;
        }

        export class Readable extends events.EventEmitter implements NodeJS.ReadableStream {
            readable: boolean;
            constructor(opts?: ReadableOptions);
            protected _read(size: number): void;
            read(size?: number): any;
            setEncoding(encoding: string): void;
            pause(): Readable;
            resume(): Readable;
            isPaused(): boolean;
            pipe<T extends NodeJS.WritableStream>(destination: T, options?: { end?: boolean; }): T;
            unpipe<T extends NodeJS.WritableStream>(destination?: T): void;
            unshift(chunk: any): void;
            wrap(oldStream: NodeJS.ReadableStream): NodeJS.ReadableStream;
            push(chunk: any, encoding?: string): boolean;

            /**
             * Event emitter
             * The defined events on documents including:
             *   1. close
             *   2. data
             *   3. end
             *   4. readable
             *   5. error
             **/
            addListener(event: string, listener: Function): this;
            addListener(event: string, listener: Function): this;
            addListener(event: "close", listener: () => void): this;
            addListener(event: "data", listener: (chunk: Buffer | string) => void): this;
            addListener(event: "end", listener: () => void): this;
            addListener(event: "readable", listener: () => void): this;
            addListener(event: "error", listener: (err: Error) => void): this;

            emit(event: string, ...args: any[]): boolean;
            emit(event: "close"): boolean;
            emit(event: "data", chunk: Buffer | string): boolean;
            emit(event: "end"): boolean;
            emit(event: "readable"): boolean;
            emit(event: "error", err: Error): boolean;

            on(event: string, listener: Function): this;
            on(event: "close", listener: () => void): this;
            on(event: "data", listener: (chunk: Buffer | string) => void): this;
            on(event: "end", listener: () => void): this;
            on(event: "readable", listener: () => void): this;
            on(event: "error", listener: (err: Error) => void): this;

            once(event: string, listener: Function): this;
            once(event: "close", listener: () => void): this;
            once(event: "data", listener: (chunk: Buffer | string) => void): this;
            once(event: "end", listener: () => void): this;
            once(event: "readable", listener: () => void): this;
            once(event: "error", listener: (err: Error) => void): this;

            prependListener(event: string, listener: Function): this;
            prependListener(event: "close", listener: () => void): this;
            prependListener(event: "data", listener: (chunk: Buffer | string) => void): this;
            prependListener(event: "end", listener: () => void): this;
            prependListener(event: "readable", listener: () => void): this;
            prependListener(event: "error", listener: (err: Error) => void): this;

            prependOnceListener(event: string, listener: Function): this;
            prependOnceListener(event: "close", listener: () => void): this;
            prependOnceListener(event: "data", listener: (chunk: Buffer | string) => void): this;
            prependOnceListener(event: "end", listener: () => void): this;
            prependOnceListener(event: "readable", listener: () => void): this;
            prependOnceListener(event: "error", listener: (err: Error) => void): this;

            removeListener(event: string, listener: Function): this;
            removeListener(event: "close", listener: () => void): this;
            removeListener(event: "data", listener: (chunk: Buffer | string) => void): this;
            removeListener(event: "end", listener: () => void): this;
            removeListener(event: "readable", listener: () => void): this;
            removeListener(event: "error", listener: (err: Error) => void): this;
        }

        export interface WritableOptions {
            highWaterMark?: number;
            decodeStrings?: boolean;
            objectMode?: boolean;
            write?: (chunk: string | Buffer, encoding: string, callback: Function) => any;
            writev?: (chunks: { chunk: string | Buffer, encoding: string }[], callback: Function) => any;
        }

        export class Writable extends events.EventEmitter implements NodeJS.WritableStream {
            writable: boolean;
            constructor(opts?: WritableOptions);
            protected _write(chunk: any, encoding: string, callback: Function): void;
            write(chunk: any, cb?: Function): boolean;
            write(chunk: any, encoding?: string, cb?: Function): boolean;
            end(): void;
            end(chunk: any, cb?: Function): void;
            end(chunk: any, encoding?: string, cb?: Function): void;

            /**
             * Event emitter
             * The defined events on documents including:
             *   1. close
             *   2. drain
             *   3. error
             *   4. finish
             *   5. pipe
             *   6. unpipe
             **/
            addListener(event: string, listener: Function): this;
            addListener(event: "close", listener: () => void): this;
            addListener(event: "drain", listener: () => void): this;
            addListener(event: "error", listener: (err: Error) => void): this;
            addListener(event: "finish", listener: () => void): this;
            addListener(event: "pipe", listener: (src: Readable) => void): this;
            addListener(event: "unpipe", listener: (src: Readable) => void): this;

            emit(event: string, ...args: any[]): boolean;
            emit(event: "close"): boolean;
            emit(event: "drain", chunk: Buffer | string): boolean;
            emit(event: "error", err: Error): boolean;
            emit(event: "finish"): boolean;
            emit(event: "pipe", src: Readable): boolean;
            emit(event: "unpipe", src: Readable): boolean;

            on(event: string, listener: Function): this;
            on(event: "close", listener: () => void): this;
            on(event: "drain", listener: () => void): this;
            on(event: "error", listener: (err: Error) => void): this;
            on(event: "finish", listener: () => void): this;
            on(event: "pipe", listener: (src: Readable) => void): this;
            on(event: "unpipe", listener: (src: Readable) => void): this;

            once(event: string, listener: Function): this;
            once(event: "close", listener: () => void): this;
            once(event: "drain", listener: () => void): this;
            once(event: "error", listener: (err: Error) => void): this;
            once(event: "finish", listener: () => void): this;
            once(event: "pipe", listener: (src: Readable) => void): this;
            once(event: "unpipe", listener: (src: Readable) => void): this;

            prependListener(event: string, listener: Function): this;
            prependListener(event: "close", listener: () => void): this;
            prependListener(event: "drain", listener: () => void): this;
            prependListener(event: "error", listener: (err: Error) => void): this;
            prependListener(event: "finish", listener: () => void): this;
            prependListener(event: "pipe", listener: (src: Readable) => void): this;
            prependListener(event: "unpipe", listener: (src: Readable) => void): this;

            prependOnceListener(event: string, listener: Function): this;
            prependOnceListener(event: "close", listener: () => void): this;
            prependOnceListener(event: "drain", listener: () => void): this;
            prependOnceListener(event: "error", listener: (err: Error) => void): this;
            prependOnceListener(event: "finish", listener: () => void): this;
            prependOnceListener(event: "pipe", listener: (src: Readable) => void): this;
            prependOnceListener(event: "unpipe", listener: (src: Readable) => void): this;

            removeListener(event: string, listener: Function): this;
            removeListener(event: "close", listener: () => void): this;
            removeListener(event: "drain", listener: () => void): this;
            removeListener(event: "error", listener: (err: Error) => void): this;
            removeListener(event: "finish", listener: () => void): this;
            removeListener(event: "pipe", listener: (src: Readable) => void): this;
            removeListener(event: "unpipe", listener: (src: Readable) => void): this;
        }

        export interface DuplexOptions extends ReadableOptions, WritableOptions {
            allowHalfOpen?: boolean;
            readableObjectMode?: boolean;
            writableObjectMode?: boolean;
        }

        // Note: Duplex extends both Readable and Writable.
        export class Duplex extends Readable implements NodeJS.ReadWriteStream {
            // Readable
            pause(): Duplex;
            resume(): Duplex;
            // Writeable
            writable: boolean;
            constructor(opts?: DuplexOptions);
            protected _write(chunk: any, encoding: string, callback: Function): void;
            write(chunk: any, cb?: Function): boolean;
            write(chunk: any, encoding?: string, cb?: Function): boolean;
            end(): void;
            end(chunk: any, cb?: Function): void;
            end(chunk: any, encoding?: string, cb?: Function): void;
        }

        export interface TransformOptions extends DuplexOptions {
            transform?: (chunk: string | Buffer, encoding: string, callback: Function) => any;
            flush?: (callback: Function) => any;
        }

        // Note: Transform lacks the _read and _write methods of Readable/Writable.
        export class Transform extends events.EventEmitter implements NodeJS.ReadWriteStream {
            readable: boolean;
            writable: boolean;
            constructor(opts?: TransformOptions);
            protected _transform(chunk: any, encoding: string, callback: Function): void;
            protected _flush(callback: Function): void;
            read(size?: number): any;
            setEncoding(encoding: string): void;
            pause(): Transform;
            resume(): Transform;
            isPaused(): boolean;
            pipe<T extends NodeJS.WritableStream>(destination: T, options?: { end?: boolean; }): T;
            unpipe<T extends NodeJS.WritableStream>(destination?: T): void;
            unshift(chunk: any): void;
            wrap(oldStream: NodeJS.ReadableStream): NodeJS.ReadableStream;
            push(chunk: any, encoding?: string): boolean;
            write(chunk: any, cb?: Function): boolean;
            write(chunk: any, encoding?: string, cb?: Function): boolean;
            end(): void;
            end(chunk: any, cb?: Function): void;
            end(chunk: any, encoding?: string, cb?: Function): void;
        }

        export class PassThrough extends Transform { }
    }

    export = internal;
}

declare module "util" {
    export interface InspectOptions {
        showHidden?: boolean;
        depth?: number;
        colors?: boolean;
        customInspect?: boolean;
    }

    export function format(format: any, ...param: any[]): string;
    export function debug(string: string): void;
    export function error(...param: any[]): void;
    export function puts(...param: any[]): void;
    export function print(...param: any[]): void;
    export function log(string: string): void;
    export function inspect(object: any, showHidden?: boolean, depth?: number, color?: boolean): string;
    export function inspect(object: any, options: InspectOptions): string;
    export function isArray(object: any): boolean;
    export function isRegExp(object: any): boolean;
    export function isDate(object: any): boolean;
    export function isError(object: any): boolean;
    export function inherits(constructor: any, superConstructor: any): void;
    export function debuglog(key: string): (msg: string, ...param: any[]) => void;
    export function isBoolean(object: any): boolean;
    export function isBuffer(object: any): boolean;
    export function isFunction(object: any): boolean;
    export function isNull(object: any): boolean;
    export function isNullOrUndefined(object: any): boolean;
    export function isNumber(object: any): boolean;
    export function isObject(object: any): boolean;
    export function isPrimitive(object: any): boolean;
    export function isString(object: any): boolean;
    export function isSymbol(object: any): boolean;
    export function isUndefined(object: any): boolean;
    export function deprecate(fn: Function, message: string): Function;
}

declare module "assert" {
    function internal(value: any, message?: string): void;
    namespace internal {
        export class AssertionError implements Error {
            name: string;
            message: string;
            actual: any;
            expected: any;
            operator: string;
            generatedMessage: boolean;

            constructor(options?: {
                message?: string; actual?: any; expected?: any;
                operator?: string; stackStartFunction?: Function
            });
        }

        export function fail(actual?: any, expected?: any, message?: string, operator?: string): void;
        export function ok(value: any, message?: string): void;
        export function equal(actual: any, expected: any, message?: string): void;
        export function notEqual(actual: any, expected: any, message?: string): void;
        export function deepEqual(actual: any, expected: any, message?: string): void;
        export function notDeepEqual(acutal: any, expected: any, message?: string): void;
        export function strictEqual(actual: any, expected: any, message?: string): void;
        export function notStrictEqual(actual: any, expected: any, message?: string): void;
        export function deepStrictEqual(actual: any, expected: any, message?: string): void;
        export function notDeepStrictEqual(actual: any, expected: any, message?: string): void;
        export var throws: {
            (block: Function, message?: string): void;
            (block: Function, error: Function, message?: string): void;
            (block: Function, error: RegExp, message?: string): void;
            (block: Function, error: (err: any) => boolean, message?: string): void;
        };

        export var doesNotThrow: {
            (block: Function, message?: string): void;
            (block: Function, error: Function, message?: string): void;
            (block: Function, error: RegExp, message?: string): void;
            (block: Function, error: (err: any) => boolean, message?: string): void;
        };

        export function ifError(value: any): void;
    }

    export = internal;
}

declare module "tty" {
    import * as net from "net";

    export function isatty(fd: number): boolean;
    export interface ReadStream extends net.Socket {
        isRaw: boolean;
        setRawMode(mode: boolean): void;
        isTTY: boolean;
    }
    export interface WriteStream extends net.Socket {
        columns: number;
        rows: number;
        isTTY: boolean;
    }
}

declare module "domain" {
    import * as events from "events";

    export class Domain extends events.EventEmitter implements NodeJS.Domain {
        run(fn: Function): void;
        add(emitter: events.EventEmitter): void;
        remove(emitter: events.EventEmitter): void;
        bind(cb: (err: Error, data: any) => any): any;
        intercept(cb: (data: any) => any): any;
        dispose(): void;
        members: any[];
        enter(): void;
        exit(): void;
    }

    export function create(): Domain;
}

declare module "constants" {
    export var E2BIG: number;
    export var EACCES: number;
    export var EADDRINUSE: number;
    export var EADDRNOTAVAIL: number;
    export var EAFNOSUPPORT: number;
    export var EAGAIN: number;
    export var EALREADY: number;
    export var EBADF: number;
    export var EBADMSG: number;
    export var EBUSY: number;
    export var ECANCELED: number;
    export var ECHILD: number;
    export var ECONNABORTED: number;
    export var ECONNREFUSED: number;
    export var ECONNRESET: number;
    export var EDEADLK: number;
    export var EDESTADDRREQ: number;
    export var EDOM: number;
    export var EEXIST: number;
    export var EFAULT: number;
    export var EFBIG: number;
    export var EHOSTUNREACH: number;
    export var EIDRM: number;
    export var EILSEQ: number;
    export var EINPROGRESS: number;
    export var EINTR: number;
    export var EINVAL: number;
    export var EIO: number;
    export var EISCONN: number;
    export var EISDIR: number;
    export var ELOOP: number;
    export var EMFILE: number;
    export var EMLINK: number;
    export var EMSGSIZE: number;
    export var ENAMETOOLONG: number;
    export var ENETDOWN: number;
    export var ENETRESET: number;
    export var ENETUNREACH: number;
    export var ENFILE: number;
    export var ENOBUFS: number;
    export var ENODATA: number;
    export var ENODEV: number;
    export var ENOENT: number;
    export var ENOEXEC: number;
    export var ENOLCK: number;
    export var ENOLINK: number;
    export var ENOMEM: number;
    export var ENOMSG: number;
    export var ENOPROTOOPT: number;
    export var ENOSPC: number;
    export var ENOSR: number;
    export var ENOSTR: number;
    export var ENOSYS: number;
    export var ENOTCONN: number;
    export var ENOTDIR: number;
    export var ENOTEMPTY: number;
    export var ENOTSOCK: number;
    export var ENOTSUP: number;
    export var ENOTTY: number;
    export var ENXIO: number;
    export var EOPNOTSUPP: number;
    export var EOVERFLOW: number;
    export var EPERM: number;
    export var EPIPE: number;
    export var EPROTO: number;
    export var EPROTONOSUPPORT: number;
    export var EPROTOTYPE: number;
    export var ERANGE: number;
    export var EROFS: number;
    export var ESPIPE: number;
    export var ESRCH: number;
    export var ETIME: number;
    export var ETIMEDOUT: number;
    export var ETXTBSY: number;
    export var EWOULDBLOCK: number;
    export var EXDEV: number;
    export var WSAEINTR: number;
    export var WSAEBADF: number;
    export var WSAEACCES: number;
    export var WSAEFAULT: number;
    export var WSAEINVAL: number;
    export var WSAEMFILE: number;
    export var WSAEWOULDBLOCK: number;
    export var WSAEINPROGRESS: number;
    export var WSAEALREADY: number;
    export var WSAENOTSOCK: number;
    export var WSAEDESTADDRREQ: number;
    export var WSAEMSGSIZE: number;
    export var WSAEPROTOTYPE: number;
    export var WSAENOPROTOOPT: number;
    export var WSAEPROTONOSUPPORT: number;
    export var WSAESOCKTNOSUPPORT: number;
    export var WSAEOPNOTSUPP: number;
    export var WSAEPFNOSUPPORT: number;
    export var WSAEAFNOSUPPORT: number;
    export var WSAEADDRINUSE: number;
    export var WSAEADDRNOTAVAIL: number;
    export var WSAENETDOWN: number;
    export var WSAENETUNREACH: number;
    export var WSAENETRESET: number;
    export var WSAECONNABORTED: number;
    export var WSAECONNRESET: number;
    export var WSAENOBUFS: number;
    export var WSAEISCONN: number;
    export var WSAENOTCONN: number;
    export var WSAESHUTDOWN: number;
    export var WSAETOOMANYREFS: number;
    export var WSAETIMEDOUT: number;
    export var WSAECONNREFUSED: number;
    export var WSAELOOP: number;
    export var WSAENAMETOOLONG: number;
    export var WSAEHOSTDOWN: number;
    export var WSAEHOSTUNREACH: number;
    export var WSAENOTEMPTY: number;
    export var WSAEPROCLIM: number;
    export var WSAEUSERS: number;
    export var WSAEDQUOT: number;
    export var WSAESTALE: number;
    export var WSAEREMOTE: number;
    export var WSASYSNOTREADY: number;
    export var WSAVERNOTSUPPORTED: number;
    export var WSANOTINITIALISED: number;
    export var WSAEDISCON: number;
    export var WSAENOMORE: number;
    export var WSAECANCELLED: number;
    export var WSAEINVALIDPROCTABLE: number;
    export var WSAEINVALIDPROVIDER: number;
    export var WSAEPROVIDERFAILEDINIT: number;
    export var WSASYSCALLFAILURE: number;
    export var WSASERVICE_NOT_FOUND: number;
    export var WSATYPE_NOT_FOUND: number;
    export var WSA_E_NO_MORE: number;
    export var WSA_E_CANCELLED: number;
    export var WSAEREFUSED: number;
    export var SIGHUP: number;
    export var SIGINT: number;
    export var SIGILL: number;
    export var SIGABRT: number;
    export var SIGFPE: number;
    export var SIGKILL: number;
    export var SIGSEGV: number;
    export var SIGTERM: number;
    export var SIGBREAK: number;
    export var SIGWINCH: number;
    export var SSL_OP_ALL: number;
    export var SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION: number;
    export var SSL_OP_CIPHER_SERVER_PREFERENCE: number;
    export var SSL_OP_CISCO_ANYCONNECT: number;
    export var SSL_OP_COOKIE_EXCHANGE: number;
    export var SSL_OP_CRYPTOPRO_TLSEXT_BUG: number;
    export var SSL_OP_DONT_INSERT_EMPTY_FRAGMENTS: number;
    export var SSL_OP_EPHEMERAL_RSA: number;
    export var SSL_OP_LEGACY_SERVER_CONNECT: number;
    export var SSL_OP_MICROSOFT_BIG_SSLV3_BUFFER: number;
    export var SSL_OP_MICROSOFT_SESS_ID_BUG: number;
    export var SSL_OP_MSIE_SSLV2_RSA_PADDING: number;
    export var SSL_OP_NETSCAPE_CA_DN_BUG: number;
    export var SSL_OP_NETSCAPE_CHALLENGE_BUG: number;
    export var SSL_OP_NETSCAPE_DEMO_CIPHER_CHANGE_BUG: number;
    export var SSL_OP_NETSCAPE_REUSE_CIPHER_CHANGE_BUG: number;
    export var SSL_OP_NO_COMPRESSION: number;
    export var SSL_OP_NO_QUERY_MTU: number;
    export var SSL_OP_NO_SESSION_RESUMPTION_ON_RENEGOTIATION: number;
    export var SSL_OP_NO_SSLv2: number;
    export var SSL_OP_NO_SSLv3: number;
    export var SSL_OP_NO_TICKET: number;
    export var SSL_OP_NO_TLSv1: number;
    export var SSL_OP_NO_TLSv1_1: number;
    export var SSL_OP_NO_TLSv1_2: number;
    export var SSL_OP_PKCS1_CHECK_1: number;
    export var SSL_OP_PKCS1_CHECK_2: number;
    export var SSL_OP_SINGLE_DH_USE: number;
    export var SSL_OP_SINGLE_ECDH_USE: number;
    export var SSL_OP_SSLEAY_080_CLIENT_DH_BUG: number;
    export var SSL_OP_SSLREF2_REUSE_CERT_TYPE_BUG: number;
    export var SSL_OP_TLS_BLOCK_PADDING_BUG: number;
    export var SSL_OP_TLS_D5_BUG: number;
    export var SSL_OP_TLS_ROLLBACK_BUG: number;
    export var ENGINE_METHOD_DSA: number;
    export var ENGINE_METHOD_DH: number;
    export var ENGINE_METHOD_RAND: number;
    export var ENGINE_METHOD_ECDH: number;
    export var ENGINE_METHOD_ECDSA: number;
    export var ENGINE_METHOD_CIPHERS: number;
    export var ENGINE_METHOD_DIGESTS: number;
    export var ENGINE_METHOD_STORE: number;
    export var ENGINE_METHOD_PKEY_METHS: number;
    export var ENGINE_METHOD_PKEY_ASN1_METHS: number;
    export var ENGINE_METHOD_ALL: number;
    export var ENGINE_METHOD_NONE: number;
    export var DH_CHECK_P_NOT_SAFE_PRIME: number;
    export var DH_CHECK_P_NOT_PRIME: number;
    export var DH_UNABLE_TO_CHECK_GENERATOR: number;
    export var DH_NOT_SUITABLE_GENERATOR: number;
    export var NPN_ENABLED: number;
    export var RSA_PKCS1_PADDING: number;
    export var RSA_SSLV23_PADDING: number;
    export var RSA_NO_PADDING: number;
    export var RSA_PKCS1_OAEP_PADDING: number;
    export var RSA_X931_PADDING: number;
    export var RSA_PKCS1_PSS_PADDING: number;
    export var POINT_CONVERSION_COMPRESSED: number;
    export var POINT_CONVERSION_UNCOMPRESSED: number;
    export var POINT_CONVERSION_HYBRID: number;
    export var O_RDONLY: number;
    export var O_WRONLY: number;
    export var O_RDWR: number;
    export var S_IFMT: number;
    export var S_IFREG: number;
    export var S_IFDIR: number;
    export var S_IFCHR: number;
    export var S_IFBLK: number;
    export var S_IFIFO: number;
    export var S_IFSOCK: number;
    export var S_IRWXU: number;
    export var S_IRUSR: number;
    export var S_IWUSR: number;
    export var S_IXUSR: number;
    export var S_IRWXG: number;
    export var S_IRGRP: number;
    export var S_IWGRP: number;
    export var S_IXGRP: number;
    export var S_IRWXO: number;
    export var S_IROTH: number;
    export var S_IWOTH: number;
    export var S_IXOTH: number;
    export var S_IFLNK: number;
    export var O_CREAT: number;
    export var O_EXCL: number;
    export var O_NOCTTY: number;
    export var O_DIRECTORY: number;
    export var O_NOATIME: number;
    export var O_NOFOLLOW: number;
    export var O_SYNC: number;
    export var O_SYMLINK: number;
    export var O_DIRECT: number;
    export var O_NONBLOCK: number;
    export var O_TRUNC: number;
    export var O_APPEND: number;
    export var F_OK: number;
    export var R_OK: number;
    export var W_OK: number;
    export var X_OK: number;
    export var UV_UDP_REUSEADDR: number;
    export var SIGQUIT: number;
    export var SIGTRAP: number;
    export var SIGIOT: number;
    export var SIGBUS: number;
    export var SIGUSR1: number;
    export var SIGUSR2: number;
    export var SIGPIPE: number;
    export var SIGALRM: number;
    export var SIGCHLD: number;
    export var SIGSTKFLT: number;
    export var SIGCONT: number;
    export var SIGSTOP: number;
    export var SIGTSTP: number;
    export var SIGTTIN: number;
    export var SIGTTOU: number;
    export var SIGURG: number;
    export var SIGXCPU: number;
    export var SIGXFSZ: number;
    export var SIGVTALRM: number;
    export var SIGPROF: number;
    export var SIGIO: number;
    export var SIGPOLL: number;
    export var SIGPWR: number;
    export var SIGSYS: number;
    export var SIGUNUSED: number;
    export var defaultCoreCipherList: string;
    export var defaultCipherList: string;
    export var ENGINE_METHOD_RSA: number;
    export var ALPN_ENABLED: number;
}

declare module "process" {
    export = process;
}

declare module "v8" {
    interface HeapSpaceInfo {
        space_name: string;
        space_size: number;
        space_used_size: number;
        space_available_size: number;
        physical_space_size: number;
    }

    const enum DoesZapCodeSpaceFlag {
        Disabled = 0,
        Enabled = 1
    }

    interface HeapInfo {
        total_heap_size: number;
        total_heap_size_executable: number;
        total_physical_size: number;
        total_available_size: number;
        used_heap_size: number;
        heap_size_limit: number;
        malloced_memory: number;
        peak_malloced_memory: number;
        does_zap_garbage: DoesZapCodeSpaceFlag;
    }

    export function getHeapStatistics(): HeapInfo;
    export function getHeapSpaceStatistics(): HeapSpaceInfo[];
    export function setFlagsFromString(flags: string): void;
}

declare module "timers" {
    export function setTimeout(callback: (...args: any[]) => void, ms: number, ...args: any[]): NodeJS.Timer;
    export function clearTimeout(timeoutId: NodeJS.Timer): void;
    export function setInterval(callback: (...args: any[]) => void, ms: number, ...args: any[]): NodeJS.Timer;
    export function clearInterval(intervalId: NodeJS.Timer): void;
    export function setImmediate(callback: (...args: any[]) => void, ...args: any[]): any;
    export function clearImmediate(immediateId: any): void;
}

declare module "console" {
    export = console;
}

/**
 * _debugger module is not documented.
 * Source code is at https://github.com/nodejs/node/blob/master/lib/_debugger.js
 */
declare module "_debugger" {
    export interface Packet {
        raw: string;
        headers: string[];
        body: Message;
    }

    export interface Message {
        seq: number;
        type: string;
    }

    export interface RequestInfo {
        command: string;
        arguments: any;
    }

    export interface Request extends Message, RequestInfo {
    }

    export interface Event extends Message {
        event: string;
        body?: any;
    }

    export interface Response extends Message {
        request_seq: number;
        success: boolean;
        /** Contains error message if success === false. */
        message?: string;
        /** Contains message body if success === true. */
        body?: any;
    }

    export interface BreakpointMessageBody {
        type: string;
        target: number;
        line: number;
    }

    export class Protocol {
        res: Packet;
        state: string;
        execute(data: string): void;
        serialize(rq: Request): string;
        onResponse: (pkt: Packet) => void;
    }

    export var NO_FRAME: number;
    export var port: number;

    export interface ScriptDesc {
        name: string;
        id: number;
        isNative?: boolean;
        handle?: number;
        type: string;
        lineOffset?: number;
        columnOffset?: number;
        lineCount?: number;
    }

    export interface Breakpoint {
        id: number;
        scriptId: number;
        script: ScriptDesc;
        line: number;
        condition?: string;
        scriptReq?: string;
    }

    export interface RequestHandler {
        (err: boolean, body: Message, res: Packet): void;
        request_seq?: number;
    }

    export interface ResponseBodyHandler {
        (err: boolean, body?: any): void;
        request_seq?: number;
    }

    export interface ExceptionInfo {
        text: string;
    }

    export interface BreakResponse {
        script?: ScriptDesc;
        exception?: ExceptionInfo;
        sourceLine: number;
        sourceLineText: string;
        sourceColumn: number;
    }

    export function SourceInfo(body: BreakResponse): string;

    export interface ClientInstance extends NodeJS.EventEmitter {
        protocol: Protocol;
        scripts: ScriptDesc[];
        handles: ScriptDesc[];
        breakpoints: Breakpoint[];
        currentSourceLine: number;
        currentSourceColumn: number;
        currentSourceLineText: string;
        currentFrame: number;
        currentScript: string;

        connect(port: number, host: string): void;
        req(req: any, cb: RequestHandler): void;
        reqFrameEval(code: string, frame: number, cb: RequestHandler): void;
        mirrorObject(obj: any, depth: number, cb: ResponseBodyHandler): void;
        setBreakpoint(rq: BreakpointMessageBody, cb: RequestHandler): void;
        clearBreakpoint(rq: Request, cb: RequestHandler): void;
        listbreakpoints(cb: RequestHandler): void;
        reqSource(from: number, to: number, cb: RequestHandler): void;
        reqScripts(cb: any): void;
        reqContinue(cb: RequestHandler): void;
    }

    export var Client: {
        new (): ClientInstance
    }
}
