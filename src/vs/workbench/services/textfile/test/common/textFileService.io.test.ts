/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ITextFileService, snapshotToString, TextFileOperationError, TextFileOperationResult, stringToSnapshot } from '../../common/textfiles.js';
import { URI } from '../../../../../base/common/uri.js';
import { join, basename } from '../../../../../base/common/path.js';
import { UTF16le, UTF8_with_bom, UTF16be, UTF8, UTF16le_BOM, UTF16be_BOM, UTF8_BOM } from '../../common/encoding.js';
import { bufferToStream, VSBuffer } from '../../../../../base/common/buffer.js';
import { createTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { ITextSnapshot, DefaultEndOfLine } from '../../../../../editor/common/model.js';
import { isWindows } from '../../../../../base/common/platform.js';
import { createTextBufferFactoryFromStream } from '../../../../../editor/common/model/textModel.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';

export interface Params {
	setup(): Promise<{
		service: ITextFileService;
		testDir: string;
	}>;
	teardown(): Promise<void>;

	exists(fsPath: string): Promise<boolean>;
	stat(fsPath: string): Promise<{ size: number }>;
	readFile(fsPath: string): Promise<VSBuffer | Buffer>;
	readFile(fsPath: string, encoding: string): Promise<string>;
	readFile(fsPath: string, encoding?: string): Promise<VSBuffer | Buffer | string>;
	detectEncodingByBOM(fsPath: string): Promise<typeof UTF16be | typeof UTF16le | typeof UTF8_with_bom | null>;
}

/**
 * Allows us to reuse test suite across different environments.
 *
 * It introduces a bit of complexity with setup and teardown, however
 * it helps us to ensure that tests are added for all environments at once,
 * hence helps us catch bugs better.
 */
export default function createSuite(params: Params) {
	let service: ITextFileService;
	let testDir = '';
	const { exists, stat, readFile, detectEncodingByBOM } = params;
	const disposables = new DisposableStore();

	setup(async () => {
		const result = await params.setup();
		service = result.service;
		testDir = result.testDir;
	});

	teardown(async () => {
		await params.teardown();
		disposables.clear();
	});

	test('create - no encoding - content empty', async () => {
		const resource = URI.file(join(testDir, 'small_new.txt'));

		await service.create([{ resource }]);

		const res = await readFile(resource.fsPath);
		assert.strictEqual(res.byteLength, 0 /* no BOM */);
	});

	test('create - no encoding - content provided (string)', async () => {
		const resource = URI.file(join(testDir, 'small_new.txt'));

		await service.create([{ resource, value: 'Hello World' }]);

		const res = await readFile(resource.fsPath);
		assert.strictEqual(res.toString(), 'Hello World');
		assert.strictEqual(res.byteLength, 'Hello World'.length);
	});

	test('create - no encoding - content provided (snapshot)', async () => {
		const resource = URI.file(join(testDir, 'small_new.txt'));

		await service.create([{ resource, value: stringToSnapshot('Hello World') }]);

		const res = await readFile(resource.fsPath);
		assert.strictEqual(res.toString(), 'Hello World');
		assert.strictEqual(res.byteLength, 'Hello World'.length);
	});

	test('create - UTF 16 LE - no content', async () => {
		const resource = URI.file(join(testDir, 'small_new.utf16le'));

		await service.create([{ resource }]);

		assert.strictEqual(await exists(resource.fsPath), true);

		const detectedEncoding = await detectEncodingByBOM(resource.fsPath);
		assert.strictEqual(detectedEncoding, UTF16le);

		const res = await readFile(resource.fsPath);
		assert.strictEqual(res.byteLength, UTF16le_BOM.length);
	});

	test('create - UTF 16 LE - content provided', async () => {
		const resource = URI.file(join(testDir, 'small_new.utf16le'));

		await service.create([{ resource, value: 'Hello World' }]);

		assert.strictEqual(await exists(resource.fsPath), true);

		const detectedEncoding = await detectEncodingByBOM(resource.fsPath);
		assert.strictEqual(detectedEncoding, UTF16le);

		const res = await readFile(resource.fsPath);
		assert.strictEqual(res.byteLength, 'Hello World'.length * 2 /* UTF16 2bytes per char */ + UTF16le_BOM.length);
	});

	test('create - UTF 16 BE - no content', async () => {
		const resource = URI.file(join(testDir, 'small_new.utf16be'));

		await service.create([{ resource }]);

		assert.strictEqual(await exists(resource.fsPath), true);

		const detectedEncoding = await detectEncodingByBOM(resource.fsPath);
		assert.strictEqual(detectedEncoding, UTF16be);

		const res = await readFile(resource.fsPath);
		assert.strictEqual(res.byteLength, UTF16le_BOM.length);
	});

	test('create - UTF 16 BE - content provided', async () => {
		const resource = URI.file(join(testDir, 'small_new.utf16be'));

		await service.create([{ resource, value: 'Hello World' }]);

		assert.strictEqual(await exists(resource.fsPath), true);

		const detectedEncoding = await detectEncodingByBOM(resource.fsPath);
		assert.strictEqual(detectedEncoding, UTF16be);

		const res = await readFile(resource.fsPath);
		assert.strictEqual(res.byteLength, 'Hello World'.length * 2 /* UTF16 2bytes per char */ + UTF16be_BOM.length);
	});

	test('create - UTF 8 BOM - no content', async () => {
		const resource = URI.file(join(testDir, 'small_new.utf8bom'));

		await service.create([{ resource }]);

		assert.strictEqual(await exists(resource.fsPath), true);

		const detectedEncoding = await detectEncodingByBOM(resource.fsPath);
		assert.strictEqual(detectedEncoding, UTF8_with_bom);

		const res = await readFile(resource.fsPath);
		assert.strictEqual(res.byteLength, UTF8_BOM.length);
	});

	test('create - UTF 8 BOM - content provided', async () => {
		const resource = URI.file(join(testDir, 'small_new.utf8bom'));

		await service.create([{ resource, value: 'Hello World' }]);

		assert.strictEqual(await exists(resource.fsPath), true);

		const detectedEncoding = await detectEncodingByBOM(resource.fsPath);
		assert.strictEqual(detectedEncoding, UTF8_with_bom);

		const res = await readFile(resource.fsPath);
		assert.strictEqual(res.byteLength, 'Hello World'.length + UTF8_BOM.length);
	});

	function createTextModelSnapshot(text: string, preserveBOM?: boolean): ITextSnapshot {
		const textModel = disposables.add(createTextModel(text));
		const snapshot = textModel.createSnapshot(preserveBOM);

		return snapshot;
	}

	test('create - UTF 8 BOM - empty content - snapshot', async () => {
		const resource = URI.file(join(testDir, 'small_new.utf8bom'));

		await service.create([{ resource, value: createTextModelSnapshot('') }]);

		assert.strictEqual(await exists(resource.fsPath), true);

		const detectedEncoding = await detectEncodingByBOM(resource.fsPath);
		assert.strictEqual(detectedEncoding, UTF8_with_bom);

		const res = await readFile(resource.fsPath);
		assert.strictEqual(res.byteLength, UTF8_BOM.length);
	});

	test('create - UTF 8 BOM - content provided - snapshot', async () => {
		const resource = URI.file(join(testDir, 'small_new.utf8bom'));

		await service.create([{ resource, value: createTextModelSnapshot('Hello World') }]);

		assert.strictEqual(await exists(resource.fsPath), true);

		const detectedEncoding = await detectEncodingByBOM(resource.fsPath);
		assert.strictEqual(detectedEncoding, UTF8_with_bom);

		const res = await readFile(resource.fsPath);
		assert.strictEqual(res.byteLength, 'Hello World'.length + UTF8_BOM.length);
	});

	test('write - use encoding (UTF 16 BE) - small content as string', async () => {
		await testEncoding(URI.file(join(testDir, 'small.txt')), UTF16be, 'Hello\nWorld', 'Hello\nWorld');
	});

	test('write - use encoding (UTF 16 BE) - small content as snapshot', async () => {
		await testEncoding(URI.file(join(testDir, 'small.txt')), UTF16be, createTextModelSnapshot('Hello\nWorld'), 'Hello\nWorld');
	});

	test('write - use encoding (UTF 16 BE) - large content as string', async () => {
		await testEncoding(URI.file(join(testDir, 'lorem.txt')), UTF16be, 'Hello\nWorld', 'Hello\nWorld');
	});

	test('write - use encoding (UTF 16 BE) - large content as snapshot', async () => {
		await testEncoding(URI.file(join(testDir, 'lorem.txt')), UTF16be, createTextModelSnapshot('Hello\nWorld'), 'Hello\nWorld');
	});

	async function testEncoding(resource: URI, encoding: string, content: string | ITextSnapshot, expectedContent: string) {
		await service.write(resource, content, { encoding });

		const detectedEncoding = await detectEncodingByBOM(resource.fsPath);
		assert.strictEqual(detectedEncoding, encoding);

		const resolved = await service.readStream(resource);
		assert.strictEqual(resolved.encoding, encoding);

		const textBuffer = disposables.add(resolved.value.create(isWindows ? DefaultEndOfLine.CRLF : DefaultEndOfLine.LF).textBuffer);
		assert.strictEqual(snapshotToString(textBuffer.createSnapshot(false)), expectedContent);
	}

	test('write - use encoding (cp1252)', async () => {
		const filePath = join(testDir, 'some_cp1252.txt');
		const contents = await readFile(filePath, 'utf8');
		const eol = /\r\n/.test(contents) ? '\r\n' : '\n';
		await testEncodingKeepsData(URI.file(filePath), 'cp1252', ['ObjectCount = LoadObjects("Öffentlicher Ordner");', '', 'Private = "Persönliche Information"', ''].join(eol));
	});

	test('write - use encoding (shiftjis)', async () => {
		await testEncodingKeepsData(URI.file(join(testDir, 'some_shiftjis.txt')), 'shiftjis', '中文abc');
	});

	test('write - use encoding (gbk)', async () => {
		await testEncodingKeepsData(URI.file(join(testDir, 'some_gbk.txt')), 'gbk', '中国abc');
	});

	test('write - use encoding (cyrillic)', async () => {
		await testEncodingKeepsData(URI.file(join(testDir, 'some_cyrillic.txt')), 'cp866', 'АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдежзийклмнопрстуфхцчшщъыьэюя');
	});

	test('write - use encoding (big5)', async () => {
		await testEncodingKeepsData(URI.file(join(testDir, 'some_big5.txt')), 'cp950', '中文abc');
	});

	async function testEncodingKeepsData(resource: URI, encoding: string, expected: string) {
		let resolved = await service.readStream(resource, { encoding });
		const textBuffer = disposables.add(resolved.value.create(isWindows ? DefaultEndOfLine.CRLF : DefaultEndOfLine.LF).textBuffer);
		const content = snapshotToString(textBuffer.createSnapshot(false));
		assert.strictEqual(content, expected);

		await service.write(resource, content, { encoding });

		resolved = await service.readStream(resource, { encoding });
		const textBuffer2 = disposables.add(resolved.value.create(DefaultEndOfLine.CRLF).textBuffer);
		assert.strictEqual(snapshotToString(textBuffer2.createSnapshot(false)), content);

		await service.write(resource, createTextModelSnapshot(content), { encoding });

		resolved = await service.readStream(resource, { encoding });
		const textBuffer3 = disposables.add(resolved.value.create(DefaultEndOfLine.CRLF).textBuffer);
		assert.strictEqual(snapshotToString(textBuffer3.createSnapshot(false)), content);
	}

	test('write - no encoding - content as string', async () => {
		const resource = URI.file(join(testDir, 'small.txt'));

		const content = (await readFile(resource.fsPath)).toString();

		await service.write(resource, content);

		const resolved = await service.readStream(resource);
		assert.strictEqual(resolved.value.getFirstLineText(999999), content);
	});

	test('write - no encoding - content as snapshot', async () => {
		const resource = URI.file(join(testDir, 'small.txt'));

		const content = (await readFile(resource.fsPath)).toString();

		await service.write(resource, createTextModelSnapshot(content));

		const resolved = await service.readStream(resource);
		assert.strictEqual(resolved.value.getFirstLineText(999999), content);
	});

	test('write - encoding preserved (UTF 16 LE) - content as string', async () => {
		const resource = URI.file(join(testDir, 'some_utf16le.css'));

		const resolved = await service.readStream(resource);
		assert.strictEqual(resolved.encoding, UTF16le);

		await testEncoding(URI.file(join(testDir, 'some_utf16le.css')), UTF16le, 'Hello\nWorld', 'Hello\nWorld');
	});

	test('write - encoding preserved (UTF 16 LE) - content as snapshot', async () => {
		const resource = URI.file(join(testDir, 'some_utf16le.css'));

		const resolved = await service.readStream(resource);
		assert.strictEqual(resolved.encoding, UTF16le);

		await testEncoding(URI.file(join(testDir, 'some_utf16le.css')), UTF16le, createTextModelSnapshot('Hello\nWorld'), 'Hello\nWorld');
	});

	test('write - UTF8 variations - content as string', async () => {
		const resource = URI.file(join(testDir, 'index.html'));

		let detectedEncoding = await detectEncodingByBOM(resource.fsPath);
		assert.strictEqual(detectedEncoding, null);

		const content = (await readFile(resource.fsPath)).toString() + 'updates';
		await service.write(resource, content, { encoding: UTF8_with_bom });

		detectedEncoding = await detectEncodingByBOM(resource.fsPath);
		assert.strictEqual(detectedEncoding, UTF8_with_bom);

		// ensure BOM preserved if enforced
		await service.write(resource, content, { encoding: UTF8_with_bom });
		detectedEncoding = await detectEncodingByBOM(resource.fsPath);
		assert.strictEqual(detectedEncoding, UTF8_with_bom);

		// allow to remove BOM
		await service.write(resource, content, { encoding: UTF8 });
		detectedEncoding = await detectEncodingByBOM(resource.fsPath);
		assert.strictEqual(detectedEncoding, null);

		// BOM does not come back
		await service.write(resource, content, { encoding: UTF8 });
		detectedEncoding = await detectEncodingByBOM(resource.fsPath);
		assert.strictEqual(detectedEncoding, null);
	});

	test('write - UTF8 variations - content as snapshot', async () => {
		const resource = URI.file(join(testDir, 'index.html'));

		let detectedEncoding = await detectEncodingByBOM(resource.fsPath);
		assert.strictEqual(detectedEncoding, null);

		const model = disposables.add(createTextModel((await readFile(resource.fsPath)).toString() + 'updates'));
		await service.write(resource, model.createSnapshot(), { encoding: UTF8_with_bom });

		detectedEncoding = await detectEncodingByBOM(resource.fsPath);
		assert.strictEqual(detectedEncoding, UTF8_with_bom);

		// ensure BOM preserved if enforced
		await service.write(resource, model.createSnapshot(), { encoding: UTF8_with_bom });
		detectedEncoding = await detectEncodingByBOM(resource.fsPath);
		assert.strictEqual(detectedEncoding, UTF8_with_bom);

		// allow to remove BOM
		await service.write(resource, model.createSnapshot(), { encoding: UTF8 });
		detectedEncoding = await detectEncodingByBOM(resource.fsPath);
		assert.strictEqual(detectedEncoding, null);

		// BOM does not come back
		await service.write(resource, model.createSnapshot(), { encoding: UTF8 });
		detectedEncoding = await detectEncodingByBOM(resource.fsPath);
		assert.strictEqual(detectedEncoding, null);
	});

	test('write - preserve UTF8 BOM - content as string', async () => {
		const resource = URI.file(join(testDir, 'some_utf8_bom.txt'));

		let detectedEncoding = await detectEncodingByBOM(resource.fsPath);
		assert.strictEqual(detectedEncoding, UTF8_with_bom);

		await service.write(resource, 'Hello World', { encoding: detectedEncoding });
		detectedEncoding = await detectEncodingByBOM(resource.fsPath);
		assert.strictEqual(detectedEncoding, UTF8_with_bom);
	});

	test('write - ensure BOM in empty file - content as string', async () => {
		const resource = URI.file(join(testDir, 'small.txt'));

		await service.write(resource, '', { encoding: UTF8_with_bom });

		const detectedEncoding = await detectEncodingByBOM(resource.fsPath);
		assert.strictEqual(detectedEncoding, UTF8_with_bom);
	});

	test('write - ensure BOM in empty file - content as snapshot', async () => {
		const resource = URI.file(join(testDir, 'small.txt'));

		await service.write(resource, createTextModelSnapshot(''), { encoding: UTF8_with_bom });

		const detectedEncoding = await detectEncodingByBOM(resource.fsPath);
		assert.strictEqual(detectedEncoding, UTF8_with_bom);
	});

	test('readStream - small text', async () => {
		const resource = URI.file(join(testDir, 'small.txt'));

		await testReadStream(resource);
	});

	test('readStream - large text', async () => {
		const resource = URI.file(join(testDir, 'lorem.txt'));

		await testReadStream(resource);
	});

	async function testReadStream(resource: URI): Promise<void> {
		const result = await service.readStream(resource);

		assert.strictEqual(result.name, basename(resource.fsPath));
		assert.strictEqual(result.size, (await stat(resource.fsPath)).size);

		const content = (await readFile(resource.fsPath)).toString();
		const textBuffer = disposables.add(result.value.create(DefaultEndOfLine.LF).textBuffer);
		assert.strictEqual(
			snapshotToString(textBuffer.createSnapshot(false)),
			snapshotToString(createTextModelSnapshot(content, false)));
	}

	test('read - small text', async () => {
		const resource = URI.file(join(testDir, 'small.txt'));

		await testRead(resource);
	});

	test('read - large text', async () => {
		const resource = URI.file(join(testDir, 'lorem.txt'));

		await testRead(resource);
	});

	async function testRead(resource: URI): Promise<void> {
		const result = await service.read(resource);

		assert.strictEqual(result.name, basename(resource.fsPath));
		assert.strictEqual(result.size, (await stat(resource.fsPath)).size);
		assert.strictEqual(result.value, (await readFile(resource.fsPath)).toString());
	}

	test('readStream - encoding picked up (CP1252)', async () => {
		const resource = URI.file(join(testDir, 'some_small_cp1252.txt'));
		const encoding = 'windows1252';

		const result = await service.readStream(resource, { encoding });
		assert.strictEqual(result.encoding, encoding);
		assert.strictEqual(result.value.getFirstLineText(999999), 'Private = "Persönlicheß Information"');
	});

	test('read - encoding picked up (CP1252)', async () => {
		const resource = URI.file(join(testDir, 'some_small_cp1252.txt'));
		const encoding = 'windows1252';

		const result = await service.read(resource, { encoding });
		assert.strictEqual(result.encoding, encoding);
		assert.strictEqual(result.value, 'Private = "Persönlicheß Information"');
	});

	test('read - encoding picked up (binary)', async () => {
		const resource = URI.file(join(testDir, 'some_small_cp1252.txt'));
		const encoding = 'binary';

		const result = await service.read(resource, { encoding });
		assert.strictEqual(result.encoding, encoding);
		assert.strictEqual(result.value, 'Private = "Persönlicheß Information"');
	});

	test('read - encoding picked up (base64)', async () => {
		const resource = URI.file(join(testDir, 'some_small_cp1252.txt'));
		const encoding = 'base64';

		const result = await service.read(resource, { encoding });
		assert.strictEqual(result.encoding, encoding);
		assert.strictEqual(result.value, btoa('Private = "Persönlicheß Information"'));
	});

	test('readStream - user overrides BOM', async () => {
		const resource = URI.file(join(testDir, 'some_utf16le.css'));

		const result = await service.readStream(resource, { encoding: 'windows1252' });
		assert.strictEqual(result.encoding, 'windows1252');
	});

	test('readStream - BOM removed', async () => {
		const resource = URI.file(join(testDir, 'some_utf8_bom.txt'));

		const result = await service.readStream(resource);
		assert.strictEqual(result.value.getFirstLineText(999999), 'This is some UTF 8 with BOM file.');
	});

	test('readStream - invalid encoding', async () => {
		const resource = URI.file(join(testDir, 'index.html'));

		const result = await service.readStream(resource, { encoding: 'superduper' });
		assert.strictEqual(result.encoding, 'utf8');
	});

	test('readStream - encoding override', async () => {
		const resource = URI.file(join(testDir, 'some.utf16le'));

		const result = await service.readStream(resource, { encoding: 'windows1252' });
		assert.strictEqual(result.encoding, 'utf16le');
		assert.strictEqual(result.value.getFirstLineText(999999), 'This is some UTF 16 with BOM file.');
	});

	test('readStream - large Big5', async () => {
		await testLargeEncoding('big5', '中文abc');
	});

	test('readStream - large CP1252', async () => {
		await testLargeEncoding('cp1252', 'öäüß');
	});

	test('readStream - large Cyrillic', async () => {
		await testLargeEncoding('cp866', 'АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдежзийклмнопрстуфхцчшщъыьэюя');
	});

	test('readStream - large GBK', async () => {
		await testLargeEncoding('gbk', '中国abc');
	});

	test('readStream - large ShiftJIS', async () => {
		await testLargeEncoding('shiftjis', '中文abc');
	});

	test('readStream - large UTF8 BOM', async () => {
		await testLargeEncoding('utf8bom', 'öäüß');
	});

	test('readStream - large UTF16 LE', async () => {
		await testLargeEncoding('utf16le', 'öäüß');
	});

	test('readStream - large UTF16 BE', async () => {
		await testLargeEncoding('utf16be', 'öäüß');
	});

	async function testLargeEncoding(encoding: string, needle: string): Promise<void> {
		const resource = URI.file(join(testDir, `lorem_${encoding}.txt`));

		// Verify via `ITextFileService.readStream`
		const result = await service.readStream(resource, { encoding });
		assert.strictEqual(result.encoding, encoding);

		const textBuffer = disposables.add(result.value.create(DefaultEndOfLine.LF).textBuffer);
		let contents = snapshotToString(textBuffer.createSnapshot(false));

		assert.strictEqual(contents.indexOf(needle), 0);
		assert.ok(contents.indexOf(needle, 10) > 0);

		// Verify via `ITextFileService.getDecodedTextFactory`
		const rawFile = await params.readFile(resource.fsPath);
		let rawFileVSBuffer: VSBuffer;
		if (rawFile instanceof VSBuffer) {
			rawFileVSBuffer = rawFile;
		} else {
			rawFileVSBuffer = VSBuffer.wrap(rawFile);
		}

		const factory = await createTextBufferFactoryFromStream(await service.getDecodedStream(resource, bufferToStream(rawFileVSBuffer), { encoding }));

		const textBuffer2 = disposables.add(factory.create(DefaultEndOfLine.LF).textBuffer);
		contents = snapshotToString(textBuffer2.createSnapshot(false));

		assert.strictEqual(contents.indexOf(needle), 0);
		assert.ok(contents.indexOf(needle, 10) > 0);
	}

	test('readStream - UTF16 LE (no BOM)', async () => {
		const resource = URI.file(join(testDir, 'utf16_le_nobom.txt'));

		const result = await service.readStream(resource);
		assert.strictEqual(result.encoding, 'utf16le');
	});

	test('readStream - UTF16 BE (no BOM)', async () => {
		const resource = URI.file(join(testDir, 'utf16_be_nobom.txt'));

		const result = await service.readStream(resource);
		assert.strictEqual(result.encoding, 'utf16be');
	});

	test('readStream - autoguessEncoding', async () => {
		const resource = URI.file(join(testDir, 'some_cp1252.txt'));

		const result = await service.readStream(resource, { autoGuessEncoding: true });
		assert.strictEqual(result.encoding, 'windows1252');
	});

	test('readStream - autoguessEncoding (candidateGuessEncodings)', async () => {
		// This file is determined to be Windows-1252 unless candidateDetectEncoding is set.
		const resource = URI.file(join(testDir, 'some.shiftjis.1.txt'));

		const result = await service.readStream(resource, { autoGuessEncoding: true, candidateGuessEncodings: ['utf-8', 'shiftjis', 'euc-jp'] });
		assert.strictEqual(result.encoding, 'shiftjis');
	});

	test('readStream - autoguessEncoding (candidateGuessEncodings is Empty)', async () => {
		const resource = URI.file(join(testDir, 'some_cp1252.txt'));

		const result = await service.readStream(resource, { autoGuessEncoding: true, candidateGuessEncodings: [] });
		assert.strictEqual(result.encoding, 'windows1252');
	});

	test('readStream - FILE_IS_BINARY', async () => {
		const resource = URI.file(join(testDir, 'binary.txt'));

		let error: TextFileOperationError | undefined = undefined;
		try {
			await service.readStream(resource, { acceptTextOnly: true });
		} catch (err) {
			error = err;
		}

		assert.ok(error);
		assert.strictEqual(error.textFileOperationResult, TextFileOperationResult.FILE_IS_BINARY);

		const result = await service.readStream(URI.file(join(testDir, 'small.txt')), { acceptTextOnly: true });
		assert.strictEqual(result.name, 'small.txt');
	});

	test('read - FILE_IS_BINARY', async () => {
		const resource = URI.file(join(testDir, 'binary.txt'));

		let error: TextFileOperationError | undefined = undefined;
		try {
			await service.read(resource, { acceptTextOnly: true });
		} catch (err) {
			error = err;
		}

		assert.ok(error);
		assert.strictEqual(error.textFileOperationResult, TextFileOperationResult.FILE_IS_BINARY);

		const result = await service.read(URI.file(join(testDir, 'small.txt')), { acceptTextOnly: true });
		assert.strictEqual(result.name, 'small.txt');
	});
}
