/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../common/async.js';
import { bufferedStreamToBuffer, bufferToReadable, bufferToStream, decodeBase64, decodeHex, encodeBase64, encodeHex, newWriteableBufferStream, readableToBuffer, streamToBuffer, VSBuffer } from '../../common/buffer.js';
import { peekStream } from '../../common/stream.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';

suite('Buffer', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('issue #71993 - VSBuffer#toString returns numbers', () => {
		const data = new Uint8Array([1, 2, 3, 'h'.charCodeAt(0), 'i'.charCodeAt(0), 4, 5]).buffer;
		const buffer = VSBuffer.wrap(new Uint8Array(data, 3, 2));
		assert.deepStrictEqual(buffer.toString(), 'hi');
	});

	test('issue #251527 - VSBuffer#toString preserves BOM character in filenames', () => {
		// BOM character (U+FEFF) is a zero-width character that was being stripped
		// when deserializing messages in the IPC layer. This test verifies that
		// the BOM character is preserved when using VSBuffer.toString().
		const bomChar = '\uFEFF';
		const filename = `${bomChar}c.txt`;
		const buffer = VSBuffer.fromString(filename);
		const result = buffer.toString();

		// Verify the BOM character is preserved
		assert.strictEqual(result, filename);
		assert.strictEqual(result.charCodeAt(0), 0xFEFF);
	});

	test('bufferToReadable / readableToBuffer', () => {
		const content = 'Hello World';
		const readable = bufferToReadable(VSBuffer.fromString(content));

		assert.strictEqual(readableToBuffer(readable).toString(), content);
	});

	test('bufferToStream / streamToBuffer', async () => {
		const content = 'Hello World';
		const stream = bufferToStream(VSBuffer.fromString(content));

		assert.strictEqual((await streamToBuffer(stream)).toString(), content);
	});

	test('bufferedStreamToBuffer', async () => {
		const content = 'Hello World';
		const stream = await peekStream(bufferToStream(VSBuffer.fromString(content)), 1);

		assert.strictEqual((await bufferedStreamToBuffer(stream)).toString(), content);
	});

	test('bufferWriteableStream - basics (no error)', async () => {
		const stream = newWriteableBufferStream();

		const chunks: VSBuffer[] = [];
		stream.on('data', data => {
			chunks.push(data);
		});

		let ended = false;
		stream.on('end', () => {
			ended = true;
		});

		const errors: Error[] = [];
		stream.on('error', error => {
			errors.push(error);
		});

		await timeout(0);
		stream.write(VSBuffer.fromString('Hello'));
		await timeout(0);
		stream.end(VSBuffer.fromString('World'));

		assert.strictEqual(chunks.length, 2);
		assert.strictEqual(chunks[0].toString(), 'Hello');
		assert.strictEqual(chunks[1].toString(), 'World');
		assert.strictEqual(ended, true);
		assert.strictEqual(errors.length, 0);
	});

	test('bufferWriteableStream - basics (error)', async () => {
		const stream = newWriteableBufferStream();

		const chunks: VSBuffer[] = [];
		stream.on('data', data => {
			chunks.push(data);
		});

		let ended = false;
		stream.on('end', () => {
			ended = true;
		});

		const errors: Error[] = [];
		stream.on('error', error => {
			errors.push(error);
		});

		await timeout(0);
		stream.write(VSBuffer.fromString('Hello'));
		await timeout(0);
		stream.error(new Error());
		stream.end();

		assert.strictEqual(chunks.length, 1);
		assert.strictEqual(chunks[0].toString(), 'Hello');
		assert.strictEqual(ended, true);
		assert.strictEqual(errors.length, 1);
	});

	test('bufferWriteableStream - buffers data when no listener', async () => {
		const stream = newWriteableBufferStream();

		await timeout(0);
		stream.write(VSBuffer.fromString('Hello'));
		await timeout(0);
		stream.end(VSBuffer.fromString('World'));

		const chunks: VSBuffer[] = [];
		stream.on('data', data => {
			chunks.push(data);
		});

		let ended = false;
		stream.on('end', () => {
			ended = true;
		});

		const errors: Error[] = [];
		stream.on('error', error => {
			errors.push(error);
		});

		assert.strictEqual(chunks.length, 1);
		assert.strictEqual(chunks[0].toString(), 'HelloWorld');
		assert.strictEqual(ended, true);
		assert.strictEqual(errors.length, 0);
	});

	test('bufferWriteableStream - buffers errors when no listener', async () => {
		const stream = newWriteableBufferStream();

		await timeout(0);
		stream.write(VSBuffer.fromString('Hello'));
		await timeout(0);
		stream.error(new Error());

		const chunks: VSBuffer[] = [];
		stream.on('data', data => {
			chunks.push(data);
		});

		const errors: Error[] = [];
		stream.on('error', error => {
			errors.push(error);
		});

		let ended = false;
		stream.on('end', () => {
			ended = true;
		});

		stream.end();

		assert.strictEqual(chunks.length, 1);
		assert.strictEqual(chunks[0].toString(), 'Hello');
		assert.strictEqual(ended, true);
		assert.strictEqual(errors.length, 1);
	});

	test('bufferWriteableStream - buffers end when no listener', async () => {
		const stream = newWriteableBufferStream();

		await timeout(0);
		stream.write(VSBuffer.fromString('Hello'));
		await timeout(0);
		stream.end(VSBuffer.fromString('World'));

		let ended = false;
		stream.on('end', () => {
			ended = true;
		});

		const chunks: VSBuffer[] = [];
		stream.on('data', data => {
			chunks.push(data);
		});

		const errors: Error[] = [];
		stream.on('error', error => {
			errors.push(error);
		});

		assert.strictEqual(chunks.length, 1);
		assert.strictEqual(chunks[0].toString(), 'HelloWorld');
		assert.strictEqual(ended, true);
		assert.strictEqual(errors.length, 0);
	});

	test('bufferWriteableStream - nothing happens after end()', async () => {
		const stream = newWriteableBufferStream();

		const chunks: VSBuffer[] = [];
		stream.on('data', data => {
			chunks.push(data);
		});

		await timeout(0);
		stream.write(VSBuffer.fromString('Hello'));
		await timeout(0);
		stream.end(VSBuffer.fromString('World'));

		let dataCalledAfterEnd = false;
		stream.on('data', data => {
			dataCalledAfterEnd = true;
		});

		let errorCalledAfterEnd = false;
		stream.on('error', error => {
			errorCalledAfterEnd = true;
		});

		let endCalledAfterEnd = false;
		stream.on('end', () => {
			endCalledAfterEnd = true;
		});

		await timeout(0);
		stream.write(VSBuffer.fromString('Hello'));
		await timeout(0);
		stream.error(new Error());
		await timeout(0);
		stream.end(VSBuffer.fromString('World'));

		assert.strictEqual(dataCalledAfterEnd, false);
		assert.strictEqual(errorCalledAfterEnd, false);
		assert.strictEqual(endCalledAfterEnd, false);

		assert.strictEqual(chunks.length, 2);
		assert.strictEqual(chunks[0].toString(), 'Hello');
		assert.strictEqual(chunks[1].toString(), 'World');
	});

	test('bufferWriteableStream - pause/resume (simple)', async () => {
		const stream = newWriteableBufferStream();

		const chunks: VSBuffer[] = [];
		stream.on('data', data => {
			chunks.push(data);
		});

		let ended = false;
		stream.on('end', () => {
			ended = true;
		});

		const errors: Error[] = [];
		stream.on('error', error => {
			errors.push(error);
		});

		stream.pause();

		await timeout(0);
		stream.write(VSBuffer.fromString('Hello'));
		await timeout(0);
		stream.end(VSBuffer.fromString('World'));

		assert.strictEqual(chunks.length, 0);
		assert.strictEqual(errors.length, 0);
		assert.strictEqual(ended, false);

		stream.resume();

		assert.strictEqual(chunks.length, 1);
		assert.strictEqual(chunks[0].toString(), 'HelloWorld');
		assert.strictEqual(ended, true);
		assert.strictEqual(errors.length, 0);
	});

	test('bufferWriteableStream - pause/resume (pause after first write)', async () => {
		const stream = newWriteableBufferStream();

		const chunks: VSBuffer[] = [];
		stream.on('data', data => {
			chunks.push(data);
		});

		let ended = false;
		stream.on('end', () => {
			ended = true;
		});

		const errors: Error[] = [];
		stream.on('error', error => {
			errors.push(error);
		});

		await timeout(0);
		stream.write(VSBuffer.fromString('Hello'));

		stream.pause();

		await timeout(0);
		stream.end(VSBuffer.fromString('World'));

		assert.strictEqual(chunks.length, 1);
		assert.strictEqual(chunks[0].toString(), 'Hello');
		assert.strictEqual(errors.length, 0);
		assert.strictEqual(ended, false);

		stream.resume();

		assert.strictEqual(chunks.length, 2);
		assert.strictEqual(chunks[0].toString(), 'Hello');
		assert.strictEqual(chunks[1].toString(), 'World');
		assert.strictEqual(ended, true);
		assert.strictEqual(errors.length, 0);
	});

	test('bufferWriteableStream - pause/resume (error)', async () => {
		const stream = newWriteableBufferStream();

		const chunks: VSBuffer[] = [];
		stream.on('data', data => {
			chunks.push(data);
		});

		let ended = false;
		stream.on('end', () => {
			ended = true;
		});

		const errors: Error[] = [];
		stream.on('error', error => {
			errors.push(error);
		});

		stream.pause();

		await timeout(0);
		stream.write(VSBuffer.fromString('Hello'));
		await timeout(0);
		stream.error(new Error());
		stream.end();

		assert.strictEqual(chunks.length, 0);
		assert.strictEqual(ended, false);
		assert.strictEqual(errors.length, 0);

		stream.resume();

		assert.strictEqual(chunks.length, 1);
		assert.strictEqual(chunks[0].toString(), 'Hello');
		assert.strictEqual(ended, true);
		assert.strictEqual(errors.length, 1);
	});

	test('bufferWriteableStream - destroy', async () => {
		const stream = newWriteableBufferStream();

		const chunks: VSBuffer[] = [];
		stream.on('data', data => {
			chunks.push(data);
		});

		let ended = false;
		stream.on('end', () => {
			ended = true;
		});

		const errors: Error[] = [];
		stream.on('error', error => {
			errors.push(error);
		});

		stream.destroy();

		await timeout(0);
		stream.write(VSBuffer.fromString('Hello'));
		await timeout(0);
		stream.end(VSBuffer.fromString('World'));

		assert.strictEqual(chunks.length, 0);
		assert.strictEqual(ended, false);
		assert.strictEqual(errors.length, 0);
	});

	test('Performance issue with VSBuffer#slice #76076', function () { // TODO@alexdima this test seems to fail in web (https://github.com/microsoft/vscode/issues/114042)
		// Buffer#slice creates a view
		if (typeof Buffer !== 'undefined') {
			const buff = Buffer.from([10, 20, 30, 40]);
			const b2 = buff.slice(1, 3);
			assert.strictEqual(buff[1], 20);
			assert.strictEqual(b2[0], 20);

			buff[1] = 17; // modify buff AND b2
			assert.strictEqual(buff[1], 17);
			assert.strictEqual(b2[0], 17);
		}

		// TypedArray#slice creates a copy
		{
			const unit = new Uint8Array([10, 20, 30, 40]);
			const u2 = unit.slice(1, 3);
			assert.strictEqual(unit[1], 20);
			assert.strictEqual(u2[0], 20);

			unit[1] = 17; // modify unit, NOT b2
			assert.strictEqual(unit[1], 17);
			assert.strictEqual(u2[0], 20);
		}

		// TypedArray#subarray creates a view
		{
			const unit = new Uint8Array([10, 20, 30, 40]);
			const u2 = unit.subarray(1, 3);
			assert.strictEqual(unit[1], 20);
			assert.strictEqual(u2[0], 20);

			unit[1] = 17; // modify unit AND b2
			assert.strictEqual(unit[1], 17);
			assert.strictEqual(u2[0], 17);
		}
	});

	test('indexOf', () => {
		const haystack = VSBuffer.fromString('abcaabbccaaabbbccc');
		assert.strictEqual(haystack.indexOf(VSBuffer.fromString('')), 0);
		assert.strictEqual(haystack.indexOf(VSBuffer.fromString('a'.repeat(100))), -1);

		assert.strictEqual(haystack.indexOf(VSBuffer.fromString('a')), 0);
		assert.strictEqual(haystack.indexOf(VSBuffer.fromString('c')), 2);

		assert.strictEqual(haystack.indexOf(VSBuffer.fromString('abcaa')), 0);
		assert.strictEqual(haystack.indexOf(VSBuffer.fromString('caaab')), 8);
		assert.strictEqual(haystack.indexOf(VSBuffer.fromString('ccc')), 15);

		assert.strictEqual(haystack.indexOf(VSBuffer.fromString('cccb')), -1);
	});

	test('wrap', () => {
		const actual = new Uint8Array([1, 2, 3]);
		const wrapped = VSBuffer.wrap(actual);
		assert.strictEqual(wrapped.byteLength, 3);
		assert.deepStrictEqual(Array.from(wrapped.buffer), [1, 2, 3]);
	});

	test('fromString', () => {
		const value = 'Hello World';
		const buff = VSBuffer.fromString(value);
		assert.strictEqual(buff.toString(), value);
	});

	test('fromByteArray', () => {
		const array = [1, 2, 3, 4, 5];
		const buff = VSBuffer.fromByteArray(array);
		assert.strictEqual(buff.byteLength, array.length);
		assert.deepStrictEqual(Array.from(buff.buffer), array);
	});

	test('concat', () => {
		const chunks = [
			VSBuffer.fromString('abc'),
			VSBuffer.fromString('def'),
			VSBuffer.fromString('ghi')
		];

		// Test without total length
		const result1 = VSBuffer.concat(chunks);
		assert.strictEqual(result1.toString(), 'abcdefghi');

		// Test with total length
		const result2 = VSBuffer.concat(chunks, 9);
		assert.strictEqual(result2.toString(), 'abcdefghi');
	});

	test('clone', () => {
		const original = VSBuffer.fromString('test');
		const clone = original.clone();

		assert.notStrictEqual(original.buffer, clone.buffer);
		assert.deepStrictEqual(Array.from(original.buffer), Array.from(clone.buffer));
	});

	test('slice', () => {
		const buff = VSBuffer.fromString('Hello World');

		const slice1 = buff.slice(0, 5);
		assert.strictEqual(slice1.toString(), 'Hello');

		const slice2 = buff.slice(6);
		assert.strictEqual(slice2.toString(), 'World');
	});

	test('set', () => {
		const buff = VSBuffer.alloc(5);

		// Test setting from VSBuffer
		buff.set(VSBuffer.fromString('ab'), 0);
		assert.strictEqual(buff.toString().substring(0, 2), 'ab');

		// Test setting from Uint8Array
		buff.set(new Uint8Array([99, 100]), 2); // 'cd'
		assert.strictEqual(buff.toString().substring(2, 4), 'cd');

		// Test invalid input
		assert.throws(() => {
			// eslint-disable-next-line local/code-no-any-casts
			buff.set({} as any);
		});
	});

	test('equals', () => {
		const buff1 = VSBuffer.fromString('test');
		const buff2 = VSBuffer.fromString('test');
		const buff3 = VSBuffer.fromString('different');
		const buff4 = VSBuffer.fromString('tes1');

		assert.strictEqual(buff1.equals(buff1), true);
		assert.strictEqual(buff1.equals(buff2), true);
		assert.strictEqual(buff1.equals(buff3), false);
		assert.strictEqual(buff1.equals(buff4), false);
	});

	test('read/write methods', () => {
		const buff = VSBuffer.alloc(8);

		// Test UInt32BE
		buff.writeUInt32BE(0x12345678, 0);
		assert.strictEqual(buff.readUInt32BE(0), 0x12345678);

		// Test UInt32LE
		buff.writeUInt32LE(0x12345678, 4);
		assert.strictEqual(buff.readUInt32LE(4), 0x12345678);

		// Test UInt8
		const buff2 = VSBuffer.alloc(1);
		buff2.writeUInt8(123, 0);
		assert.strictEqual(buff2.readUInt8(0), 123);
	});

	suite('encoding', () => {
		/*
		Generated with:

		const crypto = require('crypto');

		for (let i = 0; i < 16; i++) {
			const buf =  crypto.randomBytes(i);
			console.log(`[new Uint8Array([${Array.from(buf).join(', ')}]), '${buf.toString('base64')}'],`)
		}

		*/

		const testCases: [Uint8Array, base64: string, hex: string][] = [
			[new Uint8Array([]), '', ''],
			[new Uint8Array([77]), 'TQ==', '4d'],
			[new Uint8Array([230, 138]), '5oo=', 'e68a'],
			[new Uint8Array([104, 98, 82]), 'aGJS', '686252'],
			[new Uint8Array([92, 114, 57, 209]), 'XHI50Q==', '5c7239d1'],
			[new Uint8Array([238, 51, 1, 240, 124]), '7jMB8Hw=', 'ee3301f07c'],
			[new Uint8Array([96, 54, 130, 79, 47, 179]), 'YDaCTy+z', '6036824f2fb3'],
			[new Uint8Array([91, 22, 68, 217, 68, 117, 116]), 'WxZE2UR1dA==', '5b1644d9447574'],
			[new Uint8Array([184, 227, 214, 171, 244, 175, 141, 53]), 'uOPWq/SvjTU=', 'b8e3d6abf4af8d35'],
			[new Uint8Array([53, 98, 93, 130, 71, 117, 191, 137, 156]), 'NWJdgkd1v4mc', '35625d824775bf899c'],
			[new Uint8Array([154, 156, 60, 102, 232, 197, 92, 25, 124, 98]), 'mpw8ZujFXBl8Yg==', '9a9c3c66e8c55c197c62'],
			[new Uint8Array([152, 131, 106, 234, 17, 183, 164, 245, 252, 67, 26]), 'mINq6hG3pPX8Qxo=', '98836aea11b7a4f5fc431a'],
			[new Uint8Array([232, 254, 194, 234, 16, 42, 86, 135, 117, 61, 179, 4]), '6P7C6hAqVod1PbME', 'e8fec2ea102a5687753db304'],
			[new Uint8Array([4, 199, 85, 172, 125, 171, 172, 219, 61, 47, 78, 155, 127]), 'BMdVrH2rrNs9L06bfw==', '04c755ac7dabacdb3d2f4e9b7f'],
			[new Uint8Array([189, 67, 62, 189, 87, 171, 27, 164, 87, 142, 126, 113, 23, 182]), 'vUM+vVerG6RXjn5xF7Y=', 'bd433ebd57ab1ba4578e7e7117b6'],
			[new Uint8Array([153, 156, 145, 240, 228, 200, 199, 158, 40, 167, 97, 52, 217, 148, 43]), 'mZyR8OTIx54op2E02ZQr', '999c91f0e4c8c79e28a76134d9942b'],
		];

		test('encodes base64', () => {
			for (const [bytes, expected] of testCases) {
				assert.strictEqual(encodeBase64(VSBuffer.wrap(bytes)), expected);
			}
		});

		test('decodes, base64', () => {
			for (const [expected, encoded] of testCases) {
				assert.deepStrictEqual(new Uint8Array(decodeBase64(encoded).buffer), expected);
			}
		});

		test('encodes hex', () => {
			for (const [bytes, , expected] of testCases) {
				assert.strictEqual(encodeHex(VSBuffer.wrap(bytes)), expected);
			}
		});

		test('decodes, hex', () => {
			for (const [expected, , encoded] of testCases) {
				assert.deepStrictEqual(new Uint8Array(decodeHex(encoded).buffer), expected);
			}
		});

		test('throws error on invalid encoding', () => {
			assert.throws(() => decodeBase64('invalid!'));
			assert.throws(() => decodeHex('invalid!'));
		});
	});
});
