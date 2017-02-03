/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import assert = require('assert');
import fs = require('fs');

import stream = require('vs/base/node/stream');

suite('Stream', () => {
	test('readExactlyByFile - ANSI', function (done: () => void) {
		const file = require.toUrl('./fixtures/file.css');

		stream.readExactlyByFile(file, 10, (error: Error, buffer: NodeBuffer, count: number) => {
			assert.equal(error, null);
			assert.equal(count, 10);
			assert.equal(buffer.toString(), '/*--------');

			done();
		});
	});

	test('readExactlyByFile - empty', function (done: () => void) {
		const file = require.toUrl('./fixtures/empty.txt');

		stream.readExactlyByFile(file, 10, (error: Error, buffer: NodeBuffer, count: number) => {
			assert.equal(error, null);
			assert.equal(count, 0);

			done();
		});
	});

	test('readExactlyByStream - ANSI', function (done: () => void) {
		const file = require.toUrl('./fixtures/file.css');

		stream.readExactlyByStream(fs.createReadStream(file), 10, (error: Error, buffer: NodeBuffer, count: number) => {
			assert.equal(error, null);
			assert.equal(count, 10);
			assert.equal(buffer.toString(), '/*--------');

			done();
		});
	});

	test('readExactlyByStream - empty', function (done: () => void) {
		const file = require.toUrl('./fixtures/empty.txt');

		stream.readExactlyByStream(fs.createReadStream(file), 10, (error: Error, buffer: NodeBuffer, count: number) => {
			assert.equal(error, null);
			assert.equal(count, 0);

			done();
		});
	});

	test('readToMatchingString - ANSI', function (done: () => void) {
		const file = require.toUrl('./fixtures/file.css');

		stream.readToMatchingString(file, '\n', 10, 100, (error: Error, result: string) => {
			assert.equal(error, null);
			// \r may be present on Windows
			assert.equal(result.replace('\r', ''), '/*---------------------------------------------------------------------------------------------');

			done();
		});
	});

	test('readToMatchingString - empty', function (done: () => void) {
		const file = require.toUrl('./fixtures/empty.txt');

		stream.readToMatchingString(file, '\n', 10, 100, (error: Error, result: string) => {
			assert.equal(error, null);
			assert.equal(result, null);

			done();
		});
	});
});