export interface DiagChannel {
    name: string;
    readonly hasSubscribers: boolean;
    subscribe(handler: (message: unknown, name: string) => void): void;
    unsubscribe(handler: (message: unknown, name: string) => void): boolean;
    publish(message: unknown): void;
}
export declare const DiagChannel: {
    new (name: string): DiagChannel;
    prototype: any;
};
export declare function channel(name: string): DiagChannel;
export declare function hasSubscribers(name: string): boolean;
export declare function subscribe(name: string, handler: (message: unknown, name: string) => void): void;
export declare function unsubscribe(name: string, handler: (message: unknown, name: string) => void): boolean;
export { DiagChannel as Channel };
declare const _default: {
    channel: typeof channel;
    hasSubscribers: typeof hasSubscribers;
    subscribe: typeof subscribe;
    unsubscribe: typeof unsubscribe;
    Channel: {
        new (name: string): DiagChannel;
        prototype: any;
    };
};
export default _default;
