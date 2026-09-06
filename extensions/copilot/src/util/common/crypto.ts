/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { encodeHex, VSBuffer } from '../vs/base/common/buffer';
import * as strings from '../vs/base/common/strings';

export async function createRequestHMAC(hmacSecret: string | undefined): Promise<string | undefined> {
	// If we don't have the right env variables this could happen
	if (!hmacSecret) {
		return undefined;
	}

	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(hmacSecret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);

	const current = Math.floor(Date.now() / 1000).toString();
	const textEncoder = new TextEncoder();
	const data = textEncoder.encode(current);

	const signature = await crypto.subtle.sign('HMAC', key, data);
	const signatureArray = Array.from(new Uint8Array(signature));
	const signatureHex = signatureArray.map(b => b.toString(16).padStart(2, '0')).join('');

	return `${current}.${signatureHex}`;
}

export async function createSha256Hash(data: string | Uint8Array): Promise<string> {
	const dataUint8 = typeof data === 'string' ? new TextEncoder().encode(data) : data;
	const hashBuffer = await crypto.subtle.digest('SHA-256', dataUint8);
	const hashArray = new Uint8Array(hashBuffer);
	let hashHex = '';
	for (const byte of hashArray) {
		hashHex += byte.toString(16).padStart(2, '0');
	}

	return hashHex;
}

const _cachedSha256Hashes = new Map<string, string>();
export function getCachedSha256Hash(text: string): string {
	if (_cachedSha256Hashes.has(text)) {
		return _cachedSha256Hashes.get(text)!;
	}

	const hash = createSha256HashSyncInsecure(text);
	_cachedSha256Hashes.set(text, hash);
	return hash;
}


function createSha256HashSyncInsecure(data: string): string {
	const sha256 = new StringSHA256Insecure();
	sha256.update(data);
	return sha256.digest();
}

const enum SHA256Constant {
	BLOCK_SIZE = 64, // 512 / 8
	UNICODE_REPLACEMENT = 0xFFFD,
}

function toHexString(buffer: ArrayBuffer): string;
function toHexString(value: number, bitsize?: number): string;
function toHexString(bufferOrValue: ArrayBuffer | number, bitsize: number = 32): string {
	if (bufferOrValue instanceof ArrayBuffer) {
		return encodeHex(VSBuffer.wrap(new Uint8Array(bufferOrValue)));
	}

	return (bufferOrValue >>> 0).toString(16).padStart(bitsize / 4, '0');
}

function rightRotate(value: number, bits: number): number {
	return ((value >>> bits) | (value << (32 - bits))) >>> 0;
}

/**
 * A simple, synchronous implementation of SHA-256 for strings.
 * Only to be used in non-security-critical paths where synchronous operation is required.
 */
class StringSHA256Insecure {
	private static _k = [
		0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
		0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
		0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
		0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
		0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
		0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
		0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
		0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
	];

	private static _bigBlock32 = new DataView(new ArrayBuffer(256)); // 64 * 4 = 256

	private _h0 = 0x6a09e667;
	private _h1 = 0xbb67ae85;
	private _h2 = 0x3c6ef372;
	private _h3 = 0xa54ff53a;
	private _h4 = 0x510e527f;
	private _h5 = 0x9b05688c;
	private _h6 = 0x1f83d9ab;
	private _h7 = 0x5be0cd19;

	private readonly _buff: Uint8Array;
	private readonly _buffDV: DataView;
	private _buffLen: number;
	private _totalLen: number;
	private _leftoverHighSurrogate: number;
	private _finished: boolean;

	constructor() {
		this._buff = new Uint8Array(SHA256Constant.BLOCK_SIZE + 3 /* to fit any utf-8 */);
		this._buffDV = new DataView(this._buff.buffer);
		this._buffLen = 0;
		this._totalLen = 0;
		this._leftoverHighSurrogate = 0;
		this._finished = false;
	}

	public update(str: string): void {
		const strLen = str.length;
		if (strLen === 0) {
			return;
		}

		const buff = this._buff;
		let buffLen = this._buffLen;
		let leftoverHighSurrogate = this._leftoverHighSurrogate;
		let charCode: number;
		let offset: number;

		if (leftoverHighSurrogate !== 0) {
			charCode = leftoverHighSurrogate;
			offset = -1;
			leftoverHighSurrogate = 0;
		} else {
			charCode = str.charCodeAt(0);
			offset = 0;
		}

		while (true) {
			let codePoint = charCode;
			if (strings.isHighSurrogate(charCode)) {
				if (offset + 1 < strLen) {
					const nextCharCode = str.charCodeAt(offset + 1);
					if (strings.isLowSurrogate(nextCharCode)) {
						offset++;
						codePoint = strings.computeCodePoint(charCode, nextCharCode);
					} else {
						// illegal => unicode replacement character
						codePoint = SHA256Constant.UNICODE_REPLACEMENT;
					}
				} else {
					// last character is a surrogate pair
					leftoverHighSurrogate = charCode;
					break;
				}
			} else if (strings.isLowSurrogate(charCode)) {
				// illegal => unicode replacement character
				codePoint = SHA256Constant.UNICODE_REPLACEMENT;
			}

			buffLen = this._push(buff, buffLen, codePoint);
			offset++;
			if (offset < strLen) {
				charCode = str.charCodeAt(offset);
			} else {
				break;
			}
		}

		this._buffLen = buffLen;
		this._leftoverHighSurrogate = leftoverHighSurrogate;
	}

	private _push(buff: Uint8Array, buffLen: number, codePoint: number): number {
		if (codePoint < 0x0080) {
			buff[buffLen++] = codePoint;
		} else if (codePoint < 0x0800) {
			buff[buffLen++] = 0b11000000 | ((codePoint & 0b00000000000000000000011111000000) >>> 6);
			buff[buffLen++] = 0b10000000 | ((codePoint & 0b00000000000000000000000000111111) >>> 0);
		} else if (codePoint < 0x10000) {
			buff[buffLen++] = 0b11100000 | ((codePoint & 0b00000000000000001111000000000000) >>> 12);
			buff[buffLen++] = 0b10000000 | ((codePoint & 0b00000000000000000000111111000000) >>> 6);
			buff[buffLen++] = 0b10000000 | ((codePoint & 0b00000000000000000000000000111111) >>> 0);
		} else {
			buff[buffLen++] = 0b11110000 | ((codePoint & 0b00000000000111000000000000000000) >>> 18);
			buff[buffLen++] = 0b10000000 | ((codePoint & 0b00000000000000111111000000000000) >>> 12);
			buff[buffLen++] = 0b10000000 | ((codePoint & 0b00000000000000000000111111000000) >>> 6);
			buff[buffLen++] = 0b10000000 | ((codePoint & 0b00000000000000000000000000111111) >>> 0);
		}

		if (buffLen >= SHA256Constant.BLOCK_SIZE) {
			this._step();
			buffLen -= SHA256Constant.BLOCK_SIZE;
			this._totalLen += SHA256Constant.BLOCK_SIZE;
			// take last 3 in case of UTF8 overflow
			buff[0] = buff[SHA256Constant.BLOCK_SIZE + 0];
			buff[1] = buff[SHA256Constant.BLOCK_SIZE + 1];
			buff[2] = buff[SHA256Constant.BLOCK_SIZE + 2];
		}

		return buffLen;
	}

	public digest(): string {
		if (!this._finished) {
			this._finished = true;
			if (this._leftoverHighSurrogate) {
				// illegal => unicode replacement character
				this._leftoverHighSurrogate = 0;
				this._buffLen = this._push(this._buff, this._buffLen, SHA256Constant.UNICODE_REPLACEMENT);
			}
			this._totalLen += this._buffLen;
			this._wrapUp();
		}

		return toHexString(this._h0) + toHexString(this._h1) + toHexString(this._h2) + toHexString(this._h3) + toHexString(this._h4) + toHexString(this._h5) + toHexString(this._h6) + toHexString(this._h7);
	}

	private _wrapUp(): void {
		this._buff[this._buffLen++] = 0x80;
		this._buff.subarray(this._buffLen).fill(0);

		if (this._buffLen > 56) {
			this._step();
			this._buff.fill(0);
		}

		// this will fit because the mantissa can cover up to 52 bits
		const ml = 8 * this._totalLen;

		this._buffDV.setUint32(56, Math.floor(ml / 4294967296), false);
		this._buffDV.setUint32(60, ml % 4294967296, false);

		this._step();
	}

	private _step(): void {
		const bigBlock32 = StringSHA256Insecure._bigBlock32;
		const data = this._buffDV;
		const k = StringSHA256Insecure._k;

		// Copy chunk into first 16 words of message schedule
		for (let j = 0; j < 64 /* 16*4 */; j += 4) {
			bigBlock32.setUint32(j, data.getUint32(j, false), false);
		}

		// Extend the first 16 words into the remaining 48 words of the message schedule
		for (let j = 16; j < 64; j++) {
			const offset = j * 4;
			const w15 = bigBlock32.getUint32((j - 15) * 4, false);
			const w2 = bigBlock32.getUint32((j - 2) * 4, false);
			const s0 = rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3);
			const s1 = rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10);
			const w16 = bigBlock32.getUint32((j - 16) * 4, false);
			const w7 = bigBlock32.getUint32((j - 7) * 4, false);
			bigBlock32.setUint32(offset, (w16 + s0 + w7 + s1) >>> 0, false);
		}

		// Initialize working variables
		let a = this._h0;
		let b = this._h1;
		let c = this._h2;
		let d = this._h3;
		let e = this._h4;
		let f = this._h5;
		let g = this._h6;
		let h = this._h7;

		// Compression function main loop
		for (let j = 0; j < 64; j++) {
			const S1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
			const ch = (e & f) ^ ((~e) & g);
			const temp1 = (h + S1 + ch + k[j] + bigBlock32.getUint32(j * 4, false)) >>> 0;
			const S0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
			const maj = (a & b) ^ (a & c) ^ (b & c);
			const temp2 = (S0 + maj) >>> 0;

			h = g;
			g = f;
			f = e;
			e = (d + temp1) >>> 0;
			d = c;
			c = b;
			b = a;
			a = (temp1 + temp2) >>> 0;
		}

		// Add the compressed chunk to the current hash value
		this._h0 = (this._h0 + a) >>> 0;
		this._h1 = (this._h1 + b) >>> 0;
		this._h2 = (this._h2 + c) >>> 0;
		this._h3 = (this._h3 + d) >>> 0;
		this._h4 = (this._h4 + e) >>> 0;
		this._h5 = (this._h5 + f) >>> 0;
		this._h6 = (this._h6 + g) >>> 0;
		this._h7 = (this._h7 + h) >>> 0;
	}
}
