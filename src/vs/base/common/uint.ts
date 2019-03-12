/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export function toUint8ArrayBuffer(str: string): ArrayBuffer {

	if (typeof TextEncoder !== 'undefined') {
		return new TextEncoder().encode(str).buffer;
	}

	let i: number, len: number, length = 0, charCode = 0, trailCharCode = 0, codepoint = 0;

	// First pass, for the size
	for (i = 0, len = str.length; i < len; i++) {
		charCode = str.charCodeAt(i);

		// Surrogate pair
		if (charCode >= 0xD800 && charCode < 0xDC00) {
			trailCharCode = str.charCodeAt(++i);

			if (!(trailCharCode >= 0xDC00 && trailCharCode < 0xE000)) {
				throw new Error('Invalid char code');
			}

			// Code point can be obtained by subtracting 0xD800 and 0xDC00 from both char codes respectively
			// and joining the 10 least significant bits from each, finally adding 0x10000.
			codepoint = ((((charCode - 0xD800) & 0x3FF) << 10) | ((trailCharCode - 0xDC00) & 0x3FF)) + 0x10000;

		} else {
			codepoint = charCode;
		}

		length += byteSizeInUTF8(codepoint);
	}

	let result = new ArrayBuffer(length);
	let view = new Uint8Array(result);
	let pos = 0;

	// Second pass, for the data
	for (i = 0, len = str.length; i < len; i++) {
		charCode = str.charCodeAt(i);

		if (charCode >= 0xD800 && charCode < 0xDC00) {
			trailCharCode = str.charCodeAt(++i);
			codepoint = ((((charCode - 0xD800) & 0x3FF) << 10) | ((trailCharCode - 0xDC00) & 0x3FF)) + 0x10000;
		} else {
			codepoint = charCode;
		}

		pos += writeUTF8(codepoint, view, pos);
	}

	return result;
}

function byteSizeInUTF8(codePoint: number): number {
	codePoint = codePoint >>> 0;

	if (codePoint < 0x80) {
		return 1;
	} else if (codePoint < 0x800) {
		return 2;
	} else if (codePoint < 0x10000) {
		return 3;
	} else if (codePoint < 0x200000) {
		return 4;
	} else if (codePoint < 0x4000000) {
		return 5;
	} else if (codePoint < 0x80000000) {
		return 6;
	} else {
		throw new Error('Code point 0x' + toHexString(codePoint) + ' not encodable in UTF8.');
	}
}

function writeUTF8(codePoint: number, buffer: Uint8Array, pos: number): number {

	// How many bits needed for codePoint
	let byteSize = byteSizeInUTF8(codePoint);

	// 0xxxxxxx
	if (byteSize === 1) {
		buffer[pos] = codePoint;
		return 1;
	}

	// 110xxxxx 10xxxxxx
	// 1110xxxx 10xxxxxx 10xxxxxx
	// 11110xxx 10xxxxxx 10xxxxxx 10xxxxxx
	// 111110xx 10xxxxxx 10xxxxxx 10xxxxxx 10xxxxxx
	// 1111110x 10xxxxxx 10xxxxxx 10xxxxxx 10xxxxxx 10xxxxxx

	// first byte
	buffer[pos] = ((0xFC << (6 - byteSize)) | (codePoint >>> (6 * (byteSize - 1)))) & 0xFF;

	// successive bytes
	for (let i = 1; i < byteSize; i++) {
		buffer[pos + i] = (0x80 | (0x3F & (codePoint >>> (6 * (byteSize - i - 1))))) & 0xFF;
	}

	return byteSize;
}

function leftPad(value: string, length: number, char: string = '0'): string {
	return new Array(length - value.length + 1).join(char) + value;
}

function toHexString(value: number, bitsize: number = 32): string {
	return leftPad((value >>> 0).toString(16), bitsize / 4);
}
