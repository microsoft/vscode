/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../common/buffer.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../test/common/utils.js';
import { encodeWebSocketFrame, WebSocketFrameParser, WebSocketOpcode } from '../../common/webSocketFraming.js';

suite('WebSocket framing', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('encodes and parses a masked client frame without mutating its payload', () => {
		const payload = VSBuffer.fromString('Hello');
		const encoded = encodeWebSocketFrame(payload, { opcode: WebSocketOpcode.Text, mask: 0x01020304 });
		const frame = new WebSocketFrameParser().acceptChunk(encoded)[0];

		assert.deepStrictEqual({
			encoded: Array.from(encoded.buffer),
			payload: payload.toString(),
			frame: {
				final: frame.final,
				compressed: frame.compressed,
				opcode: frame.opcode,
				payload: frame.payload.toString(),
				mask: frame.mask,
			},
		}, {
			encoded: [0x81, 0x85, 0x01, 0x02, 0x03, 0x04, 0x49, 0x67, 0x6f, 0x68, 0x6e],
			payload: 'Hello',
			frame: {
				final: true,
				compressed: false,
				opcode: WebSocketOpcode.Text,
				payload: 'Hello',
				mask: 0x01020304,
			},
		});
	});

	test('masks a three-byte payload using every remainder byte', () => {
		const payload = VSBuffer.fromByteArray([0xaa, 0xbb, 0xcc]);
		const encoded = encodeWebSocketFrame(payload, { opcode: WebSocketOpcode.Binary, mask: 0x12345678 });
		const frame = new WebSocketFrameParser().acceptChunk(encoded)[0];

		assert.deepStrictEqual({
			encoded: Array.from(encoded.buffer),
			payload: Array.from(frame.payload.buffer),
		}, {
			encoded: [0x82, 0x83, 0x12, 0x34, 0x56, 0x78, 0xb8, 0x8f, 0x9a],
			payload: [0xaa, 0xbb, 0xcc],
		});
	});

	test('can unmask owned payload buffers in place', () => {
		const encoded = encodeWebSocketFrame(VSBuffer.fromString('owned'), { opcode: WebSocketOpcode.Text, mask: 0x12345678 });
		const frame = new WebSocketFrameParser({ unmaskInPlace: true }).acceptChunk(encoded)[0];

		assert.deepStrictEqual({
			payload: frame.payload.toString(),
			wirePayloadAfterParsing: encoded.slice(6).toString(),
		}, {
			payload: 'owned',
			wirePayloadAfterParsing: 'owned',
		});
	});

	test('preserves a present zero-valued mask', () => {
		const encoded = encodeWebSocketFrame(VSBuffer.fromString('zero'), { opcode: WebSocketOpcode.Text, mask: 0 });
		const frame = new WebSocketFrameParser().acceptChunk(encoded)[0];

		assert.deepStrictEqual({
			maskBit: encoded.readUInt8(1) & 0b10000000,
			maskBytes: Array.from(encoded.slice(2, 6).buffer),
			payload: frame.payload.toString(),
			mask: frame.mask,
		}, {
			maskBit: 0b10000000,
			maskBytes: [0, 0, 0, 0],
			payload: 'zero',
			mask: 0,
		});
	});

	test('accepts frames across chunk boundaries and in coalesced chunks', () => {
		const first = encodeWebSocketFrame(VSBuffer.fromString('first'), { opcode: WebSocketOpcode.Text });
		const second = encodeWebSocketFrame(VSBuffer.fromString('second'), { opcode: WebSocketOpcode.Text });
		const parser = new WebSocketFrameParser();

		const firstPart = parser.acceptChunk(first.slice(0, 3));
		const remaining = parser.acceptChunk(VSBuffer.concat([first.slice(3), second]));

		assert.deepStrictEqual({
			firstPart: firstPart.length,
			remaining: remaining.map(frame => frame.payload.toString()),
		}, {
			firstPart: 0,
			remaining: ['first', 'second'],
		});
	});

	for (const length of [125, 126, 65_535, 65_536]) {
		test(`encodes and parses payload length ${length}`, () => {
			const payload = VSBuffer.alloc(length);
			for (let index = 0; index < payload.byteLength; index++) {
				payload.writeUInt8(index, index);
			}

			const encoded = encodeWebSocketFrame(payload, { opcode: WebSocketOpcode.Binary });
			const frame = new WebSocketFrameParser().acceptChunk(encoded)[0];

			assert.deepStrictEqual({
				header: Array.from(encoded.slice(0, encoded.byteLength - payload.byteLength).buffer),
				length: frame.payload.byteLength,
				first: frame.payload.readUInt8(0),
				last: frame.payload.readUInt8(frame.payload.byteLength - 1),
			}, {
				header: length < 126
					? [0x82, length]
					: length < 2 ** 16
						? [0x82, 126, (length >>> 8) & 0xff, length & 0xff]
						: [0x82, 127, 0, 0, 0, 0, (length >>> 24) & 0xff, (length >>> 16) & 0xff, (length >>> 8) & 0xff, length & 0xff],
				length,
				first: 0,
				last: (length - 1) & 0xff,
			});
		});
	}

	test('rejects invalid control frames, reserved opcodes, and unsupported lengths', () => {
		assert.throws(() => encodeWebSocketFrame(VSBuffer.alloc(0), { opcode: WebSocketOpcode.Ping, final: false }));
		assert.throws(() => new WebSocketFrameParser().acceptChunk(VSBuffer.fromByteArray([0x83, 0x00])));
		assert.throws(() => new WebSocketFrameParser().acceptChunk(VSBuffer.fromByteArray([0x89, 0x7e, 0x00, 0x7e, ...new Array<number>(126).fill(0)])));
		assert.throws(() => new WebSocketFrameParser().acceptChunk(VSBuffer.fromByteArray([0x82, 0x7f, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00])));
	});

	test('rejects frames over the configured payload limit after reading the header', () => {
		const encoded = encodeWebSocketFrame(VSBuffer.fromString('too large'), { opcode: WebSocketOpcode.Text });
		assert.throws(
			() => new WebSocketFrameParser({ maxPayloadLength: 4 }).acceptChunk(encoded.slice(0, 2)),
			/configured limit of 4/,
		);
	});
});
