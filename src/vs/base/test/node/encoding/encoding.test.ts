/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';

import * as encoding from 'vs/base/node/encoding';

suite('Encoding', () => {
	test('detectBOM UTF-8', () => {
		const file = require.toUrl('./fixtures/some_utf8.css');

		return encoding.detectEncodingByBOM(file).then((encoding: string) => {
			assert.equal(encoding, 'utf8');
		});
	});

	test('detectBOM UTF-16 LE', () => {
		const file = require.toUrl('./fixtures/some_utf16le.css');

		return encoding.detectEncodingByBOM(file).then((encoding: string) => {
			assert.equal(encoding, 'utf16le');
		});
	});

	test('detectBOM UTF-16 BE', () => {
		const file = require.toUrl('./fixtures/some_utf16be.css');

		return encoding.detectEncodingByBOM(file).then((encoding: string) => {
			assert.equal(encoding, 'utf16be');
		});
	});

	test('detectBOM ANSI', function () {
		const file = require.toUrl('./fixtures/some_ansi.css');

		return encoding.detectEncodingByBOM(file).then((encoding: string) => {
			assert.equal(encoding, null);
		});
	});

	test('detectBOM ANSI', function () {
		const file = require.toUrl('./fixtures/empty.txt');

		return encoding.detectEncodingByBOM(file).then((encoding: string) => {
			assert.equal(encoding, null);
		});
	});

	test('resolve terminal encoding (detect)', function () {
		return encoding.resolveTerminalEncoding().then(enc => {
			assert.ok(encoding.encodingExists(enc));
		});
	});

	test('resolve terminal encoding (environment)', function () {
		process.env['VSCODE_CLI_ENCODING'] = 'utf16le';

		return encoding.resolveTerminalEncoding().then(enc => {
			assert.ok(encoding.encodingExists(enc));
			assert.equal(enc, 'utf16le');
		});
	});
});
