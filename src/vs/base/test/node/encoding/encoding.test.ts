/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as encoding from 'vs/base/node/encoding';
import { readExactlyByFile } from 'vs/base/node/stream';
import { Readable } from 'stream';
import { getPathFromAmdModule } from 'vs/base/common/amd';

suite('Encoding', () => {
	test('detectBOM UTF-8', async () => {
		const file = getPathFromAmdModule(require, './fixtures/some_utf8.css');

		const detectedEncoding = await encoding.detectEncodingByBOM(file);
		assert.equal(detectedEncoding, 'utf8');
	});

	test('detectBOM UTF-16 LE', async () => {
		const file = getPathFromAmdModule(require, './fixtures/some_utf16le.css');

		const detectedEncoding = await encoding.detectEncodingByBOM(file);
		assert.equal(detectedEncoding, 'utf16le');
	});

	test('detectBOM UTF-16 BE', async () => {
		const file = getPathFromAmdModule(require, './fixtures/some_utf16be.css');

		const detectedEncoding = await encoding.detectEncodingByBOM(file);
		assert.equal(detectedEncoding, 'utf16be');
	});

	test('detectBOM ANSI', async function () {
		const file = getPathFromAmdModule(require, './fixtures/some_ansi.css');

		const detectedEncoding = await encoding.detectEncodingByBOM(file);
		assert.equal(detectedEncoding, null);
	});

	test('detectBOM ANSI', async function () {
		const file = getPathFromAmdModule(require, './fixtures/empty.txt');

		const detectedEncoding = await encoding.detectEncodingByBOM(file);
		assert.equal(detectedEncoding, null);
	});

	test('resolve terminal encoding (detect)', async function () {
		const enc = await encoding.resolveTerminalEncoding();
		assert.ok(encoding.encodingExists(enc));
	});

	test('resolve terminal encoding (environment)', async function () {
		process.env['VSCODE_CLI_ENCODING'] = 'utf16le';

		const enc = await encoding.resolveTerminalEncoding();
		assert.ok(encoding.encodingExists(enc));
		assert.equal(enc, 'utf16le');
	});

	test('detectEncodingFromBuffer (JSON saved as PNG)', async function () {
		const file = getPathFromAmdModule(require, './fixtures/some.json.png');

		const buffer = await readExactlyByFile(file, 512);
		const mimes = encoding.detectEncodingFromBuffer(buffer);
		assert.equal(mimes.seemsBinary, false);
	});

	test('detectEncodingFromBuffer (PNG saved as TXT)', async function () {
		const file = getPathFromAmdModule(require, './fixtures/some.png.txt');
		const buffer = await readExactlyByFile(file, 512);
		const mimes = encoding.detectEncodingFromBuffer(buffer);
		assert.equal(mimes.seemsBinary, true);
	});

	test('detectEncodingFromBuffer (XML saved as PNG)', async function () {
		const file = getPathFromAmdModule(require, './fixtures/some.xml.png');
		const buffer = await readExactlyByFile(file, 512);
		const mimes = encoding.detectEncodingFromBuffer(buffer);
		assert.equal(mimes.seemsBinary, false);
	});

	test('detectEncodingFromBuffer (QWOFF saved as TXT)', async function () {
		const file = getPathFromAmdModule(require, './fixtures/some.qwoff.txt');
		const buffer = await readExactlyByFile(file, 512);
		const mimes = encoding.detectEncodingFromBuffer(buffer);
		assert.equal(mimes.seemsBinary, true);
	});

	test('detectEncodingFromBuffer (CSS saved as QWOFF)', async function () {
		const file = getPathFromAmdModule(require, './fixtures/some.css.qwoff');
		const buffer = await readExactlyByFile(file, 512);
		const mimes = encoding.detectEncodingFromBuffer(buffer);
		assert.equal(mimes.seemsBinary, false);
	});

	test('detectEncodingFromBuffer (PDF)', async function () {
		const file = getPathFromAmdModule(require, './fixtures/some.pdf');
		const buffer = await readExactlyByFile(file, 512);
		const mimes = encoding.detectEncodingFromBuffer(buffer);
		assert.equal(mimes.seemsBinary, true);
	});

	test('detectEncodingFromBuffer (guess UTF-16 LE from content without BOM)', async function () {
		const file = getPathFromAmdModule(require, './fixtures/utf16_le_nobom.txt');
		const buffer = await readExactlyByFile(file, 512);
		const mimes = encoding.detectEncodingFromBuffer(buffer);
		assert.equal(mimes.encoding, encoding.UTF16le);
		assert.equal(mimes.seemsBinary, false);
	});

	test('detectEncodingFromBuffer (guess UTF-16 BE from content without BOM)', async function () {
		const file = getPathFromAmdModule(require, './fixtures/utf16_be_nobom.txt');
		const buffer = await readExactlyByFile(file, 512);
		const mimes = encoding.detectEncodingFromBuffer(buffer);
		assert.equal(mimes.encoding, encoding.UTF16be);
		assert.equal(mimes.seemsBinary, false);
	});

	test('autoGuessEncoding (ShiftJIS)', async function () {
		const file = getPathFromAmdModule(require, './fixtures/some.shiftjis.txt');
		const buffer = await readExactlyByFile(file, 512 * 8);
		const mimes = await encoding.detectEncodingFromBuffer(buffer, true);
		assert.equal(mimes.encoding, 'shiftjis');
	});

	test('autoGuessEncoding (CP1252)', async function () {
		const file = getPathFromAmdModule(require, './fixtures/some.cp1252.txt');
		const buffer = await readExactlyByFile(file, 512 * 8);
		const mimes = await encoding.detectEncodingFromBuffer(buffer, true);
		assert.equal(mimes.encoding, 'windows1252');
	});

	async function readAndDecodeFromDisk(path, _encoding) {
		return new Promise<string>((resolve, reject) => {
			fs.readFile(path, (err, data) => {
				if (err) {
					reject(err);
				} else {
					resolve(encoding.decode(data, _encoding));
				}
			});
		});
	}

	async function readAllAsString(stream: NodeJS.ReadableStream) {
		return new Promise<string>((resolve, reject) => {
			let all = '';
			stream.on('data', chunk => {
				all += chunk;
				assert.equal(typeof chunk, 'string');
			});
			stream.on('end', () => {
				resolve(all);
			});
			stream.on('error', reject);
		});
	}

	test('toDecodeStream - some stream', async function () {

		let source = new Readable({
			read(size) {
				this.push(Buffer.from([65, 66, 67]));
				this.push(Buffer.from([65, 66, 67]));
				this.push(Buffer.from([65, 66, 67]));
				this.push(null);
			}
		});

		let { detected, stream } = await encoding.toDecodeStream(source, { minBytesRequiredForDetection: 4 });

		assert.ok(detected);
		assert.ok(stream);

		const content = await readAllAsString(stream);
		assert.equal(content, 'ABCABCABC');
	});

	test('toDecodeStream - some stream, expect too much data', async function () {

		let source = new Readable({
			read(size) {
				this.push(Buffer.from([65, 66, 67]));
				this.push(Buffer.from([65, 66, 67]));
				this.push(Buffer.from([65, 66, 67]));
				this.push(null);
			}
		});

		let { detected, stream } = await encoding.toDecodeStream(source, { minBytesRequiredForDetection: 64 });

		assert.ok(detected);
		assert.ok(stream);

		const content = await readAllAsString(stream);
		assert.equal(content, 'ABCABCABC');
	});

	test('toDecodeStream - some stream, no data', async function () {

		let source = new Readable({
			read(size) {
				this.push(null); // empty
			}
		});

		let { detected, stream } = await encoding.toDecodeStream(source, { minBytesRequiredForDetection: 512 });

		assert.ok(detected);
		assert.ok(stream);

		const content = await readAllAsString(stream);
		assert.equal(content, '');
	});


	test('toDecodeStream - encoding, utf16be', async function () {

		let path = getPathFromAmdModule(require, './fixtures/some_utf16be.css');
		let source = fs.createReadStream(path);

		let { detected, stream } = await encoding.toDecodeStream(source, { minBytesRequiredForDetection: 64 });

		assert.equal(detected.encoding, 'utf16be');
		assert.equal(detected.seemsBinary, false);

		let expected = await readAndDecodeFromDisk(path, detected.encoding);
		let actual = await readAllAsString(stream);
		assert.equal(actual, expected);
	});


	test('toDecodeStream - empty file', async function () {

		let path = getPathFromAmdModule(require, './fixtures/empty.txt');
		let source = fs.createReadStream(path);
		let { detected, stream } = await encoding.toDecodeStream(source, {});

		let expected = await readAndDecodeFromDisk(path, detected.encoding);
		let actual = await readAllAsString(stream);
		assert.equal(actual, expected);
	});
});
