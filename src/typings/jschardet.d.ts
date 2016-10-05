declare module 'jschardet' {
	export interface IDetectedMap {
		encoding: string,
		confidence: number
	}
	export interface JsCharDetConstants {
		_debug: boolean,
		MINIMUM_THRESHOLD: number
	}
	export function detect(buffer: NodeBuffer): IDetectedMap;
	export const Constants: JsCharDetConstants;

	export class UniversalDetector {
		constructor();
		result: IDetectedMap;
		done: boolean;
		reset(): void;
		feed(buffer: NodeBuffer): void;
		close(): IDetectedMap;
	}
}