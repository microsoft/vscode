declare module 'jschardet' {
	export interface IDetectedMap {
		encoding: string,
		confidence: number
	}
	export function detect(buffer: NodeBuffer): IDetectedMap;
}