/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { Writable } from 'stream';
import * as assert from 'assert';
import { StreamSplitter } from 'vs/base/node/nodeStreams';

suite('StreamSplitter', () => {
	test('should split a stream on a single character splitter', (done) => {
		const chunks: string[] = [];
		const splitter = new StreamSplitter('\n');
		const writable = new Writable({
			write(chunk, _encoding, callback) {
				chunks.push(chunk.toString());
				callback();
			},
		});

		splitter.pipe(writable);
		splitter.write('hello\nwor');
		splitter.write('ld\n');
		splitter.write('foo\nbar\nz');
		splitter.end(() => {
			assert.deepStrictEqual(chunks, ['hello\n', 'world\n', 'foo\n', 'bar\n', 'z']);
			done();
		});
	});

	test('should split a stream on a multi-character splitter', (done) => {
		const chunks: string[] = [];
		const splitter = new StreamSplitter('---');
		const writable = new Writable({
			write(chunk, _encoding, callback) {
				chunks.push(chunk.toString());
				callback();
			},
		});

		splitter.pipe(writable);
		splitter.write('hello---wor');
		splitter.write('ld---');
		splitter.write('foo---bar---z');
		splitter.end(() => {
			assert.deepStrictEqual(chunks, ['hello---', 'world---', 'foo---', 'bar---', 'z']);
			done();
		});
	});
});
