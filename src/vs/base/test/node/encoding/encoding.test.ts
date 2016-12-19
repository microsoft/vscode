/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import assert = require('assert');

import encoding = require('vs/base/node/encoding');

suite('Encoding', () => {
	test('detectBOM UTF-8', function (done: () => void) {
		const file = require.toUrl('./fixtures/some_utf8.css');

		encoding.detectEncodingByBOM(file, (error: Error, encoding: string) => {
			assert.equal(error, null);
			assert.equal(encoding, 'utf8');

			done();
		});
	});

	test('detectBOM UTF-16 LE', function (done: () => void) {
		const file = require.toUrl('./fixtures/some_utf16le.css');

		encoding.detectEncodingByBOM(file, (error: Error, encoding: string) => {
			assert.equal(error, null);
			assert.equal(encoding, 'utf16le');

			done();
		});
	});

	test('detectBOM UTF-16 BE', function (done: () => void) {
		const file = require.toUrl('./fixtures/some_utf16be.css');

		encoding.detectEncodingByBOM(file, (error: Error, encoding: string) => {
			assert.equal(error, null);
			assert.equal(encoding, 'utf16be');

			done();
		});
	});

	test('detectBOM ANSI', function (done: () => void) {
		const file = require.toUrl('./fixtures/some_ansi.css');

		encoding.detectEncodingByBOM(file, (error: Error, encoding: string) => {
			assert.equal(error, null);
			assert.equal(encoding, null);

			done();
		});
	});

	test('detectBOM ANSI', function (done: () => void) {
		const file = require.toUrl('./fixtures/empty.txt');

		encoding.detectEncodingByBOM(file, (error: Error, encoding: string) => {
			assert.equal(error, null);
			assert.equal(encoding, null);

			done();
		});
	});
});
