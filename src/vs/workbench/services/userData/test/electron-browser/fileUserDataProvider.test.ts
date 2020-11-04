/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as os from 'os';
import * as path from 'vs/base/common/path';
import * as uuid from 'vs/base/common/uuid';
import { IFileService, FileChangeType, IFileChange, IFileSystemProviderWithFileReadWriteCapability, IStat, FileType, FileSystemProviderCapabilities } from 'vs/platform/files/common/files';
import { FileService } from 'vs/platform/files/common/fileService';
import { NullLogService } from 'vs/platform/log/common/log';
import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { FileUserDataProvider } from 'vs/workbench/services/userData/common/fileUserDataProvider';
import { joinPath, dirname } from 'vs/base/common/resources';
import { VSBuffer } from 'vs/base/common/buffer';
import { DiskFileSystemProvider } from 'vs/platform/files/node/diskFileSystemProvider';
import { DisposableStore, IDisposable, Disposable } from 'vs/base/common/lifecycle';
import { BrowserWorkbenchEnvironmentService } from 'vs/workbench/services/environment/browser/environmentService';
import { Emitter, Event } from 'vs/base/common/event';
import { timeout } from 'vs/base/common/async';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { TestProductService } from 'vs/workbench/test/browser/workbenchTestServices';

suite('FileUserDataProvider', () => {

	let testObject: IFileService;
	let rootResource: URI;
	let userDataHomeOnDisk: URI;
	let backupWorkspaceHomeOnDisk: URI;
	let environmentService: IWorkbenchEnvironmentService;
	const disposables = new DisposableStore();
	let fileUserDataProvider: FileUserDataProvider;

	setup(async () => {
		const logService = new NullLogService();
		testObject = new FileService(logService);
		disposables.add(testObject);

		const diskFileSystemProvider = new DiskFileSystemProvider(logService);
		disposables.add(diskFileSystemProvider);
		disposables.add(testObject.registerProvider(Schemas.file, diskFileSystemProvider));

		const workspaceId = 'workspaceId';
		environmentService = new BrowserWorkbenchEnvironmentService({ remoteAuthority: 'remote', workspaceId, logsPath: URI.file('logFile') }, TestProductService);

		rootResource = URI.file(path.join(os.tmpdir(), 'vsctests', uuid.generateUuid()));
		userDataHomeOnDisk = joinPath(rootResource, 'user');
		const backupHome = joinPath(rootResource, 'Backups');
		backupWorkspaceHomeOnDisk = joinPath(backupHome, workspaceId);
		await Promise.all([testObject.createFolder(userDataHomeOnDisk), testObject.createFolder(backupWorkspaceHomeOnDisk)]);

		fileUserDataProvider = new FileUserDataProvider(userDataHomeOnDisk, backupWorkspaceHomeOnDisk, diskFileSystemProvider, environmentService, logService);
		disposables.add(fileUserDataProvider);
		disposables.add(testObject.registerProvider(Schemas.userData, fileUserDataProvider));
	});

	teardown(async () => {
		fileUserDataProvider.dispose(); // need to dispose first, otherwise del will fail (https://github.com/microsoft/vscode/issues/106283)
		await testObject.del(rootResource, { recursive: true });
		disposables.clear();
	});

	test('exists return false when file does not exist', async () => {
		const exists = await testObject.exists(environmentService.settingsResource);
		assert.equal(exists, false);
	});

	test('read file throws error if not exist', async () => {
		try {
			await testObject.readFile(environmentService.settingsResource);
			assert.fail('Should fail since file does not exist');
		} catch (e) { }
	});

	test('read existing file', async () => {
		await testObject.writeFile(joinPath(userDataHomeOnDisk, 'settings.json'), VSBuffer.fromString('{}'));
		const result = await testObject.readFile(environmentService.settingsResource);
		assert.equal(result.value, '{}');
	});

	test('create file', async () => {
		const resource = environmentService.settingsResource;
		const actual1 = await testObject.createFile(resource, VSBuffer.fromString('{}'));
		assert.equal(actual1.resource.toString(), resource.toString());
		const actual2 = await testObject.readFile(joinPath(userDataHomeOnDisk, 'settings.json'));
		assert.equal(actual2.value.toString(), '{}');
	});

	test('write file creates the file if not exist', async () => {
		const resource = environmentService.settingsResource;
		const actual1 = await testObject.writeFile(resource, VSBuffer.fromString('{}'));
		assert.equal(actual1.resource.toString(), resource.toString());
		const actual2 = await testObject.readFile(joinPath(userDataHomeOnDisk, 'settings.json'));
		assert.equal(actual2.value.toString(), '{}');
	});

	test('write to existing file', async () => {
		const resource = environmentService.settingsResource;
		await testObject.writeFile(joinPath(userDataHomeOnDisk, 'settings.json'), VSBuffer.fromString('{}'));
		const actual1 = await testObject.writeFile(resource, VSBuffer.fromString('{a:1}'));
		assert.equal(actual1.resource.toString(), resource.toString());
		const actual2 = await testObject.readFile(joinPath(userDataHomeOnDisk, 'settings.json'));
		assert.equal(actual2.value.toString(), '{a:1}');
	});

	test('delete file', async () => {
		await testObject.writeFile(joinPath(userDataHomeOnDisk, 'settings.json'), VSBuffer.fromString(''));
		await testObject.del(environmentService.settingsResource);
		const result = await testObject.exists(joinPath(userDataHomeOnDisk, 'settings.json'));
		assert.equal(false, result);
	});

	test('resolve file', async () => {
		await testObject.writeFile(joinPath(userDataHomeOnDisk, 'settings.json'), VSBuffer.fromString(''));
		const result = await testObject.resolve(environmentService.settingsResource);
		assert.ok(!result.isDirectory);
		assert.ok(result.children === undefined);
	});

	test('exists return false for folder that does not exist', async () => {
		const exists = await testObject.exists(environmentService.snippetsHome);
		assert.equal(exists, false);
	});

	test('exists return true for folder that exists', async () => {
		await testObject.createFolder(joinPath(userDataHomeOnDisk, 'snippets'));
		const exists = await testObject.exists(environmentService.snippetsHome);
		assert.equal(exists, true);
	});

	test('read file throws error for folder', async () => {
		await testObject.createFolder(joinPath(userDataHomeOnDisk, 'snippets'));
		try {
			await testObject.readFile(environmentService.snippetsHome);
			assert.fail('Should fail since read file is not supported for folders');
		} catch (e) { }
	});

	test('read file under folder', async () => {
		await testObject.createFolder(joinPath(userDataHomeOnDisk, 'snippets'));
		await testObject.writeFile(joinPath(userDataHomeOnDisk, 'snippets', 'settings.json'), VSBuffer.fromString('{}'));
		const resource = joinPath(environmentService.snippetsHome, 'settings.json');
		const actual = await testObject.readFile(resource);
		assert.equal(actual.resource.toString(), resource.toString());
		assert.equal(actual.value, '{}');
	});

	test('read file under sub folder', async () => {
		await testObject.createFolder(joinPath(userDataHomeOnDisk, 'snippets', 'java'));
		await testObject.writeFile(joinPath(userDataHomeOnDisk, 'snippets', 'java', 'settings.json'), VSBuffer.fromString('{}'));
		const resource = joinPath(environmentService.snippetsHome, 'java/settings.json');
		const actual = await testObject.readFile(resource);
		assert.equal(actual.resource.toString(), resource.toString());
		assert.equal(actual.value, '{}');
	});

	test('create file under folder that exists', async () => {
		await testObject.createFolder(joinPath(userDataHomeOnDisk, 'snippets'));
		const resource = joinPath(environmentService.snippetsHome, 'settings.json');
		const actual1 = await testObject.createFile(resource, VSBuffer.fromString('{}'));
		assert.equal(actual1.resource.toString(), resource.toString());
		const actual2 = await testObject.readFile(joinPath(userDataHomeOnDisk, 'snippets', 'settings.json'));
		assert.equal(actual2.value.toString(), '{}');
	});

	test('create file under folder that does not exist', async () => {
		const resource = joinPath(environmentService.snippetsHome, 'settings.json');
		const actual1 = await testObject.createFile(resource, VSBuffer.fromString('{}'));
		assert.equal(actual1.resource.toString(), resource.toString());
		const actual2 = await testObject.readFile(joinPath(userDataHomeOnDisk, 'snippets', 'settings.json'));
		assert.equal(actual2.value.toString(), '{}');
	});

	test('write to not existing file under container that exists', async () => {
		await testObject.createFolder(joinPath(userDataHomeOnDisk, 'snippets'));
		const resource = joinPath(environmentService.snippetsHome, 'settings.json');
		const actual1 = await testObject.writeFile(resource, VSBuffer.fromString('{}'));
		assert.equal(actual1.resource.toString(), resource.toString());
		const actual = await testObject.readFile(joinPath(userDataHomeOnDisk, 'snippets', 'settings.json'));
		assert.equal(actual.value.toString(), '{}');
	});

	test('write to not existing file under container that does not exists', async () => {
		const resource = joinPath(environmentService.snippetsHome, 'settings.json');
		const actual1 = await testObject.writeFile(resource, VSBuffer.fromString('{}'));
		assert.equal(actual1.resource.toString(), resource.toString());
		const actual = await testObject.readFile(joinPath(userDataHomeOnDisk, 'snippets', 'settings.json'));
		assert.equal(actual.value.toString(), '{}');
	});

	test('write to existing file under container', async () => {
		await testObject.createFolder(joinPath(userDataHomeOnDisk, 'snippets'));
		await testObject.writeFile(joinPath(userDataHomeOnDisk, 'snippets', 'settings.json'), VSBuffer.fromString('{}'));
		const resource = joinPath(environmentService.snippetsHome, 'settings.json');
		const actual1 = await testObject.writeFile(resource, VSBuffer.fromString('{a:1}'));
		assert.equal(actual1.resource.toString(), resource.toString());
		const actual = await testObject.readFile(joinPath(userDataHomeOnDisk, 'snippets', 'settings.json'));
		assert.equal(actual.value.toString(), '{a:1}');
	});

	test('write file under sub container', async () => {
		const resource = joinPath(environmentService.snippetsHome, 'java/settings.json');
		const actual1 = await testObject.writeFile(resource, VSBuffer.fromString('{}'));
		assert.equal(actual1.resource.toString(), resource.toString());
		const actual = await testObject.readFile(joinPath(userDataHomeOnDisk, 'snippets', 'java', 'settings.json'));
		assert.equal(actual.value.toString(), '{}');
	});

	test('delete throws error for folder that does not exist', async () => {
		try {
			await testObject.del(environmentService.snippetsHome);
			assert.fail('Should fail the folder does not exist');
		} catch (e) { }
	});

	test('delete not existing file under container that exists', async () => {
		await testObject.createFolder(joinPath(userDataHomeOnDisk, 'snippets'));
		try {
			await testObject.del(joinPath(environmentService.snippetsHome, 'settings.json'));
			assert.fail('Should fail since file does not exist');
		} catch (e) { }
	});

	test('delete not existing file under container that does not exists', async () => {
		try {
			await testObject.del(joinPath(environmentService.snippetsHome, 'settings.json'));
			assert.fail('Should fail since file does not exist');
		} catch (e) { }
	});

	test('delete existing file under folder', async () => {
		await testObject.createFolder(joinPath(userDataHomeOnDisk, 'snippets'));
		await testObject.writeFile(joinPath(userDataHomeOnDisk, 'snippets', 'settings.json'), VSBuffer.fromString('{}'));
		await testObject.del(joinPath(environmentService.snippetsHome, 'settings.json'));
		const exists = await testObject.exists(joinPath(userDataHomeOnDisk, 'snippets', 'settings.json'));
		assert.equal(exists, false);
	});

	test('resolve folder', async () => {
		await testObject.createFolder(joinPath(userDataHomeOnDisk, 'snippets'));
		await testObject.writeFile(joinPath(userDataHomeOnDisk, 'snippets', 'settings.json'), VSBuffer.fromString('{}'));
		const result = await testObject.resolve(environmentService.snippetsHome);
		assert.ok(result.isDirectory);
		assert.ok(result.children !== undefined);
		assert.equal(result.children!.length, 1);
		assert.equal(result.children![0].resource.toString(), joinPath(environmentService.snippetsHome, 'settings.json').toString());
	});

	test('read backup file', async () => {
		await testObject.writeFile(joinPath(backupWorkspaceHomeOnDisk, 'backup.json'), VSBuffer.fromString('{}'));
		const result = await testObject.readFile(joinPath(environmentService.backupWorkspaceHome!, `backup.json`));
		assert.equal(result.value, '{}');
	});

	test('create backup file', async () => {
		await testObject.createFile(joinPath(environmentService.backupWorkspaceHome!, `backup.json`), VSBuffer.fromString('{}'));
		const result = await testObject.readFile(joinPath(backupWorkspaceHomeOnDisk, 'backup.json'));
		assert.equal(result.value.toString(), '{}');
	});

	test('write backup file', async () => {
		await testObject.writeFile(joinPath(backupWorkspaceHomeOnDisk, 'backup.json'), VSBuffer.fromString('{}'));
		await testObject.writeFile(joinPath(environmentService.backupWorkspaceHome!, `backup.json`), VSBuffer.fromString('{a:1}'));
		const result = await testObject.readFile(joinPath(backupWorkspaceHomeOnDisk, 'backup.json'));
		assert.equal(result.value.toString(), '{a:1}');
	});

	test('resolve backups folder', async () => {
		await testObject.writeFile(joinPath(backupWorkspaceHomeOnDisk, 'backup.json'), VSBuffer.fromString('{}'));
		const result = await testObject.resolve(environmentService.backupWorkspaceHome!);
		assert.ok(result.isDirectory);
		assert.ok(result.children !== undefined);
		assert.equal(result.children!.length, 1);
		assert.equal(result.children![0].resource.toString(), joinPath(environmentService.backupWorkspaceHome!, `backup.json`).toString());
	});
});

class TestFileSystemProvider implements IFileSystemProviderWithFileReadWriteCapability {

	constructor(readonly onDidChangeFile: Event<readonly IFileChange[]>) { }

	readonly capabilities: FileSystemProviderCapabilities = FileSystemProviderCapabilities.FileReadWrite;

	readonly onDidChangeCapabilities: Event<void> = Event.None;

	watch(): IDisposable { return Disposable.None; }

	stat(): Promise<IStat> { throw new Error('Not Supported'); }

	mkdir(resource: URI): Promise<void> { throw new Error('Not Supported'); }

	rename(): Promise<void> { throw new Error('Not Supported'); }

	readFile(resource: URI): Promise<Uint8Array> { throw new Error('Not Supported'); }

	readdir(resource: URI): Promise<[string, FileType][]> { throw new Error('Not Supported'); }

	writeFile(): Promise<void> { throw new Error('Not Supported'); }

	delete(): Promise<void> { throw new Error('Not Supported'); }

}

suite('FileUserDataProvider - Watching', () => {

	let testObject: IFileService;
	let localBackupsResource: URI;
	let localUserDataResource: URI;
	let environmentService: IWorkbenchEnvironmentService;
	const disposables = new DisposableStore();

	const fileEventEmitter: Emitter<readonly IFileChange[]> = new Emitter<readonly IFileChange[]>();
	disposables.add(fileEventEmitter);

	setup(() => {

		environmentService = new BrowserWorkbenchEnvironmentService({ remoteAuthority: 'remote', workspaceId: 'workspaceId', logsPath: URI.file('logFile') }, TestProductService);

		const rootResource = URI.file(path.join(os.tmpdir(), 'vsctests', uuid.generateUuid()));
		localUserDataResource = joinPath(rootResource, 'user');
		localBackupsResource = joinPath(rootResource, 'Backups');

		const userDataFileSystemProvider = new FileUserDataProvider(localUserDataResource, localBackupsResource, new TestFileSystemProvider(fileEventEmitter.event), environmentService, new NullLogService());
		disposables.add(userDataFileSystemProvider);

		testObject = new FileService(new NullLogService());
		disposables.add(testObject);
		disposables.add(testObject.registerProvider(Schemas.userData, userDataFileSystemProvider));
	});

	teardown(() => disposables.clear());

	test('file added change event', done => {
		const expected = environmentService.settingsResource;
		const target = joinPath(localUserDataResource, 'settings.json');
		testObject.onDidFilesChange(e => {
			if (e.contains(expected, FileChangeType.ADDED)) {
				done();
			}
		});
		fileEventEmitter.fire([{
			resource: target,
			type: FileChangeType.ADDED
		}]);
	});

	test('file updated change event', done => {
		const expected = environmentService.settingsResource;
		const target = joinPath(localUserDataResource, 'settings.json');
		testObject.onDidFilesChange(e => {
			if (e.contains(expected, FileChangeType.UPDATED)) {
				done();
			}
		});
		fileEventEmitter.fire([{
			resource: target,
			type: FileChangeType.UPDATED
		}]);
	});

	test('file deleted change event', done => {
		const expected = environmentService.settingsResource;
		const target = joinPath(localUserDataResource, 'settings.json');
		testObject.onDidFilesChange(e => {
			if (e.contains(expected, FileChangeType.DELETED)) {
				done();
			}
		});
		fileEventEmitter.fire([{
			resource: target,
			type: FileChangeType.DELETED
		}]);
	});

	test('file under folder created change event', done => {
		const expected = joinPath(environmentService.snippetsHome, 'settings.json');
		const target = joinPath(localUserDataResource, 'snippets', 'settings.json');
		testObject.onDidFilesChange(e => {
			if (e.contains(expected, FileChangeType.ADDED)) {
				done();
			}
		});
		fileEventEmitter.fire([{
			resource: target,
			type: FileChangeType.ADDED
		}]);
	});

	test('file under folder updated change event', done => {
		const expected = joinPath(environmentService.snippetsHome, 'settings.json');
		const target = joinPath(localUserDataResource, 'snippets', 'settings.json');
		testObject.onDidFilesChange(e => {
			if (e.contains(expected, FileChangeType.UPDATED)) {
				done();
			}
		});
		fileEventEmitter.fire([{
			resource: target,
			type: FileChangeType.UPDATED
		}]);
	});

	test('file under folder deleted change event', done => {
		const expected = joinPath(environmentService.snippetsHome, 'settings.json');
		const target = joinPath(localUserDataResource, 'snippets', 'settings.json');
		testObject.onDidFilesChange(e => {
			if (e.contains(expected, FileChangeType.DELETED)) {
				done();
			}
		});
		fileEventEmitter.fire([{
			resource: target,
			type: FileChangeType.DELETED
		}]);
	});

	test('event is not triggered if file is not under user data', async () => {
		const target = joinPath(dirname(localUserDataResource), 'settings.json');
		let triggered = false;
		testObject.onDidFilesChange(() => triggered = true);
		fileEventEmitter.fire([{
			resource: target,
			type: FileChangeType.DELETED
		}]);
		await timeout(0);
		if (triggered) {
			assert.fail('event should not be triggered');
		}
	});

	test('backup file created change event', done => {
		const expected = joinPath(environmentService.backupWorkspaceHome!, 'settings.json');
		const target = joinPath(localBackupsResource, 'settings.json');
		testObject.onDidFilesChange(e => {
			if (e.contains(expected, FileChangeType.ADDED)) {
				done();
			}
		});
		fileEventEmitter.fire([{
			resource: target,
			type: FileChangeType.ADDED
		}]);
	});

	test('backup file update change event', done => {
		const expected = joinPath(environmentService.backupWorkspaceHome!, 'settings.json');
		const target = joinPath(localBackupsResource, 'settings.json');
		testObject.onDidFilesChange(e => {
			if (e.contains(expected, FileChangeType.UPDATED)) {
				done();
			}
		});
		fileEventEmitter.fire([{
			resource: target,
			type: FileChangeType.UPDATED
		}]);
	});

	test('backup file delete change event', done => {
		const expected = joinPath(environmentService.backupWorkspaceHome!, 'settings.json');
		const target = joinPath(localBackupsResource, 'settings.json');
		testObject.onDidFilesChange(e => {
			if (e.contains(expected, FileChangeType.DELETED)) {
				done();
			}
		});
		fileEventEmitter.fire([{
			resource: target,
			type: FileChangeType.DELETED
		}]);
	});
});
