// Type definitions for image-size
// Project: https://github.com/image-size/image-size
// Definitions by: Elisée MAURER <https://github.com/elisee>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped

/// <reference types='@types/node'/>

declare module 'image-size' {
	interface ImageInfo {
		width: number;
		height: number;
		type: string;
	}

	function sizeOf(path: string): ImageInfo;
	function sizeOf(path: string, callback: (err: Error, dimensions: ImageInfo) => void): void;

	function sizeOf(buffer: Buffer): ImageInfo;

	namespace sizeOf { }

	export = sizeOf;
}
