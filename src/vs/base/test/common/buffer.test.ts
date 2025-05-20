/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../common/async.js';
import { bufferedStreamToBuffer, bufferToReadable, bufferToStream, decodeBase64, encodeBase64, newWriteableBufferStream, readableToBuffer, streamToBuffer, VSBuffer } from '../../common/buffer.js';
import { peekStream } from '../../common/stream.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';

suite('Buffer', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('issue #71993 - VSBuffer#toString returns numbers', () => {
		const data = new Uint8Array([1, 2, 3, 'h'.charCodeAt(0), 'i'.charCodeAt(0), 4, 5]).buffer;
		const buffer = VSBuffer.wrap(new Uint8Array(data, 3, 2));
		assert.deepStrictEqual(buffer.toString(), 'hi');
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

	suite('base64', () => {
		/*
		Generated with:

		const crypto = require('crypto');

		for (let i = 0; i < 16; i++) {
			const buf =  crypto.randomBytes(i);
			console.log(`[new Uint8Array([${Array.from(buf).join(', ')}]), '${buf.toString('base64')}'],`)
		}

		*/

		const testCases: [Uint8Array, string][] = [
			[new Uint8Array([]), ''],
			[new Uint8Array([56]), 'OA=='],
			[new Uint8Array([209, 4]), '0QQ='],
			[new Uint8Array([19, 57, 119]), 'Ezl3'],
			[new Uint8Array([199, 237, 207, 112]), 'x+3PcA=='],
			[new Uint8Array([59, 193, 173, 26, 242]), 'O8GtGvI='],
			[new Uint8Array([81, 226, 95, 231, 116, 126]), 'UeJf53R+'],
			[new Uint8Array([11, 164, 253, 85, 8, 6, 56]), 'C6T9VQgGOA=='],
			[new Uint8Array([164, 16, 88, 88, 224, 173, 144, 114]), 'pBBYWOCtkHI='],
			[new Uint8Array([0, 196, 99, 12, 21, 229, 78, 101, 13]), 'AMRjDBXlTmUN'],
			[new Uint8Array([167, 114, 225, 116, 226, 83, 51, 48, 88, 114]), 'p3LhdOJTMzBYcg=='],
			[new Uint8Array([75, 33, 118, 10, 77, 5, 168, 194, 59, 47, 59]), 'SyF2Ck0FqMI7Lzs='],
			[new Uint8Array([203, 182, 165, 51, 208, 27, 123, 223, 112, 198, 127, 147]), 'y7alM9Abe99wxn+T'],
			[new Uint8Array([154, 93, 222, 41, 117, 234, 250, 85, 95, 144, 16, 94, 18]), 'ml3eKXXq+lVfkBBeEg=='],
			[new Uint8Array([246, 186, 88, 105, 192, 57, 25, 168, 183, 164, 103, 162, 243, 56]), '9rpYacA5Gai3pGei8zg='],
			[new Uint8Array([149, 240, 155, 96, 30, 55, 162, 172, 191, 187, 33, 124, 169, 183, 254]), 'lfCbYB43oqy/uyF8qbf+'],
		];

		test('encodes', () => {
			for (const [bytes, expected] of testCases) {
				assert.strictEqual(encodeBase64(VSBuffer.wrap(bytes)), expected);
			}
		});

		test('decodes', () => {
			for (const [expected, encoded] of testCases) {
				assert.deepStrictEqual(new Uint8Array(decodeBase64(encoded).buffer), expected);
			}
		});

		test('throws error on invalid encoding', () => {
			assert.throws(() => decodeBase64('invalid!'));
		});
	});
});
