/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../common/buffer.js';
import { ChunkStream } from './ipc.net.js';

const firstByteFinalMask = 0b10000000;
const firstByteCompressedMask = 0b01000000;
const firstByteReservedMask = 0b00110000;
const secondByteMaskedMask = 0b10000000;
const payloadLengthMask = 0b01111111;
const extendedPayloadLength16 = 126;
const extendedPayloadLength64 = 127;
const maximum32BitPayloadLength = 0xffff_ffff;

/** RFC 6455 frame opcode values supported by the framing codec. */
export const enum WebSocketOpcode {
	Continuation = 0x0,
	Text = 0x1,
	Binary = 0x2,
	Close = 0x8,
	Ping = 0x9,
	Pong = 0xA,
}

/** A parsed RFC 6455 frame with an unmasked payload. */
export interface IWebSocketFrame {
	readonly final: boolean;
	readonly compressed: boolean;
	readonly opcode: WebSocketOpcode;
	readonly payload: VSBuffer;
	/** The mask from the wire, including a zero-valued mask, when present. */
	readonly mask?: number;
}

/** Options for encoding an RFC 6455 frame. */
export interface IWebSocketFrameOptions {
	readonly final?: boolean;
	readonly compressed?: boolean;
	readonly opcode: WebSocketOpcode;
	/** Four mask bytes. When supplied, sets MASK and applies it to a payload copy. */
	readonly mask?: number;
}

/** Options for parsing RFC 6455 frames. */
export interface IWebSocketFrameParserOptions {
	/** Maximum accepted frame payload length. */
	readonly maxPayloadLength?: number;
	/** Unmask owned payload buffers in place instead of allocating a copy. */
	readonly unmaskInPlace?: boolean;
}

/** Indicates that a WebSocket frame exceeded the configured payload limit. */
export class WebSocketFrameTooLargeError extends Error {
	constructor(readonly payloadLength: number, readonly maxPayloadLength: number) {
		super(`WebSocket frame payload length ${payloadLength} exceeds the configured limit of ${maxPayloadLength}.`);
	}
}

/** Incrementally parses RFC 6455 frames from arbitrarily chunked input. */
export class WebSocketFrameParser {

	private readonly _incomingData = new ChunkStream();
	private readonly _maxPayloadLength: number;
	private readonly _unmaskInPlace: boolean;

	constructor(options: IWebSocketFrameParserOptions = {}) {
		this._maxPayloadLength = options.maxPayloadLength ?? maximum32BitPayloadLength;
		this._unmaskInPlace = options.unmaskInPlace ?? false;
		if (!Number.isInteger(this._maxPayloadLength) || this._maxPayloadLength < 0 || this._maxPayloadLength > maximum32BitPayloadLength) {
			throw new Error('WebSocket frame payload limits must be unsigned 32-bit integers.');
		}
	}

	/**
	 * Accepts a network chunk and returns every complete frame it contains.
	 */
	acceptChunk(data: VSBuffer): readonly IWebSocketFrame[] {
		if (data.byteLength === 0) {
			return [];
		}

		this._incomingData.acceptChunk(data);
		const frames: IWebSocketFrame[] = [];
		while (this._incomingData.byteLength >= 2) {
			const initialHeader = this._incomingData.peek(2);
			const firstByte = initialHeader.readUInt8(0);
			const secondByte = initialHeader.readUInt8(1);
			const payloadLengthMarker = secondByte & payloadLengthMask;
			const extendedPayloadLengthSize = payloadLengthMarker === extendedPayloadLength16 ? 2 : payloadLengthMarker === extendedPayloadLength64 ? 8 : 0;
			const masked = (secondByte & secondByteMaskedMask) !== 0;
			const headerLength = 2 + extendedPayloadLengthSize + (masked ? 4 : 0);
			if (this._incomingData.byteLength < headerLength) {
				break;
			}

			const header = this._incomingData.peek(headerLength);
			const payloadLength = getPayloadLength(header, payloadLengthMarker);
			if (payloadLength > this._maxPayloadLength) {
				throw new WebSocketFrameTooLargeError(payloadLength, this._maxPayloadLength);
			}
			validateFrame(firstByte, payloadLength);
			const opcode = firstByte & 0b00001111;
			validateOpcode(opcode);
			if (this._incomingData.byteLength < headerLength + payloadLength) {
				break;
			}

			this._incomingData.read(headerLength);
			const payload = this._incomingData.read(payloadLength);
			const mask = masked ? header.readUInt32BE(headerLength - 4) : undefined;
			let unmaskedPayload = payload;
			if (mask !== undefined) {
				if (this._unmaskInPlace) {
					applyWebSocketMask(unmaskedPayload, mask);
				} else {
					unmaskedPayload = copyAndApplyWebSocketMask(payload, mask);
				}
			}
			frames.push({
				final: (firstByte & firstByteFinalMask) !== 0,
				compressed: (firstByte & firstByteCompressedMask) !== 0,
				opcode,
				payload: unmaskedPayload,
				mask,
			});
		}
		return frames;
	}
}

/**
 * Encodes one RFC 6455 frame without mutating the supplied payload.
 */
export function encodeWebSocketFrame(payload: VSBuffer, options: IWebSocketFrameOptions): VSBuffer {
	const final = options.final ?? true;
	const compressed = options.compressed ?? false;
	validateOpcode(options.opcode);
	validateMask(options.mask);
	validateFrame((final ? firstByteFinalMask : 0) | (compressed ? firstByteCompressedMask : 0) | options.opcode, payload.byteLength);

	const headerLength = getHeaderLength(payload.byteLength, options.mask !== undefined);
	const header = VSBuffer.alloc(headerLength);
	header.writeUInt8((final ? firstByteFinalMask : 0) | (compressed ? firstByteCompressedMask : 0) | options.opcode, 0);

	let offset = 2;
	if (payload.byteLength < extendedPayloadLength16) {
		header.writeUInt8((options.mask === undefined ? 0 : secondByteMaskedMask) | payload.byteLength, 1);
	} else if (payload.byteLength < 2 ** 16) {
		header.writeUInt8((options.mask === undefined ? 0 : secondByteMaskedMask) | extendedPayloadLength16, 1);
		header.writeUInt8(payload.byteLength >>> 8, offset++);
		header.writeUInt8(payload.byteLength, offset++);
	} else {
		header.writeUInt8((options.mask === undefined ? 0 : secondByteMaskedMask) | extendedPayloadLength64, 1);
		header.writeUInt32BE(0, offset);
		offset += 4;
		header.writeUInt32BE(payload.byteLength, offset);
		offset += 4;
	}

	if (options.mask === undefined) {
		return VSBuffer.concat([header, payload]);
	}

	header.writeUInt32BE(options.mask, offset);
	return VSBuffer.concat([header, copyAndApplyWebSocketMask(payload, options.mask)]);
}

/** Applies an RFC 6455 four-byte mask to a buffer in place. */
export function applyWebSocketMask(payload: VSBuffer, mask: number): void {
	validateMask(mask);
	if (mask === 0) {
		return;
	}

	const wordCount = payload.byteLength >>> 2;
	for (let index = 0; index < wordCount; index++) {
		const offset = index * 4;
		payload.writeUInt32BE(payload.readUInt32BE(offset) ^ mask, offset);
	}

	const offset = wordCount * 4;
	const remainingByteCount = payload.byteLength - offset;
	if (remainingByteCount >= 1) {
		payload.writeUInt8(payload.readUInt8(offset) ^ ((mask >>> 24) & 0xff), offset);
	}
	if (remainingByteCount >= 2) {
		payload.writeUInt8(payload.readUInt8(offset + 1) ^ ((mask >>> 16) & 0xff), offset + 1);
	}
	if (remainingByteCount >= 3) {
		payload.writeUInt8(payload.readUInt8(offset + 2) ^ ((mask >>> 8) & 0xff), offset + 2);
	}
}

function getHeaderLength(payloadLength: number, masked: boolean): number {
	if (payloadLength > maximum32BitPayloadLength) {
		throw new Error('WebSocket payload lengths greater than 2^32 - 1 are not supported.');
	}
	if (payloadLength < extendedPayloadLength16) {
		return 2 + (masked ? 4 : 0);
	}
	if (payloadLength < 2 ** 16) {
		return 4 + (masked ? 4 : 0);
	}
	return 10 + (masked ? 4 : 0);
}

function getPayloadLength(header: VSBuffer, marker: number): number {
	if (marker < extendedPayloadLength16) {
		return marker;
	}
	if (marker === extendedPayloadLength16) {
		return header.readUInt8(2) * 2 ** 8 + header.readUInt8(3);
	}

	const highBits = header.readUInt32BE(2);
	if (highBits !== 0) {
		throw new Error('WebSocket payload lengths greater than 2^32 - 1 are not supported.');
	}
	return header.readUInt32BE(6);
}

function validateFrame(firstByte: number, payloadLength: number): void {
	if ((firstByte & firstByteReservedMask) !== 0) {
		throw new Error('WebSocket frames must not set RSV2 or RSV3.');
	}

	const opcode = firstByte & 0b00001111;
	validateOpcode(opcode);
	if (isControlOpcode(opcode)) {
		if ((firstByte & firstByteFinalMask) === 0) {
			throw new Error('WebSocket control frames must be final.');
		}
		if (payloadLength > 125) {
			throw new Error('WebSocket control frames must not exceed 125 bytes.');
		}
		if ((firstByte & firstByteCompressedMask) !== 0) {
			throw new Error('WebSocket control frames must not set RSV1.');
		}
	}
}

function validateOpcode(opcode: number): asserts opcode is WebSocketOpcode {
	if (opcode !== WebSocketOpcode.Continuation
		&& opcode !== WebSocketOpcode.Text
		&& opcode !== WebSocketOpcode.Binary
		&& opcode !== WebSocketOpcode.Close
		&& opcode !== WebSocketOpcode.Ping
		&& opcode !== WebSocketOpcode.Pong) {
		throw new Error(`WebSocket frame has reserved opcode ${opcode}.`);
	}
}

function validateMask(mask: number | undefined): void {
	if (mask !== undefined && (!Number.isInteger(mask) || mask < 0 || mask > maximum32BitPayloadLength)) {
		throw new Error('WebSocket masks must be unsigned 32-bit integers.');
	}
}

function isControlOpcode(opcode: number): boolean {
	return (opcode & 0b00001000) !== 0;
}

function copyAndApplyWebSocketMask(payload: VSBuffer, mask: number): VSBuffer {
	const maskedPayload = VSBuffer.alloc(payload.byteLength);
	maskedPayload.set(payload);
	applyWebSocketMask(maskedPayload, mask);
	return maskedPayload;
}
