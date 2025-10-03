/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IStatusbarViewModelEntry, StatusbarViewModel } from '../../../../browser/parts/statusbar/statusbarModel.js';
import { TestStorageService } from '../../../common/workbenchTestServices.js';
import { StatusbarAlignment } from '../../../../services/statusbar/browser/statusbar.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';

suite('Workbench status bar model', () => {

	const disposables = new DisposableStore();

	teardown(() => {
		disposables.clear();
	});

	test('basics', () => {
		const container = document.createElement('div');
		const model = disposables.add(new StatusbarViewModel(disposables.add(new TestStorageService())));

		assert.strictEqual(model.entries.length, 0);

		const entry1: IStatusbarViewModelEntry = { id: '3', alignment: StatusbarAlignment.LEFT, name: '3', priority: { primary: 3, secondary: 1 }, container, labelContainer: container, hasCommand: false, extensionId: undefined };
		model.add(entry1);
		const entry2: IStatusbarViewModelEntry = { id: '2', alignment: StatusbarAlignment.LEFT, name: '2', priority: { primary: 2, secondary: 1 }, container, labelContainer: container, hasCommand: false, extensionId: undefined };
		model.add(entry2);
		const entry3: IStatusbarViewModelEntry = { id: '1', alignment: StatusbarAlignment.LEFT, name: '1', priority: { primary: 1, secondary: 1 }, container, labelContainer: container, hasCommand: false, extensionId: undefined };
		model.add(entry3);
		const entry4: IStatusbarViewModelEntry = { id: '1-right', alignment: StatusbarAlignment.RIGHT, name: '1-right', priority: { primary: 1, secondary: 1 }, container, labelContainer: container, hasCommand: false, extensionId: undefined };
		model.add(entry4);

		assert.strictEqual(model.entries.length, 4);

		const leftEntries = model.getEntries(StatusbarAlignment.LEFT);
		assert.strictEqual(leftEntries.length, 3);
		assert.strictEqual(model.getEntries(StatusbarAlignment.RIGHT).length, 1);

		assert.strictEqual(leftEntries[0].id, '3');
		assert.strictEqual(leftEntries[1].id, '2');
		assert.strictEqual(leftEntries[2].id, '1');

		const entries = model.entries;
		assert.strictEqual(entries[0].id, '3');
		assert.strictEqual(entries[1].id, '2');
		assert.strictEqual(entries[2].id, '1');
		assert.strictEqual(entries[3].id, '1-right');

		assert.ok(model.findEntry(container));

		let didChangeEntryVisibility: { id: string; visible: boolean } = { id: '', visible: false };
		disposables.add(model.onDidChangeEntryVisibility(e => {
			didChangeEntryVisibility = e;
		}));

		assert.strictEqual(model.isHidden('1'), false);
		model.hide('1');
		assert.strictEqual(didChangeEntryVisibility.id, '1');
		assert.strictEqual(didChangeEntryVisibility.visible, false);
		assert.strictEqual(model.isHidden('1'), true);

		didChangeEntryVisibility = { id: '', visible: false };

		model.show('1');
		assert.strictEqual(didChangeEntryVisibility.id, '1');
		assert.strictEqual(didChangeEntryVisibility.visible, true);
		assert.strictEqual(model.isHidden('1'), false);

		model.remove(entry1);
		model.remove(entry4);
		assert.strictEqual(model.entries.length, 2);

		model.remove(entry2);
		model.remove(entry3);
		assert.strictEqual(model.entries.length, 0);
	});

	test('sorting with infinity and max number', () => {
		const container = document.createElement('div');
		const model = disposables.add(new StatusbarViewModel(disposables.add(new TestStorageService())));

		assert.strictEqual(model.entries.length, 0);

		model.add({ id: '3', alignment: StatusbarAlignment.LEFT, name: '3', priority: { primary: Number.MAX_VALUE, secondary: 1 }, container, labelContainer: container, hasCommand: false, extensionId: undefined });
		model.add({ id: '2', alignment: StatusbarAlignment.LEFT, name: '2', priority: { primary: Number.MIN_VALUE, secondary: 1 }, container, labelContainer: container, hasCommand: false, extensionId: undefined });
		model.add({ id: '1', alignment: StatusbarAlignment.LEFT, name: '1', priority: { primary: Number.POSITIVE_INFINITY, secondary: 1 }, container, labelContainer: container, hasCommand: false, extensionId: undefined });
		model.add({ id: '0', alignment: StatusbarAlignment.LEFT, name: '0', priority: { primary: Number.NEGATIVE_INFINITY, secondary: 1 }, container, labelContainer: container, hasCommand: false, extensionId: undefined });
		model.add({ id: '4', alignment: StatusbarAlignment.LEFT, name: '4', priority: { primary: 100, secondary: 1 }, container, labelContainer: container, hasCommand: false, extensionId: undefined });

		const entries = model.entries;
		assert.strictEqual(entries[0].id, '1');
		assert.strictEqual(entries[1].id, '3');
		assert.strictEqual(entries[2].id, '4');
		assert.strictEqual(entries[3].id, '2');
		assert.strictEqual(entries[4].id, '0');
	});

	test('secondary priority used when primary is same', () => {
		const container = document.createElement('div');
		const model = disposables.add(new StatusbarViewModel(disposables.add(new TestStorageService())));

		assert.strictEqual(model.entries.length, 0);

		model.add({ id: '1', alignment: StatusbarAlignment.LEFT, name: '1', priority: { primary: 1, secondary: 1 }, container, labelContainer: container, hasCommand: false, extensionId: undefined });
		model.add({ id: '2', alignment: StatusbarAlignment.LEFT, name: '2', priority: { primary: 1, secondary: 2 }, container, labelContainer: container, hasCommand: false, extensionId: undefined });
		model.add({ id: '3', alignment: StatusbarAlignment.LEFT, name: '3', priority: { primary: 1, secondary: 3 }, container, labelContainer: container, hasCommand: false, extensionId: undefined });

		const entries = model.entries;
		assert.strictEqual(entries[0].id, '3');
		assert.strictEqual(entries[1].id, '2');
		assert.strictEqual(entries[2].id, '1');
	});

	test('insertion order preserved when priorites are the same', () => {
		const container = document.createElement('div');
		const model = disposables.add(new StatusbarViewModel(disposables.add(new TestStorageService())));

		assert.strictEqual(model.entries.length, 0);

		model.add({ id: '1', alignment: StatusbarAlignment.LEFT, name: '1', priority: { primary: 1, secondary: 1 }, container, labelContainer: container, hasCommand: false, extensionId: undefined });
		model.add({ id: '2', alignment: StatusbarAlignment.LEFT, name: '2', priority: { primary: 1, secondary: 1 }, container, labelContainer: container, hasCommand: false, extensionId: undefined });
		model.add({ id: '3', alignment: StatusbarAlignment.LEFT, name: '3', priority: { primary: 1, secondary: 1 }, container, labelContainer: container, hasCommand: false, extensionId: undefined });

		const entries = model.entries;
		assert.strictEqual(entries[0].id, '1');
		assert.strictEqual(entries[1].id, '2');
		assert.strictEqual(entries[2].id, '3');
	});

	test('entry with reference to other entry (existing)', () => {
		const container = document.createElement('div');
		const model = disposables.add(new StatusbarViewModel(disposables.add(new TestStorageService())));

		// Existing reference, Alignment: left
		model.add({ id: 'a', alignment: StatusbarAlignment.LEFT, name: '1', priority: { primary: 2, secondary: 1 }, container, labelContainer: container, hasCommand: false, extensionId: undefined });
		model.add({ id: 'b', alignment: StatusbarAlignment.LEFT, name: '2', priority: { primary: 1, secondary: 1 }, container, labelContainer: container, hasCommand: false, extensionId: undefined });

		let entry = { id: 'c', alignment: StatusbarAlignment.LEFT, name: '3', priority: { primary: { location: { id: 'a', priority: 2 }, alignment: StatusbarAlignment.LEFT }, secondary: 1 }, container, labelContainer: container, hasCommand: false, extensionId: undefined };
		model.add(entry);

		let entries = model.entries;
		assert.strictEqual(entries.length, 3);
		assert.strictEqual(entries[0].id, 'c');
		assert.strictEqual(entries[1].id, 'a');
		assert.strictEqual(entries[2].id, 'b');

		model.remove(entry);

		// Existing reference, Alignment: right
		entry = { id: 'c', alignment: StatusbarAlignment.RIGHT, name: '3', priority: { primary: { location: { id: 'a', priority: 2 }, alignment: StatusbarAlignment.RIGHT }, secondary: 1 }, container, labelContainer: container, hasCommand: false, extensionId: undefined };
		model.add(entry);

		entries = model.entries;
		assert.strictEqual(entries.length, 3);
		assert.strictEqual(entries[0].id, 'a');
		assert.strictEqual(entries[1].id, 'c');
		assert.strictEqual(entries[2].id, 'b');
	});

	test('entry with reference to other entry (nonexistent)', () => {
		const container = document.createElement('div');
		const model = disposables.add(new StatusbarViewModel(disposables.add(new TestStorageService())));

		// Nonexistent reference, Alignment: left
		model.add({ id: 'a', alignment: StatusbarAlignment.LEFT, name: '1', priority: { primary: 2, secondary: 1 }, container, labelContainer: container, hasCommand: false, extensionId: undefined });
		model.add({ id: 'b', alignment: StatusbarAlignment.LEFT, name: '2', priority: { primary: 1, secondary: 1 }, container, labelContainer: container, hasCommand: false, extensionId: undefined });

		let entry = { id: 'c', alignment: StatusbarAlignment.LEFT, name: '3', priority: { primary: { location: { id: 'not-existing', priority: 0 }, alignment: StatusbarAlignment.LEFT }, secondary: 1 }, container, labelContainer: container, hasCommand: false, extensionId: undefined };
		model.add(entry);

		let entries = model.entries;
		assert.strictEqual(entries.length, 3);
		assert.strictEqual(entries[0].id, 'a');
		assert.strictEqual(entries[1].id, 'b');
		assert.strictEqual(entries[2].id, 'c');

		model.remove(entry);

		// Nonexistent reference, Alignment: different fallback priority
		entry = { id: 'c', alignment: StatusbarAlignment.LEFT, name: '3', priority: { primary: { location: { id: 'not-existing', priority: 3 }, alignment: StatusbarAlignment.LEFT }, secondary: 1 }, container, labelContainer: container, hasCommand: false, extensionId: undefined };
		model.add(entry);

		entries = model.entries;
		assert.strictEqual(entries.length, 3);
		assert.strictEqual(entries[0].id, 'c');
		assert.strictEqual(entries[1].id, 'a');
		assert.strictEqual(entries[2].id, 'b');

		model.remove(entry);

		// Nonexistent reference, Alignment: right
		entry = { id: 'c', alignment: StatusbarAlignment.RIGHT, name: '3', priority: { primary: { location: { id: 'not-existing', priority: 3 }, alignment: StatusbarAlignment.RIGHT }, secondary: 1 }, container, labelContainer: container, hasCommand: false, extensionId: undefined };
		model.add(entry);

		entries = model.entries;
		assert.strictEqual(entries.length, 3);
		assert.strictEqual(entries[0].id, 'a');
		assert.strictEqual(entries[1].id, 'b');
		assert.strictEqual(entries[2].id, 'c');
	});

	test('entry with reference to other entry resorts based on other entry being there or not', () => {
		const container = document.createElement('div');
		const model = disposables.add(new StatusbarViewModel(disposables.add(new TestStorageService())));

		model.add({ id: 'a', alignment: StatusbarAlignment.LEFT, name: '1', priority: { primary: 2, secondary: 1 }, container, labelContainer: container, hasCommand: false, extensionId: undefined });
		model.add({ id: 'b', alignment: StatusbarAlignment.LEFT, name: '2', priority: { primary: 1, secondary: 1 }, container, labelContainer: container, hasCommand: false, extensionId: undefined });
		model.add({ id: 'c', alignment: StatusbarAlignment.LEFT, name: '3', priority: { primary: { location: { id: 'not-existing', priority: 0 }, alignment: StatusbarAlignment.LEFT }, secondary: 1 }, container, labelContainer: container, hasCommand: false, extensionId: undefined });

		let entries = model.entries;
		assert.strictEqual(entries.length, 3);
		assert.strictEqual(entries[0].id, 'a');
		assert.strictEqual(entries[1].id, 'b');
		assert.strictEqual(entries[2].id, 'c');

		const entry = { id: 'not-existing', alignment: StatusbarAlignment.LEFT, name: 'not-existing', priority: { primary: 3, secondary: 1 }, container, labelContainer: container, hasCommand: false, extensionId: undefined };
		model.add(entry);

		entries = model.entries;
		assert.strictEqual(entries.length, 4);
		assert.strictEqual(entries[0].id, 'c');
		assert.strictEqual(entries[1].id, 'not-existing');
		assert.strictEqual(entries[2].id, 'a');
		assert.strictEqual(entries[3].id, 'b');

		model.remove(entry);

		entries = model.entries;
		assert.strictEqual(entries.length, 3);
		assert.strictEqual(entries[0].id, 'a');
		assert.strictEqual(entries[1].id, 'b');
		assert.strictEqual(entries[2].id, 'c');
	});

	test('entry with reference to other entry but different alignment does not explode', () => {
		const container = document.createElement('div');
		const model = disposables.add(new StatusbarViewModel(disposables.add(new TestStorageService())));

		model.add({ id: '1-left', alignment: StatusbarAlignment.LEFT, name: '1-left', priority: { primary: 2, secondary: 1 }, container, labelContainer: container, hasCommand: false, extensionId: undefined });
		model.add({ id: '2-left', alignment: StatusbarAlignment.LEFT, name: '2-left', priority: { primary: 1, secondary: 1 }, container, labelContainer: container, hasCommand: false, extensionId: undefined });

		model.add({ id: '1-right', alignment: StatusbarAlignment.RIGHT, name: '1-right', priority: { primary: 2, secondary: 1 }, container, labelContainer: container, hasCommand: false, extensionId: undefined });
		model.add({ id: '2-right', alignment: StatusbarAlignment.RIGHT, name: '2-right', priority: { primary: 1, secondary: 1 }, container, labelContainer: container, hasCommand: false, extensionId: undefined });

		assert.strictEqual(model.getEntries(StatusbarAlignment.LEFT).length, 2);
		assert.strictEqual(model.getEntries(StatusbarAlignment.RIGHT).length, 2);

		const relativeEntryLeft = { id: 'relative', alignment: StatusbarAlignment.LEFT, name: 'relative', priority: { primary: { location: { id: '1-right', priority: 2 }, alignment: StatusbarAlignment.LEFT }, secondary: 1 }, container, labelContainer: container, hasCommand: false, extensionId: undefined };
		model.add(relativeEntryLeft);

		assert.strictEqual(model.getEntries(StatusbarAlignment.LEFT).length, 3);
		assert.strictEqual(model.getEntries(StatusbarAlignment.LEFT)[2], relativeEntryLeft);
		assert.strictEqual(model.getEntries(StatusbarAlignment.RIGHT).length, 2);

		model.remove(relativeEntryLeft);

		const relativeEntryRight = { id: 'relative', alignment: StatusbarAlignment.RIGHT, name: 'relative', priority: { primary: { location: { id: '1-right', priority: 2 }, alignment: StatusbarAlignment.LEFT }, secondary: 1 }, container, labelContainer: container, hasCommand: false, extensionId: undefined };
		model.add(relativeEntryRight);

		assert.strictEqual(model.getEntries(StatusbarAlignment.LEFT).length, 2);
		assert.strictEqual(model.getEntries(StatusbarAlignment.RIGHT).length, 3);
	});

	test('entry with reference to other entry respects secondary sorting (existent)', () => {
		const container = document.createElement('div');
		const model = disposables.add(new StatusbarViewModel(disposables.add(new TestStorageService())));

		model.add({ id: 'ref', alignment: StatusbarAlignment.LEFT, name: 'ref', priority: { primary: 0, secondary: 0 }, container, labelContainer: container, hasCommand: false, extensionId: undefined });
		model.add({ id: 'entry2', alignment: StatusbarAlignment.RIGHT, name: '2', priority: { primary: { location: { id: 'ref', priority: 0 }, alignment: StatusbarAlignment.RIGHT }, secondary: 2 }, container, labelContainer: container, hasCommand: false, extensionId: undefined });
		model.add({ id: 'entry1', alignment: StatusbarAlignment.RIGHT, name: '1', priority: { primary: { location: { id: 'ref', priority: 0 }, alignment: StatusbarAlignment.RIGHT }, secondary: 1 }, container, labelContainer: container, hasCommand: false, extensionId: undefined });
		model.add({ id: 'entry3', alignment: StatusbarAlignment.RIGHT, name: '3', priority: { primary: { location: { id: 'ref', priority: 0 }, alignment: StatusbarAlignment.RIGHT }, secondary: 3 }, container, labelContainer: container, hasCommand: false, extensionId: undefined });

		const entries = model.entries;
		assert.strictEqual(entries.length, 4);
		assert.strictEqual(entries[0].id, 'ref');
		assert.strictEqual(entries[1].id, 'entry3');
		assert.strictEqual(entries[2].id, 'entry2');
		assert.strictEqual(entries[3].id, 'entry1');
	});

	test('entry with reference to other entry respects secondary sorting (nonexistent)', () => {
		const container = document.createElement('div');
		const model = disposables.add(new StatusbarViewModel(disposables.add(new TestStorageService())));

		model.add({ id: 'entry2', alignment: StatusbarAlignment.RIGHT, name: '2', priority: { primary: { location: { id: 'ref', priority: 1 }, alignment: StatusbarAlignment.RIGHT }, secondary: 2 }, container, labelContainer: container, hasCommand: false, extensionId: undefined });
		model.add({ id: 'entry1', alignment: StatusbarAlignment.RIGHT, name: '1', priority: { primary: { location: { id: 'ref', priority: 1 }, alignment: StatusbarAlignment.RIGHT }, secondary: 1 }, container, labelContainer: container, hasCommand: false, extensionId: undefined });
		model.add({ id: 'entry3', alignment: StatusbarAlignment.RIGHT, name: '3', priority: { primary: { location: { id: 'ref', priority: 1 }, alignment: StatusbarAlignment.RIGHT }, secondary: 3 }, container, labelContainer: container, hasCommand: false, extensionId: undefined });

		const entries = model.entries;
		assert.strictEqual(entries.length, 3);
		assert.strictEqual(entries[0].id, 'entry3');
		assert.strictEqual(entries[1].id, 'entry2');
		assert.strictEqual(entries[2].id, 'entry1');
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
