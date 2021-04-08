/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { isWindows } from 'vs/base/common/platform';
import { tmpdir } from 'os';
import { promises, existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'vs/base/common/path';
import { readdirSync, rimraf, writeFile } from 'vs/base/node/pfs';
import { URI } from 'vs/base/common/uri';
import { BackupFilesModel, hashPath } from 'vs/workbench/services/backup/common/backupFileService';
import { createTextBufferFactory } from 'vs/editor/common/model/textModel';
import { createTextModel } from 'vs/editor/test/common/editorTestUtils';
import { getRandomTestPath } from 'vs/base/test/node/testUtils';
import { DefaultEndOfLine, ITextSnapshot } from 'vs/editor/common/model';
import { Schemas } from 'vs/base/common/network';
import { FileService } from 'vs/platform/files/common/fileService';
import { NullLogService } from 'vs/platform/log/common/log';
import { DiskFileSystemProvider } from 'vs/platform/files/node/diskFileSystemProvider';
import { NativeWorkbenchEnvironmentService } from 'vs/workbench/services/environment/electron-sandbox/environmentService';
import { snapshotToString } from 'vs/workbench/services/textfile/common/textfiles';
import { IFileService } from 'vs/platform/files/common/files';
import { NativeBackupFileService } from 'vs/workbench/services/backup/electron-sandbox/backupFileService';
import { FileUserDataProvider } from 'vs/workbench/services/userData/common/fileUserDataProvider';
import { VSBuffer } from 'vs/base/common/buffer';
import { TestWorkbenchConfiguration } from 'vs/workbench/test/electron-browser/workbenchTestServices';
import { TestProductService } from 'vs/workbench/test/browser/workbenchTestServices';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { insert } from 'vs/base/common/arrays';
import { hash } from 'vs/base/common/hash';
import { isEqual } from 'vs/base/common/resources';

class TestWorkbenchEnvironmentService extends NativeWorkbenchEnvironmentService {

	constructor(testDir: string, backupPath: string) {
		super({ ...TestWorkbenchConfiguration, backupPath, 'user-data-dir': testDir }, TestProductService);
	}
}

export class NodeTestBackupFileService extends NativeBackupFileService {

	override readonly fileService: IFileService;

	private backupResourceJoiners: Function[];
	private discardBackupJoiners: Function[];
	discardedBackups: URI[];
	private pendingBackupsArr: Promise<void>[];

	constructor(testDir: string, workspaceBackupPath: string) {
		const environmentService = new TestWorkbenchEnvironmentService(testDir, workspaceBackupPath);
		const logService = new NullLogService();
		const fileService = new FileService(logService);
		const diskFileSystemProvider = new DiskFileSystemProvider(logService);
		fileService.registerProvider(Schemas.file, diskFileSystemProvider);
		fileService.registerProvider(Schemas.userData, new FileUserDataProvider(Schemas.file, diskFileSystemProvider, Schemas.userData, logService));

		super(environmentService, fileService, logService);

		this.fileService = fileService;
		this.backupResourceJoiners = [];
		this.discardBackupJoiners = [];
		this.discardedBackups = [];
		this.pendingBackupsArr = [];
	}

	async waitForAllBackups(): Promise<void> {
		await Promise.all(this.pendingBackupsArr);
	}

	joinBackupResource(): Promise<void> {
		return new Promise(resolve => this.backupResourceJoiners.push(resolve));
	}

	async override backup(resource: URI, content?: ITextSnapshot, versionId?: number, meta?: any, token?: CancellationToken): Promise<void> {
		const p = super.backup(resource, content, versionId, meta, token);
		const removeFromPendingBackups = insert(this.pendingBackupsArr, p.then(undefined, undefined));

		try {
			await p;
		} finally {
			removeFromPendingBackups();
		}

		while (this.backupResourceJoiners.length) {
			this.backupResourceJoiners.pop()!();
		}
	}

	joinDiscardBackup(): Promise<void> {
		return new Promise(resolve => this.discardBackupJoiners.push(resolve));
	}

	async override discardBackup(resource: URI): Promise<void> {
		await super.discardBackup(resource);
		this.discardedBackups.push(resource);

		while (this.discardBackupJoiners.length) {
			this.discardBackupJoiners.pop()!();
		}
	}

	async getBackupContents(resource: URI): Promise<string> {
		const backupResource = this.toBackupResource(resource);

		const fileContents = await this.fileService.readFile(backupResource);

		return fileContents.value.toString();
	}
}

suite('BackupFileService', () => {

	let testDir: string;
	let backupHome: string;
	let workspacesJsonPath: string;
	let workspaceBackupPath: string;
	let fooBackupPath: string;
	let barBackupPath: string;
	let untitledBackupPath: string;
	let customFileBackupPath: string;

	let service: NodeTestBackupFileService;

	let workspaceResource = URI.file(isWindows ? 'c:\\workspace' : '/workspace');
	let fooFile = URI.file(isWindows ? 'c:\\Foo' : '/Foo');
	let customFile = URI.parse('customScheme://some/path');
	let customFileWithFragment = URI.parse('customScheme2://some/path#fragment');
	let barFile = URI.file(isWindows ? 'c:\\Bar' : '/Bar');
	let fooBarFile = URI.file(isWindows ? 'c:\\Foo Bar' : '/Foo Bar');
	let untitledFile = URI.from({ scheme: Schemas.untitled, path: 'Untitled-1' });

	setup(async () => {
		testDir = getRandomTestPath(tmpdir(), 'vsctests', 'backupfileservice');
		backupHome = join(testDir, 'Backups');
		workspacesJsonPath = join(backupHome, 'workspaces.json');
		workspaceBackupPath = join(backupHome, hashPath(workspaceResource));
		fooBackupPath = join(workspaceBackupPath, fooFile.scheme, hashPath(fooFile));
		barBackupPath = join(workspaceBackupPath, barFile.scheme, hashPath(barFile));
		untitledBackupPath = join(workspaceBackupPath, untitledFile.scheme, hashPath(untitledFile));
		customFileBackupPath = join(workspaceBackupPath, customFile.scheme, hashPath(customFile));

		service = new NodeTestBackupFileService(testDir, workspaceBackupPath);

		await promises.mkdir(backupHome, { recursive: true });

		return writeFile(workspacesJsonPath, '');
	});

	teardown(() => {
		return rimraf(testDir);
	});

	suite('hashPath', () => {
		test('should correctly hash the path for untitled scheme URIs', () => {
			const uri = URI.from({
				scheme: 'untitled',
				path: 'Untitled-1'
			});
			const actual = hashPath(uri);
			// If these hashes change people will lose their backed up files!
			assert.strictEqual(actual, '-7f9c1a2e');
			assert.strictEqual(actual, hash(uri.fsPath).toString(16));
		});

		test('should correctly hash the path for file scheme URIs', () => {
			const uri = URI.file('/foo');
			const actual = hashPath(uri);
			// If these hashes change people will lose their backed up files!
			if (isWindows) {
				assert.strictEqual(actual, '20ffaa13');
			} else {
				assert.strictEqual(actual, '20eb3560');
			}
			assert.strictEqual(actual, hash(uri.fsPath).toString(16));
		});

		test('should correctly hash the path for custom scheme URIs', () => {
			const uri = URI.from({
				scheme: 'vscode-custom',
				path: 'somePath'
			});
			const actual = hashPath(uri);
			// If these hashes change people will lose their backed up files!
			assert.strictEqual(actual, '-44972d98');
			assert.strictEqual(actual, hash(uri.toString()).toString(16));
		});
	});

	suite('getBackupResource', () => {
		test('should get the correct backup path for text files', () => {
			// Format should be: <backupHome>/<workspaceHash>/<scheme>/<filePathHash>
			const backupResource = fooFile;
			const workspaceHash = hashPath(workspaceResource);
			const filePathHash = hashPath(backupResource);
			const expectedPath = URI.file(join(backupHome, workspaceHash, Schemas.file, filePathHash)).with({ scheme: Schemas.userData }).toString();
			assert.strictEqual(service.toBackupResource(backupResource).toString(), expectedPath);
		});

		test('should get the correct backup path for untitled files', () => {
			// Format should be: <backupHome>/<workspaceHash>/<scheme>/<filePath>
			const backupResource = URI.from({ scheme: Schemas.untitled, path: 'Untitled-1' });
			const workspaceHash = hashPath(workspaceResource);
			const filePathHash = hashPath(backupResource);
			const expectedPath = URI.file(join(backupHome, workspaceHash, Schemas.untitled, filePathHash)).with({ scheme: Schemas.userData }).toString();
			assert.strictEqual(service.toBackupResource(backupResource).toString(), expectedPath);
		});
	});

	suite('backup', () => {
		test('no text', async () => {
			await service.backup(fooFile);
			assert.strictEqual(readdirSync(join(workspaceBackupPath, 'file')).length, 1);
			assert.strictEqual(existsSync(fooBackupPath), true);
			assert.strictEqual(readFileSync(fooBackupPath).toString(), `${fooFile.toString()}\n`);
			assert.ok(service.hasBackupSync(fooFile));
		});

		test('text file', async () => {
			await service.backup(fooFile, createTextBufferFactory('test').create(DefaultEndOfLine.LF).textBuffer.createSnapshot(false));
			assert.strictEqual(readdirSync(join(workspaceBackupPath, 'file')).length, 1);
			assert.strictEqual(existsSync(fooBackupPath), true);
			assert.strictEqual(readFileSync(fooBackupPath).toString(), `${fooFile.toString()}\ntest`);
			assert.ok(service.hasBackupSync(fooFile));
		});

		test('text file (with version)', async () => {
			await service.backup(fooFile, createTextBufferFactory('test').create(DefaultEndOfLine.LF).textBuffer.createSnapshot(false), 666);
			assert.strictEqual(readdirSync(join(workspaceBackupPath, 'file')).length, 1);
			assert.strictEqual(existsSync(fooBackupPath), true);
			assert.strictEqual(readFileSync(fooBackupPath).toString(), `${fooFile.toString()}\ntest`);
			assert.ok(!service.hasBackupSync(fooFile, 555));
			assert.ok(service.hasBackupSync(fooFile, 666));
		});

		test('text file (with meta)', async () => {
			await service.backup(fooFile, createTextBufferFactory('test').create(DefaultEndOfLine.LF).textBuffer.createSnapshot(false), undefined, { etag: '678', orphaned: true });
			assert.strictEqual(readdirSync(join(workspaceBackupPath, 'file')).length, 1);
			assert.strictEqual(existsSync(fooBackupPath), true);
			assert.strictEqual(readFileSync(fooBackupPath).toString(), `${fooFile.toString()} {"etag":"678","orphaned":true}\ntest`);
			assert.ok(service.hasBackupSync(fooFile));
		});

		test('untitled file', async () => {
			await service.backup(untitledFile, createTextBufferFactory('test').create(DefaultEndOfLine.LF).textBuffer.createSnapshot(false));
			assert.strictEqual(readdirSync(join(workspaceBackupPath, 'untitled')).length, 1);
			assert.strictEqual(existsSync(untitledBackupPath), true);
			assert.strictEqual(readFileSync(untitledBackupPath).toString(), `${untitledFile.toString()}\ntest`);
			assert.ok(service.hasBackupSync(untitledFile));
		});

		test('text file (ITextSnapshot)', async () => {
			const model = createTextModel('test');

			await service.backup(fooFile, model.createSnapshot());
			assert.strictEqual(readdirSync(join(workspaceBackupPath, 'file')).length, 1);
			assert.strictEqual(existsSync(fooBackupPath), true);
			assert.strictEqual(readFileSync(fooBackupPath).toString(), `${fooFile.toString()}\ntest`);
			assert.ok(service.hasBackupSync(fooFile));

			model.dispose();
		});

		test('untitled file (ITextSnapshot)', async () => {
			const model = createTextModel('test');

			await service.backup(untitledFile, model.createSnapshot());
			assert.strictEqual(readdirSync(join(workspaceBackupPath, 'untitled')).length, 1);
			assert.strictEqual(existsSync(untitledBackupPath), true);
			assert.strictEqual(readFileSync(untitledBackupPath).toString(), `${untitledFile.toString()}\ntest`);

			model.dispose();
		});

		test('text file (large file, ITextSnapshot)', async () => {
			const largeString = (new Array(10 * 1024)).join('Large String\n');
			const model = createTextModel(largeString);

			await service.backup(fooFile, model.createSnapshot());
			assert.strictEqual(readdirSync(join(workspaceBackupPath, 'file')).length, 1);
			assert.strictEqual(existsSync(fooBackupPath), true);
			assert.strictEqual(readFileSync(fooBackupPath).toString(), `${fooFile.toString()}\n${largeString}`);
			assert.ok(service.hasBackupSync(fooFile));

			model.dispose();
		});

		test('untitled file (large file, ITextSnapshot)', async () => {
			const largeString = (new Array(10 * 1024)).join('Large String\n');
			const model = createTextModel(largeString);

			await service.backup(untitledFile, model.createSnapshot());
			assert.strictEqual(readdirSync(join(workspaceBackupPath, 'untitled')).length, 1);
			assert.strictEqual(existsSync(untitledBackupPath), true);
			assert.strictEqual(readFileSync(untitledBackupPath).toString(), `${untitledFile.toString()}\n${largeString}`);
			assert.ok(service.hasBackupSync(untitledFile));

			model.dispose();
		});

		test('cancellation', async () => {
			const cts = new CancellationTokenSource();
			const promise = service.backup(fooFile, undefined, undefined, undefined, cts.token);
			cts.cancel();
			await promise;

			assert.strictEqual(existsSync(fooBackupPath), false);
			assert.ok(!service.hasBackupSync(fooFile));
		});
	});

	suite('discardBackup', () => {
		test('text file', async () => {
			await service.backup(fooFile, createTextBufferFactory('test').create(DefaultEndOfLine.LF).textBuffer.createSnapshot(false));
			assert.strictEqual(readdirSync(join(workspaceBackupPath, 'file')).length, 1);
			assert.ok(service.hasBackupSync(fooFile));

			await service.discardBackup(fooFile);
			assert.strictEqual(existsSync(fooBackupPath), false);
			assert.strictEqual(readdirSync(join(workspaceBackupPath, 'file')).length, 0);
			assert.ok(!service.hasBackupSync(fooFile));
		});

		test('untitled file', async () => {
			await service.backup(untitledFile, createTextBufferFactory('test').create(DefaultEndOfLine.LF).textBuffer.createSnapshot(false));
			assert.strictEqual(readdirSync(join(workspaceBackupPath, 'untitled')).length, 1);
			await service.discardBackup(untitledFile);
			assert.strictEqual(existsSync(untitledBackupPath), false);
			assert.strictEqual(readdirSync(join(workspaceBackupPath, 'untitled')).length, 0);
		});
	});

	suite('discardBackups', () => {
		test('text file', async () => {
			await service.backup(fooFile, createTextBufferFactory('test').create(DefaultEndOfLine.LF).textBuffer.createSnapshot(false));
			assert.strictEqual(readdirSync(join(workspaceBackupPath, 'file')).length, 1);
			await service.backup(barFile, createTextBufferFactory('test').create(DefaultEndOfLine.LF).textBuffer.createSnapshot(false));
			assert.strictEqual(readdirSync(join(workspaceBackupPath, 'file')).length, 2);
			await service.discardBackups();
			assert.strictEqual(existsSync(fooBackupPath), false);
			assert.strictEqual(existsSync(barBackupPath), false);
			assert.strictEqual(existsSync(join(workspaceBackupPath, 'file')), false);
		});

		test('untitled file', async () => {
			await service.backup(untitledFile, createTextBufferFactory('test').create(DefaultEndOfLine.LF).textBuffer.createSnapshot(false));
			assert.strictEqual(readdirSync(join(workspaceBackupPath, 'untitled')).length, 1);
			await service.discardBackups();
			assert.strictEqual(existsSync(untitledBackupPath), false);
			assert.strictEqual(existsSync(join(workspaceBackupPath, 'untitled')), false);
		});

		test('can backup after discarding all', async () => {
			await service.discardBackups();
			await service.backup(untitledFile, createTextBufferFactory('test').create(DefaultEndOfLine.LF).textBuffer.createSnapshot(false));
			assert.strictEqual(existsSync(workspaceBackupPath), true);
		});
	});

	suite('getBackups', () => {
		test('("file") - text file', async () => {
			await service.backup(fooFile, createTextBufferFactory('test').create(DefaultEndOfLine.LF).textBuffer.createSnapshot(false));
			const textFiles = await service.getBackups();
			assert.deepStrictEqual(textFiles.map(f => f.fsPath), [fooFile.fsPath]);
			await service.backup(barFile, createTextBufferFactory('test').create(DefaultEndOfLine.LF).textBuffer.createSnapshot(false));
			const textFiles_1 = await service.getBackups();
			assert.deepStrictEqual(textFiles_1.map(f => f.fsPath), [fooFile.fsPath, barFile.fsPath]);
		});

		test('("file") - untitled file', async () => {
			await service.backup(untitledFile, createTextBufferFactory('test').create(DefaultEndOfLine.LF).textBuffer.createSnapshot(false));
			const textFiles = await service.getBackups();
			assert.deepStrictEqual(textFiles.map(f => f.fsPath), [untitledFile.fsPath]);
		});

		test('("untitled") - untitled file', async () => {
			await service.backup(untitledFile, createTextBufferFactory('test').create(DefaultEndOfLine.LF).textBuffer.createSnapshot(false));
			const textFiles = await service.getBackups();
			assert.deepStrictEqual(textFiles.map(f => f.fsPath), ['Untitled-1']);
		});
	});

	suite('resolve', () => {

		interface IBackupTestMetaData {
			mtime?: number;
			size?: number;
			etag?: string;
			orphaned?: boolean;
		}

		test('should restore the original contents (untitled file)', async () => {
			const contents = 'test\nand more stuff';

			await testResolveBackup(untitledFile, contents);
		});

		test('should restore the original contents (untitled file with metadata)', async () => {
			const contents = 'test\nand more stuff';

			const meta = {
				etag: 'the Etag',
				size: 666,
				mtime: Date.now(),
				orphaned: true
			};

			await testResolveBackup(untitledFile, contents, meta);
		});

		test('should restore the original contents (text file)', async () => {
			const contents = [
				'Lorem ipsum ',
				'dolor öäü sit amet ',
				'consectetur ',
				'adipiscing ßß elit'
			].join('');

			await testResolveBackup(fooFile, contents);
		});

		test('should restore the original contents (text file - custom scheme)', async () => {
			const contents = [
				'Lorem ipsum ',
				'dolor öäü sit amet ',
				'consectetur ',
				'adipiscing ßß elit'
			].join('');

			await testResolveBackup(customFile, contents);
		});

		test('should restore the original contents (text file with metadata)', async () => {
			const contents = [
				'Lorem ipsum ',
				'dolor öäü sit amet ',
				'adipiscing ßß elit',
				'consectetur '
			].join('');

			const meta = {
				etag: 'theEtag',
				size: 888,
				mtime: Date.now(),
				orphaned: false
			};

			await testResolveBackup(fooFile, contents, meta);
		});

		test('should restore the original contents (text file with metadata changed once)', async () => {
			const contents = [
				'Lorem ipsum ',
				'dolor öäü sit amet ',
				'adipiscing ßß elit',
				'consectetur '
			].join('');

			const meta = {
				etag: 'theEtag',
				size: 888,
				mtime: Date.now(),
				orphaned: false
			};

			await testResolveBackup(fooFile, contents, meta);

			// Change meta and test again
			meta.size = 999;
			await testResolveBackup(fooFile, contents, meta);
		});

		test('should restore the original contents (text file with broken metadata)', async () => {
			const contents = [
				'Lorem ipsum ',
				'dolor öäü sit amet ',
				'adipiscing ßß elit',
				'consectetur '
			].join('');

			const meta = {
				etag: 'theEtag',
				size: 888,
				mtime: Date.now(),
				orphaned: false
			};

			await service.backup(fooFile, createTextBufferFactory(contents).create(DefaultEndOfLine.LF).textBuffer.createSnapshot(false), 1, meta);

			const fileContents = readFileSync(fooBackupPath).toString();
			assert.strictEqual(fileContents.indexOf(fooFile.toString()), 0);

			const metaIndex = fileContents.indexOf('{');
			const newFileContents = fileContents.substring(0, metaIndex) + '{{' + fileContents.substr(metaIndex);
			writeFileSync(fooBackupPath, newFileContents);

			const backup = await service.resolve(fooFile);
			assert.ok(backup);
			assert.strictEqual(contents, snapshotToString(backup!.value.create(isWindows ? DefaultEndOfLine.CRLF : DefaultEndOfLine.LF).textBuffer.createSnapshot(true)));
			assert.ok(!backup!.meta);
		});

		test('should restore the original contents (text file with metadata and fragment URI)', async () => {
			const contents = [
				'Lorem ipsum ',
				'dolor öäü sit amet ',
				'adipiscing ßß elit',
				'consectetur '
			].join('');

			const meta = {
				etag: 'theEtag',
				size: 888,
				mtime: Date.now(),
				orphaned: false
			};

			await testResolveBackup(customFileWithFragment, contents, meta);
		});

		test('should restore the original contents (text file with space in name with metadata)', async () => {
			const contents = [
				'Lorem ipsum ',
				'dolor öäü sit amet ',
				'adipiscing ßß elit',
				'consectetur '
			].join('');

			const meta = {
				etag: 'theEtag',
				size: 888,
				mtime: Date.now(),
				orphaned: false
			};

			await testResolveBackup(fooBarFile, contents, meta);
		});

		test('should restore the original contents (text file with too large metadata to persist)', async () => {
			const contents = [
				'Lorem ipsum ',
				'dolor öäü sit amet ',
				'adipiscing ßß elit',
				'consectetur '
			].join('');

			const meta = {
				etag: (new Array(100 * 1024)).join('Large String'),
				size: 888,
				mtime: Date.now(),
				orphaned: false
			};

			await testResolveBackup(fooBarFile, contents, meta, null);
		});

		test('should ignore invalid backups', async () => {
			const contents = 'test\nand more stuff';

			await service.backup(fooBarFile, createTextBufferFactory(contents).create(DefaultEndOfLine.LF).textBuffer.createSnapshot(false), 1);

			const backup = await service.resolve(fooBarFile);
			if (!backup) {
				throw new Error('Unexpected missing backup');
			}

			await service.fileService.writeFile(service.toBackupResource(fooBarFile), VSBuffer.fromString(''));

			let err: Error | undefined = undefined;
			try {
				await service.resolve<IBackupTestMetaData>(fooBarFile);
			} catch (error) {
				err = error;
			}

			assert.ok(!err);
		});

		async function testResolveBackup(resource: URI, contents: string, meta?: IBackupTestMetaData, expectedMeta?: IBackupTestMetaData | null) {
			if (typeof expectedMeta === 'undefined') {
				expectedMeta = meta;
			}

			await service.backup(resource, createTextBufferFactory(contents).create(DefaultEndOfLine.LF).textBuffer.createSnapshot(false), 1, meta);

			const backup = await service.resolve<IBackupTestMetaData>(resource);
			assert.ok(backup);
			assert.strictEqual(contents, snapshotToString(backup!.value.create(isWindows ? DefaultEndOfLine.CRLF : DefaultEndOfLine.LF).textBuffer.createSnapshot(true)));

			if (expectedMeta) {
				assert.strictEqual(backup!.meta!.etag, expectedMeta.etag);
				assert.strictEqual(backup!.meta!.size, expectedMeta.size);
				assert.strictEqual(backup!.meta!.mtime, expectedMeta.mtime);
				assert.strictEqual(backup!.meta!.orphaned, expectedMeta.orphaned);
			} else {
				assert.ok(!backup!.meta);
			}
		}
	});

	suite('BackupFilesModel', () => {

		test('simple', () => {
			const model = new BackupFilesModel(service.fileService);

			const resource1 = URI.file('test.html');

			assert.strictEqual(model.has(resource1), false);

			model.add(resource1);

			assert.strictEqual(model.has(resource1), true);
			assert.strictEqual(model.has(resource1, 0), true);
			assert.strictEqual(model.has(resource1, 1), false);
			assert.strictEqual(model.has(resource1, 1, { foo: 'bar' }), false);

			model.remove(resource1);

			assert.strictEqual(model.has(resource1), false);

			model.add(resource1);

			assert.strictEqual(model.has(resource1), true);
			assert.strictEqual(model.has(resource1, 0), true);
			assert.strictEqual(model.has(resource1, 1), false);

			model.clear();

			assert.strictEqual(model.has(resource1), false);

			model.add(resource1, 1);

			assert.strictEqual(model.has(resource1), true);
			assert.strictEqual(model.has(resource1, 0), false);
			assert.strictEqual(model.has(resource1, 1), true);

			const resource2 = URI.file('test1.html');
			const resource3 = URI.file('test2.html');
			const resource4 = URI.file('test3.html');

			model.add(resource2);
			model.add(resource3);
			model.add(resource4, undefined, { foo: 'bar' });

			assert.strictEqual(model.has(resource1), true);
			assert.strictEqual(model.has(resource2), true);
			assert.strictEqual(model.has(resource3), true);

			assert.strictEqual(model.has(resource4), true);
			assert.strictEqual(model.has(resource4, undefined, { foo: 'bar' }), true);
			assert.strictEqual(model.has(resource4, undefined, { bar: 'foo' }), false);

			const resource5 = URI.file('test4.html');
			model.move(resource4, resource5);
			assert.strictEqual(model.has(resource4), false);
			assert.strictEqual(model.has(resource5), true);
		});

		test('resolve', async () => {
			await promises.mkdir(dirname(fooBackupPath), { recursive: true });
			writeFileSync(fooBackupPath, 'foo');
			const model = new BackupFilesModel(service.fileService);

			await model.resolve(URI.file(workspaceBackupPath));
			assert.strictEqual(model.has(URI.file(fooBackupPath)), true);
		});

		test('get', () => {
			const model = new BackupFilesModel(service.fileService);

			assert.deepStrictEqual(model.get(), []);

			const file1 = URI.file('/root/file/foo.html');
			const file2 = URI.file('/root/file/bar.html');
			const untitled = URI.file('/root/untitled/bar.html');

			model.add(file1);
			model.add(file2);
			model.add(untitled);

			assert.deepStrictEqual(model.get().map(f => f.fsPath), [file1.fsPath, file2.fsPath, untitled.fsPath]);
		});
	});

	suite('Hash migration', () => {

		test('works', async () => {

			// Prepare backups of the old MD5 hash format
			mkdirSync(join(workspaceBackupPath, fooFile.scheme), { recursive: true });
			mkdirSync(join(workspaceBackupPath, untitledFile.scheme), { recursive: true });
			mkdirSync(join(workspaceBackupPath, customFile.scheme), { recursive: true });
			writeFileSync(join(workspaceBackupPath, fooFile.scheme, '8a8589a2f1c9444b89add38166f50229'), `${fooFile.toString()}\ntest file`);
			writeFileSync(join(workspaceBackupPath, untitledFile.scheme, '13264068d108c6901b3592ea654fcd57'), `${untitledFile.toString()}\ntest untitled`);
			writeFileSync(join(workspaceBackupPath, customFile.scheme, 'bf018572af7b38746b502893bd0adf6c'), `${customFile.toString()}\ntest custom`);

			service.reinitialize(URI.file(workspaceBackupPath));

			const backups = await service.getBackups();
			assert.strictEqual(backups.length, 3);
			assert.ok(backups.some(backup => isEqual(backup, fooFile)));
			assert.ok(backups.some(backup => isEqual(backup, untitledFile)));
			assert.ok(backups.some(backup => isEqual(backup, customFile)));

			assert.strictEqual(readdirSync(join(workspaceBackupPath, fooFile.scheme)).length, 1);
			assert.strictEqual(existsSync(fooBackupPath), true);
			assert.strictEqual(readFileSync(fooBackupPath).toString(), `${fooFile.toString()}\ntest file`);
			assert.ok(service.hasBackupSync(fooFile));

			assert.strictEqual(readdirSync(join(workspaceBackupPath, untitledFile.scheme)).length, 1);
			assert.strictEqual(existsSync(untitledBackupPath), true);
			assert.strictEqual(readFileSync(untitledBackupPath).toString(), `${untitledFile.toString()}\ntest untitled`);
			assert.ok(service.hasBackupSync(untitledFile));

			assert.strictEqual(readdirSync(join(workspaceBackupPath, customFile.scheme)).length, 1);
			assert.strictEqual(existsSync(customFileBackupPath), true);
			assert.strictEqual(readFileSync(customFileBackupPath).toString(), `${customFile.toString()}\ntest custom`);
			assert.ok(service.hasBackupSync(customFile));
		});
	});
});
