/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { isLinux, isWindows } from '../../../../base/common/platform.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileChangeFilter, FileChangesEvent, FileChangeType, IFileChange } from '../../common/files.js';
import { coalesceEvents, reviveFileChanges, parseWatcherPatterns, isFiltered } from '../../common/watcher.js';

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

				// Verify that deleted folder B has associated resources for its children
				const deletedFolderBEvent = raw.find(e => isEqual(e.resource, deletedFolderB));
				assert.ok(deletedFolderBEvent);
				assert.ok(deletedFolderBEvent.associatedResources);
				assert.strictEqual(deletedFolderBEvent.associatedResources.length, 3);
				assert.ok(deletedFolderBEvent.associatedResources.some(r => isEqual(r, deletedFolderBF1)));
				assert.ok(deletedFolderBEvent.associatedResources.some(r => isEqual(r, deletedFolderBF2)));
				assert.ok(deletedFolderBEvent.associatedResources.some(r => isEqual(r, deletedFolderBF3)));

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

	test('coalesceEvents preserves deleted children in associatedResources', () => {
		const parent = URI.file('/users/data/src/folder');
		const child1 = URI.file('/users/data/src/folder/file1.txt');
		const child2 = URI.file('/users/data/src/folder/nested/file2.txt');
		const child3 = URI.file('/users/data/src/folder/nested/deep/file3.txt');

		const changes: IFileChange[] = [
			{ resource: parent, type: FileChangeType.DELETED },
			{ resource: child1, type: FileChangeType.DELETED },
			{ resource: child2, type: FileChangeType.DELETED },
			{ resource: child3, type: FileChangeType.DELETED }
		];

		const coalesced = coalesceEvents(changes);

		// Should only have 1 delete event (the parent)
		assert.strictEqual(coalesced.length, 1);
		assert.strictEqual(coalesced[0].type, FileChangeType.DELETED);
		assert.ok(isEqual(coalesced[0].resource, parent));

		// All children should be in associatedResources
		assert.ok(coalesced[0].associatedResources);
		assert.strictEqual(coalesced[0].associatedResources!.length, 3);

		const associatedPaths = coalesced[0].associatedResources!.map(r => r.fsPath).sort();
		assert.deepStrictEqual(associatedPaths, [child1.fsPath, child2.fsPath, child3.fsPath].sort());
	});

	test('coalesceEvents preserves multiple parent deletes with their children', () => {
		const parent1 = URI.file('/users/data/src/folder1');
		const parent1Child1 = URI.file('/users/data/src/folder1/file1.txt');
		const parent1Child2 = URI.file('/users/data/src/folder1/file2.txt');

		const parent2 = URI.file('/users/data/src/folder2');
		const parent2Child1 = URI.file('/users/data/src/folder2/fileA.txt');

		const unrelatedFile = URI.file('/users/data/src/other.txt');

		const changes: IFileChange[] = [
			{ resource: parent1, type: FileChangeType.DELETED },
			{ resource: parent1Child1, type: FileChangeType.DELETED },
			{ resource: parent1Child2, type: FileChangeType.DELETED },
			{ resource: parent2, type: FileChangeType.DELETED },
			{ resource: parent2Child1, type: FileChangeType.DELETED },
			{ resource: unrelatedFile, type: FileChangeType.DELETED }
		];

		const coalesced = coalesceEvents(changes);

		// Should have 3 delete events (2 parents + 1 unrelated)
		assert.strictEqual(coalesced.length, 3);

		const parent1Event = coalesced.find(e => isEqual(e.resource, parent1));
		const parent2Event = coalesced.find(e => isEqual(e.resource, parent2));
		const unrelatedEvent = coalesced.find(e => isEqual(e.resource, unrelatedFile));

		assert.ok(parent1Event);
		assert.ok(parent2Event);
		assert.ok(unrelatedEvent);

		// parent1 should have 2 associated resources
		assert.ok(parent1Event!.associatedResources);
		assert.strictEqual(parent1Event!.associatedResources!.length, 2);
		assert.ok(parent1Event!.associatedResources!.some(r => isEqual(r, parent1Child1)));
		assert.ok(parent1Event!.associatedResources!.some(r => isEqual(r, parent1Child2)));

		// parent2 should have 1 associated resource
		assert.ok(parent2Event!.associatedResources);
		assert.strictEqual(parent2Event!.associatedResources!.length, 1);
		assert.ok(isEqual(parent2Event!.associatedResources![0], parent2Child1));

		// unrelated file should have no associated resources
		assert.ok(!unrelatedEvent!.associatedResources || unrelatedEvent!.associatedResources!.length === 0);
	});

	test('coalesceEvents works with mixed add/update/delete events', () => {
		const deletedParent = URI.file('/users/data/src/deleted');
		const deletedChild = URI.file('/users/data/src/deleted/child.txt');
		const addedFile = URI.file('/users/data/src/added.txt');
		const updatedFile = URI.file('/users/data/src/updated.txt');

		const changes: IFileChange[] = [
			{ resource: deletedParent, type: FileChangeType.DELETED },
			{ resource: deletedChild, type: FileChangeType.DELETED },
			{ resource: addedFile, type: FileChangeType.ADDED },
			{ resource: updatedFile, type: FileChangeType.UPDATED }
		];

		const coalesced = coalesceEvents(changes);

		assert.strictEqual(coalesced.length, 3);

		const deleteEvent = coalesced.find(e => e.type === FileChangeType.DELETED);
		const addEvent = coalesced.find(e => e.type === FileChangeType.ADDED);
		const updateEvent = coalesced.find(e => e.type === FileChangeType.UPDATED);

		assert.ok(deleteEvent);
		assert.ok(addEvent);
		assert.ok(updateEvent);

		assert.ok(isEqual(deleteEvent!.resource, deletedParent));
		assert.ok(deleteEvent!.associatedResources);
		assert.strictEqual(deleteEvent!.associatedResources!.length, 1);
		assert.ok(isEqual(deleteEvent!.associatedResources![0], deletedChild));

		assert.ok(isEqual(addEvent!.resource, addedFile));
		assert.ok(isEqual(updateEvent!.resource, updatedFile));
	});

	test('coalesceEvents handles deeply nested deletions', () => {
		const root = URI.file('/users/data/src');
		const level1 = URI.file('/users/data/src/level1');
		const level2 = URI.file('/users/data/src/level1/level2');
		const level3 = URI.file('/users/data/src/level1/level2/level3');
		const level4 = URI.file('/users/data/src/level1/level2/level3/level4.txt');

		const changes: IFileChange[] = [
			{ resource: root, type: FileChangeType.DELETED },
			{ resource: level1, type: FileChangeType.DELETED },
			{ resource: level2, type: FileChangeType.DELETED },
			{ resource: level3, type: FileChangeType.DELETED },
			{ resource: level4, type: FileChangeType.DELETED }
		];

		const coalesced = coalesceEvents(changes);

		// Should only have the root delete event
		assert.strictEqual(coalesced.length, 1);
		assert.ok(isEqual(coalesced[0].resource, root));

		// All nested levels should be in associatedResources
		assert.ok(coalesced[0].associatedResources);
		assert.strictEqual(coalesced[0].associatedResources!.length, 4);
	});

	test('coalesceEvents handles file delete without children', () => {
		const file = URI.file('/users/data/src/file.txt');

		const changes: IFileChange[] = [
			{ resource: file, type: FileChangeType.DELETED }
		];

		const coalesced = coalesceEvents(changes);

		assert.strictEqual(coalesced.length, 1);
		assert.ok(isEqual(coalesced[0].resource, file));
		// No associatedResources for a simple file delete
		assert.ok(!coalesced[0].associatedResources || coalesced[0].associatedResources!.length === 0);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
