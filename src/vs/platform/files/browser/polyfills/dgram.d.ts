import type { EventEmitter } from "./events.js";
export interface Socket extends EventEmitter {
    bind(_port?: number, _addr?: string, _cb?: () => void): this;
    close(_cb?: () => void): void;
    send(_msg: Uint8Array | string, _offset?: number, _length?: number, _port?: number, _addr?: string, _cb?: (err: Error | null, bytes: number) => void): void;
    address(): {
        address: string;
        family: string;
        port: number;
    };
    setBroadcast(_flag: boolean): void;
    setTTL(_ttl: number): number;
    setMulticastTTL(_ttl: number): number;
    setMulticastLoopback(_flag: boolean): boolean;
    setMulticastInterface(_iface: string): void;
    addMembership(_group: string, _iface?: string): void;
    dropMembership(_group: string, _iface?: string): void;
    ref(): this;
    unref(): this;
    setRecvBufferSize(_sz: number): void;
    setSendBufferSize(_sz: number): void;
    getRecvBufferSize(): number;
    getSendBufferSize(): number;
}
export declare const Socket: {
    new(): Socket;
    prototype: any;
};
export declare function createSocket(_type: string | object, _cb?: (msg: Uint8Array, rinfo: object) => void): Socket;
declare const _default: {
    Socket: {
        new(): Socket;
        prototype: any;
    };
    createSocket: typeof createSocket;
};
export default _default;
