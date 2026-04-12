import { EventEmitter } from "./events.js";
export interface QuicEndpoint extends EventEmitter {
    close(): void;
    destroy(_err?: Error): void;
    readonly address: {
        address: string;
        family: string;
        port: number;
    };
}
interface QuicEndpointConstructor {
    new(_opts?: object): QuicEndpoint;
    (this: any, _opts?: object): void;
    prototype: any;
}
export declare const QuicEndpoint: QuicEndpointConstructor;
export interface QuicSession extends EventEmitter {
    close(): void;
    destroy(_err?: Error): void;
    readonly destroyed: boolean;
}
interface QuicSessionConstructor {
    new(): QuicSession;
    (this: any): void;
    prototype: any;
}
export declare const QuicSession: QuicSessionConstructor;
export interface QuicStream extends EventEmitter {
    readonly id: number;
}
interface QuicStreamConstructor {
    new(): QuicStream;
    (this: any): void;
    prototype: any;
}
export declare const QuicStream: QuicStreamConstructor;
declare const _default: {
    QuicEndpoint: QuicEndpointConstructor;
    QuicSession: QuicSessionConstructor;
    QuicStream: QuicStreamConstructor;
};
export default _default;
