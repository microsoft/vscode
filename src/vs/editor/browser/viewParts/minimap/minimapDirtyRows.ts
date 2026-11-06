/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The rows `[start, end)` in which two RGBA images of the same size differ.
 */
export interface IDirtyRows {
	readonly start: number;
	readonly end: number;
}

/**
 * Finds the smallest band of rows that contains every pixel that differs between
 * two RGBA images of `width` x `height` pixels. Returns `null` when they are equal.
 */
export function findDirtyRows(previous: Uint8ClampedArray, next: Uint8ClampedArray, width: number, height: number): IDirtyRows | null {
	// Compare whole pixels at once.
	const a = new Uint32Array(previous.buffer, previous.byteOffset, width * height);
	const b = new Uint32Array(next.buffer, next.byteOffset, width * height);

	let start = 0;
	while (start < height && rowsEqual(a, b, start * width, width)) {
		start++;
	}
	if (start === height) {
		return null;
	}
	let end = height;
	while (end > start && rowsEqual(a, b, (end - 1) * width, width)) {
		end--;
	}
	return { start, end };
}

function rowsEqual(a: Uint32Array, b: Uint32Array, offset: number, width: number): boolean {
	for (let i = offset, last = offset + width; i < last; i++) {
		if (a[i] !== b[i]) {
			return false;
		}
	}
	return true;
}
