import { EventEmitter } from "./events.js";
import type { Duplex } from "./stream.d.ts";
export interface NetAddress {
    address: string;
    family: string;
    port: number;
}
export interface SocketConfig {
    allowHalfOpen?: boolean;
    readable?: boolean;
    writable?: boolean;
}
export interface ServerConfig {
    allowHalfOpen?: boolean;
    pauseOnConnect?: boolean;
}
export interface BindOptions {
    port?: number;
    host?: string;
    backlog?: number;
}
export interface TcpSocket extends Duplex {
    localAddress: string;
    localPort: number;
    remoteAddress?: string;
    remotePort?: number;
    remoteFamily?: string;
    connecting: boolean;
    pending: boolean;
    destroyed: boolean;
    encrypted: boolean;
    readyState: string;
    bytesRead: number;
    bytesWritten: number;
    connect(portOrOpts: any, hostOrCb?: any, cb?: any): this;
    address(): NetAddress | null;
    setEncoding(enc: BufferEncoding): this;
    setTimeout(ms: number, handler?: () => void): this;
    setNoDelay(v?: boolean): this;
    setKeepAlive(on?: boolean, delay?: number): this;
    ref(): this;
    unref(): this;
    destroy(err?: Error): this;
    _feedData(chunk: Buffer | string): void;
    _feedEnd(): void;
}
export interface TcpSocketConstructor {
    new(cfg?: SocketConfig): TcpSocket;
    (this: any, cfg?: SocketConfig): void;
    prototype: any;
}
export declare const TcpSocket: TcpSocketConstructor;
export interface TcpServer extends EventEmitter {
    listening: boolean;
    maxConnections?: number;
    listen(portOrOpts?: any, hostOrCb?: any, backlogOrCb?: any, cb?: any): this;
    address(): (NetAddress & {
        host?: string;
    }) | null;
    close(cb?: (err?: Error) => void): this;
    getConnections(cb?: (err: Error | null, n: number) => void): void;
    ref(): this;
    unref(): this;
    _acceptConnection(sock: TcpSocket): void;
}
export interface TcpServerConstructor {
    new(cfgOrHandler?: ServerConfig | ((sock: TcpSocket) => void), handler?: (sock: TcpSocket) => void): TcpServer;
    (this: any, cfgOrHandler?: ServerConfig | ((sock: TcpSocket) => void), handler?: (sock: TcpSocket) => void): void;
    prototype: any;
}
export declare const TcpServer: TcpServerConstructor;
export declare function createServer(cfgOrHandler?: ServerConfig | ((sock: TcpSocket) => void), handler?: (sock: TcpSocket) => void): TcpServer;
export declare function createConnection(portOrOpts: number | {
    port: number;
    host?: string;
}, hostOrCb?: string | (() => void), cb?: () => void): TcpSocket;
export declare const connect: typeof createConnection;
export declare function isIP(addr: string): number;
export declare function isIPv4(addr: string): boolean;
export declare function isIPv6(addr: string): boolean;
declare const _default: {
    Socket: TcpSocketConstructor;
    Server: TcpServerConstructor;
    createServer: typeof createServer;
    createConnection: typeof createConnection;
    connect: typeof createConnection;
    isIP: typeof isIP;
    isIPv4: typeof isIPv4;
    isIPv6: typeof isIPv6;
};
export default _default;
