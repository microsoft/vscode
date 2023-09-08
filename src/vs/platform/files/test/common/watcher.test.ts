/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { isLinux, isWindows } from 'vs/base/common/platform';
import { isEqual } from 'vs/base/common/resources';
import { URI as uri } from 'vs/base/common/uri';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { FileChangesEvent, FileChangeType, IFileChange } from 'vs/platform/files/common/files';
import { IDiskFileChange, coalesceEvents, toFileChanges, parseWatcherPatterns } from 'vs/platform/files/common/watcher';

class TestFileWatcher extends Disposable {
	private readonly _onDidFilesChange: Emitter<{ raw: IFileChange[]; event: FileChangesEvent }>;

	constructor() {
		super();

		this._onDidFilesChange = this._register(new Emitter<{ raw: IFileChange[]; event: FileChangesEvent }>());
	}

	get onDidFilesChange(): Event<{ raw: IFileChange[]; event: FileChangesEvent }> {
		return this._onDidFilesChange.event;
	}

	report(changes: IDiskFileChange[]): void {
		this.onRawFileEvents(changes);
	}

	private onRawFileEvents(events: IDiskFileChange[]): void {

		// Coalesce
		const coalescedEvents = coalesceEvents(events);

		// Emit through event emitter
		if (coalescedEvents.length > 0) {
			this._onDidFilesChange.fire({ raw: toFileChanges(coalescedEvents), event: this.toFileChangesEvent(coalescedEvents) });
		}
	}

	private toFileChangesEvent(changes: IDiskFileChange[]): FileChangesEvent {
		return new FileChangesEvent(toFileChanges(changes), !isLinux);
	}
}

enum Path {
	UNIX,
	WINDOWS,
	UNC
}

suite('Watcher', () => {

	(isWindows ? test.skip : test)('parseWatcherPatterns - posix', () => {
		const path = '/users/data/src';
		let parsedPattern = parseWatcherPatterns(path, ['*.js'])[0];

		assert.strictEqual(parsedPattern('/users/data/src/foo.js'), true);
		assert.strictEqual(parsedPattern('/users/data/src/foo.ts'), false);
		assert.strictEqual(parsedPattern('/users/data/src/bar/foo.js'), false);

		parsedPattern = parseWatcherPatterns(path, ['/users/data/src/*.js'])[0];

		assert.strictEqual(parsedPattern('/users/data/src/foo.js'), true);
		assert.strictEqual(parsedPattern('/users/data/src/foo.ts'), false);
		assert.strictEqual(parsedPattern('/users/data/src/bar/foo.js'), false);

		parsedPattern = parseWatcherPatterns(path, ['/users/data/src/bar/*.js'])[0];

		assert.strictEqual(parsedPattern('/users/data/src/foo.js'), false);
		assert.strictEqual(parsedPattern('/users/data/src/foo.ts'), false);
		assert.strictEqual(parsedPattern('/users/data/src/bar/foo.js'), true);

		parsedPattern = parseWatcherPatterns(path, ['**/*.js'])[0];

		assert.strictEqual(parsedPattern('/users/data/src/foo.js'), true);
		assert.strictEqual(parsedPattern('/users/data/src/foo.ts'), false);
		assert.strictEqual(parsedPattern('/users/data/src/bar/foo.js'), true);
	});

	(!isWindows ? test.skip : test)('parseWatcherPatterns - windows', () => {
		const path = 'c:\\users\\data\\src';
		let parsedPattern = parseWatcherPatterns(path, ['*.js'])[0];

		assert.strictEqual(parsedPattern('c:\\users\\data\\src\\foo.js'), true);
		assert.strictEqual(parsedPattern('c:\\users\\data\\src\\foo.ts'), false);
		assert.strictEqual(parsedPattern('c:\\users\\data\\src\\bar/foo.js'), false);

		parsedPattern = parseWatcherPatterns(path, ['c:\\users\\data\\src\\*.js'])[0];

		assert.strictEqual(parsedPattern('c:\\users\\data\\src\\foo.js'), true);
		assert.strictEqual(parsedPattern('c:\\users\\data\\src\\foo.ts'), false);
		assert.strictEqual(parsedPattern('c:\\users\\data\\src\\bar\\foo.js'), false);

		parsedPattern = parseWatcherPatterns(path, ['c:\\users\\data\\src\\bar/*.js'])[0];

		assert.strictEqual(parsedPattern('c:\\users\\data\\src\\foo.js'), false);
		assert.strictEqual(parsedPattern('c:\\users\\data\\src\\foo.ts'), false);
		assert.strictEqual(parsedPattern('c:\\users\\data\\src\\bar\\foo.js'), true);

		parsedPattern = parseWatcherPatterns(path, ['**/*.js'])[0];

		assert.strictEqual(parsedPattern('c:\\users\\data\\src\\foo.js'), true);
		assert.strictEqual(parsedPattern('c:\\users\\data\\src\\foo.ts'), false);
		assert.strictEqual(parsedPattern('c:\\users\\data\\src\\bar\\foo.js'), true);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});

suite('Watcher Events Normalizer', () => {

	const disposables = new DisposableStore();

	teardown(() => {
		disposables.clear();
	});

	test('simple add/update/delete', done => {
		const watch = disposables.add(new TestFileWatcher());

		const added = uri.file('/users/data/src/added.txt');
		const updated = uri.file('/users/data/src/updated.txt');
		const deleted = uri.file('/users/data/src/deleted.txt');

		const raw: IDiskFileChange[] = [
			{ path: added.fsPath, type: FileChangeType.ADDED },
			{ path: updated.fsPath, type: FileChangeType.UPDATED },
			{ path: deleted.fsPath, type: FileChangeType.DELETED },
		];

		disposables.add(watch.onDidFilesChange(({ event, raw }) => {
			assert.ok(event);
			assert.strictEqual(raw.length, 3);
			assert.ok(event.contains(added, FileChangeType.ADDED));
			assert.ok(event.contains(updated, FileChangeType.UPDATED));
			assert.ok(event.contains(deleted, FileChangeType.DELETED));

			done();
		}));

		watch.report(raw);
	});

	(isWindows ? [Path.WINDOWS, Path.UNC] : [Path.UNIX]).forEach(path => {
		test(`delete only reported for top level folder (${path})`, done => {
			const watch = disposables.add(new TestFileWatcher());

			const deletedFolderA = uri.file(path === Path.UNIX ? '/users/data/src/todelete1' : path === Path.WINDOWS ? 'C:\\users\\data\\src\\todelete1' : '\\\\localhost\\users\\data\\src\\todelete1');
			const deletedFolderB = uri.file(path === Path.UNIX ? '/users/data/src/todelete2' : path === Path.WINDOWS ? 'C:\\users\\data\\src\\todelete2' : '\\\\localhost\\users\\data\\src\\todelete2');
			const deletedFolderBF1 = uri.file(path === Path.UNIX ? '/users/data/src/todelete2/file.txt' : path === Path.WINDOWS ? 'C:\\users\\data\\src\\todelete2\\file.txt' : '\\\\localhost\\users\\data\\src\\todelete2\\file.txt');
			const deletedFolderBF2 = uri.file(path === Path.UNIX ? '/users/data/src/todelete2/more/test.txt' : path === Path.WINDOWS ? 'C:\\users\\data\\src\\todelete2\\more\\test.txt' : '\\\\localhost\\users\\data\\src\\todelete2\\more\\test.txt');
			const deletedFolderBF3 = uri.file(path === Path.UNIX ? '/users/data/src/todelete2/super/bar/foo.txt' : path === Path.WINDOWS ? 'C:\\users\\data\\src\\todelete2\\super\\bar\\foo.txt' : '\\\\localhost\\users\\data\\src\\todelete2\\super\\bar\\foo.txt');
			const deletedFileA = uri.file(path === Path.UNIX ? '/users/data/src/deleteme.txt' : path === Path.WINDOWS ? 'C:\\users\\data\\src\\deleteme.txt' : '\\\\localhost\\users\\data\\src\\deleteme.txt');

			const addedFile = uri.file(path === Path.UNIX ? '/users/data/src/added.txt' : path === Path.WINDOWS ? 'C:\\users\\data\\src\\added.txt' : '\\\\localhost\\users\\data\\src\\added.txt');
			const updatedFile = uri.file(path === Path.UNIX ? '/users/data/src/updated.txt' : path === Path.WINDOWS ? 'C:\\users\\data\\src\\updated.txt' : '\\\\localhost\\users\\data\\src\\updated.txt');

			const raw: IDiskFileChange[] = [
				{ path: deletedFolderA.fsPath, type: FileChangeType.DELETED },
				{ path: deletedFolderB.fsPath, type: FileChangeType.DELETED },
				{ path: deletedFolderBF1.fsPath, type: FileChangeType.DELETED },
				{ path: deletedFolderBF2.fsPath, type: FileChangeType.DELETED },
				{ path: deletedFolderBF3.fsPath, type: FileChangeType.DELETED },
				{ path: deletedFileA.fsPath, type: FileChangeType.DELETED },
				{ path: addedFile.fsPath, type: FileChangeType.ADDED },
				{ path: updatedFile.fsPath, type: FileChangeType.UPDATED }
			];

			disposables.add(watch.onDidFilesChange(({ event, raw }) => {
				assert.ok(event);
				assert.strictEqual(raw.length, 5);

				assert.ok(event.contains(deletedFolderA, FileChangeType.DELETED));
				assert.ok(event.contains(deletedFolderB, FileChangeType.DELETED));
				assert.ok(event.contains(deletedFileA, FileChangeType.DELETED));
				assert.ok(event.contains(addedFile, FileChangeType.ADDED));
				assert.ok(event.contains(updatedFile, FileChangeType.UPDATED));

				done();
			}));

			watch.report(raw);
		});
	});

	test('event coalescer: ignore CREATE followed by DELETE', done => {
		const watch = disposables.add(new TestFileWatcher());

		const created = uri.file('/users/data/src/related');
		const deleted = uri.file('/users/data/src/related');
		const unrelated = uri.file('/users/data/src/unrelated');

		const raw: IDiskFileChange[] = [
			{ path: created.fsPath, type: FileChangeType.ADDED },
			{ path: deleted.fsPath, type: FileChangeType.DELETED },
			{ path: unrelated.fsPath, type: FileChangeType.UPDATED },
		];

		disposables.add(watch.onDidFilesChange(({ event, raw }) => {
			assert.ok(event);
			assert.strictEqual(raw.length, 1);

			assert.ok(event.contains(unrelated, FileChangeType.UPDATED));

			done();
		}));

		watch.report(raw);
	});

	test('event coalescer: flatten DELETE followed by CREATE into CHANGE', done => {
		const watch = disposables.add(new TestFileWatcher());

		const deleted = uri.file('/users/data/src/related');
		const created = uri.file('/users/data/src/related');
		const unrelated = uri.file('/users/data/src/unrelated');

		const raw: IDiskFileChange[] = [
			{ path: deleted.fsPath, type: FileChangeType.DELETED },
			{ path: created.fsPath, type: FileChangeType.ADDED },
			{ path: unrelated.fsPath, type: FileChangeType.UPDATED },
		];

		disposables.add(watch.onDidFilesChange(({ event, raw }) => {
			assert.ok(event);
			assert.strictEqual(raw.length, 2);

			assert.ok(event.contains(deleted, FileChangeType.UPDATED));
			assert.ok(event.contains(unrelated, FileChangeType.UPDATED));

			done();
		}));

		watch.report(raw);
	});

	test('event coalescer: ignore UPDATE when CREATE received', done => {
		const watch = disposables.add(new TestFileWatcher());

		const created = uri.file('/users/data/src/related');
		const updated = uri.file('/users/data/src/related');
		const unrelated = uri.file('/users/data/src/unrelated');

		const raw: IDiskFileChange[] = [
			{ path: created.fsPath, type: FileChangeType.ADDED },
			{ path: updated.fsPath, type: FileChangeType.UPDATED },
			{ path: unrelated.fsPath, type: FileChangeType.UPDATED },
		];

		disposables.add(watch.onDidFilesChange(({ event, raw }) => {
			assert.ok(event);
			assert.strictEqual(raw.length, 2);

			assert.ok(event.contains(created, FileChangeType.ADDED));
			assert.ok(!event.contains(created, FileChangeType.UPDATED));
			assert.ok(event.contains(unrelated, FileChangeType.UPDATED));

			done();
		}));

		watch.report(raw);
	});

	test('event coalescer: apply DELETE', done => {
		const watch = disposables.add(new TestFileWatcher());

		const updated = uri.file('/users/data/src/related');
		const updated2 = uri.file('/users/data/src/related');
		const deleted = uri.file('/users/data/src/related');
		const unrelated = uri.file('/users/data/src/unrelated');

		const raw: IDiskFileChange[] = [
			{ path: updated.fsPath, type: FileChangeType.UPDATED },
			{ path: updated2.fsPath, type: FileChangeType.UPDATED },
			{ path: unrelated.fsPath, type: FileChangeType.UPDATED },
			{ path: updated.fsPath, type: FileChangeType.DELETED }
		];

		disposables.add(watch.onDidFilesChange(({ event, raw }) => {
			assert.ok(event);
			assert.strictEqual(raw.length, 2);

			assert.ok(event.contains(deleted, FileChangeType.DELETED));
			assert.ok(!event.contains(updated, FileChangeType.UPDATED));
			assert.ok(event.contains(unrelated, FileChangeType.UPDATED));

			done();
		}));

		watch.report(raw);
	});

	test('event coalescer: track case renames', done => {
		const watch = disposables.add(new TestFileWatcher());

		const oldPath = uri.file('/users/data/src/added');
		const newPath = uri.file('/users/data/src/ADDED');

		const raw: IDiskFileChange[] = [
			{ path: newPath.fsPath, type: FileChangeType.ADDED },
			{ path: oldPath.fsPath, type: FileChangeType.DELETED }
		];

		disposables.add(watch.onDidFilesChange(({ event, raw }) => {
			assert.ok(event);
			assert.strictEqual(raw.length, 2);

			for (const r of raw) {
				if (isEqual(r.resource, oldPath)) {
					assert.strictEqual(r.type, FileChangeType.DELETED);
				} else if (isEqual(r.resource, newPath)) {
					assert.strictEqual(r.type, FileChangeType.ADDED);
				} else {
					assert.fail();
				}
			}

			done();
		}));

		watch.report(raw);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
