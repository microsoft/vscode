/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare var Buffer: any;
export const hasBuffer = (typeof Buffer !== 'undefined');

let textEncoder: TextEncoder | null;
let textDecoder: TextDecoder | null;

export class VSBuffer {

	static alloc(byteLength: number): VSBuffer {
		if (hasBuffer) {
			return new VSBuffer(Buffer.allocUnsafe(byteLength));
		} else {
			return new VSBuffer(new Uint8Array(byteLength));
		}
	}

	static wrap(actual: Uint8Array): VSBuffer {
		if (hasBuffer && !(Buffer.isBuffer(actual))) {
			// https://nodejs.org/dist/latest-v10.x/docs/api/buffer.html#buffer_class_method_buffer_from_arraybuffer_byteoffset_length
			// Create a zero-copy Buffer wrapper around the ArrayBuffer pointed to by the Uint8Array
			actual = Buffer.from(actual.buffer, actual.byteOffset, actual.byteLength);
		}
		return new VSBuffer(actual);
	}

	static fromString(source: string): VSBuffer {
		if (hasBuffer) {
			return new VSBuffer(Buffer.from(source));
		} else {
			if (!textEncoder) {
				textEncoder = new TextEncoder();
			}
			return new VSBuffer(textEncoder.encode(source));
		}
	}

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
		// ensures the same, performant, behaviour.
		return new VSBuffer(this.buffer.subarray(start!/*bad lib.d.ts*/, end));
	}

	set(array: VSBuffer, offset?: number): void {
		this.buffer.set(array.buffer, offset);
	}

	readUInt32BE(offset: number): number {
		return readUInt32BE(this.buffer, offset);
	}

	writeUInt32BE(value: number, offset: number): void {
		writeUInt32BE(this.buffer, value, offset);
	}

	readUInt8(offset: number): number {
		return readUInt8(this.buffer, offset);
	}

	writeUInt8(value: number, offset: number): void {
		writeUInt8(this.buffer, value, offset);
	}
}

export function readUInt32BE(source: Uint8Array, offset: number): number {
	return (
		source[offset] * 2 ** 24
		+ source[offset + 1] * 2 ** 16
		+ source[offset + 2] * 2 ** 8
		+ source[offset + 3]
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

function readUInt8(source: Uint8Array, offset: number): number {
	return source[offset];
}

function writeUInt8(destination: Uint8Array, value: number, offset: number): void {
	destination[offset] = value;
}

export interface VSBufferReadable {

	/**
	 * Read data from the underlying source. Will return
	 * null to indicate that no more data can be read.
	 */
	read(): VSBuffer | null;
}

export interface ReadableStream<T> {

	/**
	 * The 'data' event is emitted whenever the stream is
	 * relinquishing ownership of a chunk of data to a consumer.
	 */
	on(event: 'data', callback: (chunk: T) => void): void;

	/**
	 * Emitted when any error occurs.
	 */
	on(event: 'error', callback: (err: any) => void): void;

	/**
	 * The 'end' event is emitted when there is no more data
	 * to be consumed from the stream. The 'end' event will
	 * not be emitted unless the data is completely consumed.
	 */
	on(event: 'end', callback: () => void): void;

	/**
	 * Stops emitting any events until resume() is called.
	 */
	pause?(): void;

	/**
	 * Starts emitting events again after pause() was called.
	 */
	resume?(): void;

	/**
	 * Destroys the stream and stops emitting any event.
	 */
	destroy?(): void;
}

/**
 * A readable stream that sends data via VSBuffer.
 */
export interface VSBufferReadableStream extends ReadableStream<VSBuffer> {
	pause(): void;
	resume(): void;
	destroy(): void;
}

export function isVSBufferReadableStream(obj: any): obj is VSBufferReadableStream {
	const candidate: VSBufferReadableStream = obj;

	return candidate && [candidate.on, candidate.pause, candidate.resume, candidate.destroy].every(fn => typeof fn === 'function');
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

/**
 * Helper to fully read a VSBuffer stream into a single buffer.
 */
export function streamToBuffer(stream: VSBufferReadableStream): Promise<VSBuffer> {
	return new Promise((resolve, reject) => {
		const chunks: VSBuffer[] = [];

		stream.on('data', chunk => chunks.push(chunk));
		stream.on('error', error => reject(error));
		stream.on('end', () => resolve(VSBuffer.concat(chunks)));
	});
}

/**
 * Helper to create a VSBufferStream from an existing VSBuffer.
 */
export function bufferToStream(buffer: VSBuffer): VSBufferReadableStream {
	const stream = writeableBufferStream();

	stream.end(buffer);

	return stream;
}

/**
 * Helper to create a VSBufferStream from a Uint8Array stream.
 */
export function toVSBufferReadableStream(stream: ReadableStream<Uint8Array | string>): VSBufferReadableStream {
	const vsbufferStream = writeableBufferStream();

	stream.on('data', data => vsbufferStream.write(typeof data === 'string' ? VSBuffer.fromString(data) : VSBuffer.wrap(data)));
	stream.on('end', () => vsbufferStream.end());
	stream.on('error', error => vsbufferStream.error(error));

	return vsbufferStream;
}

/**
 * Helper to create a VSBufferStream that can be pushed
 * buffers to. Will only start to emit data when a listener
 * is added.
 */
export function writeableBufferStream(): VSBufferWriteableStream {
	return new VSBufferWriteableStreamImpl();
}

export interface VSBufferWriteableStream extends VSBufferReadableStream {
	write(chunk: VSBuffer): void;
	error(error: Error): void;
	end(result?: VSBuffer | Error): void;
}

class VSBufferWriteableStreamImpl implements VSBufferWriteableStream {

	private readonly state = {
		flowing: false,
		ended: false,
		destroyed: false
	};

	private readonly buffer = {
		data: [] as VSBuffer[],
		error: [] as Error[]
	};

	private readonly listeners = {
		data: [] as { (chunk: VSBuffer): void }[],
		error: [] as { (error: Error): void }[],
		end: [] as { (): void }[]
	};

	pause(): void {
		if (this.state.destroyed) {
			return;
		}

		this.state.flowing = false;
	}

	resume(): void {
		if (this.state.destroyed) {
			return;
		}

		if (!this.state.flowing) {
			this.state.flowing = true;

			// emit buffered events
			this.flowData();
			this.flowErrors();
			this.flowEnd();
		}
	}

	write(chunk: VSBuffer): void {
		if (this.state.destroyed) {
			return;
		}

		// flowing: directly send the data to listeners
		if (this.state.flowing) {
			this.listeners.data.forEach(listener => listener(chunk));
		}

		// not yet flowing: buffer data until flowing
		else {
			this.buffer.data.push(chunk);
		}
	}

	error(error: Error): void {
		if (this.state.destroyed) {
			return;
		}

		// flowing: directly send the error to listeners
		if (this.state.flowing) {
			this.listeners.error.forEach(listener => listener(error));
		}

		// not yet flowing: buffer errors until flowing
		else {
			this.buffer.error.push(error);
		}
	}

	end(result?: VSBuffer | Error): void {
		if (this.state.destroyed) {
			return;
		}

		// end with data or error if provided
		if (result instanceof Error) {
			this.error(result);
		} else if (result) {
			this.write(result);
		}

		// flowing: send end event to listeners
		if (this.state.flowing) {
			this.listeners.end.forEach(listener => listener());

			this.destroy();
		}

		// not yet flowing: remember state
		else {
			this.state.ended = true;
		}
	}

	on(event: 'data', callback: (chunk: VSBuffer) => void): void;
	on(event: 'error', callback: (err: any) => void): void;
	on(event: 'end', callback: () => void): void;
	on(event: 'data' | 'error' | 'end', callback: (arg0?: any) => void): void {
		if (this.state.destroyed) {
			return;
		}

		switch (event) {
			case 'data':
				this.listeners.data.push(callback);

				// switch into flowing mode as soon as the first 'data'
				// listener is added and we are not yet in flowing mode
				this.resume();

				break;

			case 'end':
				this.listeners.end.push(callback);

				// emit 'end' event directly if we are flowing
				// and the end has already been reached
				//
				// finish() when it went through
				if (this.state.flowing && this.flowEnd()) {
					this.destroy();
				}

				break;

			case 'error':
				this.listeners.error.push(callback);

				// emit buffered 'error' events unless done already
				// now that we know that we have at least one listener
				if (this.state.flowing) {
					this.flowErrors();
				}

				break;
		}
	}

	private flowData(): void {
		if (this.buffer.data.length > 0) {
			const fullDataBuffer = VSBuffer.concat(this.buffer.data);

			this.listeners.data.forEach(listener => listener(fullDataBuffer));

			this.buffer.data.length = 0;
		}
	}

	private flowErrors(): void {
		if (this.listeners.error.length > 0) {
			for (const error of this.buffer.error) {
				this.listeners.error.forEach(listener => listener(error));
			}

			this.buffer.error.length = 0;
		}
	}

	private flowEnd(): boolean {
		if (this.state.ended) {
			this.listeners.end.forEach(listener => listener());

			return this.listeners.end.length > 0;
		}

		return false;
	}

	destroy(): void {
		if (!this.state.destroyed) {
			this.state.destroyed = true;
			this.state.ended = true;

			this.buffer.data.length = 0;
			this.buffer.error.length = 0;

			this.listeners.data.length = 0;
			this.listeners.error.length = 0;
			this.listeners.end.length = 0;
		}
	}
}
