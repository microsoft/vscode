/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * Copyright (c) 2018 The xterm.js authors. All rights reserved.
 * @license MIT
 */

export type TypedArray = Uint8Array | Uint16Array | Uint32Array | Uint8ClampedArray | Int8Array | Int16Array | Int32Array | Float32Array | Float64Array;

export function slice<T extends TypedArray>(array: T, start?: number, end?: number): T {
	// all modern engines that support .slice
	if (array.slice) {
		return array.slice(start, end) as T;
	}
	return sliceFallback(array, start, end);
}

export function sliceFallback<T extends TypedArray>(array: T, start: number = 0, end: number = array.length): T {
	if (start < 0) {
		start = (array.length + start) % array.length;
	}
	if (end >= array.length) {
		end = array.length;
	} else {
		end = (array.length + end) % array.length;
	}
	start = Math.min(start, end);

	const result: T = new (array.constructor as any)(end - start);
	for (let i = 0; i < end - start; ++i) {
		result[i] = array[i + start];
	}
	return result;
}
