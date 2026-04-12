type SingleResult = (err: Error | null, addr?: string, fam?: number) => void;
type MultiResult = (err: Error | null, entries?: Array<{
    address: string;
    family: number;
}>) => void;
export declare function lookup(host: string, cb: SingleResult): void;
export declare function lookup(host: string, opts: {
    family?: number;
    all?: true;
}, cb: MultiResult): void;
export declare function lookup(host: string, opts: {
    family?: number;
    all?: boolean;
}, cb: SingleResult | MultiResult): void;
export declare function resolve(_host: string, cb: (err: Error | null, addrs?: string[]) => void): void;
export declare function resolve4(host: string, cb: (err: Error | null, addrs?: string[]) => void): void;
export declare function resolve6(_host: string, cb: (err: Error | null, addrs?: string[]) => void): void;
export declare function reverse(_ip: string, cb: (err: Error | null, names?: string[]) => void): void;
export declare function setServers(_list: string[]): void;
export declare function getServers(): string[];
export declare function setDefaultResultOrder(_order: string): void;
export declare function getDefaultResultOrder(): string;
export declare const promises: {
    lookup(host: string, opts?: {
        family?: number;
        all?: boolean;
    }): Promise<{
        address: string;
        family: number;
    } | Array<{
        address: string;
        family: number;
    }>>;
    resolve(host: string): Promise<string[]>;
    resolve4(host: string): Promise<string[]>;
    resolve6(_host: string): Promise<string[]>;
    reverse(_ip: string): Promise<string[]>;
    setServers(_s: string[]): void;
    getServers(): string[];
};
export declare const ADDRCONFIG = 0;
export declare const V4MAPPED = 0;
export declare const ALL = 0;
declare const _default: {
    lookup: typeof lookup;
    resolve: typeof resolve;
    resolve4: typeof resolve4;
    resolve6: typeof resolve6;
    reverse: typeof reverse;
    setServers: typeof setServers;
    getServers: typeof getServers;
    setDefaultResultOrder: typeof setDefaultResultOrder;
    getDefaultResultOrder: typeof getDefaultResultOrder;
    promises: {
        lookup(host: string, opts?: {
            family?: number;
            all?: boolean;
        }): Promise<{
            address: string;
            family: number;
        } | Array<{
            address: string;
            family: number;
        }>>;
        resolve(host: string): Promise<string[]>;
        resolve4(host: string): Promise<string[]>;
        resolve6(_host: string): Promise<string[]>;
        reverse(_ip: string): Promise<string[]>;
        setServers(_s: string[]): void;
        getServers(): string[];
    };
    ADDRCONFIG: number;
    V4MAPPED: number;
    ALL: number;
};
export default _default;
