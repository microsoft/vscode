import type { TcpSocket } from "./net.d.ts";
type Handler = (...args: unknown[]) => void;
interface TinyEmitter {
    _listeners: Map<string, Set<Handler>>;
    on(evt: string, fn: Handler): this;
    off(evt: string, fn: Handler): this;
    emit(evt: string, ...args: unknown[]): void;
}
interface TinyEmitterConstructor {
    new(): TinyEmitter;
    (this: any): void;
    prototype: any;
}
declare const TinyEmitter: TinyEmitterConstructor;
export declare const CONNECTING = 0;
export declare const OPEN = 1;
export declare const CLOSING = 2;
export declare const CLOSED = 3;
export interface WebSocket extends TinyEmitter {
    readonly CONNECTING: number;
    readonly OPEN: number;
    readonly CLOSING: number;
    readonly CLOSED: number;
    readyState: number;
    url: string;
    protocol: string;
    extensions: string;
    bufferedAmount: number;
    binaryType: 'blob' | 'arraybuffer';
    _uid: string;
    _boundServer: WebSocketServer | null;
    _native: globalThis.WebSocket | null;
    _tcpSocket: TcpSocket | null;
    _tcpInboundBuf: Uint8Array;
    onopen: ((ev: Event) => void) | null;
    onclose: ((ev: CloseEvent) => void) | null;
    onerror: ((ev: Event) => void) | null;
    onmessage: ((ev: MessageEvent) => void) | null;
    _open(): void;
    _openNative(): void;
    send(payload: string | ArrayBuffer | Uint8Array): void;
    close(code?: number, reason?: string): void;
    ping(): void;
    pong(): void;
    terminate(): void;
    _bindServer(srv: WebSocketServer): void;
    _deliverMessage(data: unknown): void;
}
interface WebSocketConstructor {
    new(address: string, protocols?: string | string[]): WebSocket;
    (this: any, address: string, protocols?: string | string[]): void;
    prototype: any;
    readonly CONNECTING: number;
    readonly OPEN: number;
    readonly CLOSING: number;
    readonly CLOSED: number;
}
export declare const WebSocket: WebSocketConstructor;
export interface ServerConfig {
    host?: string;
    port?: number;
    server?: unknown;
    noServer?: boolean;
    path?: string;
    clientTracking?: boolean;
    perMessageDeflate?: boolean | object;
    maxPayload?: number;
}
export interface WebSocketServer extends TinyEmitter {
    clients: Set<WebSocket>;
    options: ServerConfig;
    _route: string;
    _channelCb: ((ev: MessageEvent) => void) | null;
    _listen(): void;
    _injectClientPayload(source: WebSocket, data: unknown): void;
    handleUpgrade(req: unknown, socket: unknown, head: unknown, done: (ws: WebSocket, req: unknown) => void): void;
    close(done?: () => void): void;
    address(): {
        port: number;
        family: string;
        address: string;
    } | null;
}
interface WebSocketServerConstructor {
    new(opts?: ServerConfig): WebSocketServer;
    (this: any, opts?: ServerConfig): void;
    prototype: any;
}
export declare const WebSocketServer: WebSocketServerConstructor;
export declare const Server: WebSocketServerConstructor;
export declare const createWebSocketStream: () => never;
export default WebSocket;
