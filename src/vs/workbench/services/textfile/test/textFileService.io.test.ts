/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { URI } from 'vs/base/common/uri';
import { workbenchInstantiationService, TestTextFileService } from 'vs/workbench/test/workbenchTestServices';
import { ITextFileService, snapshotToString, TextFileOperationResult, TextFileOperationError } from 'vs/workbench/services/textfile/common/textfiles';
import { IUntitledTextEditorService } from 'vs/workbench/services/untitled/common/untitledTextEditorService';
import { IFileService } from 'vs/platform/files/common/files';
import { TextFileEditorModelManager } from 'vs/workbench/services/textfile/common/textFileEditorModelManager';
import { Schemas } from 'vs/base/common/network';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { rimraf, RimRafMode, copy, readFile, exists } from 'vs/base/node/pfs';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { FileService } from 'vs/platform/files/common/fileService';
import { NullLogService } from 'vs/platform/log/common/log';
import { getRandomTestPath } from 'vs/base/test/node/testUtils';
import { tmpdir } from 'os';
import { DiskFileSystemProvider } from 'vs/platform/files/node/diskFileSystemProvider';
import { generateUuid } from 'vs/base/common/uuid';
import { join, basename } from 'vs/base/common/path';
import { getPathFromAmdModule } from 'vs/base/common/amd';
import { UTF16be, UTF16le, UTF8_with_bom, UTF8 } from 'vs/base/node/encoding';
import { NativeTextFileService, EncodingOracle, IEncodingOverride } from 'vs/workbench/services/textfile/electron-browser/nativeTextFileService';
import { DefaultEndOfLine, ITextSnapshot } from 'vs/editor/common/model';
import { TextModel } from 'vs/editor/common/model/textModel';
import { isWindows } from 'vs/base/common/platform';
import { readFileSync, statSync } from 'fs';
import { detectEncodingByBOM } from 'vs/base/test/node/encoding/encoding.test';

class ServiceAccessor {
	constructor(
		@ITextFileService public textFileService: TestTextFileService,
		@IUntitledTextEditorService public untitledTextEditorService: IUntitledTextEditorService
	) {
	}
}

class TestNativeTextFileService extends NativeTextFileService {

	private _testEncoding: TestEncodingOracle | undefined;
	get encoding(): TestEncodingOracle {
		if (!this._testEncoding) {
			this._testEncoding = this._register(this.instantiationService.createInstance(TestEncodingOracle));
		}

		return this._testEncoding;
	}
}

class TestEncodingOracle extends EncodingOracle {

	protected get encodingOverrides(): IEncodingOverride[] {
		return [
			{ extension: 'utf16le', encoding: UTF16le },
			{ extension: 'utf16be', encoding: UTF16be },
			{ extension: 'utf8bom', encoding: UTF8_with_bom }
		];
	}

	protected set encodingOverrides(overrides: IEncodingOverride[]) { }
}

suite('Files - TextFileService i/o', () => {
	const parentDir = getRandomTestPath(tmpdir(), 'vsctests', 'textfileservice');

	let accessor: ServiceAccessor;
	const disposables = new DisposableStore();
	let service: ITextFileService;
	let testDir: string;

	setup(async () => {
		const instantiationService = workbenchInstantiationService();
		accessor = instantiationService.createInstance(ServiceAccessor);

		const logService = new NullLogService();
		const fileService = new FileService(logService);

		const fileProvider = new DiskFileSystemProvider(logService);
		disposables.add(fileService.registerProvider(Schemas.file, fileProvider));
		disposables.add(fileProvider);

		const collection = new ServiceCollection();
		collection.set(IFileService, fileService);

		service = instantiationService.createChild(collection).createInstance(TestNativeTextFileService);

		const id = generateUuid();
		testDir = join(parentDir, id);
		const sourceDir = getPathFromAmdModule(require, './fixtures');

		await copy(sourceDir, testDir);
	});

	teardown(async () => {
		(<TextFileEditorModelManager>accessor.textFileService.models).clear();
		(<TextFileEditorModelManager>accessor.textFileService.models).dispose();
		accessor.untitledTextEditorService.revertAll();

		disposables.clear();

		await rimraf(parentDir, RimRafMode.MOVE);
	});

	test('create - no encoding - content empty', async () => {
		const resource = URI.file(join(testDir, 'small_new.txt'));

		await service.create(resource);

		assert.equal(await exists(resource.fsPath), true);
	});

	test('create - no encoding - content provided', async () => {
		const resource = URI.file(join(testDir, 'small_new.txt'));

		await service.create(resource, 'Hello World');

		assert.equal(await exists(resource.fsPath), true);
		assert.equal((await readFile(resource.fsPath)).toString(), 'Hello World');
	});

	test('create - UTF 16 LE - no content', async () => {
		const resource = URI.file(join(testDir, 'small_new.utf16le'));

		await service.create(resource);

		assert.equal(await exists(resource.fsPath), true);

		const detectedEncoding = await detectEncodingByBOM(resource.fsPath);
		assert.equal(detectedEncoding, UTF16le);
	});

	test('create - UTF 16 LE - content provided', async () => {
		const resource = URI.file(join(testDir, 'small_new.utf16le'));

		await service.create(resource, 'Hello World');

		assert.equal(await exists(resource.fsPath), true);

		const detectedEncoding = await detectEncodingByBOM(resource.fsPath);
		assert.equal(detectedEncoding, UTF16le);
	});

	test('create - UTF 16 BE - no content', async () => {
		const resource = URI.file(join(testDir, 'small_new.utf16be'));

		await service.create(resource);

		assert.equal(await exists(resource.fsPath), true);

		const detectedEncoding = await detectEncodingByBOM(resource.fsPath);
		assert.equal(detectedEncoding, UTF16be);
	});

	test('create - UTF 16 BE - content provided', async () => {
		const resource = URI.file(join(testDir, 'small_new.utf16be'));

		await service.create(resource, 'Hello World');

		assert.equal(await exists(resource.fsPath), true);

		const detectedEncoding = await detectEncodingByBOM(resource.fsPath);
		assert.equal(detectedEncoding, UTF16be);
	});

	test('create - UTF 8 BOM - no content', async () => {
		const resource = URI.file(join(testDir, 'small_new.utf8bom'));

		await service.create(resource);

		assert.equal(await exists(resource.fsPath), true);

		const detectedEncoding = await detectEncodingByBOM(resource.fsPath);
		assert.equal(detectedEncoding, UTF8_with_bom);
	});

	test('create - UTF 8 BOM - content provided', async () => {
		const resource = URI.file(join(testDir, 'small_new.utf8bom'));

		await service.create(resource, 'Hello World');

		assert.equal(await exists(resource.fsPath), true);

		const detectedEncoding = await detectEncodingByBOM(resource.fsPath);
		assert.equal(detectedEncoding, UTF8_with_bom);
	});

	test('create - UTF 8 BOM - empty content - snapshot', async () => {
		const resource = URI.file(join(testDir, 'small_new.utf8bom'));

		await service.create(resource, TextModel.createFromString('').createSnapshot());

		assert.equal(await exists(resource.fsPath), true);

		const detectedEncoding = await detectEncodingByBOM(resource.fsPath);
		assert.equal(detectedEncoding, UTF8_with_bom);
	});

	test('create - UTF 8 BOM - content provided - snapshot', async () => {
		const resource = URI.file(join(testDir, 'small_new.utf8bom'));

		await service.create(resource, TextModel.createFromString('Hello World').createSnapshot());

		assert.equal(await exists(resource.fsPath), true);

		const detectedEncoding = await detectEncodingByBOM(resource.fsPath);
		assert.equal(detectedEncoding, UTF8_with_bom);
	});

	test('write - use encoding (UTF 16 BE) - small content as string', async () => {
		await testEncoding(URI.file(join(testDir, 'small.txt')), UTF16be, 'Hello\nWorld', 'Hello\nWorld');
	});

	test('write - use encoding (UTF 16 BE) - small content as snapshot', async () => {
		await testEncoding(URI.file(join(testDir, 'small.txt')), UTF16be, TextModel.createFromString('Hello\nWorld').createSnapshot(), 'Hello\nWorld');
	});

	test('write - use encoding (UTF 16 BE) - large content as string', async () => {
		await testEncoding(URI.file(join(testDir, 'lorem.txt')), UTF16be, 'Hello\nWorld', 'Hello\nWorld');
	});

	test('write - use encoding (UTF 16 BE) - large content as snapshot', async () => {
		await testEncoding(URI.file(join(testDir, 'lorem.txt')), UTF16be, TextModel.createFromString('Hello\nWorld').createSnapshot(), 'Hello\nWorld');
	});

	async function testEncoding(resource: URI, encoding: string, content: string | ITextSnapshot, expectedContent: string) {
		await service.write(resource, content, { encoding });

		const detectedEncoding = await detectEncodingByBOM(resource.fsPath);
		assert.equal(detectedEncoding, encoding);

		const resolved = await service.readStream(resource);
		assert.equal(resolved.encoding, encoding);

		assert.equal(snapshotToString(resolved.value.create(isWindows ? DefaultEndOfLine.CRLF : DefaultEndOfLine.LF).createSnapshot(false)), expectedContent);
	}

	test('write - use encoding (cp1252)', async () => {
		const filePath = join(testDir, 'some_cp1252.txt');
		const contents = await readFile(filePath, 'utf8');
		const eol = /\r\n/.test(contents) ? '\r\n' : '\n';
		await testEncodingKeepsData(URI.file(filePath), 'cp1252', ['ObjectCount = LoadObjects("Öffentlicher Ordner");', '', 'Private = "Persönliche Information"', ''].join(eol));
	});

	test('write - use encoding (shiftjis)', async () => {
		await testEncodingKeepsData(URI.file(join(testDir, 'some_shiftjs.txt')), 'shiftjis', '中文abc');
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
		const content = snapshotToString(resolved.value.create(isWindows ? DefaultEndOfLine.CRLF : DefaultEndOfLine.LF).createSnapshot(false));
		assert.equal(content, expected);

		await service.write(resource, content, { encoding });

		resolved = await service.readStream(resource, { encoding });
		assert.equal(snapshotToString(resolved.value.create(DefaultEndOfLine.CRLF).createSnapshot(false)), content);

		await service.write(resource, TextModel.createFromString(content).createSnapshot(), { encoding });

		resolved = await service.readStream(resource, { encoding });
		assert.equal(snapshotToString(resolved.value.create(DefaultEndOfLine.CRLF).createSnapshot(false)), content);
	}

	test('write - no encoding - content as string', async () => {
		const resource = URI.file(join(testDir, 'small.txt'));

		const content = (await readFile(resource.fsPath)).toString();

		await service.write(resource, content);

		const resolved = await service.readStream(resource);
		assert.equal(resolved.value.getFirstLineText(999999), content);
	});

	test('write - no encoding - content as snapshot', async () => {
		const resource = URI.file(join(testDir, 'small.txt'));

		const content = (await readFile(resource.fsPath)).toString();

		await service.write(resource, TextModel.createFromString(content).createSnapshot());

		const resolved = await service.readStream(resource);
		assert.equal(resolved.value.getFirstLineText(999999), content);
	});

	test('write - encoding preserved (UTF 16 LE) - content as string', async () => {
		const resource = URI.file(join(testDir, 'some_utf16le.css'));

		const resolved = await service.readStream(resource);
		assert.equal(resolved.encoding, UTF16le);

		await testEncoding(URI.file(join(testDir, 'some_utf16le.css')), UTF16le, 'Hello\nWorld', 'Hello\nWorld');
	});

	test('write - encoding preserved (UTF 16 LE) - content as snapshot', async () => {
		const resource = URI.file(join(testDir, 'some_utf16le.css'));

		const resolved = await service.readStream(resource);
		assert.equal(resolved.encoding, UTF16le);

		await testEncoding(URI.file(join(testDir, 'some_utf16le.css')), UTF16le, TextModel.createFromString('Hello\nWorld').createSnapshot(), 'Hello\nWorld');
	});

	test('write - UTF8 variations - content as string', async () => {
		const resource = URI.file(join(testDir, 'index.html'));

		let detectedEncoding = await detectEncodingByBOM(resource.fsPath);
		assert.equal(detectedEncoding, null);

		const content = (await readFile(resource.fsPath)).toString() + 'updates';
		await service.write(resource, content, { encoding: UTF8_with_bom });

		detectedEncoding = await detectEncodingByBOM(resource.fsPath);
		assert.equal(detectedEncoding, UTF8_with_bom);

		// ensure BOM preserved
		await service.write(resource, content, { encoding: UTF8 });
		detectedEncoding = await detectEncodingByBOM(resource.fsPath);
		assert.equal(detectedEncoding, UTF8_with_bom);

		// allow to remove BOM
		await service.write(resource, content, { encoding: UTF8, overwriteEncoding: true });
		detectedEncoding = await detectEncodingByBOM(resource.fsPath);
		assert.equal(detectedEncoding, null);

		// BOM does not come back
		await service.write(resource, content, { encoding: UTF8 });
		detectedEncoding = await detectEncodingByBOM(resource.fsPath);
		assert.equal(detectedEncoding, null);
	});

	test('write - UTF8 variations - content as snapshot', async () => {
		const resource = URI.file(join(testDir, 'index.html'));

		let detectedEncoding = await detectEncodingByBOM(resource.fsPath);
		assert.equal(detectedEncoding, null);

		const model = TextModel.createFromString((await readFile(resource.fsPath)).toString() + 'updates');
		await service.write(resource, model.createSnapshot(), { encoding: UTF8_with_bom });

		detectedEncoding = await detectEncodingByBOM(resource.fsPath);
		assert.equal(detectedEncoding, UTF8_with_bom);

		// ensure BOM preserved
		await service.write(resource, model.createSnapshot(), { encoding: UTF8 });
		detectedEncoding = await detectEncodingByBOM(resource.fsPath);
		assert.equal(detectedEncoding, UTF8_with_bom);

		// allow to remove BOM
		await service.write(resource, model.createSnapshot(), { encoding: UTF8, overwriteEncoding: true });
		detectedEncoding = await detectEncodingByBOM(resource.fsPath);
		assert.equal(detectedEncoding, null);

		// BOM does not come back
		await service.write(resource, model.createSnapshot(), { encoding: UTF8 });
		detectedEncoding = await detectEncodingByBOM(resource.fsPath);
		assert.equal(detectedEncoding, null);
	});

	test('write - preserve UTF8 BOM - content as string', async () => {
		const resource = URI.file(join(testDir, 'some_utf8_bom.txt'));

		let detectedEncoding = await detectEncodingByBOM(resource.fsPath);
		assert.equal(detectedEncoding, UTF8_with_bom);

		await service.write(resource, 'Hello World');
		detectedEncoding = await detectEncodingByBOM(resource.fsPath);
		assert.equal(detectedEncoding, UTF8_with_bom);
	});

	test('write - ensure BOM in empty file - content as string', async () => {
		const resource = URI.file(join(testDir, 'small.txt'));

		await service.write(resource, '', { encoding: UTF8_with_bom });

		let detectedEncoding = await detectEncodingByBOM(resource.fsPath);
		assert.equal(detectedEncoding, UTF8_with_bom);
	});

	test('write - ensure BOM in empty file - content as snapshot', async () => {
		const resource = URI.file(join(testDir, 'small.txt'));

		await service.write(resource, TextModel.createFromString('').createSnapshot(), { encoding: UTF8_with_bom });

		let detectedEncoding = await detectEncodingByBOM(resource.fsPath);
		assert.equal(detectedEncoding, UTF8_with_bom);
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

		assert.equal(result.name, basename(resource.fsPath));
		assert.equal(result.size, statSync(resource.fsPath).size);
		assert.equal(snapshotToString(result.value.create(DefaultEndOfLine.LF).createSnapshot(false)), snapshotToString(TextModel.createFromString(readFileSync(resource.fsPath).toString()).createSnapshot(false)));
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

		assert.equal(result.name, basename(resource.fsPath));
		assert.equal(result.size, statSync(resource.fsPath).size);
		assert.equal(result.value, readFileSync(resource.fsPath).toString());
	}

	test('readStream - encoding picked up (CP1252)', async () => {
		const resource = URI.file(join(testDir, 'some_small_cp1252.txt'));
		const encoding = 'windows1252';

		const result = await service.readStream(resource, { encoding });
		assert.equal(result.encoding, encoding);
		assert.equal(result.value.getFirstLineText(999999), 'Private = "Persönlicheß Information"');
	});

	test('read - encoding picked up (CP1252)', async () => {
		const resource = URI.file(join(testDir, 'some_small_cp1252.txt'));
		const encoding = 'windows1252';

		const result = await service.read(resource, { encoding });
		assert.equal(result.encoding, encoding);
		assert.equal(result.value, 'Private = "Persönlicheß Information"');
	});

	test('read - encoding picked up (binary)', async () => {
		const resource = URI.file(join(testDir, 'some_small_cp1252.txt'));
		const encoding = 'binary';

		const result = await service.read(resource, { encoding });
		assert.equal(result.encoding, encoding);
		assert.equal(result.value, 'Private = "Persönlicheß Information"');
	});

	test('read - encoding picked up (base64)', async () => {
		const resource = URI.file(join(testDir, 'some_small_cp1252.txt'));
		const encoding = 'base64';

		const result = await service.read(resource, { encoding });
		assert.equal(result.encoding, encoding);
		assert.equal(result.value, btoa('Private = "Persönlicheß Information"'));
	});

	test('readStream - user overrides BOM', async () => {
		const resource = URI.file(join(testDir, 'some_utf16le.css'));

		const result = await service.readStream(resource, { encoding: 'windows1252' });
		assert.equal(result.encoding, 'windows1252');
	});

	test('readStream - BOM removed', async () => {
		const resource = URI.file(join(testDir, 'some_utf8_bom.txt'));

		const result = await service.readStream(resource);
		assert.equal(result.value.getFirstLineText(999999), 'This is some UTF 8 with BOM file.');
	});

	test('readStream - invalid encoding', async () => {
		const resource = URI.file(join(testDir, 'index.html'));

		const result = await service.readStream(resource, { encoding: 'superduper' });
		assert.equal(result.encoding, 'utf8');
	});

	test('readStream - encoding override', async () => {
		const resource = URI.file(join(testDir, 'some.utf16le'));

		const result = await service.readStream(resource, { encoding: 'windows1252' });
		assert.equal(result.encoding, 'utf16le');
		assert.equal(result.value.getFirstLineText(999999), 'This is some UTF 16 with BOM file.');
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

	test('readStream - large ShiftJS', async () => {
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

		const result = await service.readStream(resource, { encoding });
		assert.equal(result.encoding, encoding);

		const contents = snapshotToString(result.value.create(DefaultEndOfLine.LF).createSnapshot(false));

		assert.equal(contents.indexOf(needle), 0);
		assert.ok(contents.indexOf(needle, 10) > 0);
	}

	test('readStream - UTF16 LE (no BOM)', async () => {
		const resource = URI.file(join(testDir, 'utf16_le_nobom.txt'));

		const result = await service.readStream(resource);
		assert.equal(result.encoding, 'utf16le');
	});

	test('readStream - UTF16 BE (no BOM)', async () => {
		const resource = URI.file(join(testDir, 'utf16_be_nobom.txt'));

		const result = await service.readStream(resource);
		assert.equal(result.encoding, 'utf16be');
	});

	test('readStream - autoguessEncoding', async () => {
		const resource = URI.file(join(testDir, 'some_cp1252.txt'));

		const result = await service.readStream(resource, { autoGuessEncoding: true });
		assert.equal(result.encoding, 'windows1252');
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
		assert.equal(error!.textFileOperationResult, TextFileOperationResult.FILE_IS_BINARY);

		const result = await service.readStream(URI.file(join(testDir, 'small.txt')), { acceptTextOnly: true });
		assert.equal(result.name, 'small.txt');
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
		assert.equal(error!.textFileOperationResult, TextFileOperationResult.FILE_IS_BINARY);

		const result = await service.read(URI.file(join(testDir, 'small.txt')), { acceptTextOnly: true });
		assert.equal(result.name, 'small.txt');
	});
});
