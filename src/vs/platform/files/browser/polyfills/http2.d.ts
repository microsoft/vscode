import { EventEmitter } from "./events.js";
export interface Http2Session extends EventEmitter {
    close(done?: () => void): void;
    destroy(_err?: Error, _code?: number): void;
    readonly destroyed: boolean;
    readonly encrypted: boolean;
    readonly closed: boolean;
    ping(_cb: (err: Error | null, dur: number, buf: Uint8Array) => void): boolean;
    ref(): void;
    unref(): void;
    setTimeout(_ms: number, _cb?: () => void): void;
}
export declare const Http2Session: {
    new(): Http2Session;
    prototype: any;
};
export interface ClientHttp2Session extends Http2Session {
}
export declare const ClientHttp2Session: {
    new(): ClientHttp2Session;
    prototype: any;
};
export interface ServerHttp2Session extends Http2Session {
}
export declare const ServerHttp2Session: {
    new(): ServerHttp2Session;
    prototype: any;
};
export interface Http2Stream extends EventEmitter {
    close(_code?: number, _cb?: () => void): void;
    readonly id: number;
    readonly pending: boolean;
    readonly destroyed: boolean;
    readonly closed: boolean;
    priority(_opts: unknown): void;
    setTimeout(_ms: number, _cb?: () => void): void;
    end(_data?: unknown, _enc?: string, _cb?: () => void): void;
}
export declare const Http2Stream: {
    new(): Http2Stream;
    prototype: any;
};
export interface Http2ServerRequest extends EventEmitter {
}
export declare const Http2ServerRequest: {
    new(): Http2ServerRequest;
    prototype: any;
};
export interface Http2ServerResponse extends EventEmitter {
    writeHead(_code: number, _hdrs?: object): this;
    end(_data?: unknown): void;
}
export declare const Http2ServerResponse: {
    new(): Http2ServerResponse;
    prototype: any;
};
export declare function createServer(_opts?: unknown, _handler?: unknown): EventEmitter;
export declare function createSecureServer(_opts?: unknown, _handler?: unknown): EventEmitter;
export declare function connect(_authority: string, _opts?: unknown, _cb?: () => void): ClientHttp2Session;
export declare const constants: {
    NGHTTP2_SESSION_SERVER: number;
    NGHTTP2_SESSION_CLIENT: number;
    HTTP2_HEADER_STATUS: string;
    HTTP2_HEADER_METHOD: string;
    HTTP2_HEADER_AUTHORITY: string;
    HTTP2_HEADER_SCHEME: string;
    HTTP2_HEADER_PATH: string;
    HTTP_STATUS_OK: number;
    HTTP_STATUS_NOT_FOUND: number;
};
export declare function getDefaultSettings(): object;
export declare function getPackedSettings(_settings?: object): Uint8Array;
export declare function getUnpackedSettings(_buf: Uint8Array): object;
export declare const sensitiveHeaders: unique symbol;
declare const _default: {
    Http2Session: {
        new(): Http2Session;
        prototype: any;
    };
    ClientHttp2Session: {
        new(): ClientHttp2Session;
        prototype: any;
    };
    ServerHttp2Session: {
        new(): ServerHttp2Session;
        prototype: any;
    };
    Http2Stream: {
        new(): Http2Stream;
        prototype: any;
    };
    Http2ServerRequest: {
        new(): Http2ServerRequest;
        prototype: any;
    };
    Http2ServerResponse: {
        new(): Http2ServerResponse;
        prototype: any;
    };
    createServer: typeof createServer;
    createSecureServer: typeof createSecureServer;
    connect: typeof connect;
    constants: {
        NGHTTP2_SESSION_SERVER: number;
        NGHTTP2_SESSION_CLIENT: number;
        HTTP2_HEADER_STATUS: string;
        HTTP2_HEADER_METHOD: string;
        HTTP2_HEADER_AUTHORITY: string;
        HTTP2_HEADER_SCHEME: string;
        HTTP2_HEADER_PATH: string;
        HTTP_STATUS_OK: number;
        HTTP_STATUS_NOT_FOUND: number;
    };
    getDefaultSettings: typeof getDefaultSettings;
    getPackedSettings: typeof getPackedSettings;
    getUnpackedSettings: typeof getUnpackedSettings;
    sensitiveHeaders: symbol;
};
export default _default;
