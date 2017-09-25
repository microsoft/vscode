/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import assert = require('assert');

import encoding = require('vs/base/node/encoding');

suite('Encoding', () => {
	test('detectBOM UTF-8', (done: (err?: any) => void) => {
		const file = require.toUrl('./fixtures/some_utf8.css');

		encoding.detectEncodingByBOM(file).then((encoding: string) => {
			assert.equal(encoding, 'utf8');
			done();
		}, done);
	});

	test('detectBOM UTF-16 LE', (done: (err?: any) => void) => {
		const file = require.toUrl('./fixtures/some_utf16le.css');

		encoding.detectEncodingByBOM(file).then((encoding: string) => {
			assert.equal(encoding, 'utf16le');
			done();
		}, done);
	});

	test('detectBOM UTF-16 BE', (done: (err?: any) => void) => {
		const file = require.toUrl('./fixtures/some_utf16be.css');

		encoding.detectEncodingByBOM(file).then((encoding: string) => {
			assert.equal(encoding, 'utf16be');
			done();
		}, done);
	});

	test('detectBOM ANSI', function (done: (err?: any) => void) {
		const file = require.toUrl('./fixtures/some_ansi.css');

		encoding.detectEncodingByBOM(file).then((encoding: string) => {
			assert.equal(encoding, null);
			done();
		}, done);
	});

	test('detectBOM ANSI', function (done: (err?: any) => void) {
		const file = require.toUrl('./fixtures/empty.txt');

		encoding.detectEncodingByBOM(file).then((encoding: string) => {
			assert.equal(encoding, null);
			done();
		}, done);
	});
});
