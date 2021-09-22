/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { tmpdir } from 'os';
import { join } from 'vs/base/common/path';
import { isLinux, isWindows } from 'vs/base/common/platform';
import { Promises } from 'vs/base/node/pfs';
import { flakySuite, getPathFromAmdModule, getRandomTestPath } from 'vs/base/test/node/testUtils';
import { FileChangeType } from 'vs/platform/files/common/files';
import { NsfwWatcherService } from 'vs/platform/files/node/watcher/nsfw/nsfwWatcherService';
import { IWatchRequest } from 'vs/platform/files/node/watcher/watcher';

flakySuite('Recursive Watcher', () => {

	class TestNsfwWatcherService extends NsfwWatcherService {

		testNormalizePaths(paths: string[]): string[] {

			// Work with strings as paths to simplify testing
			const requests: IWatchRequest[] = paths.map(path => {
				return { path, excludes: [] };
			});

			return this.normalizeRequests(requests).map(request => request.path);
		}

		override async watch(requests: IWatchRequest[]): Promise<void> {
			await super.watch(requests);

			for (const [, watcher] of this.watchers) {
				await watcher.instance;
			}
		}
	}

	let testDir: string;
	let service: TestNsfwWatcherService;
	let enableLogging = false;

	setup(async () => {
		service = new TestNsfwWatcherService();

		if (enableLogging) {
			service.onDidLogMessage(e => console.log(`[recursive watcher test message] ${e.message}`));
		}

		testDir = getRandomTestPath(tmpdir(), 'vsctests', 'filewatcher');

		const sourceDir = getPathFromAmdModule(require, './fixtures/service');

		await Promises.copy(sourceDir, testDir, { preserveSymlinks: false });
	});

	teardown(async () => {
		await service.stop();

		return Promises.rm(testDir);
	});

	function awaitEvent(service: TestNsfwWatcherService, path: string, type: FileChangeType): Promise<void> {
		return new Promise(resolve => {
			const disposable = service.onDidChangeFile(events => {
				for (const event of events) {
					if (event.path === path && event.type === type) {
						disposable.dispose();
						resolve();
						break;
					}
				}
			});
		});
	}

	const runWatchTests = process.env['BUILD_SOURCEVERSION'] || process.env['CI'] || !!process.env['VSCODE_RUN_RECURSIVE_WATCH_TESTS'];

	(runWatchTests ? test : test.skip)('basics', async function () {
		await service.watch([{ path: testDir, excludes: [] }]);

		// New file
		const newFilePath = join(testDir, 'deep', 'newFile.txt');
		let changeFuture: Promise<unknown> = awaitEvent(service, newFilePath, FileChangeType.ADDED);
		await Promises.writeFile(newFilePath, 'Hello World');
		await changeFuture;

		// New folder
		const newFolderPath = join(testDir, 'deep', 'New Folder');
		changeFuture = awaitEvent(service, newFolderPath, FileChangeType.ADDED);
		await Promises.mkdir(newFolderPath);
		await changeFuture;

		// Rename file
		let renamedFilePath = join(testDir, 'deep', 'renamedFile.txt');
		changeFuture = Promise.all([
			awaitEvent(service, newFilePath, FileChangeType.DELETED),
			awaitEvent(service, renamedFilePath, FileChangeType.ADDED)
		]);
		await Promises.rename(newFilePath, renamedFilePath);
		await changeFuture;

		// Rename folder
		let renamedFolderPath = join(testDir, 'deep', 'Renamed Folder');
		changeFuture = Promise.all([
			awaitEvent(service, newFolderPath, FileChangeType.DELETED),
			awaitEvent(service, renamedFolderPath, FileChangeType.ADDED)
		]);
		await Promises.rename(newFolderPath, renamedFolderPath);
		await changeFuture;

		// TODO: case rename is currently broken
		// if (isWindows || isMacintosh) {

		// 	// Rename file (same name, different case)
		// 	const caseRenamedFilePath = join(testDir, 'deep', 'RenamedFile.txt');
		// 	changeFuture = Promise.all([
		// 		awaitEvent(service, renamedFilePath, FileChangeType.DELETED),
		// 		awaitEvent(service, caseRenamedFilePath, FileChangeType.ADDED)
		// 	]);
		// 	await Promises.rename(renamedFilePath, caseRenamedFilePath);
		// 	await changeFuture;
		// 	renamedFilePath = caseRenamedFilePath;

		// 	// Rename folder (same name, different case)
		// 	const caseRenamedFolderPath = join(testDir, 'deep', 'REnamed Folder');
		// 	changeFuture = Promise.all([
		// 		awaitEvent(service, renamedFolderPath, FileChangeType.DELETED),
		// 		awaitEvent(service, caseRenamedFolderPath, FileChangeType.ADDED)
		// 	]);
		// 	await Promises.rename(renamedFolderPath, caseRenamedFolderPath);
		// 	await changeFuture;
		// 	renamedFolderPath = caseRenamedFolderPath;
		// }

		// Move file
		const movedFilepath = join(testDir, 'movedFile.txt');
		changeFuture = Promise.all([
			awaitEvent(service, renamedFilePath, FileChangeType.DELETED),
			awaitEvent(service, movedFilepath, FileChangeType.ADDED)
		]);
		await Promises.rename(renamedFilePath, movedFilepath);
		await changeFuture;

		// Move folder
		const movedFolderpath = join(testDir, 'Moved Folder');
		changeFuture = Promise.all([
			awaitEvent(service, renamedFolderPath, FileChangeType.DELETED),
			awaitEvent(service, movedFolderpath, FileChangeType.ADDED)
		]);
		await Promises.rename(renamedFolderPath, movedFolderpath);
		await changeFuture;

		// Copy file
		const copiedFilepath = join(testDir, 'deep', 'copiedFile.txt');
		changeFuture = awaitEvent(service, copiedFilepath, FileChangeType.ADDED);
		await Promises.copyFile(movedFilepath, copiedFilepath);
		await changeFuture;

		// Copy folder
		const copiedFolderpath = join(testDir, 'deep', 'Copied Folder');
		changeFuture = awaitEvent(service, copiedFolderpath, FileChangeType.ADDED);
		await Promises.copy(movedFolderpath, copiedFolderpath, { preserveSymlinks: false });
		await changeFuture;

		// Change file
		changeFuture = awaitEvent(service, copiedFilepath, FileChangeType.UPDATED);
		await Promises.writeFile(copiedFilepath, 'Hello Change');
		await changeFuture;

		// Change file (atomic)
		changeFuture = awaitEvent(service, copiedFilepath, FileChangeType.ADDED);
		const tempFilePath = join(testDir, 'deep', 'tmpfile');
		await Promises.writeFile(tempFilePath, 'Hello Atomic Change');
		await Promises.unlink(copiedFilepath);
		await Promises.rename(tempFilePath, copiedFilepath);
		await changeFuture;

		// Delete file
		changeFuture = awaitEvent(service, copiedFilepath, FileChangeType.DELETED);
		await Promises.unlink(copiedFilepath);
		await changeFuture;

		// Delete folder
		changeFuture = awaitEvent(service, copiedFolderpath, FileChangeType.DELETED);
		await Promises.rmdir(copiedFolderpath);
		await changeFuture;
	});

	(runWatchTests ? test : test.skip)('subsequent watch updates watchers', async function () {
		await service.watch([{ path: testDir, excludes: ['**/*.js'] }]);

		// New file (*.txt)
		let newTextFilePath = join(testDir, 'deep', 'newFile.txt');
		let changeFuture: Promise<unknown> = awaitEvent(service, newTextFilePath, FileChangeType.ADDED);
		await Promises.writeFile(newTextFilePath, 'Hello World');
		await changeFuture;

		await service.watch([{ path: join(testDir, 'deep'), excludes: ['**/*.js'] }]);
		newTextFilePath = join(testDir, 'deep', 'newFile2.txt');
		changeFuture = awaitEvent(service, newTextFilePath, FileChangeType.ADDED);
		await Promises.writeFile(newTextFilePath, 'Hello World');
		await changeFuture;

		await service.watch([{ path: join(testDir, 'deep'), excludes: ['**/*.txt'] }]);
		await service.watch([{ path: join(testDir, 'deep'), excludes: [] }]);
		newTextFilePath = join(testDir, 'deep', 'newFile3.txt');
		changeFuture = awaitEvent(service, newTextFilePath, FileChangeType.ADDED);
		await Promises.writeFile(newTextFilePath, 'Hello World');
		await changeFuture;

		return service.stop();
	});

	((isWindows /* windows: cannot create file symbolic link without elevated context */ || !runWatchTests) ? test.skip : test)('symlink support (root)', async function () {
		const link = join(testDir, 'deep-linked');
		const linkTarget = join(testDir, 'deep');
		await Promises.symlink(linkTarget, link);

		await service.watch([{ path: link, excludes: [] }]);

		// New file
		const newFilePath = join(link, 'newFile.txt');
		let changeFuture: Promise<unknown> = awaitEvent(service, newFilePath, FileChangeType.ADDED);
		await Promises.writeFile(newFilePath, 'Hello World');
		await changeFuture;
	});

	((isWindows /* windows: cannot create file symbolic link without elevated context */ || !runWatchTests) ? test.skip : test)('symlink support (via extra watch)', async function () {
		const link = join(testDir, 'deep-linked');
		const linkTarget = join(testDir, 'deep');
		await Promises.symlink(linkTarget, link);

		await service.watch([{ path: testDir, excludes: [] }, { path: link, excludes: [] }]);

		// New file
		const newFilePath = join(link, 'newFile.txt');
		let changeFuture: Promise<unknown> = awaitEvent(service, newFilePath, FileChangeType.ADDED);
		await Promises.writeFile(newFilePath, 'Hello World');
		await changeFuture;
	});

	((isLinux /* linux: is case sensitive */ || !runWatchTests) ? test.skip : test)('wrong casing', async function () {
		const deepWrongCasedPath = join(testDir, 'DEEP');

		await service.watch([{ path: deepWrongCasedPath, excludes: [] }]);

		// New file
		const newFilePath = join(deepWrongCasedPath, 'newFile.txt');
		let changeFuture: Promise<unknown> = awaitEvent(service, newFilePath, FileChangeType.ADDED);
		await Promises.writeFile(newFilePath, 'Hello World');
		await changeFuture;
	});

	test('should not exclude roots that do not overlap', () => {
		if (isWindows) {
			assert.deepStrictEqual(service.testNormalizePaths(['C:\\a']), ['C:\\a']);
			assert.deepStrictEqual(service.testNormalizePaths(['C:\\a', 'C:\\b']), ['C:\\a', 'C:\\b']);
			assert.deepStrictEqual(service.testNormalizePaths(['C:\\a', 'C:\\b', 'C:\\c\\d\\e']), ['C:\\a', 'C:\\b', 'C:\\c\\d\\e']);
		} else {
			assert.deepStrictEqual(service.testNormalizePaths(['/a']), ['/a']);
			assert.deepStrictEqual(service.testNormalizePaths(['/a', '/b']), ['/a', '/b']);
			assert.deepStrictEqual(service.testNormalizePaths(['/a', '/b', '/c/d/e']), ['/a', '/b', '/c/d/e']);
		}
	});

	test('should remove sub-folders of other paths', () => {
		if (isWindows) {
			assert.deepStrictEqual(service.testNormalizePaths(['C:\\a', 'C:\\a\\b']), ['C:\\a']);
			assert.deepStrictEqual(service.testNormalizePaths(['C:\\a', 'C:\\b', 'C:\\a\\b']), ['C:\\a', 'C:\\b']);
			assert.deepStrictEqual(service.testNormalizePaths(['C:\\b\\a', 'C:\\a', 'C:\\b', 'C:\\a\\b']), ['C:\\a', 'C:\\b']);
			assert.deepStrictEqual(service.testNormalizePaths(['C:\\a', 'C:\\a\\b', 'C:\\a\\c\\d']), ['C:\\a']);
		} else {
			assert.deepStrictEqual(service.testNormalizePaths(['/a', '/a/b']), ['/a']);
			assert.deepStrictEqual(service.testNormalizePaths(['/a', '/b', '/a/b']), ['/a', '/b']);
			assert.deepStrictEqual(service.testNormalizePaths(['/b/a', '/a', '/b', '/a/b']), ['/a', '/b']);
			assert.deepStrictEqual(service.testNormalizePaths(['/a', '/a/b', '/a/c/d']), ['/a']);
		}
	});
});
