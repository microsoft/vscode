/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { TestContextService, TestStorageService, TestWorkingCopy } from '../../../../test/common/workbenchTestServices.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { IWorkingCopyHistoryEntry, IWorkingCopyHistoryEntryDescriptor, IWorkingCopyHistoryEvent } from '../../common/workingCopyHistory.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { UriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentityService.js';
import { LabelService } from '../../../label/common/labelService.js';
import { TestEnvironmentService, TestLifecycleService, TestPathService, TestRemoteAgentService, TestWillShutdownEvent } from '../../../../test/browser/workbenchTestServices.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { NativeWorkingCopyHistoryService } from '../../common/workingCopyHistoryService.js';
import { joinPath, dirname, basename } from '../../../../../base/common/resources.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { join } from '../../../../../base/common/path.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';

export class TestWorkingCopyHistoryService extends NativeWorkingCopyHistoryService {

	readonly _fileService: IFileService;
	readonly _configurationService: TestConfigurationService;
	readonly _lifecycleService: TestLifecycleService;

	constructor(disposables: DisposableStore, fileService?: IFileService) {
		const environmentService = TestEnvironmentService;
		const logService = new NullLogService();

		if (!fileService) {
			fileService = disposables.add(new FileService(logService));
			disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));
			disposables.add(fileService.registerProvider(Schemas.vscodeUserData, disposables.add(new InMemoryFileSystemProvider())));
		}

		const remoteAgentService = new TestRemoteAgentService();
		const uriIdentityService = disposables.add(new UriIdentityService(fileService));
		const lifecycleService = disposables.add(new TestLifecycleService());
		const labelService = disposables.add(new LabelService(environmentService, new TestContextService(), new TestPathService(), new TestRemoteAgentService(), disposables.add(new TestStorageService()), lifecycleService));
		const configurationService = new TestConfigurationService();

		super(fileService, remoteAgentService, environmentService, uriIdentityService, labelService, lifecycleService, logService, configurationService);

		this._fileService = fileService;
		this._configurationService = configurationService;
		this._lifecycleService = lifecycleService;
	}
}

suite('WorkingCopyHistoryService', () => {

	const disposables = new DisposableStore();

	let testDir: URI;
	let historyHome: URI;
	let workHome: URI;
	let service: TestWorkingCopyHistoryService;
	let fileService: IFileService;

	let testFile1Path: URI;
	let testFile2Path: URI;
	let testFile3Path: URI;

	const testFile1PathContents = 'Hello Foo';
	const testFile2PathContents = [
		'Lorem ipsum ',
		'dolor öäü sit amet ',
		'adipiscing ßß elit',
		'consectetur '
	].join('');
	const testFile3PathContents = 'Hello Bar';

	setup(async () => {
		testDir = URI.file(join(generateUuid(), 'vsctests', 'workingcopyhistoryservice')).with({ scheme: Schemas.inMemory });
		historyHome = joinPath(testDir, 'User', 'History');
		workHome = joinPath(testDir, 'work');

		service = disposables.add(new TestWorkingCopyHistoryService(disposables));
		fileService = service._fileService;

		await fileService.createFolder(historyHome);
		await fileService.createFolder(workHome);

		testFile1Path = joinPath(workHome, 'foo.txt');
		testFile2Path = joinPath(workHome, 'bar.txt');
		testFile3Path = joinPath(workHome, 'foo-bar.txt');

		await fileService.writeFile(testFile1Path, VSBuffer.fromString(testFile1PathContents));
		await fileService.writeFile(testFile2Path, VSBuffer.fromString(testFile2PathContents));
		await fileService.writeFile(testFile3Path, VSBuffer.fromString(testFile3PathContents));
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
			assert.strictEqual((await fileService.exists(entry.location)), true, 'Unexpected local history not stored');
		}

		return entry;
	}

	teardown(() => {
		disposables.clear();
	});

	test('addEntry', async () => {
		const addEvents: IWorkingCopyHistoryEvent[] = [];
		disposables.add(service.onDidAddEntry(e => addEvents.push(e)));

		const workingCopy1 = disposables.add(new TestWorkingCopy(testFile1Path));
		const workingCopy2 = disposables.add(new TestWorkingCopy(testFile2Path));

		// Add Entry works

		const entry1A = await addEntry({ resource: workingCopy1.resource }, CancellationToken.None);
		const entry2A = await addEntry({ resource: workingCopy2.resource, source: 'My Source' }, CancellationToken.None);

		assert.strictEqual((await fileService.readFile(entry1A.location)).value.toString(), testFile1PathContents);
		assert.strictEqual((await fileService.readFile(entry2A.location)).value.toString(), testFile2PathContents);

		assert.strictEqual(addEvents.length, 2);
		assert.strictEqual(addEvents[0].entry.workingCopy.resource.toString(), workingCopy1.resource.toString());
		assert.strictEqual(addEvents[1].entry.workingCopy.resource.toString(), workingCopy2.resource.toString());
		assert.strictEqual(addEvents[1].entry.source, 'My Source');

		const entry1B = await addEntry({ resource: workingCopy1.resource }, CancellationToken.None);
		const entry2B = await addEntry({ resource: workingCopy2.resource }, CancellationToken.None);

		assert.strictEqual((await fileService.readFile(entry1B.location)).value.toString(), testFile1PathContents);
		assert.strictEqual((await fileService.readFile(entry2B.location)).value.toString(), testFile2PathContents);

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

		const workingCopy3 = disposables.add(new TestWorkingCopy(testFile2Path.with({ scheme: 'unsupported' })));
		const entry3A = await addEntry({ resource: workingCopy3.resource }, CancellationToken.None, false);
		assert.ok(!entry3A);

		assert.strictEqual(addEvents.length, 4);
	});

	test('renameEntry', async () => {
		const changeEvents: IWorkingCopyHistoryEvent[] = [];
		disposables.add(service.onDidChangeEntry(e => changeEvents.push(e)));

		const workingCopy1 = disposables.add(new TestWorkingCopy(testFile1Path));

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

		// Resolve from file service fresh and verify again

		service.dispose();
		service = disposables.add(new TestWorkingCopyHistoryService(disposables, fileService));

		entries = await service.getEntries(workingCopy1.resource, CancellationToken.None);
		assert.strictEqual(entries.length, 3);
		assert.strictEqual(entries[0].source, 'Hello Rename');
	});

	test('removeEntry', async () => {
		const removeEvents: IWorkingCopyHistoryEvent[] = [];
		disposables.add(service.onDidRemoveEntry(e => removeEvents.push(e)));

		const workingCopy1 = disposables.add(new TestWorkingCopy(testFile1Path));

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

		// Resolve from file service fresh and verify again

		service.dispose();
		service = disposables.add(new TestWorkingCopyHistoryService(disposables, fileService));

		entries = await service.getEntries(workingCopy1.resource, CancellationToken.None);
		assert.strictEqual(entries.length, 3);
	});

	test('removeEntry - deletes history entries folder when last entry removed', async () => {
		const workingCopy1 = disposables.add(new TestWorkingCopy(testFile1Path));

		let entry: IWorkingCopyHistoryEntry | undefined = await addEntry({ resource: workingCopy1.resource }, CancellationToken.None);

		// Simulate shutdown
		let event = new TestWillShutdownEvent();
		service._lifecycleService.fireWillShutdown(event);
		await Promise.allSettled(event.value);

		// Resolve from file service fresh and verify again

		service.dispose();
		service = disposables.add(new TestWorkingCopyHistoryService(disposables, fileService));

		assert.strictEqual((await fileService.exists(dirname(entry.location))), true);

		entry = (await service.getEntries(workingCopy1.resource, CancellationToken.None)).at(0);
		assert.ok(entry);

		await service.removeEntry(entry, CancellationToken.None);

		// Simulate shutdown
		event = new TestWillShutdownEvent();
		service._lifecycleService.fireWillShutdown(event);
		await Promise.allSettled(event.value);

		// Resolve from file service fresh and verify again

		service.dispose();
		service = disposables.add(new TestWorkingCopyHistoryService(disposables, fileService));

		assert.strictEqual((await fileService.exists(dirname(entry.location))), false);
	});

	test('removeAll', async () => {
		let removed = false;
		disposables.add(service.onDidRemoveEntries(() => removed = true));

		const workingCopy1 = disposables.add(new TestWorkingCopy(testFile1Path));
		const workingCopy2 = disposables.add(new TestWorkingCopy(testFile2Path));

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

		// Resolve from file service fresh and verify again

		service.dispose();
		service = disposables.add(new TestWorkingCopyHistoryService(disposables, fileService));

		entries = await service.getEntries(workingCopy1.resource, CancellationToken.None);
		assert.strictEqual(entries.length, 0);
		entries = await service.getEntries(workingCopy2.resource, CancellationToken.None);
		assert.strictEqual(entries.length, 0);
	});

	test('getEntries - simple', async () => {
		const workingCopy1 = disposables.add(new TestWorkingCopy(testFile1Path));
		const workingCopy2 = disposables.add(new TestWorkingCopy(testFile2Path));

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
		const workingCopy1 = disposables.add(new TestWorkingCopy(testFile1Path));
		const workingCopy2 = disposables.add(new TestWorkingCopy(testFile2Path));

		const entry1 = await addEntry({ resource: workingCopy1.resource, source: 'test-source' }, CancellationToken.None);
		const entry2 = await addEntry({ resource: workingCopy2.resource }, CancellationToken.None);
		const entry3 = await addEntry({ resource: workingCopy2.resource, source: 'other-source' }, CancellationToken.None);

		// Simulate shutdown
		const event = new TestWillShutdownEvent();
		service._lifecycleService.fireWillShutdown(event);
		await Promise.allSettled(event.value);

		// Resolve from file service fresh and verify again

		service.dispose();
		service = disposables.add(new TestWorkingCopyHistoryService(disposables, fileService));

		let entries = await service.getEntries(workingCopy1.resource, CancellationToken.None);
		assert.strictEqual(entries.length, 1);
		assertEntryEqual(entries[0], entry1);

		entries = await service.getEntries(workingCopy2.resource, CancellationToken.None);
		assert.strictEqual(entries.length, 2);
		assertEntryEqual(entries[0], entry2);
		assertEntryEqual(entries[1], entry3);
	});

	test('getEntries - corrupt meta.json is no problem', async () => {
		const workingCopy1 = disposables.add(new TestWorkingCopy(testFile1Path));

		const entry1 = await addEntry({ resource: workingCopy1.resource }, CancellationToken.None);

		// Simulate shutdown
		const event = new TestWillShutdownEvent();
		service._lifecycleService.fireWillShutdown(event);
		await Promise.allSettled(event.value);

		// Resolve from file service fresh and verify again

		service.dispose();
		service = disposables.add(new TestWorkingCopyHistoryService(disposables, fileService));

		const metaFile = joinPath(dirname(entry1.location), 'entries.json');
		assert.ok((await fileService.exists(metaFile)));
		await fileService.del(metaFile);

		const entries = await service.getEntries(workingCopy1.resource, CancellationToken.None);
		assert.strictEqual(entries.length, 1);
		assertEntryEqual(entries[0], entry1, false /* skip timestamp that is unreliable when entries.json is gone */);
	});

	test('getEntries - missing entries from meta.json is no problem', async () => {
		const workingCopy1 = disposables.add(new TestWorkingCopy(testFile1Path));

		const entry1 = await addEntry({ resource: workingCopy1.resource }, CancellationToken.None);
		const entry2 = await addEntry({ resource: workingCopy1.resource }, CancellationToken.None);

		// Simulate shutdown
		const event = new TestWillShutdownEvent();
		service._lifecycleService.fireWillShutdown(event);
		await Promise.allSettled(event.value);

		// Resolve from file service fresh and verify again

		service.dispose();
		service = disposables.add(new TestWorkingCopyHistoryService(disposables, fileService));

		await fileService.del(entry1.location);

		const entries = await service.getEntries(workingCopy1.resource, CancellationToken.None);
		assert.strictEqual(entries.length, 1);
		assertEntryEqual(entries[0], entry2);
	});

	test('getEntries - in-memory and on-disk entries are merged', async () => {
		const workingCopy1 = disposables.add(new TestWorkingCopy(testFile1Path));

		const entry1 = await addEntry({ resource: workingCopy1.resource, source: 'test-source' }, CancellationToken.None);
		const entry2 = await addEntry({ resource: workingCopy1.resource, source: 'other-source' }, CancellationToken.None);

		// Simulate shutdown
		const event = new TestWillShutdownEvent();
		service._lifecycleService.fireWillShutdown(event);
		await Promise.allSettled(event.value);

		// Resolve from file service fresh and verify again

		service.dispose();
		service = disposables.add(new TestWorkingCopyHistoryService(disposables, fileService));

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
		const workingCopy1 = disposables.add(new TestWorkingCopy(testFile1Path));

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
		const workingCopy1 = disposables.add(new TestWorkingCopy(testFile1Path));
		const workingCopy2 = disposables.add(new TestWorkingCopy(testFile2Path));

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

		// Resolve from file service fresh and verify again

		service.dispose();
		service = disposables.add(new TestWorkingCopyHistoryService(disposables, fileService));

		const workingCopy3 = disposables.add(new TestWorkingCopy(testFile3Path));
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
		const workingCopy1 = disposables.add(new TestWorkingCopy(testFile1Path));

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

		// Resolve from file service fresh and verify again

		service.dispose();
		service = disposables.add(new TestWorkingCopyHistoryService(disposables, fileService));

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
		const workingCopy1 = disposables.add(new TestWorkingCopy(testFile1Path));

		const entry1 = await addEntry({ resource: workingCopy1.resource, source: 'test-source' }, CancellationToken.None);
		const entry2 = await addEntry({ resource: workingCopy1.resource, source: 'other-source' }, CancellationToken.None);
		const entry3 = await addEntry({ resource: workingCopy1.resource, source: 'other-source' }, CancellationToken.None);
		const entry4 = await addEntry({ resource: workingCopy1.resource, source: 'other-source' }, CancellationToken.None);

		service._configurationService.setUserConfiguration('workbench.localHistory.maxFileEntries', 2);

		// Simulate shutdown
		let event = new TestWillShutdownEvent();
		service._lifecycleService.fireWillShutdown(event);
		await Promise.allSettled(event.value);

		assert.ok(!(await fileService.exists(entry1.location)));
		assert.ok(!(await fileService.exists(entry2.location)));
		assert.ok((await fileService.exists(entry3.location)));
		assert.ok((await fileService.exists(entry4.location)));

		// Resolve from file service fresh and verify again

		service.dispose();
		service = disposables.add(new TestWorkingCopyHistoryService(disposables, fileService));

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

		assert.ok((await fileService.exists(entry3.location)));
		assert.ok((await fileService.exists(entry4.location)));
		assert.ok((await fileService.exists(entry5.location)));

		// Resolve from file service fresh and verify again

		service.dispose();
		service = disposables.add(new TestWorkingCopyHistoryService(disposables, fileService));

		entries = await service.getEntries(workingCopy1.resource, CancellationToken.None);
		assert.strictEqual(entries.length, 3);
		assertEntryEqual(entries[0], entry3);
		assertEntryEqual(entries[1], entry4);
		assertEntryEqual(entries[2], entry5);
	});

	test('entries are merged when source is same', async () => {
		let replaced: IWorkingCopyHistoryEntry | undefined = undefined;
		disposables.add(service.onDidReplaceEntry(e => replaced = e.entry));

		const workingCopy1 = disposables.add(new TestWorkingCopy(testFile1Path));

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
		const workingCopy = disposables.add(new TestWorkingCopy(testFile1Path));

		const entry1 = await addEntry({ resource: workingCopy.resource, source: 'test-source' }, CancellationToken.None);
		const entry2 = await addEntry({ resource: workingCopy.resource, source: 'test-source' }, CancellationToken.None);
		const entry3 = await addEntry({ resource: workingCopy.resource, source: 'test-source' }, CancellationToken.None);

		let entries = await service.getEntries(workingCopy.resource, CancellationToken.None);
		assert.strictEqual(entries.length, 3);

		const renamedWorkingCopyResource = joinPath(dirname(workingCopy.resource), 'renamed.txt');
		await fileService.move(workingCopy.resource, renamedWorkingCopyResource);

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
		assert.ok(!entries[0].sourceDescription);
		assert.notStrictEqual(entries[0].location, entry1.location);
		assert.strictEqual(entries[0].workingCopy.resource.toString(), renamedWorkingCopyResource.toString());

		assert.strictEqual(entries[1].id, entry2.id);
		assert.strictEqual(entries[1].timestamp, entry2.timestamp);
		assert.strictEqual(entries[1].source, entry2.source);
		assert.ok(!entries[1].sourceDescription);
		assert.notStrictEqual(entries[1].location, entry2.location);
		assert.strictEqual(entries[1].workingCopy.resource.toString(), renamedWorkingCopyResource.toString());

		assert.strictEqual(entries[2].id, entry3.id);
		assert.strictEqual(entries[2].timestamp, entry3.timestamp);
		assert.strictEqual(entries[2].source, entry3.source);
		assert.notStrictEqual(entries[2].location, entry3.location);
		assert.strictEqual(entries[2].workingCopy.resource.toString(), renamedWorkingCopyResource.toString());
		assert.ok(!entries[2].sourceDescription);

		assert.strictEqual(entries[3].source, 'renamed.source' /* for the move */);
		assert.ok(entries[3].sourceDescription); // contains the source working copy path

		const all = await service.getAll(CancellationToken.None);
		assert.strictEqual(all.length, 1);
		assert.strictEqual(all[0].toString(), renamedWorkingCopyResource.toString());
	});

	test('entries moved (folder rename)', async () => {
		const workingCopy1 = disposables.add(new TestWorkingCopy(testFile1Path));
		const workingCopy2 = disposables.add(new TestWorkingCopy(testFile2Path));

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

		const renamedWorkHome = joinPath(dirname(workHome), 'renamed');
		await fileService.move(workHome, renamedWorkHome);

		const resources = await service.moveEntries(workHome, renamedWorkHome);

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

		assert.strictEqual(entries[3].source, 'moved.source' /* for the move */);
		assert.ok(entries[3].sourceDescription); // contains the source working copy path

		const all = await service.getAll(CancellationToken.None);
		assert.strictEqual(all.length, 2);
		for (const resource of all) {
			if (resource.toString() !== renamedWorkingCopy1Resource.toString() && resource.toString() !== renamedWorkingCopy2Resource.toString()) {
				assert.fail(`Unexpected history resource: ${resource.toString()}`);
			}
		}
	});

	test('move entries (file rename) - preserves previous entries (no new entries)', async () => {
		const workingCopyTarget = disposables.add(new TestWorkingCopy(testFile1Path));
		const workingCopySource = disposables.add(new TestWorkingCopy(testFile2Path));

		const entry1 = await addEntry({ resource: workingCopyTarget.resource, source: 'test-source1' }, CancellationToken.None);
		const entry2 = await addEntry({ resource: workingCopyTarget.resource, source: 'test-source2' }, CancellationToken.None);
		const entry3 = await addEntry({ resource: workingCopyTarget.resource, source: 'test-source3' }, CancellationToken.None);

		let entries = await service.getEntries(workingCopyTarget.resource, CancellationToken.None);
		assert.strictEqual(entries.length, 3);

		entries = await service.getEntries(workingCopySource.resource, CancellationToken.None);
		assert.strictEqual(entries.length, 0);

		await fileService.move(workingCopySource.resource, workingCopyTarget.resource, true);

		const result = await service.moveEntries(workingCopySource.resource, workingCopyTarget.resource);

		assert.strictEqual(result.length, 1);
		assert.strictEqual(result[0].toString(), workingCopyTarget.resource.toString());

		entries = await service.getEntries(workingCopySource.resource, CancellationToken.None);
		assert.strictEqual(entries.length, 0);

		entries = await service.getEntries(workingCopyTarget.resource, CancellationToken.None);
		assert.strictEqual(entries.length, 4);

		assert.strictEqual(entries[0].id, entry1.id);
		assert.strictEqual(entries[0].timestamp, entry1.timestamp);
		assert.strictEqual(entries[0].source, entry1.source);
		assert.notStrictEqual(entries[0].location, entry1.location);
		assert.strictEqual(entries[0].workingCopy.resource.toString(), workingCopyTarget.resource.toString());

		assert.strictEqual(entries[1].id, entry2.id);
		assert.strictEqual(entries[1].timestamp, entry2.timestamp);
		assert.strictEqual(entries[1].source, entry2.source);
		assert.notStrictEqual(entries[1].location, entry2.location);
		assert.strictEqual(entries[1].workingCopy.resource.toString(), workingCopyTarget.resource.toString());

		assert.strictEqual(entries[2].id, entry3.id);
		assert.strictEqual(entries[2].timestamp, entry3.timestamp);
		assert.strictEqual(entries[2].source, entry3.source);
		assert.notStrictEqual(entries[2].location, entry3.location);
		assert.strictEqual(entries[2].workingCopy.resource.toString(), workingCopyTarget.resource.toString());

		assert.strictEqual(entries[3].source, 'renamed.source' /* for the move */);
		assert.ok(entries[3].sourceDescription); // contains the source working copy path

		const all = await service.getAll(CancellationToken.None);
		assert.strictEqual(all.length, 1);
		assert.strictEqual(all[0].toString(), workingCopyTarget.resource.toString());
	});

	test('move entries (file rename) - preserves previous entries (new entries)', async () => {
		const workingCopyTarget = disposables.add(new TestWorkingCopy(testFile1Path));
		const workingCopySource = disposables.add(new TestWorkingCopy(testFile2Path));

		const targetEntry1 = await addEntry({ resource: workingCopyTarget.resource, source: 'test-target1' }, CancellationToken.None);
		const targetEntry2 = await addEntry({ resource: workingCopyTarget.resource, source: 'test-target2' }, CancellationToken.None);
		const targetEntry3 = await addEntry({ resource: workingCopyTarget.resource, source: 'test-target3' }, CancellationToken.None);

		const sourceEntry1 = await addEntry({ resource: workingCopySource.resource, source: 'test-source1' }, CancellationToken.None);
		const sourceEntry2 = await addEntry({ resource: workingCopySource.resource, source: 'test-source2' }, CancellationToken.None);
		const sourceEntry3 = await addEntry({ resource: workingCopySource.resource, source: 'test-source3' }, CancellationToken.None);

		let entries = await service.getEntries(workingCopyTarget.resource, CancellationToken.None);
		assert.strictEqual(entries.length, 3);

		entries = await service.getEntries(workingCopySource.resource, CancellationToken.None);
		assert.strictEqual(entries.length, 3);

		await fileService.move(workingCopySource.resource, workingCopyTarget.resource, true);

		const result = await service.moveEntries(workingCopySource.resource, workingCopyTarget.resource);

		assert.strictEqual(result.length, 1);
		assert.strictEqual(result[0].toString(), workingCopyTarget.resource.toString());

		entries = await service.getEntries(workingCopySource.resource, CancellationToken.None);
		assert.strictEqual(entries.length, 0);

		entries = await service.getEntries(workingCopyTarget.resource, CancellationToken.None);
		assert.strictEqual(entries.length, 7);

		assert.strictEqual(entries[0].id, targetEntry1.id);
		assert.strictEqual(entries[0].timestamp, targetEntry1.timestamp);
		assert.strictEqual(entries[0].source, targetEntry1.source);
		assert.notStrictEqual(entries[0].location, targetEntry1.location);
		assert.strictEqual(entries[0].workingCopy.resource.toString(), workingCopyTarget.resource.toString());

		assert.strictEqual(entries[1].id, targetEntry2.id);
		assert.strictEqual(entries[1].timestamp, targetEntry2.timestamp);
		assert.strictEqual(entries[1].source, targetEntry2.source);
		assert.notStrictEqual(entries[1].location, targetEntry2.location);
		assert.strictEqual(entries[1].workingCopy.resource.toString(), workingCopyTarget.resource.toString());

		assert.strictEqual(entries[2].id, targetEntry3.id);
		assert.strictEqual(entries[2].timestamp, targetEntry3.timestamp);
		assert.strictEqual(entries[2].source, targetEntry3.source);
		assert.notStrictEqual(entries[2].location, targetEntry3.location);
		assert.strictEqual(entries[2].workingCopy.resource.toString(), workingCopyTarget.resource.toString());

		assert.strictEqual(entries[3].id, sourceEntry1.id);
		assert.strictEqual(entries[3].timestamp, sourceEntry1.timestamp);
		assert.strictEqual(entries[3].source, sourceEntry1.source);
		assert.notStrictEqual(entries[3].location, sourceEntry1.location);
		assert.strictEqual(entries[3].workingCopy.resource.toString(), workingCopyTarget.resource.toString());

		assert.strictEqual(entries[4].id, sourceEntry2.id);
		assert.strictEqual(entries[4].timestamp, sourceEntry2.timestamp);
		assert.strictEqual(entries[4].source, sourceEntry2.source);
		assert.notStrictEqual(entries[4].location, sourceEntry2.location);
		assert.strictEqual(entries[4].workingCopy.resource.toString(), workingCopyTarget.resource.toString());

		assert.strictEqual(entries[5].id, sourceEntry3.id);
		assert.strictEqual(entries[5].timestamp, sourceEntry3.timestamp);
		assert.strictEqual(entries[5].source, sourceEntry3.source);
		assert.notStrictEqual(entries[5].location, sourceEntry3.location);
		assert.strictEqual(entries[5].workingCopy.resource.toString(), workingCopyTarget.resource.toString());

		assert.strictEqual(entries[6].source, 'renamed.source' /* for the move */);
		assert.ok(entries[6].sourceDescription); // contains the source working copy path

		const all = await service.getAll(CancellationToken.None);
		assert.strictEqual(all.length, 1);
		assert.strictEqual(all[0].toString(), workingCopyTarget.resource.toString());
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
