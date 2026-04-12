import type { EventEmitter } from "./events.js";
import type { Readable, Writable } from "./stream.d.ts";
import type { TcpSocket, NetAddress } from "./net.d.ts";
export type HttpHandler = (incoming: IncomingMessage, outgoing: ServerResponse) => void | Promise<void>;
export interface ConnectionOptions {
    method?: string;
    path?: string;
    headers?: Record<string, string | string[]>;
    hostname?: string;
    host?: string;
    port?: number;
}
export interface CompletedResponse {
    statusCode: number;
    statusMessage: string;
    headers: Record<string, string>;
    body: Buffer;
}
export interface IncomingMessage extends Readable {
    httpVersion: string;
    httpVersionMajor: number;
    httpVersionMinor: number;
    complete: boolean;
    headers: Record<string, string | string[] | undefined>;
    rawHeaders: string[];
    trailers: Record<string, string | undefined>;
    rawTrailers: string[];
    method?: string;
    url?: string;
    statusCode?: number;
    statusMessage?: string;
    aborted: boolean;
    socket: TcpSocket;
    connection: TcpSocket;
    setTimeout(ms: number, handler?: () => void): this;
    destroy(err?: Error): this;
    _injectBody(raw: Buffer | string | null): void;
}
export interface IncomingMessageConstructor {
    new(sock?: TcpSocket): IncomingMessage;
    (this: any, sock?: TcpSocket): void;
    prototype: any;
    build(verb: string, target: string, hdrs: Record<string, string>, payload?: Buffer | string): IncomingMessage;
}
export declare const IncomingMessage: IncomingMessageConstructor;
export interface ServerResponse extends Writable {
    statusCode: number;
    statusMessage: string;
    headersSent: boolean;
    finished: boolean;
    sendDate: boolean;
    socket: TcpSocket | null;
    req: IncomingMessage;
    connection: TcpSocket | null;
    _onComplete(fn: (r: CompletedResponse) => void): void;
    assignSocket(socket: TcpSocket): void;
    detachSocket(socket: TcpSocket): void;
    setHeader(key: string, val: string | string[] | number): this;
    getHeader(key: string): string | string[] | undefined;
    getHeaders(): Record<string, string | string[]>;
    getHeaderNames(): string[];
    hasHeader(key: string): boolean;
    appendHeader(key: string, val: string | string[]): this;
    removeHeader(key: string): void;
    flushHeaders(): void;
    writeContinue(): void;
    writeProcessing(): void;
    writeEarlyHints(hints: Record<string, string | string[]>, cb?: () => void): void;
    writeHead(code: number, msgOrHdrs?: any, extraHdrs?: any): this;
    write(data: any, encOrCb?: any, cb?: any): boolean;
    end(dataOrCb?: any, encOrCb?: any, cb?: any): this;
    send(payload: string | Buffer | object): this;
    setTimeout(ms: number, handler?: () => void): this;
    json(obj: unknown): this;
    status(c: number): this;
    redirect(target: string | number, loc?: string): void;
    addTrailers(headers: Record<string, string>): void;
    _collectedBody(): Buffer;
    _collectedBodyText(): string;
}
export interface ServerResponseConstructor {
    new(incoming: IncomingMessage): ServerResponse;
    (this: any, incoming: IncomingMessage): void;
    prototype: any;
}
export declare const ServerResponse: ServerResponseConstructor;
export interface Server extends EventEmitter {
    listening: boolean;
    maxHeadersCount: number | null;
    timeout: number;
    keepAliveTimeout: number;
    headersTimeout: number;
    requestTimeout: number;
    maxRequestsPerSocket: number | null;
    listen(portOrOpts?: any, hostOrCb?: any, cb?: any): this;
    close(cb?: (err?: Error) => void): this;
    address(): NetAddress | null;
    setTimeout(ms?: number, handler?: () => void): this;
    ref(): this;
    unref(): this;
    closeAllConnections(): void;
    closeIdleConnections(): void;
    dispatchUpgrade(target: string, hdrs: Record<string, string>): {
        req: IncomingMessage;
        socket: TcpSocket;
    };
    dispatchRequest(verb: string, target: string, hdrs: Record<string, string>, payload?: Buffer | string): Promise<CompletedResponse>;
}
export interface ServerConstructor {
    new(optsOrHandler?: Record<string, unknown> | HttpHandler, handler?: HttpHandler): Server;
    (this: any, optsOrHandler?: Record<string, unknown> | HttpHandler, handler?: HttpHandler): void;
    prototype: any;
}
export declare const Server: ServerConstructor;
export declare function createServer(optsOrHandler?: Record<string, unknown> | HttpHandler, handler?: HttpHandler): Server;
export declare const STATUS_CODES: Record<number, string>;
export declare const METHODS: string[];
export interface ClientRequest extends Writable {
    method: string;
    path: string;
    headers: Record<string, string>;
    finished: boolean;
    aborted: boolean;
    reusedSocket: boolean;
    maxHeadersCount: number | null;
    readonly socket: TcpSocket;
    readonly connection: TcpSocket;
    setHeader(k: string, v: string): void;
    getHeader(k: string): string | undefined;
    removeHeader(k: string): void;
    write(chunk: any, encOrCb?: any, cb?: any): boolean;
    end(dataOrCb?: any, encOrCb?: any, cb?: any): this;
    abort(): void;
    setTimeout(ms: number, handler?: () => void): this;
    flushHeaders(): void;
    setNoDelay(noDelay?: boolean): void;
    setSocketKeepAlive(enable?: boolean, initialDelay?: number): void;
}
export interface ClientRequestConstructor {
    new(opts: ConnectionOptions, proto?: "http" | "https"): ClientRequest;
    (this: any, opts: ConnectionOptions, proto?: "http" | "https"): void;
    prototype: any;
}
export declare const ClientRequest: ClientRequestConstructor;
export declare function request(first: string | URL | ConnectionOptions, second?: ConnectionOptions | ((r: IncomingMessage) => void), third?: (r: IncomingMessage) => void): ClientRequest;
export declare function get(first: string | URL | ConnectionOptions, second?: ConnectionOptions | ((r: IncomingMessage) => void), third?: (r: IncomingMessage) => void): ClientRequest;
export declare function _buildClientRequest(first: string | URL | ConnectionOptions, second: ConnectionOptions | ((r: IncomingMessage) => void) | undefined, third: ((r: IncomingMessage) => void) | undefined, proto: "http" | "https"): ClientRequest;
export type RegistryHook = (port: number, srv: Server) => void;
export declare function getServer(port: number): Server | undefined;
export declare function getAllServers(): Map<number, Server>;
export declare function closeAllServers(): void;
export declare function closeServersByPid(pid: number): void;
export declare function getServerOwner(port: number): number | undefined;
export declare function setServerListenCallback(fn: RegistryHook | null): void;
export declare function setServerCloseCallback(fn: ((port: number) => void) | null): void;
export interface AgentConfig {
    keepAlive?: boolean;
    keepAliveMsecs?: number;
    maxSockets?: number;
    maxTotalSockets?: number;
    maxFreeSockets?: number;
    scheduling?: "fifo" | "lifo";
    timeout?: number;
}
export interface Agent extends EventEmitter {
    maxSockets: number;
    maxFreeSockets: number;
    maxTotalSockets: number;
    sockets: Record<string, TcpSocket[]>;
    freeSockets: Record<string, TcpSocket[]>;
    requests: Record<string, IncomingMessage[]>;
    options: AgentConfig;
    createConnection(cfg: Record<string, unknown>, done?: (err: Error | null, sock: TcpSocket) => void): TcpSocket;
    getName(o: {
        host?: string;
        port?: number;
        localAddress?: string;
    }): string;
    addRequest(r: ClientRequest, o: Record<string, unknown>): void;
    destroy(): void;
}
export interface AgentConstructor {
    new(cfg?: AgentConfig): Agent;
    (this: any, cfg?: AgentConfig): void;
    prototype: any;
}
export declare const Agent: AgentConstructor;
export declare const globalAgent: Agent;
export declare function decodeFrame(raw: Uint8Array): {
    op: number;
    data: Uint8Array;
    consumed: number;
} | null;
export declare function encodeFrame(op: number, payload: Uint8Array, masked: boolean): Uint8Array;
declare const _default: {
    Server: ServerConstructor;
    IncomingMessage: IncomingMessageConstructor;
    ServerResponse: ServerResponseConstructor;
    ClientRequest: ClientRequestConstructor;
    createServer: typeof createServer;
    request: typeof request;
    get: typeof get;
    STATUS_CODES: Record<number, string>;
    METHODS: string[];
    getServer: typeof getServer;
    getAllServers: typeof getAllServers;
    setServerListenCallback: typeof setServerListenCallback;
    setServerCloseCallback: typeof setServerCloseCallback;
    _buildClientRequest: typeof _buildClientRequest;
    Agent: AgentConstructor;
    globalAgent: Agent;
    decodeFrame: typeof decodeFrame;
    encodeFrame: typeof encodeFrame;
};
export default _default;
