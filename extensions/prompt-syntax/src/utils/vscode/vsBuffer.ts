/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Lazy } from './lazy';
import { Buffer } from 'buffer';
import { TextEncoder, TextDecoder } from 'util';

const hasBuffer = typeof Buffer !== 'undefined';
const indexOfTable = new Lazy(() => new Uint8Array(256));

let textEncoder: TextEncoder | null;
let textDecoder: TextDecoder | null;

export class VSBuffer {
	/**
	 * When running in a nodejs context, the backing store for the returned `VSBuffer` instance
	 * might use a nodejs Buffer allocated from node's Buffer pool, which is not transferrable.
	 */
	static alloc(byteLength: number): VSBuffer {
		if (hasBuffer) {
			return new VSBuffer(Buffer.allocUnsafe(byteLength));
		} else {
			return new VSBuffer(new Uint8Array(byteLength));
		}
	}

	/**
	 * When running in a nodejs context, if `actual` is not a nodejs Buffer, the backing store for
	 * the returned `VSBuffer` instance might use a nodejs Buffer allocated from node's Buffer pool,
	 * which is not transferrable.
	 */
	static wrap(actual: Uint8Array): VSBuffer {
		if (hasBuffer && !Buffer.isBuffer(actual)) {
			// https://nodejs.org/dist/latest-v10.x/docs/api/buffer.html#buffer_class_method_buffer_from_arraybuffer_byteoffset_length
			// Create a zero-copy Buffer wrapper around the ArrayBuffer pointed to by the Uint8Array
			actual = Buffer.from(actual.buffer, actual.byteOffset, actual.byteLength);
		}
		return new VSBuffer(actual);
	}

	/**
	 * When running in a nodejs context, the backing store for the returned `VSBuffer` instance
	 * might use a nodejs Buffer allocated from node's Buffer pool, which is not transferrable.
	 */
	static fromString(source: string, options?: { dontUseNodeBuffer?: boolean }): VSBuffer {
		const dontUseNodeBuffer = options?.dontUseNodeBuffer || false;
		if (!dontUseNodeBuffer && hasBuffer) {
			return new VSBuffer(Buffer.from(source));
		} else {
			if (!textEncoder) {
				textEncoder = new TextEncoder();
			}
			return new VSBuffer(textEncoder.encode(source));
		}
	}

	/**
	 * When running in a nodejs context, the backing store for the returned `VSBuffer` instance
	 * might use a nodejs Buffer allocated from node's Buffer pool, which is not transferrable.
	 */
	static fromByteArray(source: number[]): VSBuffer {
		const result = VSBuffer.alloc(source.length);
		for (let i = 0, len = source.length; i < len; i++) {
			result.buffer[i] = source[i];
		}
		return result;
	}

	/**
	 * When running in a nodejs context, the backing store for the returned `VSBuffer` instance
	 * might use a nodejs Buffer allocated from node's Buffer pool, which is not transferrable.
	 */
	static concat(buffers: VSBuffer[], totalLength?: number): VSBuffer {
		if (typeof totalLength === 'undefined') {
			totalLength = 0;
			for (let i = 0, len = buffers.length; i < len; i++) {
				totalLength += buffers[i].byteLength;
			}
		}

		const ret = VSBuffer.alloc(totalLength);
		let offset = 0;
		for (let i = 0, len = buffers.length; i < len; i++) {
			const element = buffers[i];
			ret.set(element, offset);
			offset += element.byteLength;
		}

		return ret;
	}

	readonly buffer: Uint8Array;
	readonly byteLength: number;

	private constructor(buffer: Uint8Array) {
		this.buffer = buffer;
		this.byteLength = this.buffer.byteLength;
	}

	/**
	 * When running in a nodejs context, the backing store for the returned `VSBuffer` instance
	 * might use a nodejs Buffer allocated from node's Buffer pool, which is not transferrable.
	 */
	clone(): VSBuffer {
		const result = VSBuffer.alloc(this.byteLength);
		result.set(this);
		return result;
	}

	toString(): string {
		if (hasBuffer) {
			return this.buffer.toString();
		} else {
			if (!textDecoder) {
				textDecoder = new TextDecoder();
			}
			return textDecoder.decode(this.buffer);
		}
	}

	slice(start?: number, end?: number): VSBuffer {
		// IMPORTANT: use subarray instead of slice because TypedArray#slice
		// creates shallow copy and NodeBuffer#slice doesn't. The use of subarray
		// ensures the same, performance, behaviour.
		return new VSBuffer(this.buffer.subarray(start, end));
	}

	set(array: VSBuffer, offset?: number): void;
	set(array: Uint8Array, offset?: number): void;
	set(array: ArrayBuffer, offset?: number): void;
	set(array: ArrayBufferView, offset?: number): void;
	set(array: VSBuffer | Uint8Array | ArrayBuffer | ArrayBufferView, offset?: number): void;
	set(array: VSBuffer | Uint8Array | ArrayBuffer | ArrayBufferView, offset?: number): void {
		if (array instanceof VSBuffer) {
			this.buffer.set(array.buffer, offset);
		} else if (array instanceof Uint8Array) {
			this.buffer.set(array, offset);
		} else if (array instanceof ArrayBuffer) {
			this.buffer.set(new Uint8Array(array), offset);
		} else if (ArrayBuffer.isView(array)) {
			this.buffer.set(new Uint8Array(array.buffer, array.byteOffset, array.byteLength), offset);
		} else {
			throw new Error(`Unknown argument 'array'`);
		}
	}

	readUInt32BE(offset: number): number {
		return readUInt32BE(this.buffer, offset);
	}

	writeUInt32BE(value: number, offset: number): void {
		writeUInt32BE(this.buffer, value, offset);
	}

	readUInt32LE(offset: number): number {
		return readUInt32LE(this.buffer, offset);
	}

	writeUInt32LE(value: number, offset: number): void {
		writeUInt32LE(this.buffer, value, offset);
	}

	readUInt8(offset: number): number {
		return readUInt8(this.buffer, offset);
	}

	writeUInt8(value: number, offset: number): void {
		writeUInt8(this.buffer, value, offset);
	}

	indexOf(subarray: VSBuffer | Uint8Array, offset = 0) {
		return binaryIndexOf(
			this.buffer,
			subarray instanceof VSBuffer ? subarray.buffer : subarray,
			offset
		);
	}

	equals(other: VSBuffer): boolean {
		if (this === other) {
			return true;
		}

		if (this.byteLength !== other.byteLength) {
			return false;
		}

		return this.buffer.every((value, index) => value === other.buffer[index]);
	}
}

/**
 * Like String.indexOf, but works on Uint8Arrays.
 * Uses the boyer-moore-horspool algorithm to be reasonably speedy.
 */
export function binaryIndexOf(haystack: Uint8Array, needle: Uint8Array, offset = 0): number {
	const needleLen = needle.byteLength;
	const haystackLen = haystack.byteLength;

	if (needleLen === 0) {
		return 0;
	}

	if (needleLen === 1) {
		return haystack.indexOf(needle[0]);
	}

	if (needleLen > haystackLen - offset) {
		return -1;
	}

	// find index of the subarray using boyer-moore-horspool algorithm
	const table = indexOfTable.value;
	table.fill(needle.length);
	for (let i = 0; i < needle.length; i++) {
		table[needle[i]] = needle.length - i - 1;
	}

	let i = offset + needle.length - 1;
	let j = i;
	let result = -1;
	while (i < haystackLen) {
		if (haystack[i] === needle[j]) {
			if (j === 0) {
				result = i;
				break;
			}

			i--;
			j--;
		} else {
			i += Math.max(needle.length - j, table[haystack[i]]);
			j = needle.length - 1;
		}
	}

	return result;
}

export function readUInt16LE(source: Uint8Array, offset: number): number {
	return ((source[offset + 0] << 0) >>> 0) | ((source[offset + 1] << 8) >>> 0);
}

export function writeUInt16LE(destination: Uint8Array, value: number, offset: number): void {
	destination[offset + 0] = value & 0b11111111;
	value = value >>> 8;
	destination[offset + 1] = value & 0b11111111;
}

export function readUInt32BE(source: Uint8Array, offset: number): number {
	return (
		source[offset] * 2 ** 24 +
		source[offset + 1] * 2 ** 16 +
		source[offset + 2] * 2 ** 8 +
		source[offset + 3]
	);
}

export function writeUInt32BE(destination: Uint8Array, value: number, offset: number): void {
	destination[offset + 3] = value;
	value = value >>> 8;
	destination[offset + 2] = value;
	value = value >>> 8;
	destination[offset + 1] = value;
	value = value >>> 8;
	destination[offset] = value;
}

export function readUInt32LE(source: Uint8Array, offset: number): number {
	return (
		((source[offset + 0] << 0) >>> 0) |
		((source[offset + 1] << 8) >>> 0) |
		((source[offset + 2] << 16) >>> 0) |
		((source[offset + 3] << 24) >>> 0)
	);
}

export function writeUInt32LE(destination: Uint8Array, value: number, offset: number): void {
	destination[offset + 0] = value & 0b11111111;
	value = value >>> 8;
	destination[offset + 1] = value & 0b11111111;
	value = value >>> 8;
	destination[offset + 2] = value & 0b11111111;
	value = value >>> 8;
	destination[offset + 3] = value & 0b11111111;
}

export function readUInt8(source: Uint8Array, offset: number): number {
	return source[offset];
}

export function writeUInt8(destination: Uint8Array, value: number, offset: number): void {
	destination[offset] = value;
}
