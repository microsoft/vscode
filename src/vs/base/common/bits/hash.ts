/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import platform = require('vs/base/common/platform');
import bits = require('vs/base/common/bits/bits');
import encoding = require('vs/base/common/bits/encoding');
import types = require('vs/base/common/types');

function copy(dest: Uint8Array, destIndex: number, src: Uint8Array, srcIndex: number, count: number): number {
	for (var i = 0, len = Math.min(dest.byteLength - destIndex, src.byteLength - srcIndex, count); i < len; i++) {
		dest[destIndex + i] = src[srcIndex + i];
	}

	return len;
}

function fill(dest: Uint8Array, index: number = 0, count: number = dest.byteLength, value: number = 0): void {
	for (var i = 0; i < count; i++) {
		dest[index + i] = value;
	}
}

export class SHA1 {

	// Reference: http://en.wikipedia.org/wiki/SHA-1

	private static BLOCK_SIZE = 64; // 512 / 8

	private length: number;
	private buffer: Uint8Array;
	private bufferDV: DataView;
	private bufferLength: number;

	private bigBlock32: DataView;
	private h0 = 0x67452301;
	private h1 = 0xEFCDAB89;
	private h2 = 0x98BADCFE;
	private h3 = 0x10325476;
	private h4 = 0xC3D2E1F0;

	public static digest(data: string): string;
	public static digest(data: Uint8Array): string;
	public static digest(data: ArrayBuffer): string;
	public static digest(data: DataView): string;
	public static digest(data: any): string
	{
		var sha = new SHA1();
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

	public update(data: string): void;
	public update(data: Uint8Array): void;
	public update(data: ArrayBuffer): void;
	public update(data: DataView): void;
	public update(arg: any): void {
		if (!this.buffer) {
			throw new Error('Digest already computed.');
		}

		var data: Uint8Array;

		if (types.isString(arg)) {
			data = new Uint8Array(encoding.encodeToUTF8(<string> arg));
		} else if (arg instanceof ArrayBuffer) {
			data = new Uint8Array(arg);
		} else if (arg instanceof DataView) {
			data = new Uint8Array((<DataView> arg).buffer);
		} else {
			data = <Uint8Array> arg;
		}

		var bytesRead = 0, totalBytesRead = 0;

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

	public digest(): string {
		if (this.buffer) {
			this.wrapUp();
		}

		return bits.toHexString(this.h0) + bits.toHexString(this.h1) + bits.toHexString(this.h2) + bits.toHexString(this.h3) + bits.toHexString(this.h4);
	}

	private wrapUp(): void {
		this.buffer[this.bufferLength++] = 0x80;
		fill(this.buffer, this.bufferLength);

		if (this.bufferLength > 56) {
			this.step(this.bufferDV);
			fill(this.buffer);
		}

		var ml = bits.multiply64(8, this.length);
		this.bufferDV.setUint32(56, ml[0], false);
		this.bufferDV.setUint32(60, ml[1], false);

		this.step(this.bufferDV);

		this.buffer = null;
		this.bufferDV = null;
		this.bufferLength = -1;
	}

	private step(data: DataView): void {
		for (var j = 0; j < 64 /* 16*4 */; j += 4) {
			this.bigBlock32.setUint32(j, data.getUint32(j, false), false);
		}

		for (j = 64; j < 320 /* 80*4 */; j += 4) {
			this.bigBlock32.setUint32(j, bits.leftRotate((this.bigBlock32.getUint32(j - 12, false) ^ this.bigBlock32.getUint32(j - 32, false) ^ this.bigBlock32.getUint32(j - 56, false) ^ this.bigBlock32.getUint32(j - 64, false)), 1), false);
		}

		var a = this.h0;
		var b = this.h1;
		var c = this.h2;
		var d = this.h3;
		var e = this.h4;

		var f: number, k: number;
		var temp: number;

		for (j = 0; j < 80; j++) {
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

			temp = (bits.leftRotate(a, 5) + f + e + k + this.bigBlock32.getUint32(j * 4, false)) & 0xffffffff;
			e = d;
			d = c;
			c = bits.leftRotate(b, 30);
			b = a;
			a = temp;
		}

		this.h0 = (this.h0 + a) & 0xffffffff;
		this.h1 = (this.h1 + b) & 0xffffffff;
		this.h2 = (this.h2 + c) & 0xffffffff;
		this.h3 = (this.h3 + d) & 0xffffffff;
		this.h4 = (this.h4 + e) & 0xffffffff;
	}
}

export function computeSHA1Hash(value:string, hasBOM:boolean, headerFn?:(length:number)=>string):string;
export function computeSHA1Hash(value:ArrayBuffer, hasBOM:boolean, headerFn?:(length:number)=>string):string;
export function computeSHA1Hash(value:any, hasBOM:boolean, headerFn?:(length:number)=>string):string {
	if (typeof(ArrayBuffer) === 'undefined') {
		return null; // IE9 does not know ArrayBuffer
	}

	var data = types.isString(value) ? encoding.encodeToUTF8(value, hasBOM) : <ArrayBuffer>value;
	var hash = new SHA1();

	if (headerFn) {
		hash.update(headerFn(data.byteLength));
	}

	if (data.byteLength) {
		hash.update(data);
	}

	return hash.digest();
}