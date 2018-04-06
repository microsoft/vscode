/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';

import * as encoding from 'vs/base/node/encoding';
import { readExactlyByFile } from 'vs/base/node/stream';

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

	test('detectEncodingFromBuffer (JSON saved as PNG)', function () {
		const file = require.toUrl('./fixtures/some.json.png');

		return readExactlyByFile(file, 512).then(buffer => {
			const mimes = encoding.detectEncodingFromBuffer(buffer);
			assert.equal(mimes.seemsBinary, false);
		});
	});

	test('detectEncodingFromBuffer (PNG saved as TXT)', function () {
		const file = require.toUrl('./fixtures/some.png.txt');
		return readExactlyByFile(file, 512).then(buffer => {
			const mimes = encoding.detectEncodingFromBuffer(buffer);
			assert.equal(mimes.seemsBinary, true);
		});
	});

	test('detectEncodingFromBuffer (XML saved as PNG)', function () {
		const file = require.toUrl('./fixtures/some.xml.png');
		return readExactlyByFile(file, 512).then(buffer => {
			const mimes = encoding.detectEncodingFromBuffer(buffer);
			assert.equal(mimes.seemsBinary, false);
		});
	});

	test('detectEncodingFromBuffer (QWOFF saved as TXT)', function () {
		const file = require.toUrl('./fixtures/some.qwoff.txt');
		return readExactlyByFile(file, 512).then(buffer => {
			const mimes = encoding.detectEncodingFromBuffer(buffer);
			assert.equal(mimes.seemsBinary, true);
		});
	});

	test('detectEncodingFromBuffer (CSS saved as QWOFF)', function () {
		const file = require.toUrl('./fixtures/some.css.qwoff');
		return readExactlyByFile(file, 512).then(buffer => {
			const mimes = encoding.detectEncodingFromBuffer(buffer);
			assert.equal(mimes.seemsBinary, false);
		});
	});

	test('detectEncodingFromBuffer (PDF)', function () {
		const file = require.toUrl('./fixtures/some.pdf');
		return readExactlyByFile(file, 512).then(buffer => {
			const mimes = encoding.detectEncodingFromBuffer(buffer);
			assert.equal(mimes.seemsBinary, true);
		});
	});

	test('detectEncodingFromBuffer (guess UTF-16 LE from content without BOM)', function () {
		const file = require.toUrl('./fixtures/utf16_le_nobom.txt');
		return readExactlyByFile(file, 512).then(buffer => {
			const mimes = encoding.detectEncodingFromBuffer(buffer);
			assert.equal(mimes.encoding, encoding.UTF16le);
			assert.equal(mimes.seemsBinary, false);
		});
	});

	test('detectEncodingFromBuffer (guess UTF-16 BE from content without BOM)', function () {
		const file = require.toUrl('./fixtures/utf16_be_nobom.txt');
		return readExactlyByFile(file, 512).then(buffer => {
			const mimes = encoding.detectEncodingFromBuffer(buffer);
			assert.equal(mimes.encoding, encoding.UTF16be);
			assert.equal(mimes.seemsBinary, false);
		});
	});

	test('autoGuessEncoding (ShiftJIS)', function () {
		const file = require.toUrl('./fixtures/some.shiftjis.txt');
		return readExactlyByFile(file, 512 * 8).then(buffer => {
			return encoding.detectEncodingFromBuffer(buffer, true).then(mimes => {
				assert.equal(mimes.encoding, 'shiftjis');
			});
		});
	});

	test('autoGuessEncoding (CP1252)', function () {
		const file = require.toUrl('./fixtures/some.cp1252.txt');
		return readExactlyByFile(file, 512 * 8).then(buffer => {
			return encoding.detectEncodingFromBuffer(buffer, true).then(mimes => {
				assert.equal(mimes.encoding, 'windows1252');
			});
		});
	});
});
