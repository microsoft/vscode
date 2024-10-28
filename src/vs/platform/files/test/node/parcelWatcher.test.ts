/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { realpathSync, promises } from 'fs';
import { tmpdir } from 'os';
import { timeout } from '../../../../base/common/async.js';
import { dirname, join } from '../../../../base/common/path.js';
import { isLinux, isMacintosh, isWindows } from '../../../../base/common/platform.js';
import { Promises, RimRafMode } from '../../../../base/node/pfs.js';
import { getRandomTestPath } from '../../../../base/test/node/testUtils.js';
import { FileChangeFilter, FileChangeType, IFileChange } from '../../common/files.js';
import { ParcelWatcher } from '../../node/watcher/parcel/parcelWatcher.js';
import { IRecursiveWatchRequest } from '../../common/watcher.js';
import { getDriveLetter } from '../../../../base/common/extpath.js';
import { ltrim } from '../../../../base/common/strings.js';
import { FileAccess } from '../../../../base/common/network.js';
import { extUriBiasedIgnorePathCase } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { addUNCHostToAllowlist } from '../../../../base/node/unc.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';

export class TestParcelWatcher extends ParcelWatcher {

	protected override readonly suspendedWatchRequestPollingInterval = 100;

	private readonly _onDidWatch = this._register(new Emitter<void>());
	readonly onDidWatch = this._onDidWatch.event;

	readonly onWatchFail = this._onDidWatchFail.event;

	testRemoveDuplicateRequests(paths: string[], excludes: string[] = []): string[] {

		// Work with strings as paths to simplify testing
		const requests: IRecursiveWatchRequest[] = paths.map(path => {
			return { path, excludes, recursive: true };
		});

		return this.removeDuplicateRequests(requests, false /* validate paths skipped for tests */).map(request => request.path);
	}

	protected override getUpdateWatchersDelay(): number {
		return 0;
	}

	protected override async doWatch(requests: IRecursiveWatchRequest[]): Promise<void> {
		await super.doWatch(requests);
		await this.whenReady();

		this._onDidWatch.fire();
	}

	async whenReady(): Promise<void> {
		for (const watcher of this.watchers) {
			await watcher.ready;
		}
	}
}

// this suite has shown flaky runs in Azure pipelines where
// tasks would just hang and timeout after a while (not in
// mocha but generally). as such they will run only on demand
// whenever we update the watcher library.

suite.skip('File Watcher (parcel)', function () {

	this.timeout(10000);

	let testDir: string;
	let watcher: TestParcelWatcher;

	let loggingEnabled = false;

	function enableLogging(enable: boolean) {
		loggingEnabled = enable;
		watcher?.setVerboseLogging(enable);
	}

	enableLogging(loggingEnabled);

	setup(async () => {
		watcher = new TestParcelWatcher();
		watcher.setVerboseLogging(loggingEnabled);

		watcher.onDidLogMessage(e => {
			if (loggingEnabled) {
				console.log(`[recursive watcher test message] ${e.message}`);
			}
		});

		watcher.onDidError(e => {
			if (loggingEnabled) {
				console.log(`[recursive watcher test error] ${e.error}`);
			}
		});

		testDir = URI.file(getRandomTestPath(tmpdir(), 'vsctests', 'filewatcher')).fsPath;

		const sourceDir = FileAccess.asFileUri('vs/platform/files/test/node/fixtures/service').fsPath;

		await Promises.copy(sourceDir, testDir, { preserveSymlinks: false });
	});

	teardown(async () => {
		const watchers = watcher.watchers.size;
		let stoppedInstances = 0;
		for (const instance of watcher.watchers) {
			Event.once(instance.onDidStop)(() => {
				if (instance.stopped) {
					stoppedInstances++;
				}
			});
		}

		await watcher.stop();
		assert.strictEqual(stoppedInstances, watchers, 'All watchers must be stopped before the test ends');
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

	async function awaitEvent(watcher: TestParcelWatcher, path: string, type: FileChangeType, failOnEventReason?: string, correlationId?: number | null, expectedCount?: number): Promise<IFileChange[]> {
		if (loggingEnabled) {
			console.log(`Awaiting change type '${toMsg(type)}' on file '${path}'`);
		}

		// Await the event
		const res = await new Promise<IFileChange[]>((resolve, reject) => {
			let counter = 0;
			const disposable = watcher.onDidChangeFile(events => {
				for (const event of events) {
					if (extUriBiasedIgnorePathCase.isEqual(event.resource, URI.file(path)) && event.type === type && (correlationId === null || event.cId === correlationId)) {
						counter++;
						if (typeof expectedCount === 'number' && counter < expectedCount) {
							continue; // not yet
						}

						disposable.dispose();
						if (failOnEventReason) {
							reject(new Error(`Unexpected file event: ${failOnEventReason}`));
						} else {
							setImmediate(() => resolve(events)); // copied from parcel watcher tests, seems to drop unrelated events on macOS
						}
						break;
					}
				}
			});
		});

		// Unwind from the event call stack: we have seen crashes in Parcel
		// when e.g. calling `unsubscribe` directly from the stack of a file
		// change event
		// Refs: https://github.com/microsoft/vscode/issues/137430
		await timeout(1);

		return res;
	}

	function awaitMessage(watcher: TestParcelWatcher, type: 'trace' | 'warn' | 'error' | 'info' | 'debug'): Promise<void> {
		if (loggingEnabled) {
			console.log(`Awaiting message of type ${type}`);
		}

		// Await the message
		return new Promise<void>(resolve => {
			const disposable = watcher.onDidLogMessage(msg => {
				if (msg.type === type) {
					disposable.dispose();
					resolve();
				}
			});
		});
	}

	test('basics', async function () {
		const request = { path: testDir, excludes: [], recursive: true };
		await watcher.watch([request]);
		assert.strictEqual(watcher.watchers.size, watcher.watchers.size);

		const instance = Array.from(watcher.watchers)[0];
		assert.strictEqual(request, instance.request);
		assert.strictEqual(instance.failed, false);
		assert.strictEqual(instance.stopped, false);

		const disposables = new DisposableStore();

		const subscriptions1 = new Map<string, FileChangeType>();
		const subscriptions2 = new Map<string, FileChangeType>();

		// New file
		const newFilePath = join(testDir, 'deep', 'newFile.txt');
		disposables.add(instance.subscribe(newFilePath, change => subscriptions1.set(change.resource.fsPath, change.type)));
		disposables.add(instance.subscribe(newFilePath, change => subscriptions2.set(change.resource.fsPath, change.type))); // can subscribe multiple times
		assert.strictEqual(instance.include(newFilePath), true);
		assert.strictEqual(instance.exclude(newFilePath), false);
		let changeFuture: Promise<unknown> = awaitEvent(watcher, newFilePath, FileChangeType.ADDED);
		await Promises.writeFile(newFilePath, 'Hello World');
		await changeFuture;
		assert.strictEqual(subscriptions1.get(newFilePath), FileChangeType.ADDED);
		assert.strictEqual(subscriptions2.get(newFilePath), FileChangeType.ADDED);

		// New folder
		const newFolderPath = join(testDir, 'deep', 'New Folder');
		disposables.add(instance.subscribe(newFolderPath, change => subscriptions1.set(change.resource.fsPath, change.type)));
		const disposable = instance.subscribe(newFolderPath, change => subscriptions2.set(change.resource.fsPath, change.type));
		disposable.dispose();
		assert.strictEqual(instance.include(newFolderPath), true);
		assert.strictEqual(instance.exclude(newFolderPath), false);
		changeFuture = awaitEvent(watcher, newFolderPath, FileChangeType.ADDED);
		await promises.mkdir(newFolderPath);
		await changeFuture;
		assert.strictEqual(subscriptions1.get(newFolderPath), FileChangeType.ADDED);
		assert.strictEqual(subscriptions2.has(newFolderPath), false /* subscription was disposed before the event */);

		// Rename file
		let renamedFilePath = join(testDir, 'deep', 'renamedFile.txt');
		disposables.add(instance.subscribe(renamedFilePath, change => subscriptions1.set(change.resource.fsPath, change.type)));
		changeFuture = Promise.all([
			awaitEvent(watcher, newFilePath, FileChangeType.DELETED),
			awaitEvent(watcher, renamedFilePath, FileChangeType.ADDED)
		]);
		await Promises.rename(newFilePath, renamedFilePath);
		await changeFuture;
		assert.strictEqual(subscriptions1.get(newFilePath), FileChangeType.DELETED);
		assert.strictEqual(subscriptions1.get(renamedFilePath), FileChangeType.ADDED);

		// Rename folder
		let renamedFolderPath = join(testDir, 'deep', 'Renamed Folder');
		disposables.add(instance.subscribe(renamedFolderPath, change => subscriptions1.set(change.resource.fsPath, change.type)));
		changeFuture = Promise.all([
			awaitEvent(watcher, newFolderPath, FileChangeType.DELETED),
			awaitEvent(watcher, renamedFolderPath, FileChangeType.ADDED)
		]);
		await Promises.rename(newFolderPath, renamedFolderPath);
		await changeFuture;
		assert.strictEqual(subscriptions1.get(newFolderPath), FileChangeType.DELETED);
		assert.strictEqual(subscriptions1.get(renamedFolderPath), FileChangeType.ADDED);

		// Rename file (same name, different case)
		const caseRenamedFilePath = join(testDir, 'deep', 'RenamedFile.txt');
		changeFuture = Promise.all([
			awaitEvent(watcher, renamedFilePath, FileChangeType.DELETED),
			awaitEvent(watcher, caseRenamedFilePath, FileChangeType.ADDED)
		]);
		await Promises.rename(renamedFilePath, caseRenamedFilePath);
		await changeFuture;
		renamedFilePath = caseRenamedFilePath;

		// Rename folder (same name, different case)
		const caseRenamedFolderPath = join(testDir, 'deep', 'REnamed Folder');
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
		const copiedFilepath = join(testDir, 'deep', 'copiedFile.txt');
		changeFuture = awaitEvent(watcher, copiedFilepath, FileChangeType.ADDED);
		await promises.copyFile(movedFilepath, copiedFilepath);
		await changeFuture;

		// Copy folder
		const copiedFolderpath = join(testDir, 'deep', 'Copied Folder');
		changeFuture = awaitEvent(watcher, copiedFolderpath, FileChangeType.ADDED);
		await Promises.copy(movedFolderpath, copiedFolderpath, { preserveSymlinks: false });
		await changeFuture;

		// Change file
		changeFuture = awaitEvent(watcher, copiedFilepath, FileChangeType.UPDATED);
		await Promises.writeFile(copiedFilepath, 'Hello Change');
		await changeFuture;

		// Create new file
		const anotherNewFilePath = join(testDir, 'deep', 'anotherNewFile.txt');
		changeFuture = awaitEvent(watcher, anotherNewFilePath, FileChangeType.ADDED);
		await Promises.writeFile(anotherNewFilePath, 'Hello Another World');
		await changeFuture;

		// Read file does not emit event
		changeFuture = awaitEvent(watcher, anotherNewFilePath, FileChangeType.UPDATED, 'unexpected-event-from-read-file');
		await promises.readFile(anotherNewFilePath);
		await Promise.race([timeout(100), changeFuture]);

		// Stat file does not emit event
		changeFuture = awaitEvent(watcher, anotherNewFilePath, FileChangeType.UPDATED, 'unexpected-event-from-stat');
		await promises.stat(anotherNewFilePath);
		await Promise.race([timeout(100), changeFuture]);

		// Stat folder does not emit event
		changeFuture = awaitEvent(watcher, copiedFolderpath, FileChangeType.UPDATED, 'unexpected-event-from-stat');
		await promises.stat(copiedFolderpath);
		await Promise.race([timeout(100), changeFuture]);

		// Delete file
		changeFuture = awaitEvent(watcher, copiedFilepath, FileChangeType.DELETED);
		disposables.add(instance.subscribe(copiedFilepath, change => subscriptions1.set(change.resource.fsPath, change.type)));
		await promises.unlink(copiedFilepath);
		await changeFuture;
		assert.strictEqual(subscriptions1.get(copiedFilepath), FileChangeType.DELETED);

		// Delete folder
		changeFuture = awaitEvent(watcher, copiedFolderpath, FileChangeType.DELETED);
		disposables.add(instance.subscribe(copiedFolderpath, change => subscriptions1.set(change.resource.fsPath, change.type)));
		await promises.rmdir(copiedFolderpath);
		await changeFuture;
		assert.strictEqual(subscriptions1.get(copiedFolderpath), FileChangeType.DELETED);

		disposables.dispose();
	});

	(isMacintosh /* this test seems not possible with fsevents backend */ ? test.skip : test)('basics (atomic writes)', async function () {
		await watcher.watch([{ path: testDir, excludes: [], recursive: true }]);

		// Delete + Recreate file
		const newFilePath = join(testDir, 'deep', 'conway.js');
		const changeFuture = awaitEvent(watcher, newFilePath, FileChangeType.UPDATED);
		await promises.unlink(newFilePath);
		Promises.writeFile(newFilePath, 'Hello Atomic World');
		await changeFuture;
	});

	(!isLinux /* polling is only used in linux environments (WSL) */ ? test.skip : test)('basics (polling)', async function () {
		await watcher.watch([{ path: testDir, excludes: [], pollingInterval: 100, recursive: true }]);

		return basicCrudTest(join(testDir, 'deep', 'newFile.txt'));
	});

	async function basicCrudTest(filePath: string, correlationId?: number | null, expectedCount?: number): Promise<void> {

		// New file
		let changeFuture = awaitEvent(watcher, filePath, FileChangeType.ADDED, undefined, correlationId, expectedCount);
		await Promises.writeFile(filePath, 'Hello World');
		await changeFuture;

		// Change file
		changeFuture = awaitEvent(watcher, filePath, FileChangeType.UPDATED, undefined, correlationId, expectedCount);
		await Promises.writeFile(filePath, 'Hello Change');
		await changeFuture;

		// Delete file
		changeFuture = awaitEvent(watcher, filePath, FileChangeType.DELETED, undefined, correlationId, expectedCount);
		await promises.unlink(filePath);
		await changeFuture;
	}

	test('multiple events', async function () {
		await watcher.watch([{ path: testDir, excludes: [], recursive: true }]);
		await promises.mkdir(join(testDir, 'deep-multiple'));

		// multiple add

		const newFilePath1 = join(testDir, 'newFile-1.txt');
		const newFilePath2 = join(testDir, 'newFile-2.txt');
		const newFilePath3 = join(testDir, 'newFile-3.txt');
		const newFilePath4 = join(testDir, 'deep-multiple', 'newFile-1.txt');
		const newFilePath5 = join(testDir, 'deep-multiple', 'newFile-2.txt');
		const newFilePath6 = join(testDir, 'deep-multiple', 'newFile-3.txt');

		const addedFuture1 = awaitEvent(watcher, newFilePath1, FileChangeType.ADDED);
		const addedFuture2 = awaitEvent(watcher, newFilePath2, FileChangeType.ADDED);
		const addedFuture3 = awaitEvent(watcher, newFilePath3, FileChangeType.ADDED);
		const addedFuture4 = awaitEvent(watcher, newFilePath4, FileChangeType.ADDED);
		const addedFuture5 = awaitEvent(watcher, newFilePath5, FileChangeType.ADDED);
		const addedFuture6 = awaitEvent(watcher, newFilePath6, FileChangeType.ADDED);

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

		const changeFuture1 = awaitEvent(watcher, newFilePath1, FileChangeType.UPDATED);
		const changeFuture2 = awaitEvent(watcher, newFilePath2, FileChangeType.UPDATED);
		const changeFuture3 = awaitEvent(watcher, newFilePath3, FileChangeType.UPDATED);
		const changeFuture4 = awaitEvent(watcher, newFilePath4, FileChangeType.UPDATED);
		const changeFuture5 = awaitEvent(watcher, newFilePath5, FileChangeType.UPDATED);
		const changeFuture6 = awaitEvent(watcher, newFilePath6, FileChangeType.UPDATED);

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

		const copyFuture1 = awaitEvent(watcher, join(testDir, 'deep-multiple-copy', 'newFile-1.txt'), FileChangeType.ADDED);
		const copyFuture2 = awaitEvent(watcher, join(testDir, 'deep-multiple-copy', 'newFile-2.txt'), FileChangeType.ADDED);
		const copyFuture3 = awaitEvent(watcher, join(testDir, 'deep-multiple-copy', 'newFile-3.txt'), FileChangeType.ADDED);
		const copyFuture4 = awaitEvent(watcher, join(testDir, 'deep-multiple-copy'), FileChangeType.ADDED);

		await Promises.copy(join(testDir, 'deep-multiple'), join(testDir, 'deep-multiple-copy'), { preserveSymlinks: false });

		await Promise.all([copyFuture1, copyFuture2, copyFuture3, copyFuture4]);

		// multiple delete (single files)

		const deleteFuture1 = awaitEvent(watcher, newFilePath1, FileChangeType.DELETED);
		const deleteFuture2 = awaitEvent(watcher, newFilePath2, FileChangeType.DELETED);
		const deleteFuture3 = awaitEvent(watcher, newFilePath3, FileChangeType.DELETED);
		const deleteFuture4 = awaitEvent(watcher, newFilePath4, FileChangeType.DELETED);
		const deleteFuture5 = awaitEvent(watcher, newFilePath5, FileChangeType.DELETED);
		const deleteFuture6 = awaitEvent(watcher, newFilePath6, FileChangeType.DELETED);

		await Promise.all([
			await promises.unlink(newFilePath1),
			await promises.unlink(newFilePath2),
			await promises.unlink(newFilePath3),
			await promises.unlink(newFilePath4),
			await promises.unlink(newFilePath5),
			await promises.unlink(newFilePath6)
		]);

		await Promise.all([deleteFuture1, deleteFuture2, deleteFuture3, deleteFuture4, deleteFuture5, deleteFuture6]);

		// multiple delete (folder)

		const deleteFolderFuture1 = awaitEvent(watcher, join(testDir, 'deep-multiple'), FileChangeType.DELETED);
		const deleteFolderFuture2 = awaitEvent(watcher, join(testDir, 'deep-multiple-copy'), FileChangeType.DELETED);

		await Promise.all([Promises.rm(join(testDir, 'deep-multiple'), RimRafMode.UNLINK), Promises.rm(join(testDir, 'deep-multiple-copy'), RimRafMode.UNLINK)]);

		await Promise.all([deleteFolderFuture1, deleteFolderFuture2]);
	});

	test('subsequent watch updates watchers (path)', async function () {
		await watcher.watch([{ path: testDir, excludes: [join(realpathSync(testDir), 'unrelated')], recursive: true }]);

		// New file (*.txt)
		let newTextFilePath = join(testDir, 'deep', 'newFile.txt');
		let changeFuture = awaitEvent(watcher, newTextFilePath, FileChangeType.ADDED);
		await Promises.writeFile(newTextFilePath, 'Hello World');
		await changeFuture;

		await watcher.watch([{ path: join(testDir, 'deep'), excludes: [join(realpathSync(testDir), 'unrelated')], recursive: true }]);
		newTextFilePath = join(testDir, 'deep', 'newFile2.txt');
		changeFuture = awaitEvent(watcher, newTextFilePath, FileChangeType.ADDED);
		await Promises.writeFile(newTextFilePath, 'Hello World');
		await changeFuture;

		await watcher.watch([{ path: join(testDir, 'deep'), excludes: [realpathSync(testDir)], recursive: true }]);
		await watcher.watch([{ path: join(testDir, 'deep'), excludes: [], recursive: true }]);
		newTextFilePath = join(testDir, 'deep', 'newFile3.txt');
		changeFuture = awaitEvent(watcher, newTextFilePath, FileChangeType.ADDED);
		await Promises.writeFile(newTextFilePath, 'Hello World');
		await changeFuture;
	});

	test('invalid path does not crash watcher', async function () {
		await watcher.watch([
			{ path: testDir, excludes: [], recursive: true },
			{ path: join(testDir, 'invalid-folder'), excludes: [], recursive: true },
			{ path: FileAccess.asFileUri('').fsPath, excludes: [], recursive: true }
		]);

		return basicCrudTest(join(testDir, 'deep', 'newFile.txt'));
	});

	test('subsequent watch updates watchers (excludes)', async function () {
		await watcher.watch([{ path: testDir, excludes: [realpathSync(testDir)], recursive: true }]);
		await watcher.watch([{ path: testDir, excludes: [], recursive: true }]);

		return basicCrudTest(join(testDir, 'deep', 'newFile.txt'));
	});

	test('subsequent watch updates watchers (includes)', async function () {
		await watcher.watch([{ path: testDir, excludes: [], includes: ['nothing'], recursive: true }]);
		await watcher.watch([{ path: testDir, excludes: [], recursive: true }]);

		return basicCrudTest(join(testDir, 'deep', 'newFile.txt'));
	});

	test('includes are supported', async function () {
		await watcher.watch([{ path: testDir, excludes: [], includes: ['**/deep/**'], recursive: true }]);

		return basicCrudTest(join(testDir, 'deep', 'newFile.txt'));
	});

	test('includes are supported (relative pattern explicit)', async function () {
		await watcher.watch([{ path: testDir, excludes: [], includes: [{ base: testDir, pattern: 'deep/newFile.txt' }], recursive: true }]);

		return basicCrudTest(join(testDir, 'deep', 'newFile.txt'));
	});

	test('includes are supported (relative pattern implicit)', async function () {
		await watcher.watch([{ path: testDir, excludes: [], includes: ['deep/newFile.txt'], recursive: true }]);

		return basicCrudTest(join(testDir, 'deep', 'newFile.txt'));
	});

	test('excludes are supported (path)', async function () {
		return testExcludes([join(realpathSync(testDir), 'deep')]);
	});

	test('excludes are supported (glob)', function () {
		return testExcludes(['deep/**']);
	});

	async function testExcludes(excludes: string[]) {
		await watcher.watch([{ path: testDir, excludes, recursive: true }]);

		// New file (*.txt)
		const newTextFilePath = join(testDir, 'deep', 'newFile.txt');
		const changeFuture = awaitEvent(watcher, newTextFilePath, FileChangeType.ADDED);
		await Promises.writeFile(newTextFilePath, 'Hello World');

		const res = await Promise.any([
			timeout(500).then(() => true),
			changeFuture.then(() => false)
		]);

		if (!res) {
			assert.fail('Unexpected change event');
		}
	}

	(isWindows /* windows: cannot create file symbolic link without elevated context */ ? test.skip : test)('symlink support (root)', async function () {
		const link = join(testDir, 'deep-linked');
		const linkTarget = join(testDir, 'deep');
		await promises.symlink(linkTarget, link);

		await watcher.watch([{ path: link, excludes: [], recursive: true }]);

		return basicCrudTest(join(link, 'newFile.txt'));
	});

	(isWindows /* windows: cannot create file symbolic link without elevated context */ ? test.skip : test)('symlink support (via extra watch)', async function () {
		const link = join(testDir, 'deep-linked');
		const linkTarget = join(testDir, 'deep');
		await promises.symlink(linkTarget, link);

		await watcher.watch([{ path: testDir, excludes: [], recursive: true }, { path: link, excludes: [], recursive: true }]);

		return basicCrudTest(join(link, 'newFile.txt'));
	});

	(!isWindows /* UNC is windows only */ ? test.skip : test)('unc support', async function () {
		addUNCHostToAllowlist('localhost');

		// Local UNC paths are in the form of: \\localhost\c$\my_dir
		const uncPath = `\\\\localhost\\${getDriveLetter(testDir)?.toLowerCase()}$\\${ltrim(testDir.substr(testDir.indexOf(':') + 1), '\\')}`;

		await watcher.watch([{ path: uncPath, excludes: [], recursive: true }]);

		return basicCrudTest(join(uncPath, 'deep', 'newFile.txt'));
	});

	(isLinux /* linux: is case sensitive */ ? test.skip : test)('wrong casing', async function () {
		const deepWrongCasedPath = join(testDir, 'DEEP');

		await watcher.watch([{ path: deepWrongCasedPath, excludes: [], recursive: true }]);

		return basicCrudTest(join(deepWrongCasedPath, 'newFile.txt'));
	});

	test('invalid folder does not explode', async function () {
		const invalidPath = join(testDir, 'invalid');

		await watcher.watch([{ path: invalidPath, excludes: [], recursive: true }]);
	});

	(isWindows /* flaky on windows */ ? test.skip : test)('deleting watched path without correlation restarts watching', async function () {
		const watchedPath = join(testDir, 'deep');

		await watcher.watch([{ path: watchedPath, excludes: [], recursive: true }]);

		// Delete watched path and await
		const warnFuture = awaitMessage(watcher, 'warn');
		await Promises.rm(watchedPath, RimRafMode.UNLINK);
		await warnFuture;

		// Restore watched path
		await timeout(1500); // node.js watcher used for monitoring folder restore is async
		await promises.mkdir(watchedPath);
		await timeout(1500); // restart is delayed
		await watcher.whenReady();

		// Verify events come in again
		const newFilePath = join(watchedPath, 'newFile.txt');
		const changeFuture = awaitEvent(watcher, newFilePath, FileChangeType.ADDED);
		await Promises.writeFile(newFilePath, 'Hello World');
		await changeFuture;
	});

	test('correlationId is supported', async function () {
		const correlationId = Math.random();
		await watcher.watch([{ correlationId, path: testDir, excludes: [], recursive: true }]);

		return basicCrudTest(join(testDir, 'newFile.txt'), correlationId);
	});

	test('should not exclude roots that do not overlap', () => {
		if (isWindows) {
			assert.deepStrictEqual(watcher.testRemoveDuplicateRequests(['C:\\a']), ['C:\\a']);
			assert.deepStrictEqual(watcher.testRemoveDuplicateRequests(['C:\\a', 'C:\\b']), ['C:\\a', 'C:\\b']);
			assert.deepStrictEqual(watcher.testRemoveDuplicateRequests(['C:\\a', 'C:\\b', 'C:\\c\\d\\e']), ['C:\\a', 'C:\\b', 'C:\\c\\d\\e']);
		} else {
			assert.deepStrictEqual(watcher.testRemoveDuplicateRequests(['/a']), ['/a']);
			assert.deepStrictEqual(watcher.testRemoveDuplicateRequests(['/a', '/b']), ['/a', '/b']);
			assert.deepStrictEqual(watcher.testRemoveDuplicateRequests(['/a', '/b', '/c/d/e']), ['/a', '/b', '/c/d/e']);
		}
	});

	test('should remove sub-folders of other paths', () => {
		if (isWindows) {
			assert.deepStrictEqual(watcher.testRemoveDuplicateRequests(['C:\\a', 'C:\\a\\b']), ['C:\\a']);
			assert.deepStrictEqual(watcher.testRemoveDuplicateRequests(['C:\\a', 'C:\\b', 'C:\\a\\b']), ['C:\\a', 'C:\\b']);
			assert.deepStrictEqual(watcher.testRemoveDuplicateRequests(['C:\\b\\a', 'C:\\a', 'C:\\b', 'C:\\a\\b']), ['C:\\a', 'C:\\b']);
			assert.deepStrictEqual(watcher.testRemoveDuplicateRequests(['C:\\a', 'C:\\a\\b', 'C:\\a\\c\\d']), ['C:\\a']);
		} else {
			assert.deepStrictEqual(watcher.testRemoveDuplicateRequests(['/a', '/a/b']), ['/a']);
			assert.deepStrictEqual(watcher.testRemoveDuplicateRequests(['/a', '/b', '/a/b']), ['/a', '/b']);
			assert.deepStrictEqual(watcher.testRemoveDuplicateRequests(['/b/a', '/a', '/b', '/a/b']), ['/a', '/b']);
			assert.deepStrictEqual(watcher.testRemoveDuplicateRequests(['/a', '/a/b', '/a/c/d']), ['/a']);
		}
	});

	test('should ignore when everything excluded', () => {
		assert.deepStrictEqual(watcher.testRemoveDuplicateRequests(['/foo/bar', '/bar'], ['**', 'something']), []);
	});

	test('watching same or overlapping paths supported when correlation is applied', async () => {
		await watcher.watch([
			{ path: testDir, excludes: [], recursive: true, correlationId: 1 }
		]);

		await basicCrudTest(join(testDir, 'newFile.txt'), null, 1);

		// same path, same options
		await watcher.watch([
			{ path: testDir, excludes: [], recursive: true, correlationId: 1 },
			{ path: testDir, excludes: [], recursive: true, correlationId: 2, },
			{ path: testDir, excludes: [], recursive: true, correlationId: undefined }
		]);

		await basicCrudTest(join(testDir, 'newFile.txt'), null, 3);
		await basicCrudTest(join(testDir, 'otherNewFile.txt'), null, 3);

		// same path, different options
		await watcher.watch([
			{ path: testDir, excludes: [], recursive: true, correlationId: 1 },
			{ path: testDir, excludes: [], recursive: true, correlationId: 2 },
			{ path: testDir, excludes: [], recursive: true, correlationId: undefined },
			{ path: testDir, excludes: [join(realpathSync(testDir), 'deep')], recursive: true, correlationId: 3 },
			{ path: testDir, excludes: [join(realpathSync(testDir), 'other')], recursive: true, correlationId: 4 },
		]);

		await basicCrudTest(join(testDir, 'newFile.txt'), null, 5);
		await basicCrudTest(join(testDir, 'otherNewFile.txt'), null, 5);

		// overlapping paths (same options)
		await watcher.watch([
			{ path: dirname(testDir), excludes: [], recursive: true, correlationId: 1 },
			{ path: testDir, excludes: [], recursive: true, correlationId: 2 },
			{ path: join(testDir, 'deep'), excludes: [], recursive: true, correlationId: 3 },
		]);

		await basicCrudTest(join(testDir, 'deep', 'newFile.txt'), null, 3);
		await basicCrudTest(join(testDir, 'deep', 'otherNewFile.txt'), null, 3);

		// overlapping paths (different options)
		await watcher.watch([
			{ path: dirname(testDir), excludes: [], recursive: true, correlationId: 1 },
			{ path: testDir, excludes: [join(realpathSync(testDir), 'some')], recursive: true, correlationId: 2 },
			{ path: join(testDir, 'deep'), excludes: [join(realpathSync(testDir), 'other')], recursive: true, correlationId: 3 },
		]);

		await basicCrudTest(join(testDir, 'deep', 'newFile.txt'), null, 3);
		await basicCrudTest(join(testDir, 'deep', 'otherNewFile.txt'), null, 3);
	});

	test('watching missing path emits watcher fail event', async function () {
		const onDidWatchFail = Event.toPromise(watcher.onWatchFail);

		const folderPath = join(testDir, 'missing');
		watcher.watch([{ path: folderPath, excludes: [], recursive: true }]);

		await onDidWatchFail;
	});

	test('deleting watched path emits watcher fail and delete event if correlated', async function () {
		const folderPath = join(testDir, 'deep');

		await watcher.watch([{ path: folderPath, excludes: [], recursive: true, correlationId: 1 }]);

		let failed = false;
		const instance = Array.from(watcher.watchers)[0];
		assert.strictEqual(instance.include(folderPath), true);
		instance.onDidFail(() => failed = true);

		const onDidWatchFail = Event.toPromise(watcher.onWatchFail);
		const changeFuture = awaitEvent(watcher, folderPath, FileChangeType.DELETED, undefined, 1);
		Promises.rm(folderPath, RimRafMode.UNLINK);
		await onDidWatchFail;
		await changeFuture;
		assert.strictEqual(failed, true);
		assert.strictEqual(instance.failed, true);
	});

	test('watch requests support suspend/resume (folder, does not exist in beginning, not reusing watcher)', async () => {
		await testWatchFolderDoesNotExist(false);
	});

	(!isMacintosh /* Linux/Windows: times out for some reason */ ? test.skip : test)('watch requests support suspend/resume (folder, does not exist in beginning, reusing watcher)', async () => {
		await testWatchFolderDoesNotExist(true);
	});

	async function testWatchFolderDoesNotExist(reuseExistingWatcher: boolean) {
		let onDidWatchFail = Event.toPromise(watcher.onWatchFail);

		const folderPath = join(testDir, 'not-found');

		const requests: IRecursiveWatchRequest[] = [];
		if (reuseExistingWatcher) {
			requests.push({ path: testDir, excludes: [], recursive: true });
			await watcher.watch(requests);
		}

		const request: IRecursiveWatchRequest = { path: folderPath, excludes: [], recursive: true };
		requests.push(request);

		await watcher.watch(requests);
		await onDidWatchFail;

		if (reuseExistingWatcher) {
			assert.strictEqual(watcher.isSuspended(request), true);
		} else {
			assert.strictEqual(watcher.isSuspended(request), 'polling');
		}

		let changeFuture = awaitEvent(watcher, folderPath, FileChangeType.ADDED);
		let onDidWatch = Event.toPromise(watcher.onDidWatch);
		await promises.mkdir(folderPath);
		await changeFuture;
		await onDidWatch;

		assert.strictEqual(watcher.isSuspended(request), false);

		const filePath = join(folderPath, 'newFile.txt');
		await basicCrudTest(filePath);

		onDidWatchFail = Event.toPromise(watcher.onWatchFail);
		await Promises.rm(folderPath);
		await onDidWatchFail;

		changeFuture = awaitEvent(watcher, folderPath, FileChangeType.ADDED);
		onDidWatch = Event.toPromise(watcher.onDidWatch);
		await promises.mkdir(folderPath);
		await changeFuture;
		await onDidWatch;

		await basicCrudTest(filePath);
	}

	test('watch requests support suspend/resume (folder, exist in beginning, not reusing watcher)', async () => {
		await testWatchFolderExists(false);
	});

	(!isMacintosh /* Linux/Windows: times out for some reason */ ? test.skip : test)('watch requests support suspend/resume (folder, exist in beginning, reusing watcher)', async () => {
		await testWatchFolderExists(true);
	});

	async function testWatchFolderExists(reuseExistingWatcher: boolean) {
		const folderPath = join(testDir, 'deep');

		const requests: IRecursiveWatchRequest[] = [{ path: folderPath, excludes: [], recursive: true }];
		if (reuseExistingWatcher) {
			requests.push({ path: testDir, excludes: [], recursive: true });
		}

		await watcher.watch(requests);

		const filePath = join(folderPath, 'newFile.txt');
		await basicCrudTest(filePath);

		const onDidWatchFail = Event.toPromise(watcher.onWatchFail);
		await Promises.rm(folderPath);
		await onDidWatchFail;

		const changeFuture = awaitEvent(watcher, folderPath, FileChangeType.ADDED);
		const onDidWatch = Event.toPromise(watcher.onDidWatch);
		await promises.mkdir(folderPath);
		await changeFuture;
		await onDidWatch;

		await basicCrudTest(filePath);
	}

	test('watch request reuses another recursive watcher even when requests are coming in at the same time', async function () {
		const folderPath1 = join(testDir, 'deep', 'not-existing1');
		const folderPath2 = join(testDir, 'deep', 'not-existing2');
		const folderPath3 = join(testDir, 'not-existing3');

		const requests: IRecursiveWatchRequest[] = [
			{ path: folderPath1, excludes: [], recursive: true, correlationId: 1 },
			{ path: folderPath2, excludes: [], recursive: true, correlationId: 2 },
			{ path: folderPath3, excludes: [], recursive: true, correlationId: 3 },
			{ path: join(testDir, 'deep'), excludes: [], recursive: true }
		];

		await watcher.watch(requests);

		assert.strictEqual(watcher.isSuspended(requests[0]), true);
		assert.strictEqual(watcher.isSuspended(requests[1]), true);
		assert.strictEqual(watcher.isSuspended(requests[2]), 'polling');
		assert.strictEqual(watcher.isSuspended(requests[3]), false);
	});

	test('event type filter', async function () {
		const request = { path: testDir, excludes: [], recursive: true, filter: FileChangeFilter.ADDED | FileChangeFilter.DELETED, correlationId: 1 };
		await watcher.watch([request]);

		// Change file
		const filePath = join(testDir, 'lorem-newfile.txt');
		let changeFuture = awaitEvent(watcher, filePath, FileChangeType.ADDED, undefined, 1);
		await Promises.writeFile(filePath, 'Hello Change');
		await changeFuture;

		// Delete file
		changeFuture = awaitEvent(watcher, filePath, FileChangeType.DELETED, undefined, 1);
		await promises.unlink(filePath);
		await changeFuture;
	});
});
