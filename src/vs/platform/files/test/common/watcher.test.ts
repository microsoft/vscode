/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { isLinux, isWindows } from 'vs/base/common/platform';
import { isEqual } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { FileChangeFilter, FileChangesEvent, FileChangeType, IFileChange } from 'vs/platform/files/common/files';
import { coalesceEvents, reviveFileChanges, parseWatcherPatterns, isFiltered } from 'vs/platform/files/common/watcher';

class TestFileWatcher extends Disposable {
	private readonly _onDidFilesChange: Emitter<{ raw: IFileChange[]; event: FileChangesEvent }>;

	constructor() {
		super();

		this._onDidFilesChange = this._register(new Emitter<{ raw: IFileChange[]; event: FileChangesEvent }>());
	}

	get onDidFilesChange(): Event<{ raw: IFileChange[]; event: FileChangesEvent }> {
		return this._onDidFilesChange.event;
	}

	report(changes: IFileChange[]): void {
		this.onRawFileEvents(changes);
	}

	private onRawFileEvents(events: IFileChange[]): void {

		// Coalesce
		const coalescedEvents = coalesceEvents(events);

		// Emit through event emitter
		if (coalescedEvents.length > 0) {
			this._onDidFilesChange.fire({ raw: reviveFileChanges(coalescedEvents), event: this.toFileChangesEvent(coalescedEvents) });
		}
	}

	private toFileChangesEvent(changes: IFileChange[]): FileChangesEvent {
		return new FileChangesEvent(reviveFileChanges(changes), !isLinux);
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

		const added = URI.file('/users/data/src/added.txt');
		const updated = URI.file('/users/data/src/updated.txt');
		const deleted = URI.file('/users/data/src/deleted.txt');

		const raw: IFileChange[] = [
			{ resource: added, type: FileChangeType.ADDED },
			{ resource: updated, type: FileChangeType.UPDATED },
			{ resource: deleted, type: FileChangeType.DELETED },
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

			const deletedFolderA = URI.file(path === Path.UNIX ? '/users/data/src/todelete1' : path === Path.WINDOWS ? 'C:\\users\\data\\src\\todelete1' : '\\\\localhost\\users\\data\\src\\todelete1');
			const deletedFolderB = URI.file(path === Path.UNIX ? '/users/data/src/todelete2' : path === Path.WINDOWS ? 'C:\\users\\data\\src\\todelete2' : '\\\\localhost\\users\\data\\src\\todelete2');
			const deletedFolderBF1 = URI.file(path === Path.UNIX ? '/users/data/src/todelete2/file.txt' : path === Path.WINDOWS ? 'C:\\users\\data\\src\\todelete2\\file.txt' : '\\\\localhost\\users\\data\\src\\todelete2\\file.txt');
			const deletedFolderBF2 = URI.file(path === Path.UNIX ? '/users/data/src/todelete2/more/test.txt' : path === Path.WINDOWS ? 'C:\\users\\data\\src\\todelete2\\more\\test.txt' : '\\\\localhost\\users\\data\\src\\todelete2\\more\\test.txt');
			const deletedFolderBF3 = URI.file(path === Path.UNIX ? '/users/data/src/todelete2/super/bar/foo.txt' : path === Path.WINDOWS ? 'C:\\users\\data\\src\\todelete2\\super\\bar\\foo.txt' : '\\\\localhost\\users\\data\\src\\todelete2\\super\\bar\\foo.txt');
			const deletedFileA = URI.file(path === Path.UNIX ? '/users/data/src/deleteme.txt' : path === Path.WINDOWS ? 'C:\\users\\data\\src\\deleteme.txt' : '\\\\localhost\\users\\data\\src\\deleteme.txt');

			const addedFile = URI.file(path === Path.UNIX ? '/users/data/src/added.txt' : path === Path.WINDOWS ? 'C:\\users\\data\\src\\added.txt' : '\\\\localhost\\users\\data\\src\\added.txt');
			const updatedFile = URI.file(path === Path.UNIX ? '/users/data/src/updated.txt' : path === Path.WINDOWS ? 'C:\\users\\data\\src\\updated.txt' : '\\\\localhost\\users\\data\\src\\updated.txt');

			const raw: IFileChange[] = [
				{ resource: deletedFolderA, type: FileChangeType.DELETED },
				{ resource: deletedFolderB, type: FileChangeType.DELETED },
				{ resource: deletedFolderBF1, type: FileChangeType.DELETED },
				{ resource: deletedFolderBF2, type: FileChangeType.DELETED },
				{ resource: deletedFolderBF3, type: FileChangeType.DELETED },
				{ resource: deletedFileA, type: FileChangeType.DELETED },
				{ resource: addedFile, type: FileChangeType.ADDED },
				{ resource: updatedFile, type: FileChangeType.UPDATED }
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

		const created = URI.file('/users/data/src/related');
		const deleted = URI.file('/users/data/src/related');
		const unrelated = URI.file('/users/data/src/unrelated');

		const raw: IFileChange[] = [
			{ resource: created, type: FileChangeType.ADDED },
			{ resource: deleted, type: FileChangeType.DELETED },
			{ resource: unrelated, type: FileChangeType.UPDATED },
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

		const deleted = URI.file('/users/data/src/related');
		const created = URI.file('/users/data/src/related');
		const unrelated = URI.file('/users/data/src/unrelated');

		const raw: IFileChange[] = [
			{ resource: deleted, type: FileChangeType.DELETED },
			{ resource: created, type: FileChangeType.ADDED },
			{ resource: unrelated, type: FileChangeType.UPDATED },
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

		const created = URI.file('/users/data/src/related');
		const updated = URI.file('/users/data/src/related');
		const unrelated = URI.file('/users/data/src/unrelated');

		const raw: IFileChange[] = [
			{ resource: created, type: FileChangeType.ADDED },
			{ resource: updated, type: FileChangeType.UPDATED },
			{ resource: unrelated, type: FileChangeType.UPDATED },
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

		const updated = URI.file('/users/data/src/related');
		const updated2 = URI.file('/users/data/src/related');
		const deleted = URI.file('/users/data/src/related');
		const unrelated = URI.file('/users/data/src/unrelated');

		const raw: IFileChange[] = [
			{ resource: updated, type: FileChangeType.UPDATED },
			{ resource: updated2, type: FileChangeType.UPDATED },
			{ resource: unrelated, type: FileChangeType.UPDATED },
			{ resource: updated, type: FileChangeType.DELETED }
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

		const oldPath = URI.file('/users/data/src/added');
		const newPath = URI.file('/users/data/src/ADDED');

		const raw: IFileChange[] = [
			{ resource: newPath, type: FileChangeType.ADDED },
			{ resource: oldPath, type: FileChangeType.DELETED }
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

	test('event type filter', () => {
		const resource = URI.file('/users/data/src/related');

		assert.strictEqual(isFiltered({ resource, type: FileChangeType.ADDED }, undefined), false);
		assert.strictEqual(isFiltered({ resource, type: FileChangeType.UPDATED }, undefined), false);
		assert.strictEqual(isFiltered({ resource, type: FileChangeType.DELETED }, undefined), false);

		assert.strictEqual(isFiltered({ resource, type: FileChangeType.ADDED }, FileChangeFilter.UPDATED), true);
		assert.strictEqual(isFiltered({ resource, type: FileChangeType.ADDED }, FileChangeFilter.UPDATED | FileChangeFilter.DELETED), true);

		assert.strictEqual(isFiltered({ resource, type: FileChangeType.ADDED }, FileChangeFilter.ADDED), false);
		assert.strictEqual(isFiltered({ resource, type: FileChangeType.ADDED }, FileChangeFilter.ADDED | FileChangeFilter.UPDATED), false);
		assert.strictEqual(isFiltered({ resource, type: FileChangeType.ADDED }, FileChangeFilter.ADDED | FileChangeFilter.UPDATED | FileChangeFilter.DELETED), false);

		assert.strictEqual(isFiltered({ resource, type: FileChangeType.DELETED }, FileChangeFilter.UPDATED), true);
		assert.strictEqual(isFiltered({ resource, type: FileChangeType.DELETED }, FileChangeFilter.UPDATED | FileChangeFilter.ADDED), true);

		assert.strictEqual(isFiltered({ resource, type: FileChangeType.DELETED }, FileChangeFilter.DELETED), false);
		assert.strictEqual(isFiltered({ resource, type: FileChangeType.DELETED }, FileChangeFilter.DELETED | FileChangeFilter.UPDATED), false);
		assert.strictEqual(isFiltered({ resource, type: FileChangeType.DELETED }, FileChangeFilter.ADDED | FileChangeFilter.DELETED | FileChangeFilter.UPDATED), false);

		assert.strictEqual(isFiltered({ resource, type: FileChangeType.UPDATED }, FileChangeFilter.ADDED), true);
		assert.strictEqual(isFiltered({ resource, type: FileChangeType.UPDATED }, FileChangeFilter.DELETED | FileChangeFilter.ADDED), true);

		assert.strictEqual(isFiltered({ resource, type: FileChangeType.UPDATED }, FileChangeFilter.UPDATED), false);
		assert.strictEqual(isFiltered({ resource, type: FileChangeType.UPDATED }, FileChangeFilter.DELETED | FileChangeFilter.UPDATED), false);
		assert.strictEqual(isFiltered({ resource, type: FileChangeType.UPDATED }, FileChangeFilter.ADDED | FileChangeFilter.DELETED | FileChangeFilter.UPDATED), false);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
