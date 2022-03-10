/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { flakySuite } from 'vs/base/test/common/testUtils';
import { TestWorkingCopy } from 'vs/workbench/test/common/workbenchTestServices';
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

flakySuite('WorkingCopyHistoryTracker', () => {

	let testDir: string;
	let historyHome: string;
	let workingCopyHistoryService: TestWorkingCopyHistoryService;
	let workingCopyService: WorkingCopyService;
	let tracker: WorkingCopyHistoryTracker;

	let testFile1Path: string;
	let testFile2Path: string;

	const testFile1PathContents = 'Hello Foo';
	const testFile2PathContents = [
		'Lorem ipsum ',
		'dolor öäü sit amet ',
		'adipiscing ßß elit',
		'consectetur '
	].join('');

	setup(async () => {
		testDir = getRandomTestPath(tmpdir(), 'vsctests', 'workingcopyhistorytracker');
		historyHome = join(testDir, 'User', 'History');

		workingCopyHistoryService = new TestWorkingCopyHistoryService(testDir);
		workingCopyService = new WorkingCopyService();

		tracker = new WorkingCopyHistoryTracker(workingCopyService, workingCopyHistoryService, new UriIdentityService(new TestFileService()), new TestPathService());

		await Promises.mkdir(historyHome, { recursive: true });

		testFile1Path = join(testDir, 'foo.txt');
		testFile2Path = join(testDir, 'bar.txt');

		await Promises.writeFile(testFile1Path, testFile1PathContents);
		await Promises.writeFile(testFile2Path, testFile2PathContents);
	});

	teardown(() => {
		workingCopyHistoryService.dispose();
		workingCopyService.dispose();
		tracker.dispose();

		return Promises.rm(testDir);
	});

	test('history entry added on save', async () => {
		const workingCopy1 = new TestWorkingCopy(URI.file(testFile1Path));
		const workingCopy2 = new TestWorkingCopy(URI.file(testFile2Path));

		workingCopyService.registerWorkingCopy(workingCopy1);
		workingCopyService.registerWorkingCopy(workingCopy2);

		await workingCopy1.save();
		await workingCopy2.save();
	});
});
