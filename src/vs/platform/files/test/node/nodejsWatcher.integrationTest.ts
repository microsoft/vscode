/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { tmpdir } from 'os';
import { basename, dirname, join } from 'vs/base/common/path';
import { Promises, RimRafMode } from 'vs/base/node/pfs';
import { flakySuite, getRandomTestPath } from 'vs/base/test/node/testUtils';
import { FileChangeFilter, FileChangeType } from 'vs/platform/files/common/files';
import { INonRecursiveWatchRequest, IRecursiveWatcherWithSubscribe } from 'vs/platform/files/common/watcher';
import { watchFileContents } from 'vs/platform/files/node/watcher/nodejs/nodejsWatcherLib';
import { isLinux, isMacintosh, isWindows } from 'vs/base/common/platform';
import { getDriveLetter } from 'vs/base/common/extpath';
import { ltrim } from 'vs/base/common/strings';
import { DeferredPromise, timeout } from 'vs/base/common/async';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { NodeJSWatcher } from 'vs/platform/files/node/watcher/nodejs/nodejsWatcher';
import { FileAccess } from 'vs/base/common/network';
import { extUriBiasedIgnorePathCase } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { addUNCHostToAllowlist } from 'vs/base/node/unc';
import { Emitter, Event } from 'vs/base/common/event';
import { TestParcelWatcher } from 'vs/platform/files/test/node/parcelWatcher.integrationTest';

// this suite has shown flaky runs in Azure pipelines where
// tasks would just hang and timeout after a while (not in
// mocha but generally). as such they will run only on demand
// whenever we update the watcher library.

((process.env['BUILD_SOURCEVERSION'] || process.env['CI']) ? suite.skip : flakySuite)('File Watcher (node.js)', () => {

	class TestNodeJSWatcher extends NodeJSWatcher {

		protected override readonly suspendedWatchRequestPollingInterval = 100;

		private readonly _onDidWatch = this._register(new Emitter<void>());
		readonly onDidWatch = this._onDidWatch.event;

		readonly onWatchFail = this._onDidWatchFail.event;

		protected override getUpdateWatchersDelay(): number {
			return 0;
		}

		protected override async doWatch(requests: INonRecursiveWatchRequest[]): Promise<void> {
			await super.doWatch(requests);
			for (const watcher of this.watchers) {
				await watcher.instance.ready;
			}

			this._onDidWatch.fire();
		}
	}

	let testDir: string;
	let watcher: TestNodeJSWatcher;

	let loggingEnabled = false;

	function enableLogging(enable: boolean) {
		loggingEnabled = enable;
		watcher?.setVerboseLogging(enable);
	}

	enableLogging(false);

	setup(async () => {
		await createWatcher(undefined);

		testDir = URI.file(getRandomTestPath(tmpdir(), 'vsctests', 'filewatcher')).fsPath;

		const sourceDir = FileAccess.asFileUri('vs/platform/files/test/node/fixtures/service').fsPath;

		await Promises.copy(sourceDir, testDir, { preserveSymlinks: false });
	});

	async function createWatcher(accessor: IRecursiveWatcherWithSubscribe | undefined) {
		await watcher?.stop();
		watcher?.dispose();

		watcher = new TestNodeJSWatcher(accessor);
		watcher?.setVerboseLogging(loggingEnabled);

		watcher.onDidLogMessage(e => {
			if (loggingEnabled) {
				console.log(`[non-recursive watcher test message] ${e.message}`);
			}
		});

		watcher.onDidError(e => {
			if (loggingEnabled) {
				console.log(`[non-recursive watcher test error] ${e}`);
			}
		});
	}

	teardown(async () => {
		await watcher.stop();
		watcher.dispose();

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

	async function awaitEvent(service: TestNodeJSWatcher, path: string, type: FileChangeType, correlationId?: number | null, expectedCount?: number): Promise<void> {
		if (loggingEnabled) {
			console.log(`Awaiting change type '${toMsg(type)}' on file '${path}'`);
		}

		// Await the event
		await new Promise<void>(resolve => {
			let counter = 0;
			const disposable = service.onDidChangeFile(events => {
				for (const event of events) {
					if (extUriBiasedIgnorePathCase.isEqual(event.resource, URI.file(path)) && event.type === type && (correlationId === null || event.cId === correlationId)) {
						counter++;
						if (typeof expectedCount === 'number' && counter < expectedCount) {
							continue; // not yet
						}

						disposable.dispose();
						resolve();
						break;
					}
				}
			});
		});
	}

	test('basics (folder watch)', async function () {
		const request = { path: testDir, excludes: [], recursive: false };
		await watcher.watch([request]);
		assert.strictEqual(watcher.isSuspended(request), false);

		const instance = Array.from(watcher.watchers)[0].instance;
		assert.strictEqual(instance.isReusingRecursiveWatcher, false);
		assert.strictEqual(instance.failed, false);

		// New file
		const newFilePath = join(testDir, 'newFile.txt');
		let changeFuture: Promise<unknown> = awaitEvent(watcher, newFilePath, FileChangeType.ADDED);
		await Promises.writeFile(newFilePath, 'Hello World');
		await changeFuture;

		// New folder
		const newFolderPath = join(testDir, 'New Folder');
		changeFuture = awaitEvent(watcher, newFolderPath, FileChangeType.ADDED);
		await Promises.mkdir(newFolderPath);
		await changeFuture;

		// Rename file
		let renamedFilePath = join(testDir, 'renamedFile.txt');
		changeFuture = Promise.all([
			awaitEvent(watcher, newFilePath, FileChangeType.DELETED),
			awaitEvent(watcher, renamedFilePath, FileChangeType.ADDED)
		]);
		await Promises.rename(newFilePath, renamedFilePath);
		await changeFuture;

		// Rename folder
		let renamedFolderPath = join(testDir, 'Renamed Folder');
		changeFuture = Promise.all([
			awaitEvent(watcher, newFolderPath, FileChangeType.DELETED),
			awaitEvent(watcher, renamedFolderPath, FileChangeType.ADDED)
		]);
		await Promises.rename(newFolderPath, renamedFolderPath);
		await changeFuture;

		// Rename file (same name, different case)
		const caseRenamedFilePath = join(testDir, 'RenamedFile.txt');
		changeFuture = Promise.all([
			awaitEvent(watcher, renamedFilePath, FileChangeType.DELETED),
			awaitEvent(watcher, caseRenamedFilePath, FileChangeType.ADDED)
		]);
		await Promises.rename(renamedFilePath, caseRenamedFilePath);
		await changeFuture;
		renamedFilePath = caseRenamedFilePath;

		// Rename folder (same name, different case)
		const caseRenamedFolderPath = join(testDir, 'REnamed Folder');
		changeFuture = Promise.all([
			awaitEvent(watcher, renamedFolderPath, FileChangeType.DELETED),
			awaitEvent(watcher, caseRenamedFolderPath, FileChangeType.ADDED)
		]);
		await Promises.rename(renamedFolderPath, caseRenamedFolderPath);
		await changeFuture;
		renamedFolderPath = caseRenamedFolderPath;

		// Move file
		const movedFilepath = join(testDir, 'movedFile.txt');
		changeFuture = Promise.all([
			awaitEvent(watcher, renamedFilePath, FileChangeType.DELETED),
			awaitEvent(watcher, movedFilepath, FileChangeType.ADDED)
		]);
		await Promises.rename(renamedFilePath, movedFilepath);
		await changeFuture;

		// Move folder
		const movedFolderpath = join(testDir, 'Moved Folder');
		changeFuture = Promise.all([
			awaitEvent(watcher, renamedFolderPath, FileChangeType.DELETED),
			awaitEvent(watcher, movedFolderpath, FileChangeType.ADDED)
		]);
		await Promises.rename(renamedFolderPath, movedFolderpath);
		await changeFuture;

		// Copy file
		const copiedFilepath = join(testDir, 'copiedFile.txt');
		changeFuture = awaitEvent(watcher, copiedFilepath, FileChangeType.ADDED);
		await Promises.copyFile(movedFilepath, copiedFilepath);
		await changeFuture;

		// Copy folder
		const copiedFolderpath = join(testDir, 'Copied Folder');
		changeFuture = awaitEvent(watcher, copiedFolderpath, FileChangeType.ADDED);
		await Promises.copy(movedFolderpath, copiedFolderpath, { preserveSymlinks: false });
		await changeFuture;

		// Change file
		changeFuture = awaitEvent(watcher, copiedFilepath, FileChangeType.UPDATED);
		await Promises.writeFile(copiedFilepath, 'Hello Change');
		await changeFuture;

		// Create new file
		const anotherNewFilePath = join(testDir, 'anotherNewFile.txt');
		changeFuture = awaitEvent(watcher, anotherNewFilePath, FileChangeType.ADDED);
		await Promises.writeFile(anotherNewFilePath, 'Hello Another World');
		await changeFuture;

		// Delete file
		changeFuture = awaitEvent(watcher, copiedFilepath, FileChangeType.DELETED);
		await Promises.unlink(copiedFilepath);
		await changeFuture;

		// Delete folder
		changeFuture = awaitEvent(watcher, copiedFolderpath, FileChangeType.DELETED);
		await Promises.rmdir(copiedFolderpath);
		await changeFuture;

		watcher.dispose();
	});

	test('basics (file watch)', async function () {
		const filePath = join(testDir, 'lorem.txt');
		const request = { path: filePath, excludes: [], recursive: false };
		await watcher.watch([request]);
		assert.strictEqual(watcher.isSuspended(request), false);

		const instance = Array.from(watcher.watchers)[0].instance;
		assert.strictEqual(instance.isReusingRecursiveWatcher, false);
		assert.strictEqual(instance.failed, false);

		// Change file
		let changeFuture = awaitEvent(watcher, filePath, FileChangeType.UPDATED);
		await Promises.writeFile(filePath, 'Hello Change');
		await changeFuture;

		// Delete file
		changeFuture = awaitEvent(watcher, filePath, FileChangeType.DELETED);
		await Promises.unlink(filePath);
		await changeFuture;

		// Recreate watcher
		await Promises.writeFile(filePath, 'Hello Change');
		await watcher.watch([]);
		await watcher.watch([{ path: filePath, excludes: [], recursive: false }]);

		// Move file
		changeFuture = awaitEvent(watcher, filePath, FileChangeType.DELETED);
		await Promises.rename(filePath, `${filePath}-moved`);
		await changeFuture;
	});

	test('atomic writes (folder watch)', async function () {
		await watcher.watch([{ path: testDir, excludes: [], recursive: false }]);

		// Delete + Recreate file
		const newFilePath = join(testDir, 'lorem.txt');
		const changeFuture: Promise<unknown> = awaitEvent(watcher, newFilePath, FileChangeType.UPDATED);
		await Promises.unlink(newFilePath);
		Promises.writeFile(newFilePath, 'Hello Atomic World');
		await changeFuture;
	});

	test('atomic writes (file watch)', async function () {
		const filePath = join(testDir, 'lorem.txt');
		await watcher.watch([{ path: filePath, excludes: [], recursive: false }]);

		// Delete + Recreate file
		const newFilePath = join(filePath);
		const changeFuture: Promise<unknown> = awaitEvent(watcher, newFilePath, FileChangeType.UPDATED);
		await Promises.unlink(newFilePath);
		Promises.writeFile(newFilePath, 'Hello Atomic World');
		await changeFuture;
	});

	test('multiple events (folder watch)', async function () {
		await watcher.watch([{ path: testDir, excludes: [], recursive: false }]);

		// multiple add

		const newFilePath1 = join(testDir, 'newFile-1.txt');
		const newFilePath2 = join(testDir, 'newFile-2.txt');
		const newFilePath3 = join(testDir, 'newFile-3.txt');

		const addedFuture1: Promise<unknown> = awaitEvent(watcher, newFilePath1, FileChangeType.ADDED);
		const addedFuture2: Promise<unknown> = awaitEvent(watcher, newFilePath2, FileChangeType.ADDED);
		const addedFuture3: Promise<unknown> = awaitEvent(watcher, newFilePath3, FileChangeType.ADDED);

		await Promise.all([
			await Promises.writeFile(newFilePath1, 'Hello World 1'),
			await Promises.writeFile(newFilePath2, 'Hello World 2'),
			await Promises.writeFile(newFilePath3, 'Hello World 3'),
		]);

		await Promise.all([addedFuture1, addedFuture2, addedFuture3]);

		// multiple change

		const changeFuture1: Promise<unknown> = awaitEvent(watcher, newFilePath1, FileChangeType.UPDATED);
		const changeFuture2: Promise<unknown> = awaitEvent(watcher, newFilePath2, FileChangeType.UPDATED);
		const changeFuture3: Promise<unknown> = awaitEvent(watcher, newFilePath3, FileChangeType.UPDATED);

		await Promise.all([
			await Promises.writeFile(newFilePath1, 'Hello Update 1'),
			await Promises.writeFile(newFilePath2, 'Hello Update 2'),
			await Promises.writeFile(newFilePath3, 'Hello Update 3'),
		]);

		await Promise.all([changeFuture1, changeFuture2, changeFuture3]);

		// copy with multiple files

		const copyFuture1: Promise<unknown> = awaitEvent(watcher, join(testDir, 'newFile-1-copy.txt'), FileChangeType.ADDED);
		const copyFuture2: Promise<unknown> = awaitEvent(watcher, join(testDir, 'newFile-2-copy.txt'), FileChangeType.ADDED);
		const copyFuture3: Promise<unknown> = awaitEvent(watcher, join(testDir, 'newFile-3-copy.txt'), FileChangeType.ADDED);

		await Promise.all([
			Promises.copy(join(testDir, 'newFile-1.txt'), join(testDir, 'newFile-1-copy.txt'), { preserveSymlinks: false }),
			Promises.copy(join(testDir, 'newFile-2.txt'), join(testDir, 'newFile-2-copy.txt'), { preserveSymlinks: false }),
			Promises.copy(join(testDir, 'newFile-3.txt'), join(testDir, 'newFile-3-copy.txt'), { preserveSymlinks: false })
		]);

		await Promise.all([copyFuture1, copyFuture2, copyFuture3]);

		// multiple delete

		const deleteFuture1: Promise<unknown> = awaitEvent(watcher, newFilePath1, FileChangeType.DELETED);
		const deleteFuture2: Promise<unknown> = awaitEvent(watcher, newFilePath2, FileChangeType.DELETED);
		const deleteFuture3: Promise<unknown> = awaitEvent(watcher, newFilePath3, FileChangeType.DELETED);

		await Promise.all([
			await Promises.unlink(newFilePath1),
			await Promises.unlink(newFilePath2),
			await Promises.unlink(newFilePath3)
		]);

		await Promise.all([deleteFuture1, deleteFuture2, deleteFuture3]);
	});

	test('multiple events (file watch)', async function () {
		const filePath = join(testDir, 'lorem.txt');
		await watcher.watch([{ path: filePath, excludes: [], recursive: false }]);

		// multiple change

		const changeFuture1: Promise<unknown> = awaitEvent(watcher, filePath, FileChangeType.UPDATED);

		await Promise.all([
			await Promises.writeFile(filePath, 'Hello Update 1'),
			await Promises.writeFile(filePath, 'Hello Update 2'),
			await Promises.writeFile(filePath, 'Hello Update 3'),
		]);

		await Promise.all([changeFuture1]);
	});

	test('excludes can be updated (folder watch)', async function () {
		await watcher.watch([{ path: testDir, excludes: ['**'], recursive: false }]);
		await watcher.watch([{ path: testDir, excludes: [], recursive: false }]);

		return basicCrudTest(join(testDir, 'files-excludes.txt'));
	});

	test('excludes are ignored (file watch)', async function () {
		const filePath = join(testDir, 'lorem.txt');
		await watcher.watch([{ path: filePath, excludes: ['**'], recursive: false }]);

		return basicCrudTest(filePath, true);
	});

	test('includes can be updated (folder watch)', async function () {
		await watcher.watch([{ path: testDir, excludes: [], includes: ['nothing'], recursive: false }]);
		await watcher.watch([{ path: testDir, excludes: [], recursive: false }]);

		return basicCrudTest(join(testDir, 'files-includes.txt'));
	});

	test('non-includes are ignored (file watch)', async function () {
		const filePath = join(testDir, 'lorem.txt');
		await watcher.watch([{ path: filePath, excludes: [], includes: ['nothing'], recursive: false }]);

		return basicCrudTest(filePath, true);
	});

	test('includes are supported (folder watch)', async function () {
		await watcher.watch([{ path: testDir, excludes: [], includes: ['**/files-includes.txt'], recursive: false }]);

		return basicCrudTest(join(testDir, 'files-includes.txt'));
	});

	test('includes are supported (folder watch, relative pattern explicit)', async function () {
		await watcher.watch([{ path: testDir, excludes: [], includes: [{ base: testDir, pattern: 'files-includes.txt' }], recursive: false }]);

		return basicCrudTest(join(testDir, 'files-includes.txt'));
	});

	test('includes are supported (folder watch, relative pattern implicit)', async function () {
		await watcher.watch([{ path: testDir, excludes: [], includes: ['files-includes.txt'], recursive: false }]);

		return basicCrudTest(join(testDir, 'files-includes.txt'));
	});

	test('correlationId is supported', async function () {
		const correlationId = Math.random();
		await watcher.watch([{ correlationId, path: testDir, excludes: [], recursive: false }]);

		return basicCrudTest(join(testDir, 'newFile.txt'), undefined, correlationId);
	});

	(isWindows /* windows: cannot create file symbolic link without elevated context */ ? test.skip : test)('symlink support (folder watch)', async function () {
		const link = join(testDir, 'deep-linked');
		const linkTarget = join(testDir, 'deep');
		await Promises.symlink(linkTarget, link);

		await watcher.watch([{ path: link, excludes: [], recursive: false }]);

		return basicCrudTest(join(link, 'newFile.txt'));
	});

	async function basicCrudTest(filePath: string, skipAdd?: boolean, correlationId?: number | null, expectedCount?: number, awaitWatchAfterAdd?: boolean): Promise<void> {
		let changeFuture: Promise<unknown>;

		// New file
		if (!skipAdd) {
			changeFuture = awaitEvent(watcher, filePath, FileChangeType.ADDED, correlationId, expectedCount);
			await Promises.writeFile(filePath, 'Hello World');
			await changeFuture;
			if (awaitWatchAfterAdd) {
				await Event.toPromise(watcher.onDidWatch);
			}
		}

		// Change file
		changeFuture = awaitEvent(watcher, filePath, FileChangeType.UPDATED, correlationId, expectedCount);
		await Promises.writeFile(filePath, 'Hello Change');
		await changeFuture;

		// Delete file
		changeFuture = awaitEvent(watcher, filePath, FileChangeType.DELETED, correlationId, expectedCount);
		await Promises.unlink(await Promises.realpath(filePath)); // support symlinks
		await changeFuture;
	}

	(isWindows /* windows: cannot create file symbolic link without elevated context */ ? test.skip : test)('symlink support (file watch)', async function () {
		const link = join(testDir, 'lorem.txt-linked');
		const linkTarget = join(testDir, 'lorem.txt');
		await Promises.symlink(linkTarget, link);

		await watcher.watch([{ path: link, excludes: [], recursive: false }]);

		return basicCrudTest(link, true);
	});

	(!isWindows /* UNC is windows only */ ? test.skip : test)('unc support (folder watch)', async function () {
		addUNCHostToAllowlist('localhost');

		// Local UNC paths are in the form of: \\localhost\c$\my_dir
		const uncPath = `\\\\localhost\\${getDriveLetter(testDir)?.toLowerCase()}$\\${ltrim(testDir.substr(testDir.indexOf(':') + 1), '\\')}`;

		await watcher.watch([{ path: uncPath, excludes: [], recursive: false }]);

		return basicCrudTest(join(uncPath, 'newFile.txt'));
	});

	(!isWindows /* UNC is windows only */ ? test.skip : test)('unc support (file watch)', async function () {
		addUNCHostToAllowlist('localhost');

		// Local UNC paths are in the form of: \\localhost\c$\my_dir
		const uncPath = `\\\\localhost\\${getDriveLetter(testDir)?.toLowerCase()}$\\${ltrim(testDir.substr(testDir.indexOf(':') + 1), '\\')}\\lorem.txt`;

		await watcher.watch([{ path: uncPath, excludes: [], recursive: false }]);

		return basicCrudTest(uncPath, true);
	});

	(isLinux /* linux: is case sensitive */ ? test.skip : test)('wrong casing (folder watch)', async function () {
		const wrongCase = join(dirname(testDir), basename(testDir).toUpperCase());

		await watcher.watch([{ path: wrongCase, excludes: [], recursive: false }]);

		return basicCrudTest(join(wrongCase, 'newFile.txt'));
	});

	(isLinux /* linux: is case sensitive */ ? test.skip : test)('wrong casing (file watch)', async function () {
		const filePath = join(testDir, 'LOREM.txt');
		await watcher.watch([{ path: filePath, excludes: [], recursive: false }]);

		return basicCrudTest(filePath, true);
	});

	test('invalid path does not explode', async function () {
		const invalidPath = join(testDir, 'invalid');

		await watcher.watch([{ path: invalidPath, excludes: [], recursive: false }]);
	});

	test('watchFileContents', async function () {
		const watchedPath = join(testDir, 'lorem.txt');

		const cts = new CancellationTokenSource();

		const readyPromise = new DeferredPromise<void>();
		const chunkPromise = new DeferredPromise<void>();
		const watchPromise = watchFileContents(watchedPath, () => chunkPromise.complete(), () => readyPromise.complete(), cts.token);

		await readyPromise.p;

		Promises.writeFile(watchedPath, 'Hello World');

		await chunkPromise.p;

		cts.cancel(); // this will resolve `watchPromise`

		return watchPromise;
	});

	test('watching same or overlapping paths supported when correlation is applied', async function () {
		await watcher.watch([
			{ path: testDir, excludes: [], recursive: false, correlationId: 1 }
		]);

		await basicCrudTest(join(testDir, 'newFile_1.txt'), undefined, null, 1);

		await watcher.watch([
			{ path: testDir, excludes: [], recursive: false, correlationId: 1 },
			{ path: testDir, excludes: [], recursive: false, correlationId: 2, },
			{ path: testDir, excludes: [], recursive: false, correlationId: undefined }
		]);

		await basicCrudTest(join(testDir, 'newFile_2.txt'), undefined, null, 3);
		await basicCrudTest(join(testDir, 'otherNewFile.txt'), undefined, null, 3);
	});

	test('watching missing path emits watcher fail event', async function () {
		const onDidWatchFail = Event.toPromise(watcher.onWatchFail);

		const folderPath = join(testDir, 'missing');
		watcher.watch([{ path: folderPath, excludes: [], recursive: true }]);

		await onDidWatchFail;
	});

	test('deleting watched path emits watcher fail and delete event when correlated (file watch)', async function () {
		const filePath = join(testDir, 'lorem.txt');

		await watcher.watch([{ path: filePath, excludes: [], recursive: false, correlationId: 1 }]);

		const instance = Array.from(watcher.watchers)[0].instance;

		const onDidWatchFail = Event.toPromise(watcher.onWatchFail);
		const changeFuture = awaitEvent(watcher, filePath, FileChangeType.DELETED, 1);
		Promises.unlink(filePath);
		await onDidWatchFail;
		await changeFuture;
		assert.strictEqual(instance.failed, true);
	});

	(isMacintosh || isWindows /* macOS: does not seem to report deletes on folders | Windows: reports on('error') event only */ ? test.skip : test)('deleting watched path emits watcher fail and delete event when correlated (folder watch)', async function () {
		const folderPath = join(testDir, 'deep');

		await watcher.watch([{ path: folderPath, excludes: [], recursive: false, correlationId: 1 }]);

		const onDidWatchFail = Event.toPromise(watcher.onWatchFail);
		const changeFuture = awaitEvent(watcher, folderPath, FileChangeType.DELETED, 1);
		Promises.rm(folderPath, RimRafMode.UNLINK);
		await onDidWatchFail;
		await changeFuture;
	});

	test('correlated watch requests support suspend/resume (file, does not exist in beginning)', async function () {
		const filePath = join(testDir, 'not-found.txt');

		const onDidWatchFail = Event.toPromise(watcher.onWatchFail);
		const request = { path: filePath, excludes: [], recursive: false, correlationId: 1 };
		await watcher.watch([request]);
		await onDidWatchFail;
		assert.strictEqual(watcher.isSuspended(request), 'polling');

		await basicCrudTest(filePath, undefined, 1, undefined, true);
		await basicCrudTest(filePath, undefined, 1, undefined, true);
	});

	test('correlated watch requests support suspend/resume (file, exists in beginning)', async function () {
		const filePath = join(testDir, 'lorem.txt');
		const request = { path: filePath, excludes: [], recursive: false, correlationId: 1 };
		await watcher.watch([request]);

		const onDidWatchFail = Event.toPromise(watcher.onWatchFail);
		await basicCrudTest(filePath, true, 1);
		await onDidWatchFail;
		assert.strictEqual(watcher.isSuspended(request), 'polling');

		await basicCrudTest(filePath, undefined, 1, undefined, true);
	});

	test('correlated watch requests support suspend/resume (folder, does not exist in beginning)', async function () {
		let onDidWatchFail = Event.toPromise(watcher.onWatchFail);

		const folderPath = join(testDir, 'not-found');
		const request = { path: folderPath, excludes: [], recursive: false, correlationId: 1 };
		await watcher.watch([request]);
		await onDidWatchFail;
		assert.strictEqual(watcher.isSuspended(request), 'polling');

		let changeFuture = awaitEvent(watcher, folderPath, FileChangeType.ADDED, 1);
		let onDidWatch = Event.toPromise(watcher.onDidWatch);
		await Promises.mkdir(folderPath);
		await changeFuture;
		await onDidWatch;

		assert.strictEqual(watcher.isSuspended(request), false);

		const filePath = join(folderPath, 'newFile.txt');
		await basicCrudTest(filePath, undefined, 1);

		if (!isMacintosh) { // macOS does not report DELETE events for folders
			onDidWatchFail = Event.toPromise(watcher.onWatchFail);
			await Promises.rmdir(folderPath);
			await onDidWatchFail;

			changeFuture = awaitEvent(watcher, folderPath, FileChangeType.ADDED, 1);
			onDidWatch = Event.toPromise(watcher.onDidWatch);
			await Promises.mkdir(folderPath);
			await changeFuture;
			await onDidWatch;

			await timeout(500); // somehow needed on Linux

			await basicCrudTest(filePath, undefined, 1);
		}
	});

	(isMacintosh /* macOS: does not seem to report this */ ? test.skip : test)('correlated watch requests support suspend/resume (folder, exists in beginning)', async function () {
		const folderPath = join(testDir, 'deep');
		await watcher.watch([{ path: folderPath, excludes: [], recursive: false, correlationId: 1 }]);

		const filePath = join(folderPath, 'newFile.txt');
		await basicCrudTest(filePath, undefined, 1);

		const onDidWatchFail = Event.toPromise(watcher.onWatchFail);
		await Promises.rm(folderPath);
		await onDidWatchFail;

		const changeFuture = awaitEvent(watcher, folderPath, FileChangeType.ADDED, 1);
		const onDidWatch = Event.toPromise(watcher.onDidWatch);
		await Promises.mkdir(folderPath);
		await changeFuture;
		await onDidWatch;

		await timeout(500); // somehow needed on Linux

		await basicCrudTest(filePath, undefined, 1);
	});

	test('parcel watcher reused when present for non-recursive file watching (uncorrelated)', function () {
		return testParcelWatcherReused(undefined);
	});

	test('parcel watcher reused when present for non-recursive file watching (correlated)', function () {
		return testParcelWatcherReused(2);
	});

	function createParcelWatcher() {
		const recursiveWatcher = new TestParcelWatcher();
		recursiveWatcher.setVerboseLogging(loggingEnabled);
		recursiveWatcher.onDidLogMessage(e => {
			if (loggingEnabled) {
				console.log(`[recursive watcher test message] ${e.message}`);
			}
		});

		recursiveWatcher.onDidError(e => {
			if (loggingEnabled) {
				console.log(`[recursive watcher test error] ${e.error}`);
			}
		});

		return recursiveWatcher;
	}

	async function testParcelWatcherReused(correlationId: number | undefined) {
		const recursiveWatcher = createParcelWatcher();
		await recursiveWatcher.watch([{ path: testDir, excludes: [], recursive: true, correlationId: 1 }]);

		const recursiveInstance = Array.from(recursiveWatcher.watchers)[0];
		assert.strictEqual(recursiveInstance.subscriptionsCount, 0);

		await createWatcher(recursiveWatcher);

		const filePath = join(testDir, 'deep', 'conway.js');
		await watcher.watch([{ path: filePath, excludes: [], recursive: false, correlationId }]);

		const { instance } = Array.from(watcher.watchers)[0];
		assert.strictEqual(instance.isReusingRecursiveWatcher, true);
		assert.strictEqual(recursiveInstance.subscriptionsCount, 1);

		let changeFuture = awaitEvent(watcher, filePath, isMacintosh /* somehow fsevents seems to report still on the initial create from test setup */ ? FileChangeType.ADDED : FileChangeType.UPDATED, correlationId);
		await Promises.writeFile(filePath, 'Hello World');
		await changeFuture;

		await recursiveWatcher.stop();
		recursiveWatcher.dispose();

		await timeout(500); // give the watcher some time to restart

		changeFuture = awaitEvent(watcher, filePath, FileChangeType.UPDATED, correlationId);
		await Promises.writeFile(filePath, 'Hello World');
		await changeFuture;

		assert.strictEqual(instance.isReusingRecursiveWatcher, false);
	}

	test('correlated watch requests support suspend/resume (file, does not exist in beginning, parcel watcher reused)', async function () {
		const recursiveWatcher = createParcelWatcher();
		await recursiveWatcher.watch([{ path: testDir, excludes: [], recursive: true }]);

		await createWatcher(recursiveWatcher);

		const filePath = join(testDir, 'not-found-2.txt');

		const onDidWatchFail = Event.toPromise(watcher.onWatchFail);
		const request = { path: filePath, excludes: [], recursive: false, correlationId: 1 };
		await watcher.watch([request]);
		await onDidWatchFail;
		assert.strictEqual(watcher.isSuspended(request), true);

		const changeFuture = awaitEvent(watcher, filePath, FileChangeType.ADDED, 1);
		await Promises.writeFile(filePath, 'Hello World');
		await changeFuture;

		assert.strictEqual(watcher.isSuspended(request), false);
	});

	test('event type filter (file watch)', async function () {
		const filePath = join(testDir, 'lorem.txt');
		const request = { path: filePath, excludes: [], recursive: false, filter: FileChangeFilter.UPDATED | FileChangeFilter.DELETED, correlationId: 1 };
		await watcher.watch([request]);

		// Change file
		let changeFuture = awaitEvent(watcher, filePath, FileChangeType.UPDATED, 1);
		await Promises.writeFile(filePath, 'Hello Change');
		await changeFuture;

		// Delete file
		changeFuture = awaitEvent(watcher, filePath, FileChangeType.DELETED, 1);
		await Promises.unlink(filePath);
		await changeFuture;
	});

	test('event type filter (folder watch)', async function () {
		const request = { path: testDir, excludes: [], recursive: false, filter: FileChangeFilter.UPDATED | FileChangeFilter.DELETED, correlationId: 1 };
		await watcher.watch([request]);

		// Change file
		const filePath = join(testDir, 'lorem.txt');
		let changeFuture = awaitEvent(watcher, filePath, FileChangeType.UPDATED, 1);
		await Promises.writeFile(filePath, 'Hello Change');
		await changeFuture;

		// Delete file
		changeFuture = awaitEvent(watcher, filePath, FileChangeType.DELETED, 1);
		await Promises.unlink(filePath);
		await changeFuture;
	});
});
