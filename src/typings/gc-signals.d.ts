declare module 'gc-signals' {
	export interface GCSignal {
	}
    /**
     * Create a new GC signal. When being garbage collected the passed
     * value is stored for later consumption.
     */
	export const GCSignal: {
		new(id: number): GCSignal;
	};
    /**
     * Consume ids of garbage collected signals.
     */
	export function consumeSignals(): number[];
	export function onDidGarbageCollectSignals(callback: (ids: number[]) => any): {
		dispose(): void;
	};
	export function trackGarbageCollection(obj: any, id: number): number;
}