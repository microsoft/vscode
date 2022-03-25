/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Event } from 'vs/base/common/event';
import { flakySuite } from 'vs/base/test/common/testUtils';
import { TestContextService, TestWorkingCopy } from 'vs/workbench/test/common/workbenchTestServices';
import { getRandomTestPath } from 'vs/base/test/node/testUtils';
import { tmpdir } from 'os';
import { join } from 'vs/base/common/path';
import { Promises } from 'vs/base/node/pfs';
import { URI } from 'vs/base/common/uri';
import { TestWorkingCopyHistoryService } from 'vs/workbench/services/workingCopy/test/electron-browser/workingCopyHistoryService.test';
import { WorkingCopyHistoryTracker } from 'vs/workbench/services/workingCopy/common/workingCopyHistoryTracker';
import { WorkingCopyService } from 'vs/workbench/services/workingCopy/common/workingCopyService';
import { UriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentityService';
import { TestFileService, TestPathService } from 'vs/workbench/test/browser/workbenchTestServices';
import { DeferredPromise } from 'vs/base/common/async';
import { IFileService } from 'vs/platform/files/common/files';
import { Schemas } from 'vs/base/common/network';
import { basename, dirname, isEqual, joinPath } from 'vs/base/common/resources';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { UndoRedoService } from 'vs/platform/undoRedo/common/undoRedoService';
import { TestDialogService } from 'vs/platform/dialogs/test/common/testDialogService';
import { TestNotificationService } from 'vs/platform/notification/test/common/testNotificationService';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IWorkingCopyHistoryEntry, IWorkingCopyHistoryEntryDescriptor } from 'vs/workbench/services/workingCopy/common/workingCopyHistory';
import { assertIsDefined } from 'vs/base/common/types';

flakySuite('WorkingCopyHistoryTracker', () => {

	let testDir: string;
	let historyHome: string;
	let workHome: string;

	let workingCopyHistoryService: TestWorkingCopyHistoryService;
	let workingCopyService: WorkingCopyService;
	let fileService: IFileService;
	let configurationService: TestConfigurationService;

	let tracker: WorkingCopyHistoryTracker;

	let testFile1Path: string;
	let testFile2Path: string;

	const testFile1PathContents = 'Hello Foo';
	const testFile2PathContents = [
		'Lorem ipsum ',
		'dolor öäü sit amet ',
		'adipiscing ßß elit',
		'consectetur '
	].join('').repeat(1000);

	let increasingTimestampCounter = 1;

	async function addEntry(descriptor: IWorkingCopyHistoryEntryDescriptor, token: CancellationToken): Promise<IWorkingCopyHistoryEntry> {
		const entry = await workingCopyHistoryService.addEntry({
			...descriptor,
			timestamp: increasingTimestampCounter++ // very important to get tests to not be flaky with stable sort order
		}, token);

		return assertIsDefined(entry);
	}

	setup(async () => {
		testDir = getRandomTestPath(tmpdir(), 'vsctests', 'workingcopyhistorytracker');
		historyHome = join(testDir, 'User', 'History');
		workHome = join(testDir, 'work');

		workingCopyHistoryService = new TestWorkingCopyHistoryService(testDir);
		workingCopyService = new WorkingCopyService();
		fileService = workingCopyHistoryService._fileService;
		configurationService = workingCopyHistoryService._configurationService;

		tracker = createTracker();

		await Promises.mkdir(historyHome, { recursive: true });
		await Promises.mkdir(workHome, { recursive: true });

		testFile1Path = join(workHome, 'foo.txt');
		testFile2Path = join(workHome, 'bar.txt');

		await Promises.writeFile(testFile1Path, testFile1PathContents);
		await Promises.writeFile(testFile2Path, testFile2PathContents);
	});

	function createTracker() {
		return new WorkingCopyHistoryTracker(
			workingCopyService,
			workingCopyHistoryService,
			new UriIdentityService(new TestFileService()),
			new TestPathService(undefined, Schemas.file),
			configurationService,
			new UndoRedoService(new TestDialogService(), new TestNotificationService()),
			new TestContextService(),
			workingCopyHistoryService._fileService
		);
	}

	teardown(() => {
		workingCopyHistoryService.dispose();
		workingCopyService.dispose();
		tracker.dispose();

		return Promises.rm(testDir);
	});

	test('history entry added on save', async () => {
		const workingCopy1 = new TestWorkingCopy(URI.file(testFile1Path));
		const workingCopy2 = new TestWorkingCopy(URI.file(testFile2Path));

		const stat1 = await fileService.resolve(workingCopy1.resource, { resolveMetadata: true });
		const stat2 = await fileService.resolve(workingCopy2.resource, { resolveMetadata: true });

		workingCopyService.registerWorkingCopy(workingCopy1);
		workingCopyService.registerWorkingCopy(workingCopy2);

		const saveResult = new DeferredPromise<void>();
		let addedCounter = 0;
		workingCopyHistoryService.onDidAddEntry(e => {
			if (isEqual(e.entry.workingCopy.resource, workingCopy1.resource) || isEqual(e.entry.workingCopy.resource, workingCopy2.resource)) {
				addedCounter++;

				if (addedCounter === 2) {
					saveResult.complete();
				}
			}
		});

		await workingCopy1.save(undefined, stat1);
		await workingCopy2.save(undefined, stat2);

		await saveResult.p;
	});

	test('history entry skipped when setting disabled (globally)', async () => {
		configurationService.setUserConfiguration('workbench.localHistory.enabled', false, URI.file(testFile1Path));

		return assertNoLocalHistoryEntryAddedWithSettingsConfigured();
	});

	test('history entry skipped when setting disabled (exclude)', () => {
		configurationService.setUserConfiguration('workbench.localHistory.exclude', { '**/foo.txt': true });

		// Recreate to apply settings
		tracker.dispose();
		tracker = createTracker();

		return assertNoLocalHistoryEntryAddedWithSettingsConfigured();
	});

	test('history entry skipped when too large', async () => {
		configurationService.setUserConfiguration('workbench.localHistory.maxFileSize', 0, URI.file(testFile1Path));

		return assertNoLocalHistoryEntryAddedWithSettingsConfigured();
	});

	async function assertNoLocalHistoryEntryAddedWithSettingsConfigured(): Promise<void> {
		const workingCopy1 = new TestWorkingCopy(URI.file(testFile1Path));
		const workingCopy2 = new TestWorkingCopy(URI.file(testFile2Path));

		const stat1 = await fileService.resolve(workingCopy1.resource, { resolveMetadata: true });
		const stat2 = await fileService.resolve(workingCopy2.resource, { resolveMetadata: true });

		workingCopyService.registerWorkingCopy(workingCopy1);
		workingCopyService.registerWorkingCopy(workingCopy2);

		const saveResult = new DeferredPromise<void>();
		workingCopyHistoryService.onDidAddEntry(e => {
			if (isEqual(e.entry.workingCopy.resource, workingCopy1.resource)) {
				assert.fail('Unexpected working copy history entry: ' + e.entry.workingCopy.resource.toString());
			}

			if (isEqual(e.entry.workingCopy.resource, workingCopy2.resource)) {
				saveResult.complete();
			}
		});

		await workingCopy1.save(undefined, stat1);
		await workingCopy2.save(undefined, stat2);

		await saveResult.p;
	}

	test('entries moved (file rename)', async () => {
		const entriesMoved = Event.toPromise(workingCopyHistoryService.onDidMoveEntries);

		const workingCopy = new TestWorkingCopy(URI.file(testFile1Path));

		const entry1 = await addEntry({ resource: workingCopy.resource, source: 'test-source' }, CancellationToken.None);
		const entry2 = await addEntry({ resource: workingCopy.resource, source: 'test-source' }, CancellationToken.None);
		const entry3 = await addEntry({ resource: workingCopy.resource, source: 'test-source' }, CancellationToken.None);

		let entries = await workingCopyHistoryService.getEntries(workingCopy.resource, CancellationToken.None);
		assert.strictEqual(entries.length, 3);

		const renamedWorkingCopyResource = joinPath(dirname(workingCopy.resource), 'renamed.txt');
		await workingCopyHistoryService._fileService.move(workingCopy.resource, renamedWorkingCopyResource);

		await entriesMoved;

		entries = await workingCopyHistoryService.getEntries(workingCopy.resource, CancellationToken.None);
		assert.strictEqual(entries.length, 0);

		entries = await workingCopyHistoryService.getEntries(renamedWorkingCopyResource, CancellationToken.None);
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

		const all = await workingCopyHistoryService.getAll(CancellationToken.None);
		assert.strictEqual(all.length, 1);
		assert.strictEqual(all[0].toString(), renamedWorkingCopyResource.toString());
	});

	test('entries moved (folder rename)', async () => {
		const entriesMoved = Event.toPromise(workingCopyHistoryService.onDidMoveEntries);

		const workingCopy1 = new TestWorkingCopy(URI.file(testFile1Path));
		const workingCopy2 = new TestWorkingCopy(URI.file(testFile2Path));

		const entry1A = await addEntry({ resource: workingCopy1.resource, source: 'test-source' }, CancellationToken.None);
		const entry2A = await addEntry({ resource: workingCopy1.resource, source: 'test-source' }, CancellationToken.None);
		const entry3A = await addEntry({ resource: workingCopy1.resource, source: 'test-source' }, CancellationToken.None);

		const entry1B = await addEntry({ resource: workingCopy2.resource, source: 'test-source' }, CancellationToken.None);
		const entry2B = await addEntry({ resource: workingCopy2.resource, source: 'test-source' }, CancellationToken.None);
		const entry3B = await addEntry({ resource: workingCopy2.resource, source: 'test-source' }, CancellationToken.None);

		let entries = await workingCopyHistoryService.getEntries(workingCopy1.resource, CancellationToken.None);
		assert.strictEqual(entries.length, 3);

		entries = await workingCopyHistoryService.getEntries(workingCopy2.resource, CancellationToken.None);
		assert.strictEqual(entries.length, 3);

		const renamedWorkHome = joinPath(dirname(URI.file(workHome)), 'renamed');
		await workingCopyHistoryService._fileService.move(URI.file(workHome), renamedWorkHome);

		const renamedWorkingCopy1Resource = joinPath(renamedWorkHome, basename(workingCopy1.resource));
		const renamedWorkingCopy2Resource = joinPath(renamedWorkHome, basename(workingCopy2.resource));

		await entriesMoved;

		entries = await workingCopyHistoryService.getEntries(workingCopy1.resource, CancellationToken.None);
		assert.strictEqual(entries.length, 0);
		entries = await workingCopyHistoryService.getEntries(workingCopy2.resource, CancellationToken.None);
		assert.strictEqual(entries.length, 0);

		entries = await workingCopyHistoryService.getEntries(renamedWorkingCopy1Resource, CancellationToken.None);
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

		entries = await workingCopyHistoryService.getEntries(renamedWorkingCopy2Resource, CancellationToken.None);
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

		const all = await workingCopyHistoryService.getAll(CancellationToken.None);
		assert.strictEqual(all.length, 2);
		for (const resource of all) {
			if (resource.toString() !== renamedWorkingCopy1Resource.toString() && resource.toString() !== renamedWorkingCopy2Resource.toString()) {
				assert.fail(`Unexpected history resource: ${resource.toString()}`);
			}
		}
	});
});

