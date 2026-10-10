/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as encoding from '../../../common/encoding.js';
import * as streams from '../../../../../../base/common/stream.js';
import { newWriteableBufferStream, VSBuffer, VSBufferReadableStream, streamToBufferReadableStream } from '../../../../../../base/common/buffer.js';
import { splitLines } from '../../../../../../base/common/strings.js';
import { FileAccess } from '../../../../../../base/common/network.js';
import { importAMDNodeModule } from '../../../../../../amdX.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';

export async function detectEncodingByBOM(file: string): Promise<typeof encoding.UTF16be | typeof encoding.UTF16le | typeof encoding.UTF8_with_bom | null> {
	try {
		const { buffer, bytesRead } = await readExactlyByFile(file, 3);

		return encoding.detectEncodingByBOMFromBuffer(buffer, bytesRead);
	} catch (error) {
		return null; // ignore errors (like file not found)
	}
}

interface ReadResult {
	buffer: VSBuffer | null;
	bytesRead: number;
}

function readExactlyByFile(file: string, totalBytes: number): Promise<ReadResult> {
	return new Promise<ReadResult>((resolve, reject) => {
		fs.open(file, 'r', null, (err, fd) => {
			if (err) {
				return reject(err);
			}

			function end(err: Error | null, resultBuffer: Buffer | null, bytesRead: number): void {
				fs.close(fd, closeError => {
					if (closeError) {
						return reject(closeError);
					}

					// eslint-disable-next-line local/code-no-any-casts
					if (err && (<any>err).code === 'EISDIR') {
						return reject(err); // we want to bubble this error up (file is actually a folder)
					}

					return resolve({ buffer: resultBuffer ? VSBuffer.wrap(resultBuffer) : null, bytesRead });
				});
			}

			const buffer = Buffer.allocUnsafe(totalBytes);
			let offset = 0;

			function readChunk(): void {
				fs.read(fd, buffer, offset, totalBytes - offset, null, (err, bytesRead) => {
					if (err) {
						return end(err, null, 0);
					}

					if (bytesRead === 0) {
						return end(null, buffer, offset);
					}

					offset += bytesRead;

					if (offset === totalBytes) {
						return end(null, buffer, offset);
					}

					return readChunk();
				});
			}

			readChunk();
		});
	});
}

suite('Encoding', () => {

	test('detectBOM does not return error for non existing file', async () => {
		const file = FileAccess.asFileUri('vs/workbench/services/textfile/test/node/encoding/fixtures/not-exist.css').fsPath;

		const detectedEncoding = await detectEncodingByBOM(file);
		assert.strictEqual(detectedEncoding, null);
	});

	test('detectBOM UTF-8', async () => {
		const file = FileAccess.asFileUri('vs/workbench/services/textfile/test/node/encoding/fixtures/some_utf8.css').fsPath;

		const detectedEncoding = await detectEncodingByBOM(file);
		assert.strictEqual(detectedEncoding, 'utf8bom');
	});

	test('detectBOM UTF-16 LE', async () => {
		const file = FileAccess.asFileUri('vs/workbench/services/textfile/test/node/encoding/fixtures/some_utf16le.css').fsPath;

		const detectedEncoding = await detectEncodingByBOM(file);
		assert.strictEqual(detectedEncoding, 'utf16le');
	});

	test('detectBOM UTF-16 BE', async () => {
		const file = FileAccess.asFileUri('vs/workbench/services/textfile/test/node/encoding/fixtures/some_utf16be.css').fsPath;

		const detectedEncoding = await detectEncodingByBOM(file);
		assert.strictEqual(detectedEncoding, 'utf16be');
	});

	test('detectBOM ANSI', async function () {
		const file = FileAccess.asFileUri('vs/workbench/services/textfile/test/node/encoding/fixtures/some_ansi.css').fsPath;

		const detectedEncoding = await detectEncodingByBOM(file);
		assert.strictEqual(detectedEncoding, null);
	});

	test('detectBOM ANSI (2)', async function () {
		const file = FileAccess.asFileUri('vs/workbench/services/textfile/test/node/encoding/fixtures/empty.txt').fsPath;

		const detectedEncoding = await detectEncodingByBOM(file);
		assert.strictEqual(detectedEncoding, null);
	});

	test('detectEncodingFromBuffer (JSON saved as PNG)', async function () {
		const file = FileAccess.asFileUri('vs/workbench/services/textfile/test/node/encoding/fixtures/some.json.png').fsPath;

		const buffer = await readExactlyByFile(file, 512);
		const mimes = encoding.detectEncodingFromBuffer(buffer);
		assert.strictEqual(mimes.seemsBinary, false);
	});

	test('detectEncodingFromBuffer (PNG saved as TXT)', async function () {
		const file = FileAccess.asFileUri('vs/workbench/services/textfile/test/node/encoding/fixtures/some.png.txt').fsPath;
		const buffer = await readExactlyByFile(file, 512);
		const mimes = encoding.detectEncodingFromBuffer(buffer);
		assert.strictEqual(mimes.seemsBinary, true);
	});

	test('detectEncodingFromBuffer (XML saved as PNG)', async function () {
		const file = FileAccess.asFileUri('vs/workbench/services/textfile/test/node/encoding/fixtures/some.xml.png').fsPath;
		const buffer = await readExactlyByFile(file, 512);
		const mimes = encoding.detectEncodingFromBuffer(buffer);
		assert.strictEqual(mimes.seemsBinary, false);
	});

	test('detectEncodingFromBuffer (QWOFF saved as TXT)', async function () {
		const file = FileAccess.asFileUri('vs/workbench/services/textfile/test/node/encoding/fixtures/some.qwoff.txt').fsPath;
		const buffer = await readExactlyByFile(file, 512);
		const mimes = encoding.detectEncodingFromBuffer(buffer);
		assert.strictEqual(mimes.seemsBinary, true);
	});

	test('detectEncodingFromBuffer (CSS saved as QWOFF)', async function () {
		const file = FileAccess.asFileUri('vs/workbench/services/textfile/test/node/encoding/fixtures/some.css.qwoff').fsPath;
		const buffer = await readExactlyByFile(file, 512);
		const mimes = encoding.detectEncodingFromBuffer(buffer);
		assert.strictEqual(mimes.seemsBinary, false);
	});

	test('detectEncodingFromBuffer (PDF)', async function () {
		const file = FileAccess.asFileUri('vs/workbench/services/textfile/test/node/encoding/fixtures/some.pdf').fsPath;
		const buffer = await readExactlyByFile(file, 512);
		const mimes = encoding.detectEncodingFromBuffer(buffer);
		assert.strictEqual(mimes.seemsBinary, true);
	});

	test('detectEncodingFromBuffer (guess UTF-16 LE from content without BOM)', async function () {
		const file = FileAccess.asFileUri('vs/workbench/services/textfile/test/node/encoding/fixtures/utf16_le_nobom.txt').fsPath;
		const buffer = await readExactlyByFile(file, 512);
		const mimes = encoding.detectEncodingFromBuffer(buffer);
		assert.strictEqual(mimes.encoding, encoding.UTF16le);
		assert.strictEqual(mimes.seemsBinary, false);
	});

	test('detectEncodingFromBuffer (guess UTF-16 BE from content without BOM)', async function () {
		const file = FileAccess.asFileUri('vs/workbench/services/textfile/test/node/encoding/fixtures/utf16_be_nobom.txt').fsPath;
		const buffer = await readExactlyByFile(file, 512);
		const mimes = encoding.detectEncodingFromBuffer(buffer);
		assert.strictEqual(mimes.encoding, encoding.UTF16be);
		assert.strictEqual(mimes.seemsBinary, false);
	});

	test('autoGuessEncoding (UTF8)', async function () {
		const file = FileAccess.asFileUri('vs/workbench/services/textfile/test/node/encoding/fixtures/some_file.css').fsPath;
		const buffer = await readExactlyByFile(file, 512 * 8);
		const mimes = await encoding.detectEncodingFromBuffer(buffer, true);
		assert.strictEqual(mimes.encoding, 'utf8');
	});

	test('autoGuessEncoding (ASCII)', async function () {
		const file = FileAccess.asFileUri('vs/workbench/services/textfile/test/node/encoding/fixtures/some_ansi.css').fsPath;
		const buffer = await readExactlyByFile(file, 512 * 8);
		const mimes = await encoding.detectEncodingFromBuffer(buffer, true);
		assert.strictEqual(mimes.encoding, null);
	});

	test('autoGuessEncoding (ShiftJIS)', async function () {
		const file = FileAccess.asFileUri('vs/workbench/services/textfile/test/node/encoding/fixtures/some.shiftjis.txt').fsPath;
		const buffer = await readExactlyByFile(file, 512 * 8);
		const mimes = await encoding.detectEncodingFromBuffer(buffer, true);
		assert.strictEqual(mimes.encoding, 'shiftjis');
	});

	test('autoGuessEncoding (CP1252)', async function () {
		const file = FileAccess.asFileUri('vs/workbench/services/textfile/test/node/encoding/fixtures/some.cp1252.txt').fsPath;
		const buffer = await readExactlyByFile(file, 512 * 8);
		const mimes = await encoding.detectEncodingFromBuffer(buffer, true);
		assert.strictEqual(mimes.encoding, 'windows1252');
	});

	test('autoGuessEncoding (candidateGuessEncodings - ShiftJIS)', async function () {
		// This file is determined to be windows1252 unless candidateDetectEncoding is set.
		const file = FileAccess.asFileUri('vs/workbench/services/textfile/test/node/encoding/fixtures/some.shiftjis.1.txt').fsPath;
		const buffer = await readExactlyByFile(file, 512 * 8);
		const mimes = await encoding.detectEncodingFromBuffer(buffer, true, ['utf8', 'shiftjis', 'eucjp']);
		assert.strictEqual(mimes.encoding, 'shiftjis');
	});

	suite('autoGuessEncoding (candidate fallback)', () => {
		const cp950Bytes = Buffer.from('a440afeba4a4a4e50a', 'hex');

		for (const { name, bytes, candidates, expected } of [
			{ name: 'short CP950', bytes: cp950Bytes, candidates: ['cp950'], expected: 'cp950' },
			{ name: 'UTF-8 and CP950', bytes: cp950Bytes, candidates: ['utf8', 'cp950'], expected: 'cp950' },
			{ name: 'normalized candidates', bytes: cp950Bytes, candidates: ['utf-8', 'CP950'], expected: 'cp950' },
			{ name: 'duplicate candidates', bytes: cp950Bytes, candidates: ['cp950', 'cp950'], expected: 'cp950' },
			{ name: 'only one lossless candidate', bytes: cp950Bytes, candidates: ['shiftjis', 'cp950', 'eucjp'], expected: 'cp950' },
			{ name: 'mostly ASCII', bytes: Buffer.concat([cp950Bytes, Buffer.from('echo hello world\n'.repeat(300))]), candidates: ['cp950'], expected: 'cp950' },
			{ name: 'valid UTF-8', bytes: Buffer.from('一般中文\n'), candidates: ['cp950'], expected: null },
			{ name: 'ASCII', bytes: Buffer.from('echo hello world\n'), candidates: ['cp950'], expected: null },
			{ name: 'empty', bytes: Buffer.alloc(0), candidates: ['cp950'], expected: null },
			{ name: 'partial UTF-8 character', bytes: Buffer.from('e4b8', 'hex'), candidates: ['cp950'], expected: null },
			{ name: 'invalid CP950', bytes: Buffer.from('ffff', 'hex'), candidates: ['cp950'], expected: null },
			{ name: 'incomplete CP950', bytes: cp950Bytes.subarray(0, 7), candidates: ['cp950'], expected: null },
			{ name: 'ambiguous candidates', bytes: Buffer.from('a4a4', 'hex'), candidates: ['cp950', 'eucjp'], expected: null },
			{ name: 'no candidates', bytes: cp950Bytes, candidates: [], expected: 'windows1252' },
			{ name: 'unsupported candidates', bytes: cp950Bytes, candidates: ['unsupported'], expected: 'windows1252' },
			{ name: 'BOM takes precedence', bytes: Buffer.from('efbbbf41', 'hex'), candidates: ['cp950'], expected: 'utf8bom' },
		]) {
			test(name, async () => {
				const buffer = VSBuffer.wrap(bytes);

				assert.deepStrictEqual(await encoding.detectEncodingFromBuffer({ buffer, bytesRead: buffer.byteLength }, true, candidates), {
					encoding: expected,
					seemsBinary: false
				});
			});
		}

		test('disabled guessing', () => {
			const buffer = VSBuffer.wrap(cp950Bytes);

			assert.deepStrictEqual(encoding.detectEncodingFromBuffer({ buffer, bytesRead: buffer.byteLength }, false, ['cp950']), {
				encoding: null,
				seemsBinary: false
			});
		});
	});

	async function readAndDecodeFromDisk(path: string, fileEncoding: string | null) {
		return new Promise<string>((resolve, reject) => {
			fs.readFile(path, (err, data) => {
				if (err) {
					reject(err);
				} else {
					resolve(importAMDNodeModule<typeof import('@vscode/iconv-lite-umd')>('@vscode/iconv-lite-umd', 'lib/iconv-lite-umd.js').then(iconv => iconv.decode(data, encoding.toNodeEncoding(fileEncoding))));
				}
			});
		});
	}

	function newTestReadableStream(buffers: Buffer[]): VSBufferReadableStream {
		const stream = newWriteableBufferStream();
		buffers
			.map(VSBuffer.wrap)
			.forEach(buffer => {
				setTimeout(() => {
					stream.write(buffer);
				});
			});
		setTimeout(() => {
			stream.end();
		});
		return stream;
	}

	async function readAllAsString(stream: streams.ReadableStream<string>) {
		return streams.consumeStream(stream, strings => strings.join(''));
	}

	test('toDecodeStream - some stream', async function () {
		const source = newTestReadableStream([
			Buffer.from([65, 66, 67]),
			Buffer.from([65, 66, 67]),
			Buffer.from([65, 66, 67]),
		]);

		const { detected, stream } = await encoding.toDecodeStream(source, { acceptTextOnly: true, minBytesRequiredForDetection: 4, guessEncoding: false, candidateGuessEncodings: [], overwriteEncoding: async detected => detected || encoding.UTF8 });

		assert.ok(detected);
		assert.ok(stream);

		const content = await readAllAsString(stream);
		assert.strictEqual(content, 'ABCABCABC');
	});

	test('toDecodeStream - some stream, expect too much data', async function () {
		const source = newTestReadableStream([
			Buffer.from([65, 66, 67]),
			Buffer.from([65, 66, 67]),
			Buffer.from([65, 66, 67]),
		]);

		const { detected, stream } = await encoding.toDecodeStream(source, { acceptTextOnly: true, minBytesRequiredForDetection: 64, guessEncoding: false, candidateGuessEncodings: [], overwriteEncoding: async detected => detected || encoding.UTF8 });

		assert.ok(detected);
		assert.ok(stream);

		const content = await readAllAsString(stream);
		assert.strictEqual(content, 'ABCABCABC');
	});

	test('toDecodeStream - some stream, no data', async function () {
		const source = newWriteableBufferStream();
		source.end();

		const { detected, stream } = await encoding.toDecodeStream(source, { acceptTextOnly: true, minBytesRequiredForDetection: 512, guessEncoding: false, candidateGuessEncodings: [], overwriteEncoding: async detected => detected || encoding.UTF8 });

		assert.ok(detected);
		assert.ok(stream);

		const content = await readAllAsString(stream);
		assert.strictEqual(content, '');
	});

	test('toDecodeStream - encoding, utf16be', async function () {
		const path = FileAccess.asFileUri('vs/workbench/services/textfile/test/node/encoding/fixtures/some_utf16be.css').fsPath;
		const source = streamToBufferReadableStream(fs.createReadStream(path));

		const { detected, stream } = await encoding.toDecodeStream(source, { acceptTextOnly: true, minBytesRequiredForDetection: 64, guessEncoding: false, candidateGuessEncodings: [], overwriteEncoding: async detected => detected || encoding.UTF8 });

		assert.strictEqual(detected.encoding, 'utf16be');
		assert.strictEqual(detected.seemsBinary, false);

		const expected = await readAndDecodeFromDisk(path, detected.encoding);
		const actual = await readAllAsString(stream);
		assert.strictEqual(actual, expected);
	});

	test('toDecodeStream - empty file', async function () {
		const path = FileAccess.asFileUri('vs/workbench/services/textfile/test/node/encoding/fixtures/empty.txt').fsPath;
		const source = streamToBufferReadableStream(fs.createReadStream(path));
		const { detected, stream } = await encoding.toDecodeStream(source, { acceptTextOnly: true, guessEncoding: false, candidateGuessEncodings: [], overwriteEncoding: async detected => detected || encoding.UTF8 });

		const expected = await readAndDecodeFromDisk(path, detected.encoding);
		const actual = await readAllAsString(stream);
		assert.strictEqual(actual, expected);
	});

	for (const { name, padding } of [
		{ name: 'short CP950', padding: '' },
		{ name: 'mostly ASCII', padding: 'echo hello world\n'.repeat(300) }
	]) {
		test(`toDecodeStream - candidate fallback (${name})`, async () => {
			const source = newTestReadableStream([Buffer.concat([
				Buffer.from('a440afeba4a4a4e50a', 'hex'),
				Buffer.from(padding)
			])]);
			const { detected, stream } = await encoding.toDecodeStream(source, { acceptTextOnly: true, guessEncoding: true, candidateGuessEncodings: ['utf8', 'cp950'], overwriteEncoding: async detected => detected || encoding.UTF8 });

			assert.deepStrictEqual({ detected, content: await readAllAsString(stream) }, {
				detected: { encoding: 'cp950', seemsBinary: false },
				content: `一般中文\n${padding}`
			});
		});
	}

	test('toDecodeStream - candidate fallback preserves a split UTF-8 character', async () => {
		const source = newTestReadableStream([
			Buffer.from('e4b8', 'hex'),
			Buffer.from('ad', 'hex')
		]);
		const { detected, stream } = await encoding.toDecodeStream(source, { acceptTextOnly: true, minBytesRequiredForDetection: 2, guessEncoding: true, candidateGuessEncodings: ['cp950'], overwriteEncoding: async detected => detected || encoding.UTF8 });

		assert.deepStrictEqual({ detected, content: await readAllAsString(stream) }, {
			detected: { encoding: 'utf8', seemsBinary: false },
			content: '中'
		});
	});

	test('toDecodeStream - decodes buffer entirely', async function () {
		const emojis = Buffer.from('🖥️💻💾');
		const incompleteEmojis = emojis.slice(0, emojis.length - 1);

		const buffers: Buffer[] = [];
		for (let i = 0; i < incompleteEmojis.length; i++) {
			buffers.push(incompleteEmojis.slice(i, i + 1));
		}

		const source = newTestReadableStream(buffers);
		const { stream } = await encoding.toDecodeStream(source, { acceptTextOnly: true, minBytesRequiredForDetection: 4, guessEncoding: false, candidateGuessEncodings: [], overwriteEncoding: async detected => detected || encoding.UTF8 });

		const expected = new TextDecoder().decode(incompleteEmojis);
		const actual = await readAllAsString(stream);

		assert.strictEqual(actual, expected);
	});

	test('toDecodeStream - some stream (GBK issue #101856)', async function () {
		const path = FileAccess.asFileUri('vs/workbench/services/textfile/test/node/encoding/fixtures/some_gbk.txt').fsPath;
		const source = streamToBufferReadableStream(fs.createReadStream(path));

		const { detected, stream } = await encoding.toDecodeStream(source, { acceptTextOnly: true, minBytesRequiredForDetection: 4, guessEncoding: false, candidateGuessEncodings: [], overwriteEncoding: async () => 'gbk' });
		assert.ok(detected);
		assert.ok(stream);

		const content = await readAllAsString(stream);
		assert.strictEqual(content.length, 65537);
	});

	test('toDecodeStream - some stream (UTF-8 issue #102202)', async function () {
		const path = FileAccess.asFileUri('vs/workbench/services/textfile/test/node/encoding/fixtures/issue_102202.txt').fsPath;
		const source = streamToBufferReadableStream(fs.createReadStream(path));

		const { detected, stream } = await encoding.toDecodeStream(source, { acceptTextOnly: true, minBytesRequiredForDetection: 4, guessEncoding: false, candidateGuessEncodings: [], overwriteEncoding: async () => 'utf-8' });
		assert.ok(detected);
		assert.ok(stream);

		const content = await readAllAsString(stream);
		const lines = splitLines(content);

		assert.strictEqual(lines[981].toString(), '啊啊啊啊啊啊aaa啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊，啊啊啊啊啊啊啊啊啊啊啊。');
	});

	test('toDecodeStream - binary', async function () {
		const source = () => {
			return newTestReadableStream([
				Buffer.from([0, 0, 0]),
				Buffer.from('Hello World'),
				Buffer.from([0])
			]);
		};

		// acceptTextOnly: true

		let error: Error | undefined = undefined;
		try {
			await encoding.toDecodeStream(source(), { acceptTextOnly: true, guessEncoding: false, candidateGuessEncodings: [], overwriteEncoding: async detected => detected || encoding.UTF8 });
		} catch (e) {
			error = e;
		}

		assert.ok(error instanceof encoding.DecodeStreamError);
		assert.strictEqual(error.decodeStreamErrorKind, encoding.DecodeStreamErrorKind.STREAM_IS_BINARY);

		// acceptTextOnly: false

		const { detected, stream } = await encoding.toDecodeStream(source(), { acceptTextOnly: false, guessEncoding: false, candidateGuessEncodings: [], overwriteEncoding: async detected => detected || encoding.UTF8 });

		assert.ok(detected);
		assert.strictEqual(detected.seemsBinary, true);
		assert.ok(stream);
	});

	test('toEncodeReadable - encoding, utf16be', async function () {
		const path = FileAccess.asFileUri('vs/workbench/services/textfile/test/node/encoding/fixtures/some_utf16be.css').fsPath;
		const source = await readAndDecodeFromDisk(path, encoding.UTF16be);

		const iconv = await importAMDNodeModule<typeof import('@vscode/iconv-lite-umd')>('@vscode/iconv-lite-umd', 'lib/iconv-lite-umd.js');

		const expected = VSBuffer.wrap(
			iconv.encode(source, encoding.toNodeEncoding(encoding.UTF16be))
		).toString();

		const actual = streams.consumeReadable(
			await encoding.toEncodeReadable(streams.toReadable(source), encoding.UTF16be),
			VSBuffer.concat
		).toString();

		assert.strictEqual(actual, expected);
	});

	test('toEncodeReadable - empty readable to utf8', async function () {
		const source: streams.Readable<string> = {
			read() {
				return null;
			}
		};

		const actual = streams.consumeReadable(
			await encoding.toEncodeReadable(source, encoding.UTF8),
			VSBuffer.concat
		).toString();

		assert.strictEqual(actual, '');
	});

	[{
		utfEncoding: encoding.UTF8,
		relatedBom: encoding.UTF8_BOM
	}, {
		utfEncoding: encoding.UTF8_with_bom,
		relatedBom: encoding.UTF8_BOM
	}, {
		utfEncoding: encoding.UTF16be,
		relatedBom: encoding.UTF16be_BOM,
	}, {
		utfEncoding: encoding.UTF16le,
		relatedBom: encoding.UTF16le_BOM
	}].forEach(({ utfEncoding, relatedBom }) => {
		test(`toEncodeReadable - empty readable to ${utfEncoding} with BOM`, async function () {
			const source: streams.Readable<string> = {
				read() {
					return null;
				}
			};

			const encodedReadable = encoding.toEncodeReadable(source, utfEncoding, { addBOM: true });

			const expected = VSBuffer.wrap(Buffer.from(relatedBom)).toString();
			const actual = streams.consumeReadable(await encodedReadable, VSBuffer.concat).toString();

			assert.strictEqual(actual, expected);
		});
	});

	test('encodingExists', async function () {
		for (const enc in encoding.SUPPORTED_ENCODINGS) {
			if (enc === encoding.UTF8_with_bom) {
				continue; // skip over encodings from us
			}
			const iconv = await importAMDNodeModule<typeof import('@vscode/iconv-lite-umd')>('@vscode/iconv-lite-umd', 'lib/iconv-lite-umd.js');
			assert.strictEqual(iconv.encodingExists(enc), true, enc);
		}
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
