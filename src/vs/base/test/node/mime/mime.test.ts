/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';

import * as mimeCommon from 'vs/base/common/mime';
import * as mime from 'vs/base/node/mime';
import { readExactlyByFile } from 'vs/base/node/stream';
import { UTF16le, UTF16be } from 'vs/base/node/encoding';

suite('Mime', () => {

	test('detectMimesFromFile (JSON saved as PNG)', function () {
		const file = require.toUrl('./fixtures/some.json.png');

		return readExactlyByFile(file, 512).then(buffer => {
			const mimes = mime.detectMimeAndEncodingFromBuffer(buffer);
			assert.deepEqual(mimes.mimes, ['text/plain']);
		});
	});

	test('detectMimesFromFile (PNG saved as TXT)', function () {
		mimeCommon.registerTextMime({ id: 'text', mime: 'text/plain', extension: '.txt' });
		const file = require.toUrl('./fixtures/some.png.txt');
		return readExactlyByFile(file, 512).then(buffer => {
			const mimes = mime.detectMimeAndEncodingFromBuffer(buffer);
			assert.deepEqual(mimes.mimes, ['application/octet-stream']);
		});
	});

	test('detectMimesFromFile (XML saved as PNG)', function () {
		const file = require.toUrl('./fixtures/some.xml.png');
		return readExactlyByFile(file, 512).then(buffer => {
			const mimes = mime.detectMimeAndEncodingFromBuffer(buffer);
			assert.deepEqual(mimes.mimes, ['text/plain']);
		});
	});

	test('detectMimesFromFile (QWOFF saved as TXT)', function () {
		const file = require.toUrl('./fixtures/some.qwoff.txt');
		return readExactlyByFile(file, 512).then(buffer => {
			const mimes = mime.detectMimeAndEncodingFromBuffer(buffer);
			assert.deepEqual(mimes.mimes, ['application/octet-stream']);
		});
	});

	test('detectMimesFromFile (CSS saved as QWOFF)', function () {
		const file = require.toUrl('./fixtures/some.css.qwoff');
		return readExactlyByFile(file, 512).then(buffer => {
			const mimes = mime.detectMimeAndEncodingFromBuffer(buffer);
			assert.deepEqual(mimes.mimes, ['text/plain']);
		});
	});

	test('detectMimesFromFile (PDF)', function () {
		const file = require.toUrl('./fixtures/some.pdf');
		return readExactlyByFile(file, 512).then(buffer => {
			const mimes = mime.detectMimeAndEncodingFromBuffer(buffer);
			assert.deepEqual(mimes.mimes, ['application/octet-stream']);
		});
	});

	test('detectMimesFromFile (guess UTF-16 LE from content without BOM)', function () {
		mimeCommon.registerTextMime({ id: 'text', mime: 'text/plain', extension: '.txt' });
		const file = require.toUrl('./fixtures/utf16_le_nobom.txt');
		return readExactlyByFile(file, 512).then(buffer => {
			const mimes = mime.detectMimeAndEncodingFromBuffer(buffer);
			assert.equal(mimes.encoding, UTF16le);
			assert.deepEqual(mimes.mimes, ['text/plain']);
		});
	});

	test('detectMimesFromFile (guess UTF-16 BE from content without BOM)', function () {
		mimeCommon.registerTextMime({ id: 'text', mime: 'text/plain', extension: '.txt' });
		const file = require.toUrl('./fixtures/utf16_be_nobom.txt');
		return readExactlyByFile(file, 512).then(buffer => {
			const mimes = mime.detectMimeAndEncodingFromBuffer(buffer);
			assert.equal(mimes.encoding, UTF16be);
			assert.deepEqual(mimes.mimes, ['text/plain']);
		});
	});

	test('autoGuessEncoding (ShiftJIS)', function () {
		const file = require.toUrl('./fixtures/some.shiftjis.txt');
		return readExactlyByFile(file, 512 * 8).then(buffer => {
			return mime.detectMimeAndEncodingFromBuffer(buffer, true).then(mimes => {
				assert.equal(mimes.encoding, 'shiftjis');
			});
		});
	});

	test('autoGuessEncoding (CP1252)', function () {
		const file = require.toUrl('./fixtures/some.cp1252.txt');
		return readExactlyByFile(file, 512 * 8).then(buffer => {
			return mime.detectMimeAndEncodingFromBuffer(buffer, true).then(mimes => {
				assert.equal(mimes.encoding, 'windows1252');
			});
		});
	});
});
