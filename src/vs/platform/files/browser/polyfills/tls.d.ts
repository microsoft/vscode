import { EventEmitter } from "./events.js";
export interface TLSSocket extends EventEmitter {
    authorized: boolean;
    encrypted: boolean;
    getPeerCertificate(_detailed?: boolean): object;
    getCipher(): {
        name: string;
        version: string;
    } | null;
    getProtocol(): string | null;
    setServername(_name: string): void;
    renegotiate(_opts: unknown, _cb: (err: Error | null) => void): boolean;
}
export declare const TLSSocket: {
    new(_sock?: unknown, _opts?: unknown): TLSSocket;
    prototype: any;
};
export interface Server extends EventEmitter {
    listen(..._args: unknown[]): this;
    close(_cb?: (err?: Error) => void): this;
    address(): {
        port: number;
        family: string;
        address: string;
    } | string | null;
    getTicketKeys(): Uint8Array;
    setTicketKeys(_keys: Uint8Array): void;
    setSecureContext(_opts: unknown): void;
}
export declare const Server: {
    new(_opts?: unknown, _handler?: (sock: TLSSocket) => void): Server;
    prototype: any;
};
export declare function createServer(_opts?: unknown, _handler?: (sock: TLSSocket) => void): Server;
export declare function connect(_opts: unknown, _cb?: () => void): TLSSocket;
export declare function createSecureContext(_opts?: unknown): object;
export type SecureContext = object;
export declare const getCiphers: () => string[];
export declare const DEFAULT_ECDH_CURVE = "auto";
export declare const DEFAULT_MAX_VERSION = "TLSv1.3";
export declare const DEFAULT_MIN_VERSION = "TLSv1.2";
export declare const rootCertificates: string[];
declare const _default: {
    TLSSocket: {
        new(_sock?: unknown, _opts?: unknown): TLSSocket;
        prototype: any;
    };
    Server: {
        new(_opts?: unknown, _handler?: (sock: TLSSocket) => void): Server;
        prototype: any;
    };
    createServer: typeof createServer;
    connect: typeof connect;
    createSecureContext: typeof createSecureContext;
    getCiphers: () => string[];
    DEFAULT_ECDH_CURVE: string;
    DEFAULT_MAX_VERSION: string;
    DEFAULT_MIN_VERSION: string;
    rootCertificates: string[];
};
export default _default;
