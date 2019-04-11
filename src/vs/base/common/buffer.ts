/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare var Buffer: any;
export const hasBuffer = (typeof Buffer !== 'undefined');

let textEncoder: TextEncoder | null;
let textDecoder: TextDecoder | null;

export class VSBuffer {

	public static alloc(byteLength: number): VSBuffer {
		if (hasBuffer) {
			return new VSBuffer(Buffer.allocUnsafe(byteLength));
		} else {
			return new VSBuffer(new Uint8Array(byteLength));
		}
	}

	public static wrap(actual: Uint8Array): VSBuffer {
		if (hasBuffer && !(Buffer.isBuffer(actual))) {
			// https://nodejs.org/dist/latest-v10.x/docs/api/buffer.html#buffer_class_method_buffer_from_arraybuffer_byteoffset_length
			// Create a zero-copy Buffer wrapper around the ArrayBuffer pointed to by the Uint8Array
			actual = Buffer.from(actual.buffer, actual.byteOffset, actual.byteLength);
		}
		return new VSBuffer(actual);
	}

	public static fromString(source: string): VSBuffer {
		if (hasBuffer) {
			return new VSBuffer(Buffer.from(source));
		} else {
			if (!textEncoder) {
				textEncoder = new TextEncoder();
			}
			return new VSBuffer(textEncoder.encode(source));
		}
	}

	public static concat(buffers: VSBuffer[], totalLength?: number): VSBuffer {
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

	public readonly buffer: Uint8Array;
	public readonly byteLength: number;

	private constructor(buffer: Uint8Array) {
		this.buffer = buffer;
		this.byteLength = this.buffer.byteLength;
	}

	public toString(): string {
		if (hasBuffer) {
			return this.buffer.toString();
		} else {
			if (!textDecoder) {
				textDecoder = new TextDecoder();
			}
			return textDecoder.decode(this.buffer);
		}
	}

	public slice(start?: number, end?: number): VSBuffer {
		return new VSBuffer(this.buffer.slice(start, end));
	}

	public set(array: VSBuffer, offset?: number): void {
		this.buffer.set(array.buffer, offset);
	}

	public readUint32BE(offset: number): number {
		return readUint32BE(this.buffer, offset);
	}

	public writeUint32BE(value: number, offset: number): void {
		writeUint32BE(this.buffer, value, offset);
	}

	public readUint8(offset: number): number {
		return readUint8(this.buffer, offset);
	}

	public writeUint8(value: number, offset: number): void {
		writeUint8(this.buffer, value, offset);
	}

}

function readUint32BE(source: Uint8Array, offset: number): number {
	return (
		source[offset] * 2 ** 24
		+ source[offset + 1] * 2 ** 16
		+ source[offset + 2] * 2 ** 8
		+ source[offset + 3]
	);
}

function writeUint32BE(destination: Uint8Array, value: number, offset: number): void {
	destination[offset + 3] = value;
	value = value >>> 8;
	destination[offset + 2] = value;
	value = value >>> 8;
	destination[offset + 1] = value;
	value = value >>> 8;
	destination[offset] = value;
}

function readUint8(source: Uint8Array, offset: number): number {
	return source[offset];
}

function writeUint8(destination: Uint8Array, value: number, offset: number): void {
	destination[offset] = value;
}

export interface VSBufferReadable {

	/**
	 * Read data from the underlying source. Will return
	 * null to indicate that no more data can be read.
	 */
	read(): VSBuffer | null;
}

/**
 * Helper to fully read a VSBuffer readable into a single buffer.
 */
export function readableToBuffer(readable: VSBufferReadable): VSBuffer {
	const chunks: VSBuffer[] = [];

	let chunk: VSBuffer | null;
	while (chunk = readable.read()) {
		chunks.push(chunk);
	}

	return VSBuffer.concat(chunks);
}

/**
 * Helper to convert a buffer into a readable buffer.
 */
export function bufferToReadable(buffer: VSBuffer): VSBufferReadable {
	let done = false;
	return {
		read: () => {
			if (done) {
				return null;
			}

			done = true;

			return buffer;
		}
	};
}