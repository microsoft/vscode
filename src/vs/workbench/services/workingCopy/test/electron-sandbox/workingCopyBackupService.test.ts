/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { isWindows } from 'vs/base/common/platform';
import { insert } from 'vs/base/common/arrays';
import { hash } from 'vs/base/common/hash';
import { isEqual, joinPath, dirname } from 'vs/base/common/resources';
import { join } from 'vs/base/common/path';
import { URI } from 'vs/base/common/uri';
import { WorkingCopyBackupsModel, hashIdentifier } from 'vs/workbench/services/workingCopy/common/workingCopyBackupService';
import { createTextModel } from 'vs/editor/test/common/testTextModel';
import { Schemas } from 'vs/base/common/network';
import { FileService } from 'vs/platform/files/common/fileService';
import { LogLevel, NullLogService } from 'vs/platform/log/common/log';
import { NativeWorkbenchEnvironmentService } from 'vs/workbench/services/environment/electron-sandbox/environmentService';
import { toBufferOrReadable } from 'vs/workbench/services/textfile/common/textfiles';
import { IFileService } from 'vs/platform/files/common/files';
import { NativeWorkingCopyBackupService } from 'vs/workbench/services/workingCopy/electron-sandbox/workingCopyBackupService';
import { FileUserDataProvider } from 'vs/platform/userData/common/fileUserDataProvider';
import { bufferToReadable, bufferToStream, streamToBuffer, VSBuffer, VSBufferReadable, VSBufferReadableStream } from 'vs/base/common/buffer';
import { TestLifecycleService, toTypedWorkingCopyId, toUntypedWorkingCopyId } from 'vs/workbench/test/browser/workbenchTestServices';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { IWorkingCopyBackupMeta, IWorkingCopyIdentifier } from 'vs/workbench/services/workingCopy/common/workingCopy';
import { consumeStream } from 'vs/base/common/stream';
import { TestProductService } from 'vs/workbench/test/common/workbenchTestServices';
import { InMemoryFileSystemProvider } from 'vs/platform/files/common/inMemoryFilesystemProvider';
import { generateUuid } from 'vs/base/common/uuid';
import { INativeWindowConfiguration } from 'vs/platform/window/common/window';
import product from 'vs/platform/product/common/product';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { UserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';
import { UriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentityService';

const homeDir = URI.file('home').with({ scheme: Schemas.inMemory });
const tmpDir = URI.file('tmp').with({ scheme: Schemas.inMemory });
const NULL_PROFILE = {
	name: '',
	id: '',
	shortName: '',
	isDefault: false,
	location: homeDir,
	settingsResource: joinPath(homeDir, 'settings.json'),
	globalStorageHome: joinPath(homeDir, 'globalStorage'),
	keybindingsResource: joinPath(homeDir, 'keybindings.json'),
	tasksResource: joinPath(homeDir, 'tasks.json'),
	snippetsHome: joinPath(homeDir, 'snippets'),
	extensionsResource: joinPath(homeDir, 'extensions.json'),
	cacheHome: joinPath(homeDir, 'cache')
};

const TestNativeWindowConfiguration: INativeWindowConfiguration = {
	windowId: 0,
	machineId: 'testMachineId',
	sqmId: 'testSqmId',
	devDeviceId: 'testdevDeviceId',
	logLevel: LogLevel.Error,
	loggers: { global: [], window: [] },
	mainPid: 0,
	appRoot: '',
	userEnv: {},
	execPath: process.execPath,
	perfMarks: [],
	colorScheme: { dark: true, highContrast: false },
	os: { release: 'unknown', hostname: 'unknown', arch: 'unknown' },
	product,
	homeDir: homeDir.fsPath,
	tmpDir: tmpDir.fsPath,
	userDataDir: joinPath(homeDir, product.nameShort).fsPath,
	profiles: { profile: NULL_PROFILE, all: [NULL_PROFILE], home: homeDir },
	nls: {
		messages: [],
		language: 'en'
	},
	_: []
};

export class TestNativeWorkbenchEnvironmentService extends NativeWorkbenchEnvironmentService {

	constructor(testDir: URI, backupPath: URI) {
		super({ ...TestNativeWindowConfiguration, backupPath: backupPath.fsPath, 'user-data-dir': testDir.fsPath }, TestProductService);
	}
}

export class NodeTestWorkingCopyBackupService extends NativeWorkingCopyBackupService {

	private backupResourceJoiners: Function[];
	private discardBackupJoiners: Function[];
	discardedBackups: IWorkingCopyIdentifier[];
	discardedAllBackups: boolean;
	private pendingBackupsArr: Promise<void>[];

	readonly _fileService: IFileService;

	constructor(testDir: URI, workspaceBackupPath: URI) {
		const environmentService = new TestNativeWorkbenchEnvironmentService(testDir, workspaceBackupPath);
		const logService = new NullLogService();
		const fileService = new FileService(logService);
		const lifecycleService = new TestLifecycleService();
		super(environmentService, fileService, logService, lifecycleService);

		const fsp = new InMemoryFileSystemProvider();
		fileService.registerProvider(Schemas.inMemory, fsp);
		const uriIdentityService = new UriIdentityService(fileService);
		const userDataProfilesService = new UserDataProfilesService(environmentService, fileService, uriIdentityService, logService);
		fileService.registerProvider(Schemas.vscodeUserData, new FileUserDataProvider(Schemas.file, fsp, Schemas.vscodeUserData, userDataProfilesService, uriIdentityService, logService));

		this._fileService = fileService;

		this.backupResourceJoiners = [];
		this.discardBackupJoiners = [];
		this.discardedBackups = [];
		this.pendingBackupsArr = [];
		this.discardedAllBackups = false;
	}

	testGetFileService(): IFileService {
		return this.fileService;
	}

	async waitForAllBackups(): Promise<void> {
		await Promise.all(this.pendingBackupsArr);
	}

	joinBackupResource(): Promise<void> {
		return new Promise(resolve => this.backupResourceJoiners.push(resolve));
	}

	override async backup(identifier: IWorkingCopyIdentifier, content?: VSBufferReadableStream | VSBufferReadable, versionId?: number, meta?: any, token?: CancellationToken): Promise<void> {
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

	override async discardBackup(identifier: IWorkingCopyIdentifier): Promise<void> {
		await super.discardBackup(identifier);
		this.discardedBackups.push(identifier);

		while (this.discardBackupJoiners.length) {
			this.discardBackupJoiners.pop()!();
		}
	}

	override async discardBackups(filter?: { except: IWorkingCopyIdentifier[] }): Promise<void> {
		this.discardedAllBackups = true;

		return super.discardBackups(filter);
	}

	async getBackupContents(identifier: IWorkingCopyIdentifier): Promise<string> {
		const backupResource = this.toBackupResource(identifier);

		const fileContents = await this.fileService.readFile(backupResource);

		return fileContents.value.toString();
	}
}

suite('WorkingCopyBackupService', () => {

	let testDir: URI;
	let backupHome: URI;
	let workspacesJsonPath: URI;
	let workspaceBackupPath: URI;

	let service: NodeTestWorkingCopyBackupService;
	let fileService: IFileService;

	const disposables = new DisposableStore();

	const workspaceResource = URI.file(isWindows ? 'c:\\workspace' : '/workspace');
	const fooFile = URI.file(isWindows ? 'c:\\Foo' : '/Foo');
	const customFile = URI.parse('customScheme://some/path');
	const customFileWithFragment = URI.parse('customScheme2://some/path#fragment');
	const barFile = URI.file(isWindows ? 'c:\\Bar' : '/Bar');
	const fooBarFile = URI.file(isWindows ? 'c:\\Foo Bar' : '/Foo Bar');
	const untitledFile = URI.from({ scheme: Schemas.untitled, path: 'Untitled-1' });

	setup(async () => {
		testDir = URI.file(join(generateUuid(), 'vsctests', 'workingcopybackupservice')).with({ scheme: Schemas.inMemory });
		backupHome = joinPath(testDir, 'Backups');
		workspacesJsonPath = joinPath(backupHome, 'workspaces.json');
		workspaceBackupPath = joinPath(backupHome, hash(workspaceResource.fsPath).toString(16));

		service = disposables.add(new NodeTestWorkingCopyBackupService(testDir, workspaceBackupPath));
		fileService = service._fileService;

		await fileService.createFolder(backupHome);

		return fileService.writeFile(workspacesJsonPath, VSBuffer.fromString(''));
	});

	teardown(() => {
		disposables.clear();
	});

	suite('hashIdentifier', () => {
		test('should correctly hash the identifier for untitled scheme URIs', () => {
			const uri = URI.from({ scheme: Schemas.untitled, path: 'Untitled-1' });

			// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
			// If these hashes change people will lose their backed up files
			// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

			const untypedBackupHash = hashIdentifier(toUntypedWorkingCopyId(uri));
			assert.strictEqual(untypedBackupHash, '-7f9c1a2e');
			assert.strictEqual(untypedBackupHash, hash(uri.fsPath).toString(16));

			const typedBackupHash = hashIdentifier({ typeId: 'hashTest', resource: uri });
			if (isWindows) {
				assert.strictEqual(typedBackupHash, '-17c47cdc');
			} else {
				assert.strictEqual(typedBackupHash, '-8ad5f4f');
			}

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

			const untypedBackupHash = hashIdentifier(toUntypedWorkingCopyId(uri));
			if (isWindows) {
				assert.strictEqual(untypedBackupHash, '20ffaa13');
			} else {
				assert.strictEqual(untypedBackupHash, '20eb3560');
			}
			assert.strictEqual(untypedBackupHash, hash(uri.fsPath).toString(16));

			const typedBackupHash = hashIdentifier({ typeId: 'hashTest', resource: uri });
			if (isWindows) {
				assert.strictEqual(typedBackupHash, '-55fc55db');
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

			const untypedBackupHash = hashIdentifier(toUntypedWorkingCopyId(uri));
			assert.strictEqual(untypedBackupHash, '-44972d98');
			assert.strictEqual(untypedBackupHash, hash(uri.toString()).toString(16));

			const typedBackupHash = hashIdentifier({ typeId: 'hashTest', resource: uri });
			assert.strictEqual(typedBackupHash, '502149c7');

			// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
			// If these hashes collide people will lose their backed up files
			// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

			assert.notStrictEqual(untypedBackupHash, typedBackupHash);
		});

		test('should not fail for URIs without path', () => {
			const uri = URI.from({
				scheme: 'vscode-fragment',
				fragment: 'frag'
			});

			// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
			// If these hashes change people will lose their backed up files
			// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

			const untypedBackupHash = hashIdentifier(toUntypedWorkingCopyId(uri));
			assert.strictEqual(untypedBackupHash, '-2f6b2f1b');
			assert.strictEqual(untypedBackupHash, hash(uri.toString()).toString(16));

			const typedBackupHash = hashIdentifier({ typeId: 'hashTest', resource: uri });
			assert.strictEqual(typedBackupHash, '6e82ca57');

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
			let backupId = toUntypedWorkingCopyId(backupResource);
			let filePathHash = hashIdentifier(backupId);
			let expectedPath = joinPath(backupHome, workspaceHash, Schemas.file, filePathHash).with({ scheme: Schemas.vscodeUserData }).toString();
			assert.strictEqual(service.toBackupResource(backupId).toString(), expectedPath);

			// With Type ID
			backupId = toTypedWorkingCopyId(backupResource);
			filePathHash = hashIdentifier(backupId);
			expectedPath = joinPath(backupHome, workspaceHash, Schemas.file, filePathHash).with({ scheme: Schemas.vscodeUserData }).toString();
			assert.strictEqual(service.toBackupResource(backupId).toString(), expectedPath);
		});

		test('should get the correct backup path for untitled files', () => {

			// Format should be: <backupHome>/<workspaceHash>/<scheme>/<filePathHash>
			const backupResource = URI.from({ scheme: Schemas.untitled, path: 'Untitled-1' });
			const workspaceHash = hash(workspaceResource.fsPath).toString(16);

			// No Type ID
			let backupId = toUntypedWorkingCopyId(backupResource);
			let filePathHash = hashIdentifier(backupId);
			let expectedPath = joinPath(backupHome, workspaceHash, Schemas.untitled, filePathHash).with({ scheme: Schemas.vscodeUserData }).toString();
			assert.strictEqual(service.toBackupResource(backupId).toString(), expectedPath);

			// With Type ID
			backupId = toTypedWorkingCopyId(backupResource);
			filePathHash = hashIdentifier(backupId);
			expectedPath = joinPath(backupHome, workspaceHash, Schemas.untitled, filePathHash).with({ scheme: Schemas.vscodeUserData }).toString();
			assert.strictEqual(service.toBackupResource(backupId).toString(), expectedPath);
		});

		test('should get the correct backup path for custom files', () => {

			// Format should be: <backupHome>/<workspaceHash>/<scheme>/<filePathHash>
			const backupResource = URI.from({ scheme: 'custom', path: 'custom/file.txt' });
			const workspaceHash = hash(workspaceResource.fsPath).toString(16);

			// No Type ID
			let backupId = toUntypedWorkingCopyId(backupResource);
			let filePathHash = hashIdentifier(backupId);
			let expectedPath = joinPath(backupHome, workspaceHash, 'custom', filePathHash).with({ scheme: Schemas.vscodeUserData }).toString();
			assert.strictEqual(service.toBackupResource(backupId).toString(), expectedPath);

			// With Type ID
			backupId = toTypedWorkingCopyId(backupResource);
			filePathHash = hashIdentifier(backupId);
			expectedPath = joinPath(backupHome, workspaceHash, 'custom', filePathHash).with({ scheme: Schemas.vscodeUserData }).toString();
			assert.strictEqual(service.toBackupResource(backupId).toString(), expectedPath);
		});
	});

	suite('backup', () => {

		function toExpectedPreamble(identifier: IWorkingCopyIdentifier, content = '', meta?: object): string {
			return `${identifier.resource.toString()} ${JSON.stringify({ ...meta, typeId: identifier.typeId })}\n${content}`;
		}

		test('joining', async () => {
			let backupJoined = false;
			const joinBackupsPromise = service.joinBackups();
			joinBackupsPromise.then(() => backupJoined = true);
			await joinBackupsPromise;
			assert.strictEqual(backupJoined, true);

			backupJoined = false;
			service.joinBackups().then(() => backupJoined = true);

			const identifier = toUntypedWorkingCopyId(fooFile);
			const backupPath = joinPath(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));

			const backupPromise = service.backup(identifier);
			assert.strictEqual(backupJoined, false);
			await backupPromise;
			assert.strictEqual(backupJoined, true);

			assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, 'file'))).children?.length, 1);
			assert.strictEqual((await fileService.exists(backupPath)), true);
			assert.strictEqual((await fileService.readFile(backupPath)).value.toString(), toExpectedPreamble(identifier));
			assert.ok(service.hasBackupSync(identifier));
		});

		test('no text', async () => {
			const identifier = toUntypedWorkingCopyId(fooFile);
			const backupPath = joinPath(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));

			await service.backup(identifier);
			assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, 'file'))).children?.length, 1);
			assert.strictEqual((await fileService.exists(backupPath)), true);
			assert.strictEqual((await fileService.readFile(backupPath)).value.toString(), toExpectedPreamble(identifier));
			assert.ok(service.hasBackupSync(identifier));
		});

		test('text file', async () => {
			const identifier = toUntypedWorkingCopyId(fooFile);
			const backupPath = joinPath(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));

			await service.backup(identifier, bufferToReadable(VSBuffer.fromString('test')));
			assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, 'file'))).children?.length, 1);
			assert.strictEqual((await fileService.exists(backupPath)), true);
			assert.strictEqual((await fileService.readFile(backupPath)).value.toString(), toExpectedPreamble(identifier, 'test'));
			assert.ok(service.hasBackupSync(identifier));
		});

		test('text file (with version)', async () => {
			const identifier = toUntypedWorkingCopyId(fooFile);
			const backupPath = joinPath(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));

			await service.backup(identifier, bufferToReadable(VSBuffer.fromString('test')), 666);
			assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, 'file'))).children?.length, 1);
			assert.strictEqual((await fileService.exists(backupPath)), true);
			assert.strictEqual((await fileService.readFile(backupPath)).value.toString(), toExpectedPreamble(identifier, 'test'));
			assert.ok(!service.hasBackupSync(identifier, 555));
			assert.ok(service.hasBackupSync(identifier, 666));
		});

		test('text file (with meta)', async () => {
			const identifier = toUntypedWorkingCopyId(fooFile);
			const backupPath = joinPath(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));
			const meta = { etag: '678', orphaned: true };

			await service.backup(identifier, bufferToReadable(VSBuffer.fromString('test')), undefined, meta);
			assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, 'file'))).children?.length, 1);
			assert.strictEqual((await fileService.exists(backupPath)), true);
			assert.strictEqual((await fileService.readFile(backupPath)).value.toString(), toExpectedPreamble(identifier, 'test', meta));
			assert.ok(service.hasBackupSync(identifier));
		});

		test('text file with whitespace in name and type (with meta)', async () => {
			const fileWithSpace = URI.file(isWindows ? 'c:\\Foo \n Bar' : '/Foo \n Bar');
			const identifier = toTypedWorkingCopyId(fileWithSpace, ' test id \n');
			const backupPath = joinPath(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));
			const meta = { etag: '678 \n k', orphaned: true };

			await service.backup(identifier, bufferToReadable(VSBuffer.fromString('test')), undefined, meta);
			assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, 'file'))).children?.length, 1);
			assert.strictEqual((await fileService.exists(backupPath)), true);
			assert.strictEqual((await fileService.readFile(backupPath)).value.toString(), toExpectedPreamble(identifier, 'test', meta));
			assert.ok(service.hasBackupSync(identifier));
		});

		test('text file with unicode character in name and type (with meta)', async () => {
			const fileWithUnicode = URI.file(isWindows ? 'c:\\so𒀅meࠄ' : '/so𒀅meࠄ');
			const identifier = toTypedWorkingCopyId(fileWithUnicode, ' test so𒀅meࠄ id \n');
			const backupPath = joinPath(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));
			const meta = { etag: '678so𒀅meࠄ', orphaned: true };

			await service.backup(identifier, bufferToReadable(VSBuffer.fromString('test')), undefined, meta);
			assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, 'file'))).children?.length, 1);
			assert.strictEqual((await fileService.exists(backupPath)), true);
			assert.strictEqual((await fileService.readFile(backupPath)).value.toString(), toExpectedPreamble(identifier, 'test', meta));
			assert.ok(service.hasBackupSync(identifier));
		});

		test('untitled file', async () => {
			const identifier = toUntypedWorkingCopyId(untitledFile);
			const backupPath = joinPath(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));

			await service.backup(identifier, bufferToReadable(VSBuffer.fromString('test')));
			assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, 'untitled'))).children?.length, 1);
			assert.strictEqual((await fileService.exists(backupPath)), true);
			assert.strictEqual((await fileService.readFile(backupPath)).value.toString(), toExpectedPreamble(identifier, 'test'));
			assert.ok(service.hasBackupSync(identifier));
		});

		test('text file (readable)', async () => {
			const identifier = toUntypedWorkingCopyId(fooFile);
			const backupPath = joinPath(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));
			const model = createTextModel('test');

			await service.backup(identifier, toBufferOrReadable(model.createSnapshot()));
			assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, 'file'))).children?.length, 1);
			assert.strictEqual((await fileService.exists(backupPath)), true);
			assert.strictEqual((await fileService.readFile(backupPath)).value.toString(), toExpectedPreamble(identifier, 'test'));
			assert.ok(service.hasBackupSync(identifier));

			model.dispose();
		});

		test('untitled file (readable)', async () => {
			const identifier = toUntypedWorkingCopyId(untitledFile);
			const backupPath = joinPath(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));
			const model = createTextModel('test');

			await service.backup(identifier, toBufferOrReadable(model.createSnapshot()));
			assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, 'untitled'))).children?.length, 1);
			assert.strictEqual((await fileService.exists(backupPath)), true);
			assert.strictEqual((await fileService.readFile(backupPath)).value.toString(), toExpectedPreamble(identifier, 'test'));

			model.dispose();
		});

		test('text file (large file, stream)', () => {
			const largeString = (new Array(30 * 1024)).join('Large String\n');

			return testLargeTextFile(largeString, bufferToStream(VSBuffer.fromString(largeString)));
		});

		test('text file (large file, readable)', async () => {
			const largeString = (new Array(30 * 1024)).join('Large String\n');
			const model = createTextModel(largeString);

			await testLargeTextFile(largeString, toBufferOrReadable(model.createSnapshot()));

			model.dispose();
		});

		async function testLargeTextFile(largeString: string, buffer: VSBufferReadable | VSBufferReadableStream) {
			const identifier = toUntypedWorkingCopyId(fooFile);
			const backupPath = joinPath(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));

			await service.backup(identifier, buffer, undefined, { largeTest: true });
			assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, 'file'))).children?.length, 1);
			assert.strictEqual((await fileService.exists(backupPath)), true);
			assert.strictEqual((await fileService.readFile(backupPath)).value.toString(), toExpectedPreamble(identifier, largeString, { largeTest: true }));
			assert.ok(service.hasBackupSync(identifier));
		}

		test('untitled file (large file, readable)', async () => {
			const identifier = toUntypedWorkingCopyId(untitledFile);
			const backupPath = joinPath(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));
			const largeString = (new Array(30 * 1024)).join('Large String\n');
			const model = createTextModel(largeString);

			await service.backup(identifier, toBufferOrReadable(model.createSnapshot()));
			assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, 'untitled'))).children?.length, 1);
			assert.strictEqual((await fileService.exists(backupPath)), true);
			assert.strictEqual((await fileService.readFile(backupPath)).value.toString(), toExpectedPreamble(identifier, largeString));
			assert.ok(service.hasBackupSync(identifier));

			model.dispose();
		});

		test('cancellation', async () => {
			const identifier = toUntypedWorkingCopyId(fooFile);
			const backupPath = joinPath(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));

			const cts = new CancellationTokenSource();
			const promise = service.backup(identifier, undefined, undefined, undefined, cts.token);
			cts.cancel();
			await promise;

			assert.strictEqual((await fileService.exists(backupPath)), false);
			assert.ok(!service.hasBackupSync(identifier));
		});

		test('multiple', async () => {
			const identifier = toUntypedWorkingCopyId(fooFile);
			const backupPath = joinPath(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));

			await Promise.all([
				service.backup(identifier),
				service.backup(identifier),
				service.backup(identifier),
				service.backup(identifier)
			]);

			assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, 'file'))).children?.length, 1);
			assert.strictEqual((await fileService.exists(backupPath)), true);
			assert.strictEqual((await fileService.readFile(backupPath)).value.toString(), toExpectedPreamble(identifier));
			assert.ok(service.hasBackupSync(identifier));
		});

		test('multiple same resource, different type id', async () => {
			const backupId1 = toUntypedWorkingCopyId(fooFile);
			const backupId2 = toTypedWorkingCopyId(fooFile, 'type1');
			const backupId3 = toTypedWorkingCopyId(fooFile, 'type2');

			await Promise.all([
				service.backup(backupId1),
				service.backup(backupId2),
				service.backup(backupId3)
			]);

			assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, 'file'))).children?.length, 3);

			for (const backupId of [backupId1, backupId2, backupId3]) {
				const fooBackupPath = joinPath(workspaceBackupPath, backupId.resource.scheme, hashIdentifier(backupId));
				assert.strictEqual((await fileService.exists(fooBackupPath)), true);
				assert.strictEqual((await fileService.readFile(fooBackupPath)).value.toString(), toExpectedPreamble(backupId));
				assert.ok(service.hasBackupSync(backupId));
			}
		});
	});

	suite('discardBackup', () => {

		test('joining', async () => {
			const identifier = toUntypedWorkingCopyId(fooFile);
			const backupPath = joinPath(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));

			await service.backup(identifier, bufferToReadable(VSBuffer.fromString('test')));
			assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, 'file'))).children?.length, 1);
			assert.ok(service.hasBackupSync(identifier));

			let backupJoined = false;
			service.joinBackups().then(() => backupJoined = true);

			const discardBackupPromise = service.discardBackup(identifier);
			assert.strictEqual(backupJoined, false);
			await discardBackupPromise;
			assert.strictEqual(backupJoined, true);

			assert.strictEqual((await fileService.exists(backupPath)), false);
			assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, 'file'))).children?.length, 0);
			assert.ok(!service.hasBackupSync(identifier));
		});

		test('text file', async () => {
			const identifier = toUntypedWorkingCopyId(fooFile);
			const backupPath = joinPath(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));

			await service.backup(identifier, bufferToReadable(VSBuffer.fromString('test')));
			assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, 'file'))).children?.length, 1);
			assert.ok(service.hasBackupSync(identifier));

			await service.discardBackup(identifier);
			assert.strictEqual((await fileService.exists(backupPath)), false);
			assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, 'file'))).children?.length, 0);
			assert.ok(!service.hasBackupSync(identifier));
		});

		test('untitled file', async () => {
			const identifier = toUntypedWorkingCopyId(untitledFile);
			const backupPath = joinPath(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));

			await service.backup(identifier, bufferToReadable(VSBuffer.fromString('test')));
			assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, 'untitled'))).children?.length, 1);

			await service.discardBackup(identifier);
			assert.strictEqual((await fileService.exists(backupPath)), false);
			assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, 'untitled'))).children?.length, 0);
		});

		test('multiple same resource, different type id', async () => {
			const backupId1 = toUntypedWorkingCopyId(fooFile);
			const backupId2 = toTypedWorkingCopyId(fooFile, 'type1');
			const backupId3 = toTypedWorkingCopyId(fooFile, 'type2');

			await Promise.all([
				service.backup(backupId1),
				service.backup(backupId2),
				service.backup(backupId3)
			]);

			assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, 'file'))).children?.length, 3);

			for (const backupId of [backupId1, backupId2, backupId3]) {
				const backupPath = joinPath(workspaceBackupPath, backupId.resource.scheme, hashIdentifier(backupId));
				await service.discardBackup(backupId);
				assert.strictEqual((await fileService.exists(backupPath)), false);
			}
			assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, 'file'))).children?.length, 0);
		});
	});

	suite('discardBackups (all)', () => {
		test('text file', async () => {
			const backupId1 = toUntypedWorkingCopyId(fooFile);
			const backupId2 = toUntypedWorkingCopyId(barFile);
			const backupId3 = toTypedWorkingCopyId(barFile);

			await service.backup(backupId1, bufferToReadable(VSBuffer.fromString('test')));
			assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, 'file'))).children?.length, 1);

			await service.backup(backupId2, bufferToReadable(VSBuffer.fromString('test')));
			assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, 'file'))).children?.length, 2);

			await service.backup(backupId3, bufferToReadable(VSBuffer.fromString('test')));
			assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, 'file'))).children?.length, 3);

			await service.discardBackups();
			for (const backupId of [backupId1, backupId2, backupId3]) {
				const backupPath = joinPath(workspaceBackupPath, backupId.resource.scheme, hashIdentifier(backupId));
				assert.strictEqual((await fileService.exists(backupPath)), false);
			}

			assert.strictEqual((await fileService.exists(joinPath(workspaceBackupPath, 'file'))), false);
		});

		test('untitled file', async () => {
			const backupId = toUntypedWorkingCopyId(untitledFile);
			const backupPath = joinPath(workspaceBackupPath, backupId.resource.scheme, hashIdentifier(backupId));

			await service.backup(backupId, bufferToReadable(VSBuffer.fromString('test')));
			assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, 'untitled'))).children?.length, 1);

			await service.discardBackups();
			assert.strictEqual((await fileService.exists(backupPath)), false);
			assert.strictEqual((await fileService.exists(joinPath(workspaceBackupPath, 'untitled'))), false);
		});

		test('can backup after discarding all', async () => {
			await service.discardBackups();
			await service.backup(toUntypedWorkingCopyId(untitledFile), bufferToReadable(VSBuffer.fromString('test')));
			assert.strictEqual((await fileService.exists(workspaceBackupPath)), true);
		});
	});

	suite('discardBackups (except some)', () => {
		test('text file', async () => {
			const backupId1 = toUntypedWorkingCopyId(fooFile);
			const backupId2 = toUntypedWorkingCopyId(barFile);
			const backupId3 = toTypedWorkingCopyId(barFile);

			await service.backup(backupId1, bufferToReadable(VSBuffer.fromString('test')));
			assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, 'file'))).children?.length, 1);

			await service.backup(backupId2, bufferToReadable(VSBuffer.fromString('test')));
			assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, 'file'))).children?.length, 2);

			await service.backup(backupId3, bufferToReadable(VSBuffer.fromString('test')));
			assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, 'file'))).children?.length, 3);

			await service.discardBackups({ except: [backupId2, backupId3] });

			let backupPath = joinPath(workspaceBackupPath, backupId1.resource.scheme, hashIdentifier(backupId1));
			assert.strictEqual((await fileService.exists(backupPath)), false);

			backupPath = joinPath(workspaceBackupPath, backupId2.resource.scheme, hashIdentifier(backupId2));
			assert.strictEqual((await fileService.exists(backupPath)), true);

			backupPath = joinPath(workspaceBackupPath, backupId3.resource.scheme, hashIdentifier(backupId3));
			assert.strictEqual((await fileService.exists(backupPath)), true);

			await service.discardBackups({ except: [backupId1] });

			for (const backupId of [backupId1, backupId2, backupId3]) {
				const backupPath = joinPath(workspaceBackupPath, backupId.resource.scheme, hashIdentifier(backupId));
				assert.strictEqual((await fileService.exists(backupPath)), false);
			}
		});

		test('untitled file', async () => {
			const backupId = toUntypedWorkingCopyId(untitledFile);
			const backupPath = joinPath(workspaceBackupPath, backupId.resource.scheme, hashIdentifier(backupId));

			await service.backup(backupId, bufferToReadable(VSBuffer.fromString('test')));
			assert.strictEqual((await fileService.exists(backupPath)), true);
			assert.strictEqual((await fileService.resolve(joinPath(workspaceBackupPath, 'untitled'))).children?.length, 1);

			await service.discardBackups({ except: [backupId] });
			assert.strictEqual((await fileService.exists(backupPath)), true);
		});
	});

	suite('getBackups', () => {
		test('text file', async () => {
			await Promise.all([
				service.backup(toUntypedWorkingCopyId(fooFile), bufferToReadable(VSBuffer.fromString('test'))),
				service.backup(toTypedWorkingCopyId(fooFile, 'type1'), bufferToReadable(VSBuffer.fromString('test'))),
				service.backup(toTypedWorkingCopyId(fooFile, 'type2'), bufferToReadable(VSBuffer.fromString('test')))
			]);

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

			await service.backup(toUntypedWorkingCopyId(barFile), bufferToReadable(VSBuffer.fromString('test')));

			backups = await service.getBackups();
			assert.strictEqual(backups.length, 4);
		});

		test('untitled file', async () => {
			await Promise.all([
				service.backup(toUntypedWorkingCopyId(untitledFile), bufferToReadable(VSBuffer.fromString('test'))),
				service.backup(toTypedWorkingCopyId(untitledFile, 'type1'), bufferToReadable(VSBuffer.fromString('test'))),
				service.backup(toTypedWorkingCopyId(untitledFile, 'type2'), bufferToReadable(VSBuffer.fromString('test')))
			]);

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

		interface IBackupTestMetaData extends IWorkingCopyBackupMeta {
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

		test('should restore the original contents (untitled file empty with metadata)', async () => {
			const contents = '';

			const meta = {
				etag: 'the Etag',
				size: 666,
				mtime: Date.now(),
				orphaned: true
			};

			await testResolveBackup(untitledFile, contents, meta);
		});

		test('should restore the original contents (untitled large file with metadata)', async () => {
			const contents = (new Array(30 * 1024)).join('Large String\n');

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

		test('should restore the original contents (empty text file with metadata)', async () => {
			const contents = '';

			const meta = {
				etag: 'theEtag',
				size: 888,
				mtime: Date.now(),
				orphaned: false
			};

			await testResolveBackup(fooFile, contents, meta);
		});

		test('should restore the original contents (large text file with metadata)', async () => {
			const contents = (new Array(30 * 1024)).join('Large String\n');

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

			await testResolveBackup(fooFile, contents, meta, true);
		});

		async function testResolveBackup(resource: URI, contents: string, meta?: IBackupTestMetaData, expectNoMeta?: boolean) {
			await doTestResolveBackup(toUntypedWorkingCopyId(resource), contents, meta, expectNoMeta);
			await doTestResolveBackup(toTypedWorkingCopyId(resource), contents, meta, expectNoMeta);
		}

		async function doTestResolveBackup(identifier: IWorkingCopyIdentifier, contents: string, meta?: IBackupTestMetaData, expectNoMeta?: boolean) {
			await service.backup(identifier, bufferToReadable(VSBuffer.fromString(contents)), 1, meta);

			const backup = await service.resolve<IBackupTestMetaData>(identifier);
			assert.ok(backup);
			assert.strictEqual(contents, (await streamToBuffer(backup.value)).toString());

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

		test('should restore the original contents (text file with broken metadata)', async () => {
			await testShouldRestoreOriginalContentsWithBrokenBackup(toUntypedWorkingCopyId(fooFile));
			await testShouldRestoreOriginalContentsWithBrokenBackup(toTypedWorkingCopyId(fooFile));
		});

		async function testShouldRestoreOriginalContentsWithBrokenBackup(identifier: IWorkingCopyIdentifier): Promise<void> {
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

			await service.backup(identifier, bufferToReadable(VSBuffer.fromString(contents)), 1, meta);

			const backupPath = joinPath(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));

			const fileContents = (await fileService.readFile(backupPath)).value.toString();
			assert.strictEqual(fileContents.indexOf(identifier.resource.toString()), 0);

			const metaIndex = fileContents.indexOf('{');
			const newFileContents = fileContents.substring(0, metaIndex) + '{{' + fileContents.substr(metaIndex);
			await fileService.writeFile(backupPath, VSBuffer.fromString(newFileContents));

			const backup = await service.resolve(identifier);
			assert.ok(backup);
			assert.strictEqual(contents, (await streamToBuffer(backup.value)).toString());
			assert.strictEqual(backup.meta, undefined);
		}

		test('should update metadata from file into model when resolving', async () => {
			await testShouldUpdateMetaFromFileWhenResolving(toUntypedWorkingCopyId(fooFile));
			await testShouldUpdateMetaFromFileWhenResolving(toTypedWorkingCopyId(fooFile));
		});

		async function testShouldUpdateMetaFromFileWhenResolving(identifier: IWorkingCopyIdentifier): Promise<void> {
			const contents = 'Foo Bar';

			const meta = {
				etag: 'theEtagForThisMetadataTest',
				size: 888,
				mtime: Date.now(),
				orphaned: false
			};

			const updatedMeta = {
				...meta,
				etag: meta.etag + meta.etag
			};

			await service.backup(identifier, bufferToReadable(VSBuffer.fromString(contents)), 1, meta);

			const backupPath = joinPath(workspaceBackupPath, identifier.resource.scheme, hashIdentifier(identifier));

			// Simulate the condition of the backups model loading initially without
			// meta data information and then getting the meta data updated on the
			// first call to resolve the backup. We simulate this by explicitly changing
			// the meta data in the file and then verifying that the updated meta data
			// is persisted back into the model (verified via `hasBackupSync`).
			// This is not really something that would happen in real life because any
			// backup that is made via backup service will update the model accordingly.

			const originalFileContents = (await fileService.readFile(backupPath)).value.toString();
			await fileService.writeFile(backupPath, VSBuffer.fromString(originalFileContents.replace(meta.etag, updatedMeta.etag)));

			await service.resolve(identifier);

			assert.strictEqual(service.hasBackupSync(identifier, undefined, meta), false);
			assert.strictEqual(service.hasBackupSync(identifier, undefined, updatedMeta), true);

			await fileService.writeFile(backupPath, VSBuffer.fromString(originalFileContents));

			await service.getBackups();

			assert.strictEqual(service.hasBackupSync(identifier, undefined, meta), true);
			assert.strictEqual(service.hasBackupSync(identifier, undefined, updatedMeta), false);
		}

		test('should ignore invalid backups (empty file)', async () => {
			const contents = 'test\nand more stuff';

			await service.backup(toUntypedWorkingCopyId(fooFile), bufferToReadable(VSBuffer.fromString(contents)), 1);

			let backup = await service.resolve(toUntypedWorkingCopyId(fooFile));
			assert.ok(backup);

			await service.testGetFileService().writeFile(service.toBackupResource(toUntypedWorkingCopyId(fooFile)), VSBuffer.fromString(''));

			backup = await service.resolve<IBackupTestMetaData>(toUntypedWorkingCopyId(fooFile));
			assert.ok(!backup);
		});

		test('should ignore invalid backups (no preamble)', async () => {
			const contents = 'testand more stuff';

			await service.backup(toUntypedWorkingCopyId(fooFile), bufferToReadable(VSBuffer.fromString(contents)), 1);

			let backup = await service.resolve(toUntypedWorkingCopyId(fooFile));
			assert.ok(backup);

			await service.testGetFileService().writeFile(service.toBackupResource(toUntypedWorkingCopyId(fooFile)), VSBuffer.fromString(contents));

			backup = await service.resolve<IBackupTestMetaData>(toUntypedWorkingCopyId(fooFile));
			assert.ok(!backup);
		});

		test('file with binary data', async () => {
			const identifier = toUntypedWorkingCopyId(fooFile);

			const buffer = Uint8Array.from([
				137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 73, 0, 0, 0, 67, 8, 2, 0, 0, 0, 95, 138, 191, 237, 0, 0, 0, 1, 115, 82, 71, 66, 0, 174, 206, 28, 233, 0, 0, 0, 4, 103, 65, 77, 65, 0, 0, 177, 143, 11, 252, 97, 5, 0, 0, 0, 9, 112, 72, 89, 115, 0, 0, 14, 195, 0, 0, 14, 195, 1, 199, 111, 168, 100, 0, 0, 0, 71, 116, 69, 88, 116, 83, 111, 117, 114, 99, 101, 0, 83, 104, 111, 116, 116, 121, 32, 118, 50, 46, 48, 46, 50, 46, 50, 49, 54, 32, 40, 67, 41, 32, 84, 104, 111, 109, 97, 115, 32, 66, 97, 117, 109, 97, 110, 110, 32, 45, 32, 104, 116, 116, 112, 58, 47, 47, 115, 104, 111, 116, 116, 121, 46, 100, 101, 118, 115, 45, 111, 110, 46, 110, 101, 116, 44, 132, 21, 213, 0, 0, 0, 84, 73, 68, 65, 84, 120, 218, 237, 207, 65, 17, 0, 0, 12, 2, 32, 211, 217, 63, 146, 37, 246, 218, 65, 3, 210, 191, 226, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 230, 118, 100, 169, 4, 173, 8, 44, 248, 184, 40, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130
			]);

			await service.backup(identifier, bufferToReadable(VSBuffer.wrap(buffer)), undefined, { binaryTest: 'true' });

			const backup = await service.resolve(toUntypedWorkingCopyId(fooFile));
			assert.ok(backup);

			const backupBuffer = await consumeStream(backup.value, chunks => VSBuffer.concat(chunks));
			assert.strictEqual(backupBuffer.buffer.byteLength, buffer.byteLength);
		});
	});

	suite('WorkingCopyBackupsModel', () => {

		test('simple', async () => {
			const model = await WorkingCopyBackupsModel.create(workspaceBackupPath, service.testGetFileService());

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

			model.update(resource4, { foo: 'nothing' });
			assert.strictEqual(model.has(resource4, undefined, { foo: 'nothing' }), true);
			assert.strictEqual(model.has(resource4, undefined, { foo: 'bar' }), false);

			model.update(resource4);
			assert.strictEqual(model.has(resource4), true);
			assert.strictEqual(model.has(resource4, undefined, { foo: 'nothing' }), false);
		});

		test('create', async () => {
			const fooBackupPath = joinPath(workspaceBackupPath, fooFile.scheme, hashIdentifier(toUntypedWorkingCopyId(fooFile)));
			await fileService.createFolder(dirname(fooBackupPath));
			await fileService.writeFile(fooBackupPath, VSBuffer.fromString('foo'));
			const model = await WorkingCopyBackupsModel.create(workspaceBackupPath, service.testGetFileService());

			assert.strictEqual(model.has(fooBackupPath), true);
		});

		test('get', async () => {
			const model = await WorkingCopyBackupsModel.create(workspaceBackupPath, service.testGetFileService());

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

	suite('typeId migration', () => {

		test('works (when meta is missing)', async () => {
			const fooBackupId = toUntypedWorkingCopyId(fooFile);
			const untitledBackupId = toUntypedWorkingCopyId(untitledFile);
			const customBackupId = toUntypedWorkingCopyId(customFile);

			const fooBackupPath = joinPath(workspaceBackupPath, fooFile.scheme, hashIdentifier(fooBackupId));
			const untitledBackupPath = joinPath(workspaceBackupPath, untitledFile.scheme, hashIdentifier(untitledBackupId));
			const customFileBackupPath = joinPath(workspaceBackupPath, customFile.scheme, hashIdentifier(customBackupId));

			// Prepare backups of the old format without meta
			await fileService.createFolder(joinPath(workspaceBackupPath, fooFile.scheme));
			await fileService.createFolder(joinPath(workspaceBackupPath, untitledFile.scheme));
			await fileService.createFolder(joinPath(workspaceBackupPath, customFile.scheme));
			await fileService.writeFile(fooBackupPath, VSBuffer.fromString(`${fooFile.toString()}\ntest file`));
			await fileService.writeFile(untitledBackupPath, VSBuffer.fromString(`${untitledFile.toString()}\ntest untitled`));
			await fileService.writeFile(customFileBackupPath, VSBuffer.fromString(`${customFile.toString()}\ntest custom`));

			service.reinitialize(workspaceBackupPath);

			const backups = await service.getBackups();
			assert.strictEqual(backups.length, 3);
			assert.ok(backups.some(backup => isEqual(backup.resource, fooFile)));
			assert.ok(backups.some(backup => isEqual(backup.resource, untitledFile)));
			assert.ok(backups.some(backup => isEqual(backup.resource, customFile)));
			assert.ok(backups.every(backup => backup.typeId === ''));
		});

		test('works (when typeId in meta is missing)', async () => {
			const fooBackupId = toUntypedWorkingCopyId(fooFile);
			const untitledBackupId = toUntypedWorkingCopyId(untitledFile);
			const customBackupId = toUntypedWorkingCopyId(customFile);

			const fooBackupPath = joinPath(workspaceBackupPath, fooFile.scheme, hashIdentifier(fooBackupId));
			const untitledBackupPath = joinPath(workspaceBackupPath, untitledFile.scheme, hashIdentifier(untitledBackupId));
			const customFileBackupPath = joinPath(workspaceBackupPath, customFile.scheme, hashIdentifier(customBackupId));

			// Prepare backups of the old format without meta
			await fileService.createFolder(joinPath(workspaceBackupPath, fooFile.scheme));
			await fileService.createFolder(joinPath(workspaceBackupPath, untitledFile.scheme));
			await fileService.createFolder(joinPath(workspaceBackupPath, customFile.scheme));
			await fileService.writeFile(fooBackupPath, VSBuffer.fromString(`${fooFile.toString()} ${JSON.stringify({ foo: 'bar' })}\ntest file`));
			await fileService.writeFile(untitledBackupPath, VSBuffer.fromString(`${untitledFile.toString()} ${JSON.stringify({ foo: 'bar' })}\ntest untitled`));
			await fileService.writeFile(customFileBackupPath, VSBuffer.fromString(`${customFile.toString()} ${JSON.stringify({ foo: 'bar' })}\ntest custom`));

			service.reinitialize(workspaceBackupPath);

			const backups = await service.getBackups();
			assert.strictEqual(backups.length, 3);
			assert.ok(backups.some(backup => isEqual(backup.resource, fooFile)));
			assert.ok(backups.some(backup => isEqual(backup.resource, untitledFile)));
			assert.ok(backups.some(backup => isEqual(backup.resource, customFile)));
			assert.ok(backups.every(backup => backup.typeId === ''));
		});
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
