/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, Emitter } from 'vs/base/common/event';
import { tmpdir } from 'os';
import { basename, dirname, join } from 'vs/base/common/path';
import { Promises, RimRafMode } from 'vs/base/node/pfs';
import { flakySuite, getPathFromAmdModule, getRandomTestPath } from 'vs/base/test/node/testUtils';
import { FileChangeType } from 'vs/platform/files/common/files';
import { IDiskFileChange } from 'vs/platform/files/common/watcher';
import { NodeJSFileWatcher } from 'vs/platform/files/node/watcher/nodejs/nodejsWatcher';
import { isLinux, isMacintosh, isWindows } from 'vs/base/common/platform';
import { getDriveLetter } from 'vs/base/common/extpath';
import { ltrim } from 'vs/base/common/strings';
import { DeferredPromise } from 'vs/base/common/async';

// this suite has shown flaky runs in Azure pipelines where
// tasks would just hang and timeout after a while (not in
// mocha but generally). as such they will run only on demand
// whenever we update the watcher library.

((process.env['BUILD_SOURCEVERSION'] || process.env['CI']) ? suite.skip : flakySuite)('File Watcher (node.js)', () => {

	let testDir: string;
	let watcher: TestNodeJSFileWatcher;
	let event: Event<IDiskFileChange[]>;

	let loggingEnabled = false;

	function enableLogging(enable: boolean) {
		loggingEnabled = enable;
		watcher?.setVerboseLogging(enable);
	}

	enableLogging(false);

	class TestNodeJSFileWatcher extends NodeJSFileWatcher {

		private readonly _whenDisposed = new DeferredPromise<void>();
		readonly whenDisposed = this._whenDisposed.p;

		override dispose(): void {
			super.dispose();

			this._whenDisposed.complete();
		}
	}

	setup(async function () {
		testDir = getRandomTestPath(tmpdir(), 'vsctests', 'filewatcher');

		const sourceDir = getPathFromAmdModule(require, './fixtures/service');

		await Promises.copy(sourceDir, testDir, { preserveSymlinks: false });

		await createWatcher(testDir);
	});

	function createWatcher(path: string, excludes: string[] = []): Promise<void> {
		if (watcher) {
			watcher.dispose();
		}

		const emitter = new Emitter<IDiskFileChange[]>();
		event = emitter.event;

		watcher = new TestNodeJSFileWatcher({ path, excludes }, changes => emitter.fire(changes), msg => {
			if (loggingEnabled) {
				console.log(`[recursive watcher test message] ${msg.type}: ${msg.message}`);
			}
		}, loggingEnabled);

		return watcher.ready;
	}

	teardown(async () => {
		watcher.dispose();

		// Possible that the file watcher is still holding
		// onto the folders on Windows specifically and the
		// unlink would fail. In that case, do not fail the
		// test suite.
		return Promises.rm(testDir).catch(error => console.error(error));
	});

	async function awaitEvent(onDidChangeFile: Event<IDiskFileChange[]>, path: string, type: FileChangeType): Promise<void> {
		if (loggingEnabled) {
			console.log(`Awaiting change type '${toMsg(type)}' on file '${path}'`);
		}

		// Await the event
		await new Promise<void>((resolve, reject) => {
			const disposable = onDidChangeFile(events => {
				for (const event of events) {
					if (event.path === path && event.type === type) {
						disposable.dispose();
						setImmediate(() => resolve()); // copied from parcel watcher tests, seems to drop unrelated events on macOS
						break;
					}
				}
			});
		});
	}

	function toMsg(type: FileChangeType): string {
		switch (type) {
			case FileChangeType.ADDED: return 'added';
			case FileChangeType.DELETED: return 'deleted';
			default: return 'changed';
		}
	}

	test('basics (folder watch)', async function () {

		// New file
		const newFilePath = join(testDir, 'newFile.txt');
		let changeFuture: Promise<unknown> = awaitEvent(event, newFilePath, FileChangeType.ADDED);
		await Promises.writeFile(newFilePath, 'Hello World');
		await changeFuture;

		// New folder
		const newFolderPath = join(testDir, 'New Folder');
		changeFuture = awaitEvent(event, newFolderPath, FileChangeType.ADDED);
		await Promises.mkdir(newFolderPath);
		await changeFuture;

		// Rename file
		let renamedFilePath = join(testDir, 'renamedFile.txt');
		changeFuture = Promise.all([
			awaitEvent(event, newFilePath, FileChangeType.DELETED),
			awaitEvent(event, renamedFilePath, FileChangeType.ADDED)
		]);
		await Promises.rename(newFilePath, renamedFilePath);
		await changeFuture;

		// Rename folder
		let renamedFolderPath = join(testDir, 'Renamed Folder');
		changeFuture = Promise.all([
			awaitEvent(event, newFolderPath, FileChangeType.DELETED),
			awaitEvent(event, renamedFolderPath, FileChangeType.ADDED)
		]);
		await Promises.rename(newFolderPath, renamedFolderPath);
		await changeFuture;

		// Rename file (same name, different case)
		const caseRenamedFilePath = join(testDir, 'RenamedFile.txt');
		changeFuture = Promise.all([
			awaitEvent(event, renamedFilePath, FileChangeType.DELETED),
			awaitEvent(event, caseRenamedFilePath, FileChangeType.ADDED)
		]);
		await Promises.rename(renamedFilePath, caseRenamedFilePath);
		await changeFuture;
		renamedFilePath = caseRenamedFilePath;

		// Rename folder (same name, different case)
		const caseRenamedFolderPath = join(testDir, 'REnamed Folder');
		changeFuture = Promise.all([
			awaitEvent(event, renamedFolderPath, FileChangeType.DELETED),
			awaitEvent(event, caseRenamedFolderPath, FileChangeType.ADDED)
		]);
		await Promises.rename(renamedFolderPath, caseRenamedFolderPath);
		await changeFuture;
		renamedFolderPath = caseRenamedFolderPath;

		// Move file
		const movedFilepath = join(testDir, 'movedFile.txt');
		changeFuture = Promise.all([
			awaitEvent(event, renamedFilePath, FileChangeType.DELETED),
			awaitEvent(event, movedFilepath, FileChangeType.ADDED)
		]);
		await Promises.rename(renamedFilePath, movedFilepath);
		await changeFuture;

		// Move folder
		const movedFolderpath = join(testDir, 'Moved Folder');
		changeFuture = Promise.all([
			awaitEvent(event, renamedFolderPath, FileChangeType.DELETED),
			awaitEvent(event, movedFolderpath, FileChangeType.ADDED)
		]);
		await Promises.rename(renamedFolderPath, movedFolderpath);
		await changeFuture;

		// Copy file
		const copiedFilepath = join(testDir, 'copiedFile.txt');
		changeFuture = awaitEvent(event, copiedFilepath, FileChangeType.ADDED);
		await Promises.copyFile(movedFilepath, copiedFilepath);
		await changeFuture;

		// Copy folder
		const copiedFolderpath = join(testDir, 'Copied Folder');
		changeFuture = awaitEvent(event, copiedFolderpath, FileChangeType.ADDED);
		await Promises.copy(movedFolderpath, copiedFolderpath, { preserveSymlinks: false });
		await changeFuture;

		// Change file
		changeFuture = awaitEvent(event, copiedFilepath, FileChangeType.UPDATED);
		await Promises.writeFile(copiedFilepath, 'Hello Change');
		await changeFuture;

		// Create new file
		const anotherNewFilePath = join(testDir, 'anotherNewFile.txt');
		changeFuture = awaitEvent(event, anotherNewFilePath, FileChangeType.ADDED);
		await Promises.writeFile(anotherNewFilePath, 'Hello Another World');
		await changeFuture;

		// Delete file
		changeFuture = awaitEvent(event, copiedFilepath, FileChangeType.DELETED);
		await Promises.unlink(copiedFilepath);
		await changeFuture;

		// Delete folder
		changeFuture = awaitEvent(event, copiedFolderpath, FileChangeType.DELETED);
		await Promises.rmdir(copiedFolderpath);
		await changeFuture;

		watcher.dispose();
	});

	test('basics (file watch)', async function () {
		const filePath = join(testDir, 'lorem.txt');
		await createWatcher(filePath);

		// Change file
		let changeFuture = awaitEvent(event, filePath, FileChangeType.UPDATED);
		await Promises.writeFile(filePath, 'Hello Change');
		await changeFuture;

		// Delete file
		changeFuture = awaitEvent(event, filePath, FileChangeType.DELETED);
		await Promises.unlink(filePath);
		await changeFuture;

		// Recreate watcher
		await Promises.writeFile(filePath, 'Hello Change');
		await createWatcher(filePath);

		// Move file
		changeFuture = awaitEvent(event, filePath, FileChangeType.DELETED);
		await Promises.move(filePath, `${filePath}-moved`);
		await changeFuture;
	});

	test('atomic writes (folder watch)', async function () {

		// Delete + Recreate file
		const newFilePath = join(testDir, 'lorem.txt');
		let changeFuture: Promise<unknown> = awaitEvent(event, newFilePath, FileChangeType.UPDATED);
		await Promises.unlink(newFilePath);
		Promises.writeFile(newFilePath, 'Hello Atomic World');
		await changeFuture;
	});

	test('atomic writes (file watch)', async function () {
		const filePath = join(testDir, 'lorem.txt');
		await createWatcher(filePath);

		// Delete + Recreate file
		const newFilePath = join(filePath);
		let changeFuture: Promise<unknown> = awaitEvent(event, newFilePath, FileChangeType.UPDATED);
		await Promises.unlink(newFilePath);
		Promises.writeFile(newFilePath, 'Hello Atomic World');
		await changeFuture;
	});

	test('multiple events (folder watch)', async function () {

		// multiple add

		const newFilePath1 = join(testDir, 'newFile-1.txt');
		const newFilePath2 = join(testDir, 'newFile-2.txt');
		const newFilePath3 = join(testDir, 'newFile-3.txt');

		const addedFuture1: Promise<unknown> = awaitEvent(event, newFilePath1, FileChangeType.ADDED);
		const addedFuture2: Promise<unknown> = awaitEvent(event, newFilePath2, FileChangeType.ADDED);
		const addedFuture3: Promise<unknown> = awaitEvent(event, newFilePath3, FileChangeType.ADDED);

		await Promise.all([
			await Promises.writeFile(newFilePath1, 'Hello World 1'),
			await Promises.writeFile(newFilePath2, 'Hello World 2'),
			await Promises.writeFile(newFilePath3, 'Hello World 3'),
		]);

		await Promise.all([addedFuture1, addedFuture2, addedFuture3]);

		// multiple change

		const changeFuture1: Promise<unknown> = awaitEvent(event, newFilePath1, FileChangeType.UPDATED);
		const changeFuture2: Promise<unknown> = awaitEvent(event, newFilePath2, FileChangeType.UPDATED);
		const changeFuture3: Promise<unknown> = awaitEvent(event, newFilePath3, FileChangeType.UPDATED);

		await Promise.all([
			await Promises.writeFile(newFilePath1, 'Hello Update 1'),
			await Promises.writeFile(newFilePath2, 'Hello Update 2'),
			await Promises.writeFile(newFilePath3, 'Hello Update 3'),
		]);

		await Promise.all([changeFuture1, changeFuture2, changeFuture3]);

		// copy with multiple files

		const copyFuture1: Promise<unknown> = awaitEvent(event, join(testDir, 'newFile-1-copy.txt'), FileChangeType.ADDED);
		const copyFuture2: Promise<unknown> = awaitEvent(event, join(testDir, 'newFile-2-copy.txt'), FileChangeType.ADDED);
		const copyFuture3: Promise<unknown> = awaitEvent(event, join(testDir, 'newFile-3-copy.txt'), FileChangeType.ADDED);

		await Promise.all([
			Promises.copy(join(testDir, 'newFile-1.txt'), join(testDir, 'newFile-1-copy.txt'), { preserveSymlinks: false }),
			Promises.copy(join(testDir, 'newFile-2.txt'), join(testDir, 'newFile-2-copy.txt'), { preserveSymlinks: false }),
			Promises.copy(join(testDir, 'newFile-3.txt'), join(testDir, 'newFile-3-copy.txt'), { preserveSymlinks: false })
		]);

		await Promise.all([copyFuture1, copyFuture2, copyFuture3]);

		// multiple delete

		const deleteFuture1: Promise<unknown> = awaitEvent(event, newFilePath1, FileChangeType.DELETED);
		const deleteFuture2: Promise<unknown> = awaitEvent(event, newFilePath2, FileChangeType.DELETED);
		const deleteFuture3: Promise<unknown> = awaitEvent(event, newFilePath3, FileChangeType.DELETED);

		await Promise.all([
			await Promises.unlink(newFilePath1),
			await Promises.unlink(newFilePath2),
			await Promises.unlink(newFilePath3)
		]);

		await Promise.all([deleteFuture1, deleteFuture2, deleteFuture3]);
	});

	test('multiple events (file watch)', async function () {
		const filePath = join(testDir, 'lorem.txt');
		await createWatcher(filePath);

		// multiple change

		const changeFuture1: Promise<unknown> = awaitEvent(event, filePath, FileChangeType.UPDATED);

		await Promise.all([
			await Promises.writeFile(filePath, 'Hello Update 1'),
			await Promises.writeFile(filePath, 'Hello Update 2'),
			await Promises.writeFile(filePath, 'Hello Update 3'),
		]);

		await Promise.all([changeFuture1]);
	});

	test('excludes are ignored (file watch)', async function () {
		const filePath = join(testDir, 'lorem.txt');
		await createWatcher(filePath, ['**']);

		return basicCrudTest(filePath, true);
	});

	(isWindows /* windows: cannot create file symbolic link without elevated context */ ? test.skip : test)('symlink support (folder watch)', async function () {
		const link = join(testDir, 'deep-linked');
		const linkTarget = join(testDir, 'deep');
		await Promises.symlink(linkTarget, link);

		await createWatcher(link);

		return basicCrudTest(join(link, 'newFile.txt'));
	});

	async function basicCrudTest(filePath: string, skipAdd?: boolean): Promise<void> {
		let changeFuture: Promise<unknown>;

		// New file
		if (!skipAdd) {
			changeFuture = awaitEvent(event, filePath, FileChangeType.ADDED);
			await Promises.writeFile(filePath, 'Hello World');
			await changeFuture;
		}

		// Change file
		changeFuture = awaitEvent(event, filePath, FileChangeType.UPDATED);
		await Promises.writeFile(filePath, 'Hello Change');
		await changeFuture;

		// Delete file
		changeFuture = awaitEvent(event, filePath, FileChangeType.DELETED);
		await Promises.unlink(await Promises.realpath(filePath)); // support symlinks
		await changeFuture;
	}

	(isWindows /* windows: cannot create file symbolic link without elevated context */ ? test.skip : test)('symlink support (file watch)', async function () {
		const link = join(testDir, 'lorem.txt-linked');
		const linkTarget = join(testDir, 'lorem.txt');
		await Promises.symlink(linkTarget, link);

		await createWatcher(link);

		return basicCrudTest(link, true);
	});

	(!isWindows /* UNC is windows only */ ? test.skip : test)('unc support (folder watch)', async function () {

		// Local UNC paths are in the form of: \\localhost\c$\my_dir
		const uncPath = `\\\\localhost\\${getDriveLetter(testDir)?.toLowerCase()}$\\${ltrim(testDir.substr(testDir.indexOf(':') + 1), '\\')}`;

		await createWatcher(uncPath);

		return basicCrudTest(join(uncPath, 'newFile.txt'));
	});

	(!isWindows /* UNC is windows only */ ? test.skip : test)('unc support (file watch)', async function () {

		// Local UNC paths are in the form of: \\localhost\c$\my_dir
		const uncPath = `\\\\localhost\\${getDriveLetter(testDir)?.toLowerCase()}$\\${ltrim(testDir.substr(testDir.indexOf(':') + 1), '\\')}\\lorem.txt`;

		await createWatcher(uncPath);

		return basicCrudTest(uncPath, true);
	});

	(isLinux /* linux: is case sensitive */ ? test.skip : test)('wrong casing (folder watch)', async function () {
		const wrongCase = join(dirname(testDir), basename(testDir).toUpperCase());

		await createWatcher(wrongCase);

		return basicCrudTest(join(wrongCase, 'newFile.txt'));
	});

	(isLinux /* linux: is case sensitive */ ? test.skip : test)('wrong casing (file watch)', async function () {
		const filePath = join(testDir, 'LOREM.txt');
		await createWatcher(filePath);

		return basicCrudTest(filePath, true);
	});

	test('invalid path does not explode', async function () {
		const invalidPath = join(testDir, 'invalid');

		await createWatcher(invalidPath);
	});

	(isMacintosh /* macOS: does not seem to report this */ ? test.skip : test)('deleting watched path is handled properly (folder watch)', async function () {
		const watchedPath = join(testDir, 'deep');
		await createWatcher(watchedPath);

		// Delete watched path and ensure watcher is now disposed
		Promises.rm(watchedPath, RimRafMode.UNLINK);
		await watcher.whenDisposed;
	});

	test('deleting watched path is handled properly (file watch)', async function () {
		const watchedPath = join(testDir, 'lorem.txt');
		await createWatcher(watchedPath);

		// Delete watched path
		const changeFuture = awaitEvent(event, watchedPath, FileChangeType.DELETED);
		Promises.unlink(watchedPath);
		await changeFuture;

		// Ensure watcher is now disposed
		await watcher.whenDisposed;
	});
});
