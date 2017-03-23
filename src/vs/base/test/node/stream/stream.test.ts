/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import assert = require('assert');
import fs = require('fs');

import stream = require('vs/base/node/stream');

suite('Stream', () => {
	test('readExactlyByFile - ANSI', function (done: (err?) => void) {
		const file = require.toUrl('./fixtures/file.css');

		stream.readExactlyByFile(file, 10).then(({buffer, bytesRead}) => {
			assert.equal(bytesRead, 10);
			assert.equal(buffer.toString(), '/*--------');
			done();
		}, done);
	});

	test('readExactlyByFile - empty', function (done: (err?: any) => void) {
		const file = require.toUrl('./fixtures/empty.txt');

		stream.readExactlyByFile(file, 10).then(({bytesRead}) => {
			assert.equal(bytesRead, 0);
			done();
		}, done);
	});

	test('readExactlyByStream - ANSI', function (done: (err?: any) => void) {
		const file = require.toUrl('./fixtures/file.css');

		stream.readExactlyByStream(fs.createReadStream(file), 10).then(({buffer, bytesRead}) => {
			assert.equal(bytesRead, 10);
			assert.equal(buffer.toString(), '/*--------');
			done();
		}, done);
	});

	test('readExactlyByStream - empty', function (done: (err?: any) => void) {
		const file = require.toUrl('./fixtures/empty.txt');

		stream.readExactlyByStream(fs.createReadStream(file), 10).then(({bytesRead}) => {
			assert.equal(bytesRead, 0);
			done();
		}, done);
	});

	test('readToMatchingString - ANSI', function (done: (err?: any) => void) {
		const file = require.toUrl('./fixtures/file.css');

		stream.readToMatchingString(file, '\n', 10, 100).then((result: string) => {
			// \r may be present on Windows
			assert.equal(result.replace('\r', ''), '/*---------------------------------------------------------------------------------------------');
			done();
		}, done);
	});

	test('readToMatchingString - empty', function (done: (err?: any) => void) {
		const file = require.toUrl('./fixtures/empty.txt');

		stream.readToMatchingString(file, '\n', 10, 100).then((result: string) => {
			assert.equal(result, null);

			done();
		}, done);
	});
});