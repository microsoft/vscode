/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { NativeWorkbenchEnvironmentService } from 'vs/workbench/services/environment/electron-sandbox/environmentService';
import { TestNativePathService, TestNativeWindowConfiguration } from 'vs/workbench/test/electron-browser/workbenchTestServices';
import { TestContextService, TestProductService, TestStorageService, TestWorkingCopy } from 'vs/workbench/test/common/workbenchTestServices';
import { NullLogService } from 'vs/platform/log/common/log';
import { FileService } from 'vs/platform/files/common/fileService';
import { DiskFileSystemProvider } from 'vs/platform/files/node/diskFileSystemProvider';
import { Schemas } from 'vs/base/common/network';
import { flakySuite, getRandomTestPath } from 'vs/base/test/node/testUtils';
import { tmpdir } from 'os';
import { dirname, join } from 'vs/base/common/path';
import { Promises } from 'vs/base/node/pfs';
import { URI } from 'vs/base/common/uri';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { existsSync, readFileSync, unlinkSync } from 'fs';
import { IWorkingCopyHistoryEntry, IWorkingCopyHistoryEntryDescriptor, IWorkingCopyHistoryEvent } from 'vs/workbench/services/workingCopy/common/workingCopyHistory';
import { IFileService } from 'vs/platform/files/common/files';
import { UriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentityService';
import { LabelService } from 'vs/workbench/services/label/common/labelService';
import { TestLifecycleService, TestRemoteAgentService, TestWillShutdownEvent } from 'vs/workbench/test/browser/workbenchTestServices';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { NativeWorkingCopyHistoryService } from 'vs/workbench/services/workingCopy/electron-sandbox/workingCopyHistoryService';
import { joinPath, dirname as resourcesDirname, basename } from 'vs/base/common/resources';
import { firstOrDefault } from 'vs/base/common/arrays';

class TestWorkbenchEnvironmentService extends NativeWorkbenchEnvironmentService {

	constructor(private readonly testDir: string) {
		super({ ...TestNativeWindowConfiguration, 'user-data-dir': testDir }, TestProductService);
	}

	override get localHistoryHome() {
		return joinPath(URI.file(this.testDir), 'History');
	}
}

export class TestWorkingCopyHistoryService extends NativeWorkingCopyHistoryService {

	readonly _fileService: IFileService;
	readonly _configurationService: TestConfigurationService;
	readonly _lifecycleService: TestLifecycleService;

	constructor(testDir: string) {
		const environmentService = new TestWorkbenchEnvironmentService(testDir);
		const logService = new NullLogService();
		const fileService = new FileService(logService);

		const diskFileSystemProvider = new DiskFileSystemProvider(logService);
		fileService.registerProvider(Schemas.file, diskFileSystemProvider);

		const remoteAgentService = new TestRemoteAgentService();

		const uriIdentityService = new UriIdentityService(fileService);

		const labelService = new LabelService(environmentService, new TestContextService(), new TestNativePathService(), new TestRemoteAgentService(), new TestStorageService(), new TestLifecycleService());

		const lifecycleService = new TestLifecycleService();

		const configurationService = new TestConfigurationService();

		super(fileService, remoteAgentService, environmentService, uriIdentityService, labelService, lifecycleService, logService, configurationService);

		this._fileService = fileService;
		this._configurationService = configurationService;
		this._lifecycleService = lifecycleService;
	}
}

flakySuite('WorkingCopyHistoryService', () => {

	let testDir: string;
	let historyHome: string;
	let workHome: string;
	let service: TestWorkingCopyHistoryService;

	let testFile1Path: string;
	let testFile2Path: string;
	let testFile3Path: string;

	const testFile1PathContents = 'Hello Foo';
	const testFile2PathContents = [
		'Lorem ipsum ',
		'dolor öäü sit amet ',
		'adipiscing ßß elit',
		'consectetur '
	].join('');
	const testFile3PathContents = 'Hello Bar';

	setup(async () => {
		testDir = getRandomTestPath(tmpdir(), 'vsctests', 'workingcopyhistoryservice');
		historyHome = join(testDir, 'User', 'History');
		workHome = join(testDir, 'work');

		service = new TestWorkingCopyHistoryService(testDir);

		await Promises.mkdir(historyHome, { recursive: true });
		await Promises.mkdir(workHome, { recursive: true });

		testFile1Path = join(workHome, 'foo.txt');
		testFile2Path = join(workHome, 'bar.txt');
		testFile3Path = join(workHome, 'foo-bar.txt');

		await Promises.writeFile(testFile1Path, testFile1PathContents);
		await Promises.writeFile(testFile2Path, testFile2PathContents);
		await Promises.writeFile(testFile3Path, testFile3PathContents);
	});

	let increasingTimestampCounter = 1;

	async function addEntry(descriptor: IWorkingCopyHistoryEntryDescriptor, token: CancellationToken, expectEntryAdded?: boolean): Promise<IWorkingCopyHistoryEntry>;
	async function addEntry(descriptor: IWorkingCopyHistoryEntryDescriptor, token: CancellationToken, expectEntryAdded: false): Promise<IWorkingCopyHistoryEntry | undefined>;
	async function addEntry(descriptor: IWorkingCopyHistoryEntryDescriptor, token: CancellationToken, expectEntryAdded = true): Promise<IWorkingCopyHistoryEntry | undefined> {
		const entry = await service.addEntry({
			...descriptor,
			timestamp: increasingTimestampCounter++ // very important to get tests to not be flaky with stable sort order
		}, token);

		if (expectEntryAdded) {
			assert.ok(entry, 'Unexpected undefined local history entry');
			assert.strictEqual(existsSync(entry.location.fsPath), true, 'Unexpected local history not stored on disk');
		}

		return entry;
	}

	teardown(() => {
		service.dispose();

		return Promises.rm(testDir);
	});

	test('addEntry', async () => {
		const addEvents: IWorkingCopyHistoryEvent[] = [];
		service.onDidAddEntry(e => addEvents.push(e));

		const workingCopy1 = new TestWorkingCopy(URI.file(testFile1Path));
		const workingCopy2 = new TestWorkingCopy(URI.file(testFile2Path));

		// Add Entry works

		const entry1A = await addEntry({ resource: workingCopy1.resource }, CancellationToken.None);
		const entry2A = await addEntry({ resource: workingCopy2.resource, source: 'My Source' }, CancellationToken.None);

		assert.strictEqual(readFileSync(entry1A.location.fsPath).toString(), testFile1PathContents);
		assert.strictEqual(readFileSync(entry2A.location.fsPath).toString(), testFile2PathContents);

		assert.strictEqual(addEvents.length, 2);
		assert.strictEqual(addEvents[0].entry.workingCopy.resource.toString(), workingCopy1.resource.toString());
		assert.strictEqual(addEvents[1].entry.workingCopy.resource.toString(), workingCopy2.resource.toString());
		assert.strictEqual(addEvents[1].entry.source, 'My Source');

		const entry1B = await addEntry({ resource: workingCopy1.resource }, CancellationToken.None);
		const entry2B = await addEntry({ resource: workingCopy2.resource }, CancellationToken.None);

		assert.strictEqual(readFileSync(entry1B.location.fsPath).toString(), testFile1PathContents);
		assert.strictEqual(readFileSync(entry2B.location.fsPath).toString(), testFile2PathContents);

		assert.strictEqual(addEvents.length, 4);
		assert.strictEqual(addEvents[2].entry.workingCopy.resource.toString(), workingCopy1.resource.toString());
		assert.strictEqual(addEvents[3].entry.workingCopy.resource.toString(), workingCopy2.resource.toString());

		// Cancellation works

		const cts = new CancellationTokenSource();
		const entry1CPromise = addEntry({ resource: workingCopy1.resource }, cts.token, false);
		cts.dispose(true);

		const entry1C = await entry1CPromise;
		assert.ok(!entry1C);

		assert.strictEqual(addEvents.length, 4);

		// Invalid working copies are ignored

		const workingCopy3 = new TestWorkingCopy(URI.file(testFile2Path).with({ scheme: 'unsupported' }));
		const entry3A = await addEntry({ resource: workingCopy3.resource }, CancellationToken.None, false);
		assert.ok(!entry3A);

		assert.strictEqual(addEvents.length, 4);
	});

	test('renameEntry', async () => {
		const changeEvents: IWorkingCopyHistoryEvent[] = [];
		service.onDidChangeEntry(e => changeEvents.push(e));

		const workingCopy1 = new TestWorkingCopy(URI.file(testFile1Path));

		const entry = await addEntry({ resource: workingCopy1.resource }, CancellationToken.None);
		await addEntry({ resource: workingCopy1.resource }, CancellationToken.None);
		await addEntry({ resource: workingCopy1.resource, source: 'My Source' }, CancellationToken.None);

		let entries = await service.getEntries(workingCopy1.resource, CancellationToken.None);
		assert.strictEqual(entries.length, 3);

		await service.updateEntry(entry, { source: 'Hello Rename' }, CancellationToken.None);

		assert.strictEqual(changeEvents.length, 1);
		assert.strictEqual(changeEvents[0].entry, entry);

		entries = await service.getEntries(workingCopy1.resource, CancellationToken.None);
		assert.strictEqual(entries[0].source, 'Hello Rename');

		// Simulate shutdown
		const event = new TestWillShutdownEvent();
		service._lifecycleService.fireWillShutdown(event);
		await Promise.allSettled(event.value);

		// Resolve from disk fresh and verify again

		service.dispose();
		service = new TestWorkingCopyHistoryService(testDir);

		entries = await service.getEntries(workingCopy1.resource, CancellationToken.None);
		assert.strictEqual(entries.length, 3);
		assert.strictEqual(entries[0].source, 'Hello Rename');
	});

	test('removeEntry', async () => {
		const removeEvents: IWorkingCopyHistoryEvent[] = [];
		service.onDidRemoveEntry(e => removeEvents.push(e));

		const workingCopy1 = new TestWorkingCopy(URI.file(testFile1Path));

		await addEntry({ resource: workingCopy1.resource }, CancellationToken.None);
		const entry2 = await addEntry({ resource: workingCopy1.resource }, CancellationToken.None);
		await addEntry({ resource: workingCopy1.resource }, CancellationToken.None);
		await addEntry({ resource: workingCopy1.resource, source: 'My Source' }, CancellationToken.None);

		let entries = await service.getEntries(workingCopy1.resource, CancellationToken.None);
		assert.strictEqual(entries.length, 4);

		let removed = await service.removeEntry(entry2, CancellationToken.None);
		assert.strictEqual(removed, true);

		assert.strictEqual(removeEvents.length, 1);
		assert.strictEqual(removeEvents[0].entry, entry2);

		// Cannot remove same entry again
		removed = await service.removeEntry(entry2, CancellationToken.None);
		assert.strictEqual(removed, false);

		entries = await service.getEntries(workingCopy1.resource, CancellationToken.None);
		assert.strictEqual(entries.length, 3);

		// Simulate shutdown
		const event = new TestWillShutdownEvent();
		service._lifecycleService.fireWillShutdown(event);
		await Promise.allSettled(event.value);

		// Resolve from disk fresh and verify again

		service.dispose();
		service = new TestWorkingCopyHistoryService(testDir);

		entries = await service.getEntries(workingCopy1.resource, CancellationToken.None);
		assert.strictEqual(entries.length, 3);
	});

	test('removeEntry - deletes history entries folder when last entry removed', async () => {
		const workingCopy1 = new TestWorkingCopy(URI.file(testFile1Path));

		let entry = await addEntry({ resource: workingCopy1.resource }, CancellationToken.None);

		// Simulate shutdown
		let event = new TestWillShutdownEvent();
		service._lifecycleService.fireWillShutdown(event);
		await Promise.allSettled(event.value);

		// Resolve from disk fresh and verify again

		service.dispose();
		service = new TestWorkingCopyHistoryService(testDir);

		assert.strictEqual(existsSync(dirname(entry.location.fsPath)), true);

		entry = firstOrDefault(await service.getEntries(workingCopy1.resource, CancellationToken.None))!;
		assert.ok(entry);

		await service.removeEntry(entry, CancellationToken.None);

		// Simulate shutdown
		event = new TestWillShutdownEvent();
		service._lifecycleService.fireWillShutdown(event);
		await Promise.allSettled(event.value);

		// Resolve from disk fresh and verify again

		service.dispose();
		service = new TestWorkingCopyHistoryService(testDir);

		assert.strictEqual(existsSync(dirname(entry.location.fsPath)), false);
	});

	test('removeAll', async () => {
		let removed = false;
		service.onDidRemoveEntries(() => removed = true);

		const workingCopy1 = new TestWorkingCopy(URI.file(testFile1Path));
		const workingCopy2 = new TestWorkingCopy(URI.file(testFile2Path));

		await addEntry({ resource: workingCopy1.resource }, CancellationToken.None);
		await addEntry({ resource: workingCopy1.resource }, CancellationToken.None);
		await addEntry({ resource: workingCopy2.resource }, CancellationToken.None);
		await addEntry({ resource: workingCopy2.resource, source: 'My Source' }, CancellationToken.None);

		let entries = await service.getEntries(workingCopy1.resource, CancellationToken.None);
		assert.strictEqual(entries.length, 2);
		entries = await service.getEntries(workingCopy2.resource, CancellationToken.None);
		assert.strictEqual(entries.length, 2);

		await service.removeAll(CancellationToken.None);

		assert.strictEqual(removed, true);

		entries = await service.getEntries(workingCopy1.resource, CancellationToken.None);
		assert.strictEqual(entries.length, 0);
		entries = await service.getEntries(workingCopy2.resource, CancellationToken.None);
		assert.strictEqual(entries.length, 0);

		// Simulate shutdown
		const event = new TestWillShutdownEvent();
		service._lifecycleService.fireWillShutdown(event);
		await Promise.allSettled(event.value);

		// Resolve from disk fresh and verify again

		service.dispose();
		service = new TestWorkingCopyHistoryService(testDir);

		entries = await service.getEntries(workingCopy1.resource, CancellationToken.None);
		assert.strictEqual(entries.length, 0);
		entries = await service.getEntries(workingCopy2.resource, CancellationToken.None);
		assert.strictEqual(entries.length, 0);
	});

	test('getEntries - simple', async () => {
		const workingCopy1 = new TestWorkingCopy(URI.file(testFile1Path));
		const workingCopy2 = new TestWorkingCopy(URI.file(testFile2Path));

		let entries = await service.getEntries(workingCopy1.resource, CancellationToken.None);
		assert.strictEqual(entries.length, 0);

		const entry1 = await addEntry({ resource: workingCopy1.resource, source: 'test-source' }, CancellationToken.None);

		entries = await service.getEntries(workingCopy1.resource, CancellationToken.None);
		assert.strictEqual(entries.length, 1);
		assertEntryEqual(entries[0], entry1);

		const entry2 = await addEntry({ resource: workingCopy1.resource, source: 'test-source' }, CancellationToken.None);

		entries = await service.getEntries(workingCopy1.resource, CancellationToken.None);
		assert.strictEqual(entries.length, 2);
		assertEntryEqual(entries[1], entry2);

		entries = await service.getEntries(workingCopy2.resource, CancellationToken.None);
		assert.strictEqual(entries.length, 0);

		const entry3 = await addEntry({ resource: workingCopy2.resource, source: 'other-test-source' }, CancellationToken.None);

		entries = await service.getEntries(workingCopy2.resource, CancellationToken.None);
		assert.strictEqual(entries.length, 1);
		assertEntryEqual(entries[0], entry3);
	});

	test('getEntries - metadata preserved when stored', async () => {
		const workingCopy1 = new TestWorkingCopy(URI.file(testFile1Path));
		const workingCopy2 = new TestWorkingCopy(URI.file(testFile2Path));

		const entry1 = await addEntry({ resource: workingCopy1.resource, source: 'test-source' }, CancellationToken.None);
		const entry2 = await addEntry({ resource: workingCopy2.resource }, CancellationToken.None);
		const entry3 = await addEntry({ resource: workingCopy2.resource, source: 'other-source' }, CancellationToken.None);

		// Simulate shutdown
		const event = new TestWillShutdownEvent();
		service._lifecycleService.fireWillShutdown(event);
		await Promise.allSettled(event.value);

		// Resolve from disk fresh and verify again

		service.dispose();
		service = new TestWorkingCopyHistoryService(testDir);

		let entries = await service.getEntries(workingCopy1.resource, CancellationToken.None);
		assert.strictEqual(entries.length, 1);
		assertEntryEqual(entries[0], entry1);

		entries = await service.getEntries(workingCopy2.resource, CancellationToken.None);
		assert.strictEqual(entries.length, 2);
		assertEntryEqual(entries[0], entry2);
		assertEntryEqual(entries[1], entry3);
	});

	test('getEntries - corrupt meta.json is no problem', async () => {
		const workingCopy1 = new TestWorkingCopy(URI.file(testFile1Path));

		const entry1 = await addEntry({ resource: workingCopy1.resource }, CancellationToken.None);

		// Simulate shutdown
		const event = new TestWillShutdownEvent();
		service._lifecycleService.fireWillShutdown(event);
		await Promise.allSettled(event.value);

		// Resolve from disk fresh and verify again

		service.dispose();
		service = new TestWorkingCopyHistoryService(testDir);

		const metaFile = join(dirname(entry1.location.fsPath), 'entries.json');
		assert.ok(existsSync(metaFile));
		unlinkSync(metaFile);

		const entries = await service.getEntries(workingCopy1.resource, CancellationToken.None);
		assert.strictEqual(entries.length, 1);
		assertEntryEqual(entries[0], entry1, false /* skip timestamp that is unreliable when entries.json is gone */);
	});

	test('getEntries - missing entries from meta.json is no problem', async () => {
		const workingCopy1 = new TestWorkingCopy(URI.file(testFile1Path));

		const entry1 = await addEntry({ resource: workingCopy1.resource }, CancellationToken.None);
		const entry2 = await addEntry({ resource: workingCopy1.resource }, CancellationToken.None);

		// Simulate shutdown
		const event = new TestWillShutdownEvent();
		service._lifecycleService.fireWillShutdown(event);
		await Promise.allSettled(event.value);

		// Resolve from disk fresh and verify again

		service.dispose();
		service = new TestWorkingCopyHistoryService(testDir);

		unlinkSync(entry1.location.fsPath);

		const entries = await service.getEntries(workingCopy1.resource, CancellationToken.None);
		assert.strictEqual(entries.length, 1);
		assertEntryEqual(entries[0], entry2);
	});

	test('getEntries - in-memory and on-disk entries are merged', async () => {
		const workingCopy1 = new TestWorkingCopy(URI.file(testFile1Path));

		const entry1 = await addEntry({ resource: workingCopy1.resource, source: 'test-source' }, CancellationToken.None);
		const entry2 = await addEntry({ resource: workingCopy1.resource, source: 'other-source' }, CancellationToken.None);

		// Simulate shutdown
		const event = new TestWillShutdownEvent();
		service._lifecycleService.fireWillShutdown(event);
		await Promise.allSettled(event.value);

		// Resolve from disk fresh and verify again

		service.dispose();
		service = new TestWorkingCopyHistoryService(testDir);

		const entry3 = await addEntry({ resource: workingCopy1.resource, source: 'test-source' }, CancellationToken.None);
		const entry4 = await addEntry({ resource: workingCopy1.resource, source: 'other-source' }, CancellationToken.None);

		const entries = await service.getEntries(workingCopy1.resource, CancellationToken.None);
		assert.strictEqual(entries.length, 4);
		assertEntryEqual(entries[0], entry1);
		assertEntryEqual(entries[1], entry2);
		assertEntryEqual(entries[2], entry3);
		assertEntryEqual(entries[3], entry4);
	});

	test('getEntries - configured max entries respected', async () => {
		const workingCopy1 = new TestWorkingCopy(URI.file(testFile1Path));

		await addEntry({ resource: workingCopy1.resource }, CancellationToken.None);
		await addEntry({ resource: workingCopy1.resource }, CancellationToken.None);
		const entry3 = await addEntry({ resource: workingCopy1.resource, source: 'Test source' }, CancellationToken.None);
		const entry4 = await addEntry({ resource: workingCopy1.resource }, CancellationToken.None);

		service._configurationService.setUserConfiguration('workbench.localHistory.maxFileEntries', 2);

		let entries = await service.getEntries(workingCopy1.resource, CancellationToken.None);
		assert.strictEqual(entries.length, 2);
		assertEntryEqual(entries[0], entry3);
		assertEntryEqual(entries[1], entry4);

		service._configurationService.setUserConfiguration('workbench.localHistory.maxFileEntries', 4);

		entries = await service.getEntries(workingCopy1.resource, CancellationToken.None);
		assert.strictEqual(entries.length, 4);

		service._configurationService.setUserConfiguration('workbench.localHistory.maxFileEntries', 5);

		entries = await service.getEntries(workingCopy1.resource, CancellationToken.None);
		assert.strictEqual(entries.length, 4);
	});

	test('getAll', async () => {
		const workingCopy1 = new TestWorkingCopy(URI.file(testFile1Path));
		const workingCopy2 = new TestWorkingCopy(URI.file(testFile2Path));

		let resources = await service.getAll(CancellationToken.None);
		assert.strictEqual(resources.length, 0);

		await addEntry({ resource: workingCopy1.resource, source: 'test-source' }, CancellationToken.None);
		await addEntry({ resource: workingCopy1.resource, source: 'test-source' }, CancellationToken.None);
		await addEntry({ resource: workingCopy2.resource, source: 'test-source' }, CancellationToken.None);
		await addEntry({ resource: workingCopy2.resource, source: 'test-source' }, CancellationToken.None);

		resources = await service.getAll(CancellationToken.None);
		assert.strictEqual(resources.length, 2);
		for (const resource of resources) {
			if (resource.toString() !== workingCopy1.resource.toString() && resource.toString() !== workingCopy2.resource.toString()) {
				assert.fail(`Unexpected history resource: ${resource.toString()}`);
			}
		}

		// Simulate shutdown
		const event = new TestWillShutdownEvent();
		service._lifecycleService.fireWillShutdown(event);
		await Promise.allSettled(event.value);

		// Resolve from disk fresh and verify again

		service.dispose();
		service = new TestWorkingCopyHistoryService(testDir);

		const workingCopy3 = new TestWorkingCopy(URI.file(testFile3Path));
		await addEntry({ resource: workingCopy3.resource, source: 'test-source' }, CancellationToken.None);

		resources = await service.getAll(CancellationToken.None);
		assert.strictEqual(resources.length, 3);
		for (const resource of resources) {
			if (resource.toString() !== workingCopy1.resource.toString() && resource.toString() !== workingCopy2.resource.toString() && resource.toString() !== workingCopy3.resource.toString()) {
				assert.fail(`Unexpected history resource: ${resource.toString()}`);
			}
		}
	});

	test('getAll - ignores resource when no entries exist', async () => {
		const workingCopy1 = new TestWorkingCopy(URI.file(testFile1Path));

		const entry = await addEntry({ resource: workingCopy1.resource, source: 'test-source' }, CancellationToken.None);

		let resources = await service.getAll(CancellationToken.None);
		assert.strictEqual(resources.length, 1);

		await service.removeEntry(entry, CancellationToken.None);

		resources = await service.getAll(CancellationToken.None);
		assert.strictEqual(resources.length, 0);

		// Simulate shutdown
		const event = new TestWillShutdownEvent();
		service._lifecycleService.fireWillShutdown(event);
		await Promise.allSettled(event.value);

		// Resolve from disk fresh and verify again

		service.dispose();
		service = new TestWorkingCopyHistoryService(testDir);

		resources = await service.getAll(CancellationToken.None);
		assert.strictEqual(resources.length, 0);
	});

	function assertEntryEqual(entryA: IWorkingCopyHistoryEntry, entryB: IWorkingCopyHistoryEntry, assertTimestamp = true): void {
		assert.strictEqual(entryA.id, entryB.id);
		assert.strictEqual(entryA.location.toString(), entryB.location.toString());
		if (assertTimestamp) {
			assert.strictEqual(entryA.timestamp, entryB.timestamp);
		}
		assert.strictEqual(entryA.source, entryB.source);
		assert.strictEqual(entryA.workingCopy.name, entryB.workingCopy.name);
		assert.strictEqual(entryA.workingCopy.resource.toString(), entryB.workingCopy.resource.toString());
	}

	test('entries cleaned up on shutdown', async () => {
		const workingCopy1 = new TestWorkingCopy(URI.file(testFile1Path));

		const entry1 = await addEntry({ resource: workingCopy1.resource, source: 'test-source' }, CancellationToken.None);
		const entry2 = await addEntry({ resource: workingCopy1.resource, source: 'other-source' }, CancellationToken.None);
		const entry3 = await addEntry({ resource: workingCopy1.resource, source: 'other-source' }, CancellationToken.None);
		const entry4 = await addEntry({ resource: workingCopy1.resource, source: 'other-source' }, CancellationToken.None);

		service._configurationService.setUserConfiguration('workbench.localHistory.maxFileEntries', 2);

		// Simulate shutdown
		let event = new TestWillShutdownEvent();
		service._lifecycleService.fireWillShutdown(event);
		await Promise.allSettled(event.value);

		assert.ok(!existsSync(entry1.location.fsPath));
		assert.ok(!existsSync(entry2.location.fsPath));
		assert.ok(existsSync(entry3.location.fsPath));
		assert.ok(existsSync(entry4.location.fsPath));

		// Resolve from disk fresh and verify again

		service.dispose();
		service = new TestWorkingCopyHistoryService(testDir);

		let entries = await service.getEntries(workingCopy1.resource, CancellationToken.None);
		assert.strictEqual(entries.length, 2);
		assertEntryEqual(entries[0], entry3);
		assertEntryEqual(entries[1], entry4);

		service._configurationService.setUserConfiguration('workbench.localHistory.maxFileEntries', 3);

		const entry5 = await addEntry({ resource: workingCopy1.resource, source: 'other-source' }, CancellationToken.None);

		// Simulate shutdown
		event = new TestWillShutdownEvent();
		service._lifecycleService.fireWillShutdown(event);
		await Promise.allSettled(event.value);

		assert.ok(existsSync(entry3.location.fsPath));
		assert.ok(existsSync(entry4.location.fsPath));
		assert.ok(existsSync(entry5.location.fsPath));

		// Resolve from disk fresh and verify again

		service.dispose();
		service = new TestWorkingCopyHistoryService(testDir);

		entries = await service.getEntries(workingCopy1.resource, CancellationToken.None);
		assert.strictEqual(entries.length, 3);
		assertEntryEqual(entries[0], entry3);
		assertEntryEqual(entries[1], entry4);
		assertEntryEqual(entries[2], entry5);
	});

	test('entries are merged when source is same', async () => {
		let replaced: IWorkingCopyHistoryEntry | undefined = undefined;
		service.onDidReplaceEntry(e => replaced = e.entry);

		const workingCopy1 = new TestWorkingCopy(URI.file(testFile1Path));

		service._configurationService.setUserConfiguration('workbench.localHistory.mergeWindow', 1);

		const entry1 = await addEntry({ resource: workingCopy1.resource, source: 'test-source' }, CancellationToken.None);
		assert.strictEqual(replaced, undefined);

		const entry2 = await addEntry({ resource: workingCopy1.resource, source: 'test-source' }, CancellationToken.None);
		assert.strictEqual(replaced, entry1);

		const entry3 = await addEntry({ resource: workingCopy1.resource, source: 'test-source' }, CancellationToken.None);
		assert.strictEqual(replaced, entry2);

		let entries = await service.getEntries(workingCopy1.resource, CancellationToken.None);
		assert.strictEqual(entries.length, 1);
		assertEntryEqual(entries[0], entry3);

		service._configurationService.setUserConfiguration('workbench.localHistory.mergeWindow', undefined);

		await addEntry({ resource: workingCopy1.resource, source: 'test-source' }, CancellationToken.None);
		await addEntry({ resource: workingCopy1.resource, source: 'test-source' }, CancellationToken.None);

		entries = await service.getEntries(workingCopy1.resource, CancellationToken.None);
		assert.strictEqual(entries.length, 3);
	});

	test('move entries (file rename)', async () => {
		const workingCopy = new TestWorkingCopy(URI.file(testFile1Path));

		const entry1 = await addEntry({ resource: workingCopy.resource, source: 'test-source' }, CancellationToken.None);
		const entry2 = await addEntry({ resource: workingCopy.resource, source: 'test-source' }, CancellationToken.None);
		const entry3 = await addEntry({ resource: workingCopy.resource, source: 'test-source' }, CancellationToken.None);

		let entries = await service.getEntries(workingCopy.resource, CancellationToken.None);
		assert.strictEqual(entries.length, 3);

		const renamedWorkingCopyResource = joinPath(resourcesDirname(workingCopy.resource), 'renamed.txt');
		await service._fileService.move(workingCopy.resource, renamedWorkingCopyResource);

		const result = await service.moveEntries(workingCopy.resource, renamedWorkingCopyResource);

		assert.strictEqual(result.length, 1);
		assert.strictEqual(result[0].toString(), renamedWorkingCopyResource.toString());

		entries = await service.getEntries(workingCopy.resource, CancellationToken.None);
		assert.strictEqual(entries.length, 0);

		entries = await service.getEntries(renamedWorkingCopyResource, CancellationToken.None);
		assert.strictEqual(entries.length, 4);

		assert.strictEqual(entries[0].id, entry1.id);
		assert.strictEqual(entries[0].timestamp, entry1.timestamp);
		assert.strictEqual(entries[0].source, entry1.source);
		assert.notStrictEqual(entries[0].location, entry1.location);
		assert.strictEqual(entries[0].workingCopy.resource.toString(), renamedWorkingCopyResource.toString());

		assert.strictEqual(entries[1].id, entry2.id);
		assert.strictEqual(entries[1].timestamp, entry2.timestamp);
		assert.strictEqual(entries[1].source, entry2.source);
		assert.notStrictEqual(entries[1].location, entry2.location);
		assert.strictEqual(entries[1].workingCopy.resource.toString(), renamedWorkingCopyResource.toString());

		assert.strictEqual(entries[2].id, entry3.id);
		assert.strictEqual(entries[2].timestamp, entry3.timestamp);
		assert.strictEqual(entries[2].source, entry3.source);
		assert.notStrictEqual(entries[2].location, entry3.location);
		assert.strictEqual(entries[2].workingCopy.resource.toString(), renamedWorkingCopyResource.toString());

		const all = await service.getAll(CancellationToken.None);
		assert.strictEqual(all.length, 1);
		assert.strictEqual(all[0].toString(), renamedWorkingCopyResource.toString());
	});

	test('entries moved (folder rename)', async () => {
		const workingCopy1 = new TestWorkingCopy(URI.file(testFile1Path));
		const workingCopy2 = new TestWorkingCopy(URI.file(testFile2Path));

		const entry1A = await addEntry({ resource: workingCopy1.resource, source: 'test-source' }, CancellationToken.None);
		const entry2A = await addEntry({ resource: workingCopy1.resource, source: 'test-source' }, CancellationToken.None);
		const entry3A = await addEntry({ resource: workingCopy1.resource, source: 'test-source' }, CancellationToken.None);

		const entry1B = await addEntry({ resource: workingCopy2.resource, source: 'test-source' }, CancellationToken.None);
		const entry2B = await addEntry({ resource: workingCopy2.resource, source: 'test-source' }, CancellationToken.None);
		const entry3B = await addEntry({ resource: workingCopy2.resource, source: 'test-source' }, CancellationToken.None);

		let entries = await service.getEntries(workingCopy1.resource, CancellationToken.None);
		assert.strictEqual(entries.length, 3);

		entries = await service.getEntries(workingCopy2.resource, CancellationToken.None);
		assert.strictEqual(entries.length, 3);

		const renamedWorkHome = joinPath(resourcesDirname(URI.file(workHome)), 'renamed');
		await service._fileService.move(URI.file(workHome), renamedWorkHome);

		const resources = await service.moveEntries(URI.file(workHome), renamedWorkHome);

		const renamedWorkingCopy1Resource = joinPath(renamedWorkHome, basename(workingCopy1.resource));
		const renamedWorkingCopy2Resource = joinPath(renamedWorkHome, basename(workingCopy2.resource));

		assert.strictEqual(resources.length, 2);
		for (const resource of resources) {
			if (resource.toString() !== renamedWorkingCopy1Resource.toString() && resource.toString() !== renamedWorkingCopy2Resource.toString()) {
				assert.fail(`Unexpected history resource: ${resource.toString()}`);
			}
		}

		entries = await service.getEntries(workingCopy1.resource, CancellationToken.None);
		assert.strictEqual(entries.length, 0);
		entries = await service.getEntries(workingCopy2.resource, CancellationToken.None);
		assert.strictEqual(entries.length, 0);

		entries = await service.getEntries(renamedWorkingCopy1Resource, CancellationToken.None);
		assert.strictEqual(entries.length, 4);

		assert.strictEqual(entries[0].id, entry1A.id);
		assert.strictEqual(entries[0].timestamp, entry1A.timestamp);
		assert.strictEqual(entries[0].source, entry1A.source);
		assert.notStrictEqual(entries[0].location, entry1A.location);
		assert.strictEqual(entries[0].workingCopy.resource.toString(), renamedWorkingCopy1Resource.toString());

		assert.strictEqual(entries[1].id, entry2A.id);
		assert.strictEqual(entries[1].timestamp, entry2A.timestamp);
		assert.strictEqual(entries[1].source, entry2A.source);
		assert.notStrictEqual(entries[1].location, entry2A.location);
		assert.strictEqual(entries[1].workingCopy.resource.toString(), renamedWorkingCopy1Resource.toString());

		assert.strictEqual(entries[2].id, entry3A.id);
		assert.strictEqual(entries[2].timestamp, entry3A.timestamp);
		assert.strictEqual(entries[2].source, entry3A.source);
		assert.notStrictEqual(entries[2].location, entry3A.location);
		assert.strictEqual(entries[2].workingCopy.resource.toString(), renamedWorkingCopy1Resource.toString());

		entries = await service.getEntries(renamedWorkingCopy2Resource, CancellationToken.None);
		assert.strictEqual(entries.length, 4);

		assert.strictEqual(entries[0].id, entry1B.id);
		assert.strictEqual(entries[0].timestamp, entry1B.timestamp);
		assert.strictEqual(entries[0].source, entry1B.source);
		assert.notStrictEqual(entries[0].location, entry1B.location);
		assert.strictEqual(entries[0].workingCopy.resource.toString(), renamedWorkingCopy2Resource.toString());

		assert.strictEqual(entries[1].id, entry2B.id);
		assert.strictEqual(entries[1].timestamp, entry2B.timestamp);
		assert.strictEqual(entries[1].source, entry2B.source);
		assert.notStrictEqual(entries[1].location, entry2B.location);
		assert.strictEqual(entries[1].workingCopy.resource.toString(), renamedWorkingCopy2Resource.toString());

		assert.strictEqual(entries[2].id, entry3B.id);
		assert.strictEqual(entries[2].timestamp, entry3B.timestamp);
		assert.strictEqual(entries[2].source, entry3B.source);
		assert.notStrictEqual(entries[2].location, entry3B.location);
		assert.strictEqual(entries[2].workingCopy.resource.toString(), renamedWorkingCopy2Resource.toString());

		const all = await service.getAll(CancellationToken.None);
		assert.strictEqual(all.length, 2);
		for (const resource of all) {
			if (resource.toString() !== renamedWorkingCopy1Resource.toString() && resource.toString() !== renamedWorkingCopy2Resource.toString()) {
				assert.fail(`Unexpected history resource: ${resource.toString()}`);
			}
		}
	});
});
