export interface Tracing {
    readonly categories: string;
    readonly enabled: boolean;
    enable(): void;
    disable(): void;
}
interface TracingConstructor {
    new (categories: string[]): Tracing;
    (this: any, categories: string[]): void;
    prototype: any;
}
export declare const Tracing: TracingConstructor;
export declare function createTracing(opts: {
    categories: string[];
}): Tracing;
export declare function getEnabledCategories(): string | undefined;
declare const _default: {
    createTracing: typeof createTracing;
    getEnabledCategories: typeof getEnabledCategories;
    Tracing: TracingConstructor;
};
export default _default;
