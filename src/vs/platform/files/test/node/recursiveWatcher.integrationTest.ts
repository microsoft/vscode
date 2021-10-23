/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { realpathSync } from 'fs';
import { tmpdir } from 'os';
import { timeout } from 'vs/base/common/async';
import { dirname, join, sep } from 'vs/base/common/path';
import { isLinux, isWindows } from 'vs/base/common/platform';
import { Promises, RimRafMode } from 'vs/base/node/pfs';
import { flakySuite, getPathFromAmdModule, getRandomTestPath } from 'vs/base/test/node/testUtils';
import { FileChangeType } from 'vs/platform/files/common/files';
import { IWatcher, ParcelWatcherService } from 'vs/platform/files/node/watcher/parcel/parcelWatcherService';
import { IWatchRequest } from 'vs/platform/files/common/watcher';

flakySuite('Recursive Watcher (parcel)', () => {

	class TestParcelWatcherService extends ParcelWatcherService {

		testNormalizePaths(paths: string[]): string[] {

			// Work with strings as paths to simplify testing
			const requests: IWatchRequest[] = paths.map(path => {
				return { path, excludes: [] };
			});

			return this.normalizeRequests(requests).map(request => request.path);
		}

		override async watch(requests: IWatchRequest[]): Promise<void> {
			await super.watch(requests);
			await this.whenReady();
		}

		async whenReady(): Promise<void> {
			for (const [, watcher] of this.watchers) {
				await watcher.ready;
			}
		}

		override toExcludePaths(path: string, excludes: string[] | undefined): string[] | undefined {
			return super.toExcludePaths(path, excludes);
		}

		override  restartWatching(watcher: IWatcher, delay = 10): void {
			return super.restartWatching(watcher, delay);
		}
	}

	let testDir: string;
	let service: TestParcelWatcherService;

	let loggingEnabled = false;

	function enableLogging(enable: boolean) {
		loggingEnabled = enable;
		service?.setVerboseLogging(enable);
	}

	enableLogging(false);

	setup(async () => {
		service = new TestParcelWatcherService();

		service.onDidLogMessage(e => {
			if (loggingEnabled) {
				console.log(`[recursive watcher test message] ${e.message}`);
			}
		});

		testDir = getRandomTestPath(tmpdir(), 'vsctests', 'filewatcher');

		const sourceDir = getPathFromAmdModule(require, './fixtures/service');

		await Promises.copy(sourceDir, testDir, { preserveSymlinks: false });
	});

	teardown(async () => {
		await service.stop();

		// Possible that the file watcher is still holding
		// onto the folders on Windows specifically and the
		// unlink would fail. In that case, do not fail the
		// test suite.
		return Promises.rm(testDir).catch(error => console.error(error));
	});

	function toMsg(type: FileChangeType): string {
		switch (type) {
			case FileChangeType.ADDED: return 'added';
			case FileChangeType.DELETED: return 'deleted';
			default: return 'changed';
		}
	}

	async function awaitEvent(service: TestParcelWatcherService, path: string, type: FileChangeType, failOnEventReason?: string): Promise<void> {
		if (loggingEnabled) {
			console.log(`Awaiting change type '${toMsg(type)}' on file '${path}'`);
		}

		// Await the event
		await new Promise<void>((resolve, reject) => {
			const disposable = service.onDidChangeFile(events => {
				for (const event of events) {
					if (event.path === path && event.type === type) {
						disposable.dispose();
						if (failOnEventReason) {
							reject(new Error(`Unexpected file event: ${failOnEventReason}`));
						} else {
							resolve();
						}
						break;
					}
				}
			});
		});
	}

	test('basics', async function () {
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

		// Rename file (same name, different case)
		const caseRenamedFilePath = join(testDir, 'deep', 'RenamedFile.txt');
		changeFuture = Promise.all([
			awaitEvent(service, renamedFilePath, FileChangeType.DELETED),
			awaitEvent(service, caseRenamedFilePath, FileChangeType.ADDED)
		]);
		await Promises.rename(renamedFilePath, caseRenamedFilePath);
		await changeFuture;
		renamedFilePath = caseRenamedFilePath;

		// Rename folder (same name, different case)
		const caseRenamedFolderPath = join(testDir, 'deep', 'REnamed Folder');
		changeFuture = Promise.all([
			awaitEvent(service, renamedFolderPath, FileChangeType.DELETED),
			awaitEvent(service, caseRenamedFolderPath, FileChangeType.ADDED)
		]);
		await Promises.rename(renamedFolderPath, caseRenamedFolderPath);
		await changeFuture;
		renamedFolderPath = caseRenamedFolderPath;

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

		// Read file does not emit event
		changeFuture = awaitEvent(service, copiedFilepath, FileChangeType.UPDATED, 'unexpected-event-from-read-file');
		await Promises.readFile(copiedFilepath);
		await Promise.race([timeout(100), changeFuture]);

		// Stat file does not emit event
		changeFuture = awaitEvent(service, copiedFilepath, FileChangeType.UPDATED, 'unexpected-event-from-stat');
		await Promises.stat(copiedFilepath);
		await Promise.race([timeout(100), changeFuture]);

		// Delete file
		changeFuture = awaitEvent(service, copiedFilepath, FileChangeType.DELETED);
		await Promises.unlink(copiedFilepath);
		await changeFuture;

		// Delete folder
		changeFuture = awaitEvent(service, copiedFolderpath, FileChangeType.DELETED);
		await Promises.rmdir(copiedFolderpath);
		await changeFuture;
	});

	(!isLinux /* polling is only used in linux environments (WSL) */ ? test.skip : test)('basics (polling)', async function () {
		await service.watch([{ path: testDir, excludes: [], pollingInterval: 100 }]);

		// New file
		const newFilePath = join(testDir, 'deep', 'newFile.txt');
		let changeFuture: Promise<unknown> = awaitEvent(service, newFilePath, FileChangeType.ADDED);
		await Promises.writeFile(newFilePath, 'Hello World');
		await changeFuture;

		// Change file
		changeFuture = awaitEvent(service, newFilePath, FileChangeType.UPDATED);
		await Promises.writeFile(newFilePath, 'Hello Change');
		await changeFuture;

		// Delete file
		changeFuture = awaitEvent(service, newFilePath, FileChangeType.DELETED);
		await Promises.unlink(newFilePath);
		await changeFuture;
	});

	test('multiple events', async function () {
		await service.watch([{ path: testDir, excludes: [] }]);
		await Promises.mkdir(join(testDir, 'deep-multiple'));

		// multiple add

		const newFilePath1 = join(testDir, 'newFile-1.txt');
		const newFilePath2 = join(testDir, 'newFile-2.txt');
		const newFilePath3 = join(testDir, 'newFile-3.txt');
		const newFilePath4 = join(testDir, 'deep-multiple', 'newFile-1.txt');
		const newFilePath5 = join(testDir, 'deep-multiple', 'newFile-2.txt');
		const newFilePath6 = join(testDir, 'deep-multiple', 'newFile-3.txt');

		const addedFuture1: Promise<unknown> = awaitEvent(service, newFilePath1, FileChangeType.ADDED);
		const addedFuture2: Promise<unknown> = awaitEvent(service, newFilePath2, FileChangeType.ADDED);
		const addedFuture3: Promise<unknown> = awaitEvent(service, newFilePath3, FileChangeType.ADDED);
		const addedFuture4: Promise<unknown> = awaitEvent(service, newFilePath4, FileChangeType.ADDED);
		const addedFuture5: Promise<unknown> = awaitEvent(service, newFilePath5, FileChangeType.ADDED);
		const addedFuture6: Promise<unknown> = awaitEvent(service, newFilePath6, FileChangeType.ADDED);

		await Promise.all([
			await Promises.writeFile(newFilePath1, 'Hello World 1'),
			await Promises.writeFile(newFilePath2, 'Hello World 2'),
			await Promises.writeFile(newFilePath3, 'Hello World 3'),
			await Promises.writeFile(newFilePath4, 'Hello World 4'),
			await Promises.writeFile(newFilePath5, 'Hello World 5'),
			await Promises.writeFile(newFilePath6, 'Hello World 6')
		]);

		await Promise.all([addedFuture1, addedFuture2, addedFuture3, addedFuture4, addedFuture5, addedFuture6]);

		// multiple change

		const changeFuture1: Promise<unknown> = awaitEvent(service, newFilePath1, FileChangeType.UPDATED);
		const changeFuture2: Promise<unknown> = awaitEvent(service, newFilePath2, FileChangeType.UPDATED);
		const changeFuture3: Promise<unknown> = awaitEvent(service, newFilePath3, FileChangeType.UPDATED);
		const changeFuture4: Promise<unknown> = awaitEvent(service, newFilePath4, FileChangeType.UPDATED);
		const changeFuture5: Promise<unknown> = awaitEvent(service, newFilePath5, FileChangeType.UPDATED);
		const changeFuture6: Promise<unknown> = awaitEvent(service, newFilePath6, FileChangeType.UPDATED);

		await Promise.all([
			await Promises.writeFile(newFilePath1, 'Hello Update 1'),
			await Promises.writeFile(newFilePath2, 'Hello Update 2'),
			await Promises.writeFile(newFilePath3, 'Hello Update 3'),
			await Promises.writeFile(newFilePath4, 'Hello Update 4'),
			await Promises.writeFile(newFilePath5, 'Hello Update 5'),
			await Promises.writeFile(newFilePath6, 'Hello Update 6')
		]);

		await Promise.all([changeFuture1, changeFuture2, changeFuture3, changeFuture4, changeFuture5, changeFuture6]);

		// copy with multiple files

		const copyFuture1: Promise<unknown> = awaitEvent(service, join(testDir, 'deep-multiple-copy', 'newFile-1.txt'), FileChangeType.ADDED);
		const copyFuture2: Promise<unknown> = awaitEvent(service, join(testDir, 'deep-multiple-copy', 'newFile-2.txt'), FileChangeType.ADDED);
		const copyFuture3: Promise<unknown> = awaitEvent(service, join(testDir, 'deep-multiple-copy', 'newFile-3.txt'), FileChangeType.ADDED);
		const copyFuture4: Promise<unknown> = awaitEvent(service, join(testDir, 'deep-multiple-copy'), FileChangeType.ADDED);

		await Promises.copy(join(testDir, 'deep-multiple'), join(testDir, 'deep-multiple-copy'), { preserveSymlinks: false });

		await Promise.all([copyFuture1, copyFuture2, copyFuture3, copyFuture4]);

		// multiple delete (single files)

		const deleteFuture1: Promise<unknown> = awaitEvent(service, newFilePath1, FileChangeType.DELETED);
		const deleteFuture2: Promise<unknown> = awaitEvent(service, newFilePath2, FileChangeType.DELETED);
		const deleteFuture3: Promise<unknown> = awaitEvent(service, newFilePath3, FileChangeType.DELETED);
		const deleteFuture4: Promise<unknown> = awaitEvent(service, newFilePath4, FileChangeType.DELETED);
		const deleteFuture5: Promise<unknown> = awaitEvent(service, newFilePath5, FileChangeType.DELETED);
		const deleteFuture6: Promise<unknown> = awaitEvent(service, newFilePath6, FileChangeType.DELETED);

		await Promise.all([
			await Promises.unlink(newFilePath1),
			await Promises.unlink(newFilePath2),
			await Promises.unlink(newFilePath3),
			await Promises.unlink(newFilePath4),
			await Promises.unlink(newFilePath5),
			await Promises.unlink(newFilePath6)
		]);

		await Promise.all([deleteFuture1, deleteFuture2, deleteFuture3, deleteFuture4, deleteFuture5, deleteFuture6]);

		// multiple delete (folder)

		const deleteFolderFuture1: Promise<unknown> = awaitEvent(service, join(testDir, 'deep-multiple'), FileChangeType.DELETED);
		const deleteFolderFuture2: Promise<unknown> = awaitEvent(service, join(testDir, 'deep-multiple-copy'), FileChangeType.DELETED);

		await Promise.all([Promises.rm(join(testDir, 'deep-multiple'), RimRafMode.UNLINK), Promises.rm(join(testDir, 'deep-multiple-copy'), RimRafMode.UNLINK)]);

		await Promise.all([deleteFolderFuture1, deleteFolderFuture2]);
	});

	test('subsequent watch updates watchers (path)', async function () {
		await service.watch([{ path: testDir, excludes: [join(realpathSync(testDir), 'unrelated')] }]);

		// New file (*.txt)
		let newTextFilePath = join(testDir, 'deep', 'newFile.txt');
		let changeFuture: Promise<unknown> = awaitEvent(service, newTextFilePath, FileChangeType.ADDED);
		await Promises.writeFile(newTextFilePath, 'Hello World');
		await changeFuture;

		await service.watch([{ path: join(testDir, 'deep'), excludes: [join(realpathSync(testDir), 'unrelated')] }]);
		newTextFilePath = join(testDir, 'deep', 'newFile2.txt');
		changeFuture = awaitEvent(service, newTextFilePath, FileChangeType.ADDED);
		await Promises.writeFile(newTextFilePath, 'Hello World');
		await changeFuture;

		await service.watch([{ path: join(testDir, 'deep'), excludes: [realpathSync(testDir)] }]);
		await service.watch([{ path: join(testDir, 'deep'), excludes: [] }]);
		newTextFilePath = join(testDir, 'deep', 'newFile3.txt');
		changeFuture = awaitEvent(service, newTextFilePath, FileChangeType.ADDED);
		await Promises.writeFile(newTextFilePath, 'Hello World');
		await changeFuture;

		return service.stop();
	});

	test('subsequent watch updates watchers (excludes)', async function () {
		await service.watch([{ path: testDir, excludes: [realpathSync(testDir)] }]);
		await service.watch([{ path: testDir, excludes: [] }]);

		// New file (*.txt)
		let newTextFilePath = join(testDir, 'deep', 'newFile.txt');
		let changeFuture: Promise<unknown> = awaitEvent(service, newTextFilePath, FileChangeType.ADDED);
		await Promises.writeFile(newTextFilePath, 'Hello World');
		await changeFuture;

		return service.stop();
	});

	(isWindows /* windows: cannot create file symbolic link without elevated context */ ? test.skip : test)('symlink support (root)', async function () {
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

	(isWindows /* windows: cannot create file symbolic link without elevated context */ ? test.skip : test)('symlink support (via extra watch)', async function () {
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

	(isLinux /* linux: is case sensitive */ ? test.skip : test)('wrong casing', async function () {
		const deepWrongCasedPath = join(testDir, 'DEEP');

		await service.watch([{ path: deepWrongCasedPath, excludes: [] }]);

		// New file
		const newFilePath = join(deepWrongCasedPath, 'newFile.txt');
		let changeFuture: Promise<unknown> = awaitEvent(service, newFilePath, FileChangeType.ADDED);
		await Promises.writeFile(newFilePath, 'Hello World');
		await changeFuture;
	});

	test('invalid folder does not explode', async function () {
		const invalidPath = join(testDir, 'invalid');

		await service.watch([{ path: invalidPath, excludes: [] }]);
	});

	test('deleting watched path is handled properly', async function () {
		const watchedPath = join(testDir, 'deep');

		await service.watch([{ path: watchedPath, excludes: [] }]);

		// Delete watched path
		let changeFuture: Promise<unknown> = awaitEvent(service, watchedPath, FileChangeType.DELETED);
		await Promises.rm(watchedPath, RimRafMode.UNLINK);
		await changeFuture;

		// Restore watched path
		changeFuture = awaitEvent(service, watchedPath, FileChangeType.ADDED);
		await Promises.mkdir(watchedPath);
		await changeFuture;

		await timeout(20); // restart is delayed
		await service.whenReady();

		// Verify events come in again
		const newFilePath = join(watchedPath, 'newFile.txt');
		changeFuture = awaitEvent(service, newFilePath, FileChangeType.ADDED);
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

	test('excludes are converted to absolute paths', () => {

		// undefined / empty

		assert.strictEqual(service.toExcludePaths(testDir, undefined), undefined);
		assert.strictEqual(service.toExcludePaths(testDir, []), undefined);

		// absolute paths

		let excludes = service.toExcludePaths(testDir, [testDir]);
		assert.strictEqual(excludes?.length, 1);
		assert.strictEqual(excludes[0], testDir);

		excludes = service.toExcludePaths(testDir, [`${testDir}${sep}`, join(testDir, 'foo', 'bar'), `${join(testDir, 'other', 'deep')}${sep}`]);
		assert.strictEqual(excludes?.length, 3);
		assert.strictEqual(excludes[0], testDir);
		assert.strictEqual(excludes[1], join(testDir, 'foo', 'bar'));
		assert.strictEqual(excludes[2], join(testDir, 'other', 'deep'));

		// wrong casing is normalized for root
		if (!isLinux) {
			excludes = service.toExcludePaths(testDir, [join(testDir.toUpperCase(), 'node_modules', '**')]);
			assert.strictEqual(excludes?.length, 1);
			assert.strictEqual(excludes[0], join(testDir, 'node_modules'));
		}

		// exclude ignored if not parent of watched dir
		excludes = service.toExcludePaths(testDir, [join(dirname(testDir), 'node_modules', '**')]);
		assert.strictEqual(excludes, undefined);

		// relative paths

		excludes = service.toExcludePaths(testDir, ['.']);
		assert.strictEqual(excludes?.length, 1);
		assert.strictEqual(excludes[0], testDir);

		excludes = service.toExcludePaths(testDir, ['foo', `bar${sep}`, join('foo', 'bar'), `${join('other', 'deep')}${sep}`]);
		assert.strictEqual(excludes?.length, 4);
		assert.strictEqual(excludes[0], join(testDir, 'foo'));
		assert.strictEqual(excludes[1], join(testDir, 'bar'));
		assert.strictEqual(excludes[2], join(testDir, 'foo', 'bar'));
		assert.strictEqual(excludes[3], join(testDir, 'other', 'deep'));

		// simple globs (relative)

		excludes = service.toExcludePaths(testDir, ['**']);
		assert.strictEqual(excludes?.length, 1);
		assert.strictEqual(excludes[0], testDir);

		excludes = service.toExcludePaths(testDir, ['**/**']);
		assert.strictEqual(excludes?.length, 1);
		assert.strictEqual(excludes[0], testDir);

		excludes = service.toExcludePaths(testDir, ['**\\**']);
		assert.strictEqual(excludes?.length, 1);
		assert.strictEqual(excludes[0], testDir);

		excludes = service.toExcludePaths(testDir, ['**/node_modules/**']);
		assert.strictEqual(excludes?.length, 1);
		assert.strictEqual(excludes[0], join(testDir, 'node_modules'));

		excludes = service.toExcludePaths(testDir, ['**/.git/objects/**']);
		assert.strictEqual(excludes?.length, 1);
		assert.strictEqual(excludes[0], join(testDir, '.git', 'objects'));

		excludes = service.toExcludePaths(testDir, ['**/node_modules']);
		assert.strictEqual(excludes?.length, 1);
		assert.strictEqual(excludes[0], join(testDir, 'node_modules'));

		excludes = service.toExcludePaths(testDir, ['**/.git/objects']);
		assert.strictEqual(excludes?.length, 1);
		assert.strictEqual(excludes[0], join(testDir, '.git', 'objects'));

		excludes = service.toExcludePaths(testDir, ['node_modules/**']);
		assert.strictEqual(excludes?.length, 1);
		assert.strictEqual(excludes[0], join(testDir, 'node_modules'));

		excludes = service.toExcludePaths(testDir, ['.git/objects/**']);
		assert.strictEqual(excludes?.length, 1);
		assert.strictEqual(excludes[0], join(testDir, '.git', 'objects'));

		// simple globs (absolute)

		excludes = service.toExcludePaths(testDir, [join(testDir, 'node_modules', '**')]);
		assert.strictEqual(excludes?.length, 1);
		assert.strictEqual(excludes[0], join(testDir, 'node_modules'));

		// Linux: more restrictive glob treatment
		if (isLinux) {
			excludes = service.toExcludePaths(testDir, ['**/node_modules/*/**']);
			assert.strictEqual(excludes?.length, 1);
			assert.strictEqual(excludes[0], join(testDir, 'node_modules'));
		}

		// unsupported globs

		else {
			excludes = service.toExcludePaths(testDir, ['**/node_modules/*/**']);
			assert.strictEqual(excludes, undefined);
		}

		excludes = service.toExcludePaths(testDir, ['**/*.js']);
		assert.strictEqual(excludes, undefined);

		excludes = service.toExcludePaths(testDir, ['*.js']);
		assert.strictEqual(excludes, undefined);

		excludes = service.toExcludePaths(testDir, ['*']);
		assert.strictEqual(excludes, undefined);
	});
});
