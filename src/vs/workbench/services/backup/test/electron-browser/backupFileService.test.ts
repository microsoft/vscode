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
import { BackupFilesModel, hashIdentifier } from 'vs/workbench/services/backup/common/backupFileService';
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
import { TestProductService, toTypedBackup, toUntypedBackup } from 'vs/workbench/test/browser/workbenchTestServices';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { insert } from 'vs/base/common/arrays';
import { hash } from 'vs/base/common/hash';
import { isEqual } from 'vs/base/common/resources';
import { BackupIdentifier, IBackupMeta } from 'vs/workbench/services/backup/common/backup';

class TestWorkbenchEnvironmentService extends NativeWorkbenchEnvironmentService {

	constructor(testDir: string, backupPath: string) {
		super({ ...TestWorkbenchConfiguration, backupPath, 'user-data-dir': testDir }, TestProductService);
	}
}

export class NodeTestBackupFileService extends NativeBackupFileService {

	override readonly fileService: IFileService;

	private backupResourceJoiners: Function[];
	private discardBackupJoiners: Function[];
	discardedBackups: BackupIdentifier[];
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

	async override backup(identifier: BackupIdentifier, content?: ITextSnapshot, versionId?: number, meta?: any, token?: CancellationToken): Promise<void> {
		const p = super.backup(identifier, content, versionId, meta, token);
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

	async override discardBackup(identifier: BackupIdentifier): Promise<void> {
		await super.discardBackup(identifier);
		this.discardedBackups.push(identifier);

		while (this.discardBackupJoiners.length) {
			this.discardBackupJoiners.pop()!();
		}
	}

	async getBackupContents(identifier: BackupIdentifier): Promise<string> {
		const backupResource = this.toBackupResource(identifier);

		const fileContents = await this.fileService.readFile(backupResource);

		return fileContents.value.toString();
	}
}

suite('BackupFileService', () => {

	let testDir: string;
	let backupHome: string;
	let workspacesJsonPath: string;
	let workspaceBackupPath: string;

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
		workspaceBackupPath = join(backupHome, hash(workspaceResource.fsPath).toString(16));

		service = new NodeTestBackupFileService(testDir, workspaceBackupPath);

		await promises.mkdir(backupHome, { recursive: true });

		return writeFile(workspacesJsonPath, '');
	});

	teardown(() => {
		return rimraf(testDir);
	});

	suite('hashIdentifier', () => {
		test('should correctly hash the identifier for untitled scheme URIs', () => {
			const uri = URI.from({ scheme: Schemas.untitled, path: 'Untitled-1' });

			// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
			// If these hashes change people will lose their backed up files
			// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

			const untypedBackupHash = hashIdentifier(toUntypedBackup(uri));
			assert.strictEqual(untypedBackupHash, '-7f9c1a2e');
			assert.strictEqual(untypedBackupHash, hash(uri.fsPath).toString(16));

			const typedBackupHash = hashIdentifier({ typeId: 'hashTest', resource: uri });
			assert.strictEqual(typedBackupHash, '-8ad5f4f');

			// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
			// If these hashes collide people will lose their backed up files
			// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

			assert.notStrictEqual(untypedBackupHash, typedBackupHash);
		});

		test('should correctly hash the identifier for file scheme URIs', () => {
			const uri = URI.file('/foo');

			// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
			// If these hashes change people will lose their backed up files
			// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

			const untypedBackupHash = hashIdentifier(toUntypedBackup(uri));
			if (isWindows) {
				assert.strictEqual(untypedBackupHash, '20ffaa13');
			} else {
				assert.strictEqual(untypedBackupHash, '20eb3560');
			}
			assert.strictEqual(untypedBackupHash, hash(uri.fsPath).toString(16));

			const typedBackupHash = hashIdentifier({ typeId: 'hashTest', resource: uri });
			if (isWindows) {
				//TODO@bpasero fill in
			} else {
				assert.strictEqual(typedBackupHash, '51e56bf');
			}

			// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
			// If these hashes collide people will lose their backed up files
			// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

			assert.notStrictEqual(untypedBackupHash, typedBackupHash);
		});

		test('should correctly hash the identifier for custom scheme URIs', () => {
			const uri = URI.from({
				scheme: 'vscode-custom',
				path: 'somePath'
			});

			// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
			// If these hashes change people will lose their backed up files
			// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

			const untypedBackupHash = hashIdentifier(toUntypedBackup(uri));
			assert.strictEqual(untypedBackupHash, '-44972d98');
			assert.strictEqual(untypedBackupHash, hash(uri.toString()).toString(16));

			const typedBackupHash = hashIdentifier({ typeId: 'hashTest', resource: uri });
			assert.strictEqual(typedBackupHash, '502149c7');

			// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
			// If these hashes collide people will lose their backed up files
			// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

			assert.notStrictEqual(untypedBackupHash, typedBackupHash);
		});
	});

	suite('getBackupResource', () => {
		test('should get the correct backup path for text files', () => {

			// Format should be: <backupHome>/<workspaceHash>/<scheme>/<filePathHash>
			const backupResource = fooFile;
			const workspaceHash = hash(workspaceResource.fsPath).toString(16);

			// No Type ID
			let backupId = toUntypedBackup(backupResource);
			let filePathHash = hashIdentifier(backupId);
			let expectedPath = URI.file(join(backupHome, workspaceHash, Schemas.file, filePathHash)).with({ scheme: Schemas.userData }).toString();
			assert.strictEqual(service.toBackupResource(backupId).toString(), expectedPath);

			// With Type ID
			backupId = toTypedBackup(backupResource);
			filePathHash = hashIdentifier(backupId);
			expectedPath = URI.file(join(backupHome, workspaceHash, Schemas.file, filePathHash)).with({ scheme: Schemas.userData }).toString();
			assert.strictEqual(service.toBackupResource(backupId).toString(), expectedPath);
		});

		test('should get the correct backup path for untitled files', () => {

			// Format should be: <backupHome>/<workspaceHash>/<scheme>/<filePathHash>
			const backupResource = URI.from({ scheme: Schemas.untitled, path: 'Untitled-1' });
			const workspaceHash = hash(workspaceResource.fsPath).toString(16);

			// No Type ID
			let backupId = toUntypedBackup(backupResource);
			let filePathHash = hashIdentifier(backupId);
			let expectedPath = URI.file(join(backupHome, workspaceHash, Schemas.untitled, filePathHash)).with({ scheme: Schemas.userData }).toString();
			assert.strictEqual(service.toBackupResource(backupId).toString(), expectedPath);

			// With Type ID
			backupId = toTypedBackup(backupResource);
			filePathHash = hashIdentifier(backupId);
			expectedPath = URI.file(join(backupHome, workspaceHash, Schemas.untitled, filePathHash)).with({ scheme: Schemas.userData }).toString();
			assert.strictEqual(service.toBackupResource(backupId).toString(), expectedPath);
		});

		test('should get the correct backup path for custom files', () => {

			// Format should be: <backupHome>/<workspaceHash>/<scheme>/<filePathHash>
			const backupResource = URI.from({ scheme: 'custom', path: 'custom/file.txt' });
			const workspaceHash = hash(workspaceResource.fsPath).toString(16);

			// No Type ID
			let backupId = toUntypedBackup(backupResource);
			let filePathHash = hashIdentifier(backupId);
			let expectedPath = URI.file(join(backupHome, workspaceHash, 'custom', filePathHash)).with({ scheme: Schemas.userData }).toString();
			assert.strictEqual(service.toBackupResource(backupId).toString(), expectedPath);

			// With Type ID
			backupId = toTypedBackup(backupResource);
			filePathHash = hashIdentifier(backupId);
			expectedPath = URI.file(join(backupHome, workspaceHash, 'custom', filePathHash)).with({ scheme: Schemas.userData }).toString();
			assert.strictEqual(service.toBackupResource(backupId).toString(), expectedPath);
		});
	});

	suite('backup', () => {

		function toExpectedPreamble(identifier: BackupIdentifier, content = '', meta?: object): string {
			return `${identifier.resource.toString()} ${JSON.stringify({ ...meta, typeId: identifier.typeId })}\n${content}`;
		}

		test('no text', async () => {
			const identifier = toUntypedBackup(fooFile);
			const backupPath = join(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));

			await service.backup(identifier);
			assert.strictEqual(readdirSync(join(workspaceBackupPath, 'file')).length, 1);
			assert.strictEqual(existsSync(backupPath), true);
			assert.strictEqual(readFileSync(backupPath).toString(), toExpectedPreamble(identifier));
			assert.ok(service.hasBackupSync(identifier));
		});

		test('text file', async () => {
			const identifier = toUntypedBackup(fooFile);
			const backupPath = join(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));

			await service.backup(identifier, createTextBufferFactory('test').create(DefaultEndOfLine.LF).textBuffer.createSnapshot(false));
			assert.strictEqual(readdirSync(join(workspaceBackupPath, 'file')).length, 1);
			assert.strictEqual(existsSync(backupPath), true);
			assert.strictEqual(readFileSync(backupPath).toString(), toExpectedPreamble(identifier, 'test'));
			assert.ok(service.hasBackupSync(identifier));
		});

		test('text file (with version)', async () => {
			const identifier = toUntypedBackup(fooFile);
			const backupPath = join(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));

			await service.backup(identifier, createTextBufferFactory('test').create(DefaultEndOfLine.LF).textBuffer.createSnapshot(false), 666);
			assert.strictEqual(readdirSync(join(workspaceBackupPath, 'file')).length, 1);
			assert.strictEqual(existsSync(backupPath), true);
			assert.strictEqual(readFileSync(backupPath).toString(), toExpectedPreamble(identifier, 'test'));
			assert.ok(!service.hasBackupSync(identifier, 555));
			assert.ok(service.hasBackupSync(identifier, 666));
		});

		test('text file (with meta)', async () => {
			const identifier = toUntypedBackup(fooFile);
			const backupPath = join(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));
			const meta = { etag: '678', orphaned: true };

			await service.backup(identifier, createTextBufferFactory('test').create(DefaultEndOfLine.LF).textBuffer.createSnapshot(false), undefined, meta);
			assert.strictEqual(readdirSync(join(workspaceBackupPath, 'file')).length, 1);
			assert.strictEqual(existsSync(backupPath), true);
			assert.strictEqual(readFileSync(backupPath).toString(), toExpectedPreamble(identifier, 'test', meta));
			assert.ok(service.hasBackupSync(identifier));
		});

		test('text file with whitespace in name and type (with meta)', async () => {
			let fileWithSpace = URI.file(isWindows ? 'c:\\Foo \n Bar' : '/Foo \n Bar');
			const identifier = toTypedBackup(fileWithSpace, ' test id \n');
			const backupPath = join(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));
			const meta = { etag: '678', orphaned: true };

			await service.backup(identifier, createTextBufferFactory('test').create(DefaultEndOfLine.LF).textBuffer.createSnapshot(false), undefined, meta);
			assert.strictEqual(readdirSync(join(workspaceBackupPath, 'file')).length, 1);
			assert.strictEqual(existsSync(backupPath), true);
			assert.strictEqual(readFileSync(backupPath).toString(), toExpectedPreamble(identifier, 'test', meta));
			assert.ok(service.hasBackupSync(identifier));
		});

		test('untitled file', async () => {
			const identifier = toUntypedBackup(untitledFile);
			const backupPath = join(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));

			await service.backup(identifier, createTextBufferFactory('test').create(DefaultEndOfLine.LF).textBuffer.createSnapshot(false));
			assert.strictEqual(readdirSync(join(workspaceBackupPath, 'untitled')).length, 1);
			assert.strictEqual(existsSync(backupPath), true);
			assert.strictEqual(readFileSync(backupPath).toString(), toExpectedPreamble(identifier, 'test'));
			assert.ok(service.hasBackupSync(identifier));
		});

		test('text file (ITextSnapshot)', async () => {
			const identifier = toUntypedBackup(fooFile);
			const backupPath = join(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));
			const model = createTextModel('test');

			await service.backup(identifier, model.createSnapshot());
			assert.strictEqual(readdirSync(join(workspaceBackupPath, 'file')).length, 1);
			assert.strictEqual(existsSync(backupPath), true);
			assert.strictEqual(readFileSync(backupPath).toString(), toExpectedPreamble(identifier, 'test'));
			assert.ok(service.hasBackupSync(identifier));

			model.dispose();
		});

		test('untitled file (ITextSnapshot)', async () => {
			const identifier = toUntypedBackup(untitledFile);
			const backupPath = join(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));
			const model = createTextModel('test');

			await service.backup(identifier, model.createSnapshot());
			assert.strictEqual(readdirSync(join(workspaceBackupPath, 'untitled')).length, 1);
			assert.strictEqual(existsSync(backupPath), true);
			assert.strictEqual(readFileSync(backupPath).toString(), toExpectedPreamble(identifier, 'test'));

			model.dispose();
		});

		test('text file (large file, ITextSnapshot)', async () => {
			const identifier = toUntypedBackup(fooFile);
			const backupPath = join(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));
			const largeString = (new Array(10 * 1024)).join('Large String\n');
			const model = createTextModel(largeString);

			await service.backup(identifier, model.createSnapshot());
			assert.strictEqual(readdirSync(join(workspaceBackupPath, 'file')).length, 1);
			assert.strictEqual(existsSync(backupPath), true);
			assert.strictEqual(readFileSync(backupPath).toString(), toExpectedPreamble(identifier, largeString));
			assert.ok(service.hasBackupSync(identifier));

			model.dispose();
		});

		test('untitled file (large file, ITextSnapshot)', async () => {
			const identifier = toUntypedBackup(untitledFile);
			const backupPath = join(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));
			const largeString = (new Array(10 * 1024)).join('Large String\n');
			const model = createTextModel(largeString);

			await service.backup(identifier, model.createSnapshot());
			assert.strictEqual(readdirSync(join(workspaceBackupPath, 'untitled')).length, 1);
			assert.strictEqual(existsSync(backupPath), true);
			assert.strictEqual(readFileSync(backupPath).toString(), toExpectedPreamble(identifier, largeString));
			assert.ok(service.hasBackupSync(identifier));

			model.dispose();
		});

		test('cancellation', async () => {
			const identifier = toUntypedBackup(fooFile);
			const backupPath = join(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));

			const cts = new CancellationTokenSource();
			const promise = service.backup(identifier, undefined, undefined, undefined, cts.token);
			cts.cancel();
			await promise;

			assert.strictEqual(existsSync(backupPath), false);
			assert.ok(!service.hasBackupSync(identifier));
		});

		test('multiple same resource, different type id', async () => {
			const backupId1 = toUntypedBackup(fooFile);
			const backupId2 = toTypedBackup(fooFile, 'type1');
			const backupId3 = toTypedBackup(fooFile, 'type2');

			await service.backup(backupId1);
			await service.backup(backupId2);
			await service.backup(backupId3);

			assert.strictEqual(readdirSync(join(workspaceBackupPath, 'file')).length, 3);

			for (const backupId of [backupId1, backupId2, backupId3]) {
				const fooBackupPath = join(workspaceBackupPath, backupId.resource.scheme, hashIdentifier(backupId));
				assert.strictEqual(existsSync(fooBackupPath), true);
				assert.strictEqual(readFileSync(fooBackupPath).toString(), toExpectedPreamble(backupId));
				assert.ok(service.hasBackupSync(backupId));
			}
		});
	});

	suite('discardBackup', () => {

		test('text file', async () => {
			const identifier = toUntypedBackup(fooFile);
			const backupPath = join(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));

			await service.backup(identifier, createTextBufferFactory('test').create(DefaultEndOfLine.LF).textBuffer.createSnapshot(false));
			assert.strictEqual(readdirSync(join(workspaceBackupPath, 'file')).length, 1);
			assert.ok(service.hasBackupSync(identifier));

			await service.discardBackup(identifier);
			assert.strictEqual(existsSync(backupPath), false);
			assert.strictEqual(readdirSync(join(workspaceBackupPath, 'file')).length, 0);
			assert.ok(!service.hasBackupSync(identifier));
		});

		test('untitled file', async () => {
			const identifier = toUntypedBackup(untitledFile);
			const backupPath = join(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));

			await service.backup(identifier, createTextBufferFactory('test').create(DefaultEndOfLine.LF).textBuffer.createSnapshot(false));
			assert.strictEqual(readdirSync(join(workspaceBackupPath, 'untitled')).length, 1);

			await service.discardBackup(identifier);
			assert.strictEqual(existsSync(backupPath), false);
			assert.strictEqual(readdirSync(join(workspaceBackupPath, 'untitled')).length, 0);
		});

		test('multiple same resource, different type id', async () => {
			const backupId1 = toUntypedBackup(fooFile);
			const backupId2 = toTypedBackup(fooFile, 'type1');
			const backupId3 = toTypedBackup(fooFile, 'type2');

			await service.backup(backupId1);
			await service.backup(backupId2);
			await service.backup(backupId3);

			assert.strictEqual(readdirSync(join(workspaceBackupPath, 'file')).length, 3);

			for (const backupId of [backupId1, backupId2, backupId3]) {
				const backupPath = join(workspaceBackupPath, backupId.resource.scheme, hashIdentifier(backupId));
				await service.discardBackup(backupId);
				assert.strictEqual(existsSync(backupPath), false);
			}
			assert.strictEqual(readdirSync(join(workspaceBackupPath, 'file')).length, 0);
		});
	});

	suite('discardBackups', () => {
		test('text file', async () => {
			const backupId1 = toUntypedBackup(fooFile);
			const backupId2 = toUntypedBackup(barFile);
			const backupId3 = toTypedBackup(barFile);

			await service.backup(backupId1, createTextBufferFactory('test').create(DefaultEndOfLine.LF).textBuffer.createSnapshot(false));
			assert.strictEqual(readdirSync(join(workspaceBackupPath, 'file')).length, 1);

			await service.backup(backupId2, createTextBufferFactory('test').create(DefaultEndOfLine.LF).textBuffer.createSnapshot(false));
			assert.strictEqual(readdirSync(join(workspaceBackupPath, 'file')).length, 2);

			await service.backup(backupId3, createTextBufferFactory('test').create(DefaultEndOfLine.LF).textBuffer.createSnapshot(false));
			assert.strictEqual(readdirSync(join(workspaceBackupPath, 'file')).length, 3);

			await service.discardBackups();
			for (const backupId of [backupId1, backupId2, backupId3]) {
				const backupPath = join(workspaceBackupPath, backupId.resource.scheme, hashIdentifier(backupId));
				assert.strictEqual(existsSync(backupPath), false);
			}

			assert.strictEqual(existsSync(join(workspaceBackupPath, 'file')), false);
		});

		test('untitled file', async () => {
			const backupId = toUntypedBackup(untitledFile);
			const backupPath = join(workspaceBackupPath, backupId.resource.scheme, hashIdentifier(backupId));

			await service.backup(backupId, createTextBufferFactory('test').create(DefaultEndOfLine.LF).textBuffer.createSnapshot(false));
			assert.strictEqual(readdirSync(join(workspaceBackupPath, 'untitled')).length, 1);

			await service.discardBackups();
			assert.strictEqual(existsSync(backupPath), false);
			assert.strictEqual(existsSync(join(workspaceBackupPath, 'untitled')), false);
		});

		test('can backup after discarding all', async () => {
			await service.discardBackups();
			await service.backup(toUntypedBackup(untitledFile), createTextBufferFactory('test').create(DefaultEndOfLine.LF).textBuffer.createSnapshot(false));
			assert.strictEqual(existsSync(workspaceBackupPath), true);
		});
	});

	suite('getBackups', () => {
		test('text file', async () => {
			await service.backup(toUntypedBackup(fooFile), createTextBufferFactory('test').create(DefaultEndOfLine.LF).textBuffer.createSnapshot(false));
			await service.backup(toTypedBackup(fooFile, 'type1'), createTextBufferFactory('test').create(DefaultEndOfLine.LF).textBuffer.createSnapshot(false));
			await service.backup(toTypedBackup(fooFile, 'type2'), createTextBufferFactory('test').create(DefaultEndOfLine.LF).textBuffer.createSnapshot(false));

			let backups = await service.getBackups();
			assert.strictEqual(backups.length, 3);

			for (const backup of backups) {
				if (backup.typeId === '') {
					assert.strictEqual(backup.resource.toString(), fooFile.toString());
				} else if (backup.typeId === 'type1') {
					assert.strictEqual(backup.resource.toString(), fooFile.toString());
				} else if (backup.typeId === 'type2') {
					assert.strictEqual(backup.resource.toString(), fooFile.toString());
				} else {
					assert.fail('Unexpected backup');
				}
			}

			await service.backup(toUntypedBackup(barFile), createTextBufferFactory('test').create(DefaultEndOfLine.LF).textBuffer.createSnapshot(false));

			backups = await service.getBackups();
			assert.strictEqual(backups.length, 4);
		});

		test('untitled file', async () => {
			await service.backup(toUntypedBackup(untitledFile), createTextBufferFactory('test').create(DefaultEndOfLine.LF).textBuffer.createSnapshot(false));
			await service.backup(toTypedBackup(untitledFile, 'type1'), createTextBufferFactory('test').create(DefaultEndOfLine.LF).textBuffer.createSnapshot(false));
			await service.backup(toTypedBackup(untitledFile, 'type2'), createTextBufferFactory('test').create(DefaultEndOfLine.LF).textBuffer.createSnapshot(false));

			const backups = await service.getBackups();
			assert.strictEqual(backups.length, 3);

			for (const backup of backups) {
				if (backup.typeId === '') {
					assert.strictEqual(backup.resource.toString(), untitledFile.toString());
				} else if (backup.typeId === 'type1') {
					assert.strictEqual(backup.resource.toString(), untitledFile.toString());
				} else if (backup.typeId === 'type2') {
					assert.strictEqual(backup.resource.toString(), untitledFile.toString());
				} else {
					assert.fail('Unexpected backup');
				}
			}
		});
	});

	suite('resolve', () => {

		interface IBackupTestMetaData extends IBackupMeta {
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
			await testShouldRestoreOriginalContents(toUntypedBackup(fooFile));
			await testShouldRestoreOriginalContents(toTypedBackup(fooFile));
		});

		async function testShouldRestoreOriginalContents(identifier: BackupIdentifier): Promise<void> {
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

			await service.backup(identifier, createTextBufferFactory(contents).create(DefaultEndOfLine.LF).textBuffer.createSnapshot(false), 1, meta);

			const backupPath = join(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));

			const fileContents = readFileSync(backupPath).toString();
			assert.strictEqual(fileContents.indexOf(identifier.resource.toString()), 0);

			const metaIndex = fileContents.indexOf('{');
			const newFileContents = fileContents.substring(0, metaIndex) + '{{' + fileContents.substr(metaIndex);
			writeFileSync(backupPath, newFileContents);

			const backup = await service.resolve(identifier);
			assert.ok(backup);
			assert.strictEqual(contents, snapshotToString(backup.value.create(isWindows ? DefaultEndOfLine.CRLF : DefaultEndOfLine.LF).textBuffer.createSnapshot(true)));
			assert.strictEqual(backup.meta, undefined);
		}

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

			await testResolveBackup(fooBarFile, contents, meta, true);
		});

		test('should ignore invalid backups', async () => {
			const contents = 'test\nand more stuff';

			await service.backup(toUntypedBackup(fooBarFile), createTextBufferFactory(contents).create(DefaultEndOfLine.LF).textBuffer.createSnapshot(false), 1);

			const backup = await service.resolve(toUntypedBackup(fooBarFile));
			if (!backup) {
				throw new Error('Unexpected missing backup');
			}

			await service.fileService.writeFile(service.toBackupResource(toUntypedBackup(fooBarFile)), VSBuffer.fromString(''));

			let err: Error | undefined = undefined;
			try {
				await service.resolve<IBackupTestMetaData>(toUntypedBackup(fooBarFile));
			} catch (error) {
				err = error;
			}

			assert.ok(!err);
		});

		async function testResolveBackup(resource: URI, contents: string, meta?: IBackupTestMetaData, expectNoMeta?: boolean) {
			await doTestResolveBackup(toUntypedBackup(resource), contents, meta, expectNoMeta);
			await doTestResolveBackup(toTypedBackup(resource), contents, meta, expectNoMeta);
		}

		async function doTestResolveBackup(identifier: BackupIdentifier, contents: string, meta?: IBackupTestMetaData, expectNoMeta?: boolean) {
			await service.backup(identifier, createTextBufferFactory(contents).create(DefaultEndOfLine.LF).textBuffer.createSnapshot(false), 1, meta);

			const backup = await service.resolve<IBackupTestMetaData>(identifier);
			assert.ok(backup);
			assert.strictEqual(contents, snapshotToString(backup.value.create(isWindows ? DefaultEndOfLine.CRLF : DefaultEndOfLine.LF).textBuffer.createSnapshot(true)));

			if (expectNoMeta || !meta) {
				assert.strictEqual(backup.meta, undefined);
			} else {
				assert.ok(backup.meta);
				assert.strictEqual(backup.meta.etag, meta.etag);
				assert.strictEqual(backup.meta.size, meta.size);
				assert.strictEqual(backup.meta.mtime, meta.mtime);
				assert.strictEqual(backup.meta.orphaned, meta.orphaned);

				assert.strictEqual(Object.keys(meta).length, Object.keys(backup.meta).length);
			}
		}
	});

	suite('BackupFilesModel', () => {

		test('simple', async () => {
			const model = await BackupFilesModel.create(service.fileService, URI.file(workspaceBackupPath));

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
			const fooBackupPath = join(workspaceBackupPath, fooFile.scheme, hashIdentifier(toUntypedBackup(fooFile)));
			await promises.mkdir(dirname(fooBackupPath), { recursive: true });
			writeFileSync(fooBackupPath, 'foo');
			const model = await BackupFilesModel.create(service.fileService, URI.file(workspaceBackupPath));

			await model.resolve(URI.file(workspaceBackupPath));
			assert.strictEqual(model.has(URI.file(fooBackupPath)), true);
		});

		test('get', async () => {
			const model = await BackupFilesModel.create(service.fileService, URI.file(workspaceBackupPath));

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
			const fooBackupId = toUntypedBackup(fooFile);
			const untitledBackupId = toUntypedBackup(untitledFile);
			const customBackupId = toUntypedBackup(customFile);

			const fooBackupPath = join(workspaceBackupPath, fooFile.scheme, hashIdentifier(fooBackupId));
			const untitledBackupPath = join(workspaceBackupPath, untitledFile.scheme, hashIdentifier(untitledBackupId));
			const customFileBackupPath = join(workspaceBackupPath, customFile.scheme, hashIdentifier(customBackupId));

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
			assert.ok(backups.some(backup => isEqual(backup.resource, fooFile)));
			assert.ok(backups.some(backup => isEqual(backup.resource, untitledFile)));
			assert.ok(backups.some(backup => isEqual(backup.resource, customFile)));

			assert.strictEqual(readdirSync(join(workspaceBackupPath, fooFile.scheme)).length, 1);
			assert.strictEqual(existsSync(fooBackupPath), true);
			assert.strictEqual(readFileSync(fooBackupPath).toString(), `${fooFile.toString()}\ntest file`);
			assert.ok(service.hasBackupSync(fooBackupId));

			assert.strictEqual(readdirSync(join(workspaceBackupPath, untitledFile.scheme)).length, 1);
			assert.strictEqual(existsSync(untitledBackupPath), true);
			assert.strictEqual(readFileSync(untitledBackupPath).toString(), `${untitledFile.toString()}\ntest untitled`);
			assert.ok(service.hasBackupSync(untitledBackupId));

			assert.strictEqual(readdirSync(join(workspaceBackupPath, customFile.scheme)).length, 1);
			assert.strictEqual(existsSync(customFileBackupPath), true);
			assert.strictEqual(readFileSync(customFileBackupPath).toString(), `${customFile.toString()}\ntest custom`);
			assert.ok(service.hasBackupSync(customBackupId));
		});
	});

	suite('typeId migration', () => {

		test('works (when meta is missing)', async () => {
			const fooBackupId = toUntypedBackup(fooFile);
			const untitledBackupId = toUntypedBackup(untitledFile);
			const customBackupId = toUntypedBackup(customFile);

			const fooBackupPath = join(workspaceBackupPath, fooFile.scheme, hashIdentifier(fooBackupId));
			const untitledBackupPath = join(workspaceBackupPath, untitledFile.scheme, hashIdentifier(untitledBackupId));
			const customFileBackupPath = join(workspaceBackupPath, customFile.scheme, hashIdentifier(customBackupId));

			// Prepare backups of the old format without meta
			mkdirSync(join(workspaceBackupPath, fooFile.scheme), { recursive: true });
			mkdirSync(join(workspaceBackupPath, untitledFile.scheme), { recursive: true });
			mkdirSync(join(workspaceBackupPath, customFile.scheme), { recursive: true });
			writeFileSync(fooBackupPath, `${fooFile.toString()}\ntest file`);
			writeFileSync(untitledBackupPath, `${untitledFile.toString()}\ntest untitled`);
			writeFileSync(customFileBackupPath, `${customFile.toString()}\ntest custom`);

			service.reinitialize(URI.file(workspaceBackupPath));

			const backups = await service.getBackups();
			assert.strictEqual(backups.length, 3);
			assert.ok(backups.some(backup => isEqual(backup.resource, fooFile)));
			assert.ok(backups.some(backup => isEqual(backup.resource, untitledFile)));
			assert.ok(backups.some(backup => isEqual(backup.resource, customFile)));
			assert.ok(backups.every(backup => backup.typeId === ''));
		});

		test('works (when typeId in meta is missing)', async () => {
			const fooBackupId = toUntypedBackup(fooFile);
			const untitledBackupId = toUntypedBackup(untitledFile);
			const customBackupId = toUntypedBackup(customFile);

			const fooBackupPath = join(workspaceBackupPath, fooFile.scheme, hashIdentifier(fooBackupId));
			const untitledBackupPath = join(workspaceBackupPath, untitledFile.scheme, hashIdentifier(untitledBackupId));
			const customFileBackupPath = join(workspaceBackupPath, customFile.scheme, hashIdentifier(customBackupId));

			// Prepare backups of the old format without meta
			mkdirSync(join(workspaceBackupPath, fooFile.scheme), { recursive: true });
			mkdirSync(join(workspaceBackupPath, untitledFile.scheme), { recursive: true });
			mkdirSync(join(workspaceBackupPath, customFile.scheme), { recursive: true });
			writeFileSync(fooBackupPath, `${fooFile.toString()} ${JSON.stringify({ foo: 'bar' })}\ntest file`);
			writeFileSync(untitledBackupPath, `${untitledFile.toString()} ${JSON.stringify({ foo: 'bar' })}\ntest untitled`);
			writeFileSync(customFileBackupPath, `${customFile.toString()} ${JSON.stringify({ foo: 'bar' })}\ntest custom`);

			service.reinitialize(URI.file(workspaceBackupPath));

			const backups = await service.getBackups();
			assert.strictEqual(backups.length, 3);
			assert.ok(backups.some(backup => isEqual(backup.resource, fooFile)));
			assert.ok(backups.some(backup => isEqual(backup.resource, untitledFile)));
			assert.ok(backups.some(backup => isEqual(backup.resource, customFile)));
			assert.ok(backups.every(backup => backup.typeId === ''));
		});
	});
});
