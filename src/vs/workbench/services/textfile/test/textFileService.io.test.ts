/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { URI } from 'vs/base/common/uri';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { workbenchInstantiationService, TestLifecycleService, TestTextFileService, TestWindowsService, TestContextService, TestFileService, TestEnvironmentService, TestTextResourceConfigurationService } from 'vs/workbench/test/workbenchTestServices';
import { IWindowsService } from 'vs/platform/windows/common/windows';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { IFileService, ITextSnapshot, snapshotToString } from 'vs/platform/files/common/files';
import { TextFileEditorModelManager } from 'vs/workbench/services/textfile/common/textFileEditorModelManager';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ModelServiceImpl } from 'vs/editor/common/services/modelServiceImpl';
import { Schemas } from 'vs/base/common/network';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { rimraf, RimRafMode, copy, readFile, exists } from 'vs/base/node/pfs';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { FileService2 } from 'vs/workbench/services/files2/common/fileService2';
import { NullLogService } from 'vs/platform/log/common/log';
import { getRandomTestPath } from 'vs/base/test/node/testUtils';
import { tmpdir } from 'os';
import { DiskFileSystemProvider } from 'vs/workbench/services/files2/node/diskFileSystemProvider';
import { generateUuid } from 'vs/base/common/uuid';
import { join } from 'vs/base/common/path';
import { getPathFromAmdModule } from 'vs/base/common/amd';
import { detectEncodingByBOM, UTF16be, UTF16le, UTF8_with_bom, UTF8 } from 'vs/base/node/encoding';
import { NodeTextFileService, EncodingOracle, IEncodingOverride } from 'vs/workbench/services/textfile/node/textFileService';
import { LegacyFileService } from 'vs/workbench/services/files/node/fileService';
import { DefaultEndOfLine } from 'vs/editor/common/model';
import { TextModel } from 'vs/editor/common/model/textModel';
import { isWindows } from 'vs/base/common/platform';

class ServiceAccessor {
	constructor(
		@ILifecycleService public lifecycleService: TestLifecycleService,
		@ITextFileService public textFileService: TestTextFileService,
		@IUntitledEditorService public untitledEditorService: IUntitledEditorService,
		@IWindowsService public windowsService: TestWindowsService,
		@IWorkspaceContextService public contextService: TestContextService,
		@IModelService public modelService: ModelServiceImpl,
		@IFileService public fileService: TestFileService
	) {
	}
}

class TestNodeTextFileService extends NodeTextFileService {

	private _testEncoding: TestEncodingOracle;
	protected get encoding(): TestEncodingOracle {
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
	let disposables: IDisposable[] = [];
	let service: ITextFileService;
	let testDir: string;

	setup(async () => {
		const instantiationService = workbenchInstantiationService();
		accessor = instantiationService.createInstance(ServiceAccessor);

		const logService = new NullLogService();
		const fileService = new FileService2(logService);

		const fileProvider = new DiskFileSystemProvider(logService);
		disposables.push(fileService.registerProvider(Schemas.file, fileProvider));
		disposables.push(fileProvider);

		fileService.setLegacyService(new LegacyFileService(
			fileService,
			accessor.contextService,
			TestEnvironmentService,
			new TestTextResourceConfigurationService()
		));

		const collection = new ServiceCollection();
		collection.set(IFileService, fileService);

		service = instantiationService.createChild(collection).createInstance(TestNodeTextFileService);

		const id = generateUuid();
		testDir = join(parentDir, id);
		const sourceDir = getPathFromAmdModule(require, './fixtures');

		await copy(sourceDir, testDir);
	});

	teardown(async () => {
		(<TextFileEditorModelManager>accessor.textFileService.models).clear();
		(<TextFileEditorModelManager>accessor.textFileService.models).dispose();
		accessor.untitledEditorService.revertAll();

		disposables = dispose(disposables);

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
		assert.equal(detectedEncoding, UTF8);
	});

	test('create - UTF 8 BOM - content provided', async () => {
		const resource = URI.file(join(testDir, 'small_new.utf8bom'));

		await service.create(resource, 'Hello World');

		assert.equal(await exists(resource.fsPath), true);

		const detectedEncoding = await detectEncodingByBOM(resource.fsPath);
		assert.equal(detectedEncoding, UTF8);
	});

	test('create - UTF 8 BOM - empty content - snapshot', async () => {
		const resource = URI.file(join(testDir, 'small_new.utf8bom'));

		await service.create(resource, TextModel.createFromString('').createSnapshot());

		assert.equal(await exists(resource.fsPath), true);

		const detectedEncoding = await detectEncodingByBOM(resource.fsPath);
		assert.equal(detectedEncoding, UTF8);
	});

	test('create - UTF 8 BOM - content provided - snapshot', async () => {
		const resource = URI.file(join(testDir, 'small_new.utf8bom'));

		await service.create(resource, TextModel.createFromString('Hello World').createSnapshot());

		assert.equal(await exists(resource.fsPath), true);

		const detectedEncoding = await detectEncodingByBOM(resource.fsPath);
		assert.equal(detectedEncoding, UTF8);
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

		const resolved = await service.resolve(resource);
		assert.equal(resolved.encoding, encoding);

		assert.equal(snapshotToString(resolved.value.create(isWindows ? DefaultEndOfLine.CRLF : DefaultEndOfLine.LF).createSnapshot(false)), expectedContent);
	}

	test('write - use encoding (cp1252)', async () => {
		await testEncodingKeepsData(URI.file(join(testDir, 'some_cp1252.txt')), 'cp1252', ['ObjectCount = LoadObjects("Öffentlicher Ordner");', '', 'Private = "Persönliche Information"', ''].join(isWindows ? '\r\n' : '\n'));
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
		let resolved = await service.resolve(resource, { encoding });
		const content = snapshotToString(resolved.value.create(isWindows ? DefaultEndOfLine.CRLF : DefaultEndOfLine.LF).createSnapshot(false));
		assert.equal(content, expected);

		await service.write(resource, content, { encoding });

		resolved = await service.resolve(resource, { encoding });
		assert.equal(snapshotToString(resolved.value.create(DefaultEndOfLine.CRLF).createSnapshot(false)), content);

		await service.write(resource, TextModel.createFromString(content).createSnapshot(), { encoding });

		resolved = await service.resolve(resource, { encoding });
		assert.equal(snapshotToString(resolved.value.create(DefaultEndOfLine.CRLF).createSnapshot(false)), content);
	}

	test('write - no encoding - content as string', async () => {
		const resource = URI.file(join(testDir, 'small.txt'));

		const content = (await readFile(resource.fsPath)).toString();

		await service.write(resource, content);

		const resolved = await service.resolve(resource);
		assert.equal(snapshotToString(resolved.value.create(isWindows ? DefaultEndOfLine.CRLF : DefaultEndOfLine.LF).createSnapshot(false)), content);
	});

	test('write - no encoding - content as snapshot', async () => {
		const resource = URI.file(join(testDir, 'small.txt'));

		const content = (await readFile(resource.fsPath)).toString();

		await service.write(resource, TextModel.createFromString(content).createSnapshot());

		const resolved = await service.resolve(resource);
		assert.equal(snapshotToString(resolved.value.create(isWindows ? DefaultEndOfLine.CRLF : DefaultEndOfLine.LF).createSnapshot(false)), content);
	});

	test('write - encoding preserved (UTF 16 LE) - content as string', async () => {
		const resource = URI.file(join(testDir, 'some_utf16le.css'));

		const resolved = await service.resolve(resource);
		assert.equal(resolved.encoding, UTF16le);

		await testEncoding(URI.file(join(testDir, 'some_utf16le.css')), UTF16le, 'Hello\nWorld', 'Hello\nWorld');
	});

	test('write - encoding preserved (UTF 16 LE) - content as snapshot', async () => {
		const resource = URI.file(join(testDir, 'some_utf16le.css'));

		const resolved = await service.resolve(resource);
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
		assert.equal(detectedEncoding, UTF8);

		// ensure BOM preserved
		await service.write(resource, content, { encoding: UTF8 });
		detectedEncoding = await detectEncodingByBOM(resource.fsPath);
		assert.equal(detectedEncoding, UTF8);

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
		assert.equal(detectedEncoding, UTF8);

		// ensure BOM preserved
		await service.write(resource, model.createSnapshot(), { encoding: UTF8 });
		detectedEncoding = await detectEncodingByBOM(resource.fsPath);
		assert.equal(detectedEncoding, UTF8);

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
		assert.equal(detectedEncoding, UTF8);

		await service.write(resource, 'Hello World');
		detectedEncoding = await detectEncodingByBOM(resource.fsPath);
		assert.equal(detectedEncoding, UTF8);
	});

	test('write - ensure BOM in empty file - content as string', async () => {
		const resource = URI.file(join(testDir, 'small.txt'));

		await service.write(resource, '', { encoding: UTF8_with_bom });

		let detectedEncoding = await detectEncodingByBOM(resource.fsPath);
		assert.equal(detectedEncoding, UTF8);
	});

	test('write - ensure BOM in empty file - content as snapshot', async () => {
		const resource = URI.file(join(testDir, 'small.txt'));

		await service.write(resource, TextModel.createFromString('').createSnapshot(), { encoding: UTF8_with_bom });

		let detectedEncoding = await detectEncodingByBOM(resource.fsPath);
		assert.equal(detectedEncoding, UTF8);
	});
});
