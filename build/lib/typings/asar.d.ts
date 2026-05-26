declare module 'asar/lib/filesystem.js' {

	export default class AsarFilesystem {
		readonly header: unknown;
		constructor(src: string);
		insertDirectory(path: string, shouldUnpack?: boolean): unknown;
		insertFile(path: string, shouldUnpack: boolean, file: { stat: { size: number; mode: number } }, options: {}): Promise<void>;
	}
}
