/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { VSBuffer, bufferToReadable, readableToBuffer, bufferToStream, streamToBuffer, newWriteableBufferStream, bufferedStreamToBuffer } from 'vs/base/common/buffer';
import { timeout } from 'vs/base/common/async';
import { peekStream } from 'vs/base/common/stream';

suite('Buffer', () => {

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

		let chunks: VSBuffer[] = [];
		stream.on('data', data => {
			chunks.push(data);
		});

		let ended = false;
		stream.on('end', () => {
			ended = true;
		});

		let errors: Error[] = [];
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

		let chunks: VSBuffer[] = [];
		stream.on('data', data => {
			chunks.push(data);
		});

		let ended = false;
		stream.on('end', () => {
			ended = true;
		});

		let errors: Error[] = [];
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

		let chunks: VSBuffer[] = [];
		stream.on('data', data => {
			chunks.push(data);
		});

		let ended = false;
		stream.on('end', () => {
			ended = true;
		});

		let errors: Error[] = [];
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

		let chunks: VSBuffer[] = [];
		stream.on('data', data => {
			chunks.push(data);
		});

		let errors: Error[] = [];
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

		let chunks: VSBuffer[] = [];
		stream.on('data', data => {
			chunks.push(data);
		});

		let errors: Error[] = [];
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

		let chunks: VSBuffer[] = [];
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

		let chunks: VSBuffer[] = [];
		stream.on('data', data => {
			chunks.push(data);
		});

		let ended = false;
		stream.on('end', () => {
			ended = true;
		});

		let errors: Error[] = [];
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

		let chunks: VSBuffer[] = [];
		stream.on('data', data => {
			chunks.push(data);
		});

		let ended = false;
		stream.on('end', () => {
			ended = true;
		});

		let errors: Error[] = [];
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

		let chunks: VSBuffer[] = [];
		stream.on('data', data => {
			chunks.push(data);
		});

		let ended = false;
		stream.on('end', () => {
			ended = true;
		});

		let errors: Error[] = [];
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

		let chunks: VSBuffer[] = [];
		stream.on('data', data => {
			chunks.push(data);
		});

		let ended = false;
		stream.on('end', () => {
			ended = true;
		});

		let errors: Error[] = [];
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
});
