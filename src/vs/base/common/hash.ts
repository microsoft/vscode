/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isString } from 'vs/base/common/types';

/**
 * Return a hash value for an object.
 */
export function hash(obj: any, hashVal = 0): number {
	switch (typeof obj) {
		case 'object':
			if (obj === null) {
				return numberHash(349, hashVal);
			} else if (Array.isArray(obj)) {
				return arrayHash(obj, hashVal);
			}
			return objectHash(obj, hashVal);
		case 'string':
			return stringHash(obj, hashVal);
		case 'boolean':
			return booleanHash(obj, hashVal);
		case 'number':
			return numberHash(obj, hashVal);
		case 'undefined':
			return numberHash(0, 937);
		default:
			return numberHash(0, 617);
	}
}

function numberHash(val: number, initialHashVal: number): number {
	return (((initialHashVal << 5) - initialHashVal) + val) | 0;  // hashVal * 31 + ch, keep as int32
}

function booleanHash(b: boolean, initialHashVal: number): number {
	return numberHash(b ? 433 : 863, initialHashVal);
}

function stringHash(s: string, hashVal: number) {
	hashVal = numberHash(149417, hashVal);
	for (let i = 0, length = s.length; i < length; i++) {
		hashVal = numberHash(s.charCodeAt(i), hashVal);
	}
	return hashVal;
}

function arrayHash(arr: any[], initialHashVal: number): number {
	initialHashVal = numberHash(104579, initialHashVal);
	return arr.reduce((hashVal, item) => hash(item, hashVal), initialHashVal);
}

function objectHash(obj: any, initialHashVal: number): number {
	initialHashVal = numberHash(181387, initialHashVal);
	return Object.keys(obj).sort().reduce((hashVal, key) => {
		hashVal = stringHash(key, hashVal);
		return hash(obj[key], hashVal);
	}, initialHashVal);
}

export class Hasher {

	private _value = 0;

	get value(): number {
		return this._value;
	}

	hash(obj: any): number {
		this._value = hash(obj, this._value);
		return this._value;
	}
}

//#region SHA1

export function computeSHA1Hash(value: string): string {
	const data = encodeToArrayBuffer(value);
	const hash = new SHA1();

	if (data.byteLength) {
		hash.update(data);
	}

	return hash.digest();
}

class SHA1 {

	// Reference: http://en.wikipedia.org/wiki/SHA-1

	private static BLOCK_SIZE = 64; // 512 / 8

	private length: number;
	private buffer: Uint8Array | null;
	private bufferDV: DataView | null;
	private bufferLength: number;

	private bigBlock32: DataView;
	private h0 = 0x67452301;
	private h1 = 0xEFCDAB89;
	private h2 = 0x98BADCFE;
	private h3 = 0x10325476;
	private h4 = 0xC3D2E1F0;

	static digest(data: string): string;
	static digest(data: Uint8Array): string;
	static digest(data: ArrayBuffer): string;
	static digest(data: DataView): string;
	static digest(data: any): string {
		let sha = new SHA1();
		sha.update(data);

		return sha.digest();
	}

	constructor() {
		this.length = 0;

		this.buffer = new Uint8Array(SHA1.BLOCK_SIZE);
		this.bufferDV = new DataView(this.buffer.buffer);
		this.bufferLength = 0;

		this.bigBlock32 = new DataView(new ArrayBuffer(320)); // 80 * 4 = 320;
	}

	update(data: string): void;
	update(data: Uint8Array): void;
	update(data: ArrayBuffer): void;
	update(data: DataView): void;
	update(arg: any): void {
		if (!this.buffer || !this.bufferDV) {
			throw new Error('Digest already computed.');
		}

		let data: Uint8Array;

		if (isString(arg)) {
			data = new Uint8Array(encodeToArrayBuffer(<string>arg));
		} else if (arg instanceof ArrayBuffer) {
			data = new Uint8Array(arg);
		} else if (arg instanceof DataView) {
			data = new Uint8Array((<DataView>arg).buffer);
		} else {
			data = <Uint8Array>arg;
		}

		let bytesRead = 0, totalBytesRead = 0;

		while (totalBytesRead < data.byteLength) {
			bytesRead = copy(this.buffer, this.bufferLength, data, totalBytesRead, data.byteLength);

			this.bufferLength += bytesRead;
			totalBytesRead += bytesRead;

			if (this.bufferLength === SHA1.BLOCK_SIZE) {
				this.step(this.bufferDV);
				this.bufferLength = 0;
			}
		}

		this.length += totalBytesRead;
	}

	digest(): string {
		if (this.buffer) {
			this.wrapUp();
		}

		return toHexString(this.h0) + toHexString(this.h1) + toHexString(this.h2) + toHexString(this.h3) + toHexString(this.h4);
	}

	private wrapUp(): void {
		if (!this.buffer || !this.bufferDV) {
			return; // already wrapped up
		}

		this.buffer[this.bufferLength++] = 0x80;
		fill(this.buffer, this.bufferLength);

		if (this.bufferLength > 56) {
			this.step(this.bufferDV);
			fill(this.buffer);
		}

		let ml = multiply64(8, this.length);
		this.bufferDV.setUint32(56, ml[0], false);
		this.bufferDV.setUint32(60, ml[1], false);

		this.step(this.bufferDV);

		this.buffer = null;
		this.bufferDV = null;
		this.bufferLength = -1;
	}

	private step(data: DataView): void {
		for (let j = 0; j < 64 /* 16*4 */; j += 4) {
			this.bigBlock32.setUint32(j, data.getUint32(j, false), false);
		}

		for (let j = 64; j < 320 /* 80*4 */; j += 4) {
			this.bigBlock32.setUint32(j, leftRotate((this.bigBlock32.getUint32(j - 12, false) ^ this.bigBlock32.getUint32(j - 32, false) ^ this.bigBlock32.getUint32(j - 56, false) ^ this.bigBlock32.getUint32(j - 64, false)), 1), false);
		}

		let a = this.h0;
		let b = this.h1;
		let c = this.h2;
		let d = this.h3;
		let e = this.h4;

		let f: number, k: number;
		let temp: number;

		for (let j = 0; j < 80; j++) {
			if (j < 20) {
				f = (b & c) | ((~b) & d);
				k = 0x5A827999;
			} else if (j < 40) {
				f = b ^ c ^ d;
				k = 0x6ED9EBA1;
			} else if (j < 60) {
				f = (b & c) | (b & d) | (c & d);
				k = 0x8F1BBCDC;
			} else {
				f = b ^ c ^ d;
				k = 0xCA62C1D6;
			}

			temp = (leftRotate(a, 5) + f + e + k + this.bigBlock32.getUint32(j * 4, false)) & 0xFFFFFFFF;
			e = d;
			d = c;
			c = leftRotate(b, 30);
			b = a;
			a = temp;
		}

		this.h0 = (this.h0 + a) & 0xFFFFFFFF;
		this.h1 = (this.h1 + b) & 0xFFFFFFFF;
		this.h2 = (this.h2 + c) & 0xFFFFFFFF;
		this.h3 = (this.h3 + d) & 0xFFFFFFFF;
		this.h4 = (this.h4 + e) & 0xFFFFFFFF;
	}
}

function leftPad(value: string, length: number, char: string = '0'): string {
	return new Array(length - value.length + 1).join(char) + value;
}

function toHexString(value: number, bitsize: number = 32): string {
	return leftPad((value >>> 0).toString(16), bitsize / 4);
}

function leftRotate(value: number, bits: number, totalBits: number = 32): number {

	// delta + bits = totalBits
	let delta = totalBits - bits;

	// All ones, expect `delta` zeros aligned to the right
	let mask = ~((1 << delta) - 1);

	// Join (value left-shifted `bits` bits) with (masked value right-shifted `delta` bits)
	return ((value << bits) | ((mask & value) >>> delta)) >>> 0;
}

function multiply64(a: number, b: number): number[] {
	/*                      A1        A0   => A
	*						B1        B0   => B
	*				   B0 * A1   B0 * A0
	*		 B1 * A1   B1 * A0
	*	C3        C2        C1        C0   => C
	*/

	let a0 = a & 0xFFFF, a1 = a >>> 16;
	let b0 = b & 0xFFFF, b1 = b >>> 16;
	let c0 = 0, c1 = 0, c2 = 0, c3 = 0;

	let x = b0 * a0;
	c0 += x & 0xFFFF;
	c1 += x >>> 16;

	x = b0 * a1;
	c1 += x & 0xFFFF;
	c2 += x >>> 16;

	x = b1 * a0;
	c1 += x & 0xFFFF;
	c2 += x >>> 16;

	c2 += c1 >>> 16;
	c1 = c1 & 0xFFFF;

	x = b1 * a1;
	c2 += x & 0xFFFF;
	c3 += x >>> 16;

	c3 += c2 >>> 16;
	c2 = c2 & 0xFFFF;

	return [(c3 << 16 | c2) >>> 0, (c1 << 16 | c0) >>> 0];
}

function encodeToArrayBuffer(str: string): ArrayBuffer {
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

function copy(dest: Uint8Array, destIndex: number, src: Uint8Array, srcIndex: number, count: number): number {
	const len = Math.min(dest.byteLength - destIndex, src.byteLength - srcIndex, count);

	for (let i = 0; i < len; i++) {
		dest[destIndex + i] = src[srcIndex + i];
	}

	return len;
}

function fill(dest: Uint8Array, index: number = 0, count: number = dest.byteLength, value: number = 0): void {
	for (let i = 0; i < count; i++) {
		dest[index + i] = value;
	}
}

//#endregion