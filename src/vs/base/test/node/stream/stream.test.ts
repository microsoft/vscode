/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';

import * as stream from 'vs/base/node/stream';

suite('Stream', () => {
	test('readExactlyByFile - ANSI', function () {
		const file = require.toUrl('./fixtures/file.css');

		return stream.readExactlyByFile(file, 10).then(({ buffer, bytesRead }) => {
			assert.equal(bytesRead, 10);
			assert.equal(buffer.toString(), '/*--------');
		});
	});

	test('readExactlyByFile - empty', function () {
		const file = require.toUrl('./fixtures/empty.txt');

		return stream.readExactlyByFile(file, 10).then(({ bytesRead }) => {
			assert.equal(bytesRead, 0);
		});
	});

	test('readToMatchingString - ANSI', function () {
		const file = require.toUrl('./fixtures/file.css');

		return stream.readToMatchingString(file, '\n', 10, 100).then((result: string) => {
			// \r may be present on Windows
			assert.equal(result.replace('\r', ''), '/*---------------------------------------------------------------------------------------------');
		});
	});

	test('readToMatchingString - empty', function () {
		const file = require.toUrl('./fixtures/empty.txt');

		return stream.readToMatchingString(file, '\n', 10, 100).then((result: string) => {
			assert.equal(result, null);
		});
	});
});