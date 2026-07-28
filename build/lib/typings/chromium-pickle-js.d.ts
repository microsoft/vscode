declare module 'chromium-pickle-js' {
	export interface Pickle {
		writeString(value: string): void;
		writeUInt32(value: number): void;

		toBuffer(): Buffer;
	}

	export function createEmpty(): Pickle;
}
