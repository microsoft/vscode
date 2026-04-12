export declare const performance: Performance;
export interface TimingEntryList {
    getEntries(): PerformanceEntry[];
    getEntriesByName(name: string, kind?: string): PerformanceEntry[];
    getEntriesByType(kind: string): PerformanceEntry[];
}
export interface PerformanceObserver {
    observe(cfg: {
        entryTypes?: string[];
        type?: string;
    }): void;
    disconnect(): void;
    takeRecords(): PerformanceEntry[];
}
export declare const PerformanceObserver: {
    new (fn: (list: TimingEntryList) => void): PerformanceObserver;
    prototype: any;
    supportedEntryTypes: string[];
};
export interface TimingHistogram {
    min: number;
    max: number;
    mean: number;
    stddev: number;
    percentiles: Map<number, number>;
    exceeds: number;
    reset(): void;
    percentile(p: number): number;
}
export declare const TimingHistogram: {
    new (): TimingHistogram;
    prototype: any;
};
export declare function createHistogram(): TimingHistogram;
export declare function monitorEventLoopDelay(_opts?: {
    resolution?: number;
}): TimingHistogram;
declare const _default: {
    performance: Performance;
    PerformanceObserver: {
        new (fn: (list: TimingEntryList) => void): PerformanceObserver;
        prototype: any;
        supportedEntryTypes: string[];
    };
    createHistogram: typeof createHistogram;
    monitorEventLoopDelay: typeof monitorEventLoopDelay;
};
export default _default;
