/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
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
import { isEqual } from 'vs/base/common/resources';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { UndoRedoService } from 'vs/platform/undoRedo/common/undoRedoService';
import { TestDialogService } from 'vs/platform/dialogs/test/common/testDialogService';
import { TestNotificationService } from 'vs/platform/notification/test/common/testNotificationService';

flakySuite('WorkingCopyHistoryTracker', () => {

	let testDir: string;
	let historyHome: string;

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

	setup(async () => {
		testDir = getRandomTestPath(tmpdir(), 'vsctests', 'workingcopyhistorytracker');
		historyHome = join(testDir, 'User', 'History');

		workingCopyHistoryService = new TestWorkingCopyHistoryService(testDir);
		workingCopyService = new WorkingCopyService();
		fileService = workingCopyHistoryService._fileService;
		configurationService = workingCopyHistoryService._configurationService;

		tracker = createTracker();

		await Promises.mkdir(historyHome, { recursive: true });

		testFile1Path = join(testDir, 'foo.txt');
		testFile2Path = join(testDir, 'bar.txt');

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
			new TestContextService()
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
});
