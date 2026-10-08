/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { INotificationHandle, INotificationService } from '../../../../../platform/notification/common/notification.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { defaultProjectBoardViewState, IProjectBoardViewState, ProjectBoardSurface, ProjectBoardViewState, validateProjectBoardViewState } from '../../browser/projectBoardViewState.js';

suite('ProjectBoardViewState', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => sinon.restore());
	const sample: IProjectBoardViewState = {
		version: 1, expandedCards: ['provider\0session\0chat'], expandedChats: ['provider\0session\0main'],
		collapsedRows: ['row'], collapsedColumns: ['column'], unassignedCollapsed: true,
		visibleCounts: [[JSON.stringify(['row', 'column']), 6]],
	};
	const key = ProjectBoardViewState.storageKey('first', 'embedded');

	function setup(storage = store.add(new InMemoryStorageService()), boardId = 'first', surface: ProjectBoardSurface = 'embedded') {
		const log = store.add(new NullLogService());
		const errors = sinon.spy(log, 'error');
		const prompts: Parameters<INotificationService['prompt']>[2][] = [];
		const messages: string[] = [];
		const notifications = new class extends mock<INotificationService>() {
			override prompt(...args: Parameters<INotificationService['prompt']>): INotificationHandle {
				messages.push(args[1]);
				prompts.push(args[2]);
				return new class extends mock<INotificationHandle>() { }();
			}
			override warn(message: string): void { messages.push(message); }
		}();
		const state = store.add(new ProjectBoardViewState(boardId, surface, storage, log, notifications));
		return { state, storage, errors, prompts, messages };
	}

	test('defaults are memory-only and saves restore every fold field in profile-machine storage', () => {
		const h = setup();
		assert.deepStrictEqual(h.state.value, defaultProjectBoardViewState());
		assert.strictEqual(h.storage.get(key, StorageScope.PROFILE), undefined);
		h.state.save(sample);
		assert.deepStrictEqual(setup(h.storage).state.value, sample);
		assert.strictEqual(h.storage.get(key, StorageScope.WORKSPACE), undefined);
		assert.ok(h.storage.keys(StorageScope.PROFILE, StorageTarget.MACHINE).includes(key));
	});

	test('boards and surfaces remain independent, including IDs containing separators', () => {
		const h = setup();
		h.state.save(sample);
		assert.deepStrictEqual(setup(h.storage, 'second').state.value, defaultProjectBoardViewState());
		assert.deepStrictEqual(setup(h.storage, 'first', 'standalone').state.value, defaultProjectBoardViewState());
		assert.notStrictEqual(ProjectBoardViewState.storageKey('first.embedded', 'standalone'), ProjectBoardViewState.storageKey('first', 'embedded'));
	});

	test('unchanged snapshots do not write or publish storage changes', () => {
		const h = setup();
		const writes = sinon.spy(h.storage, 'store');
		const changed = sinon.spy();
		store.add(h.state.onDidChange(changed));
		h.state.save(sample);
		h.state.save({ ...sample, expandedCards: [...sample.expandedCards] });
		assert.deepStrictEqual({ writes: writes.callCount, changed: changed.callCount }, { writes: 1, changed: 0 });
	});

	test('valid external updates and removal restore the view without a writeback loop', () => {
		const h = setup();
		const changed = sinon.spy();
		store.add(h.state.onDidChange(changed));
		const writes = sinon.spy(h.storage, 'store');
		h.storage.store(key, JSON.stringify(sample), StorageScope.PROFILE, StorageTarget.MACHINE);
		assert.deepStrictEqual(h.state.value, sample);
		assert.strictEqual(writes.callCount, 1);
		h.storage.remove(key, StorageScope.PROFILE);
		assert.deepStrictEqual(h.state.value, defaultProjectBoardViewState());
		assert.strictEqual(changed.callCount, 2);
	});

	for (const invalid of [
		'{broken',
		JSON.stringify({ ...sample, version: 2 }),
		JSON.stringify({ ...sample, collapsedRows: ['row', 'row'] }),
		JSON.stringify({ ...sample, expandedCards: [1] }),
		JSON.stringify({ ...sample, unassignedCollapsed: 'true' }),
		JSON.stringify({ ...sample, visibleCounts: [['cell', 1.5]] }),
		JSON.stringify({ ...sample, visibleCounts: [['cell', -1]] }),
		JSON.stringify({ ...sample, visibleCounts: [['cell', 3], ['cell', 6]] }),
		JSON.stringify({ ...sample, extra: true }),
	]) {
		test(`invalid state is reported and preserved until explicit reset: ${invalid.slice(0, 50)}`, () => {
			const storage = store.add(new InMemoryStorageService());
			storage.store(key, invalid, StorageScope.PROFILE, StorageTarget.MACHINE);
			const h = setup(storage);
			assert.deepStrictEqual(h.state.value, defaultProjectBoardViewState());
			assert.strictEqual(h.errors.callCount, 1);
			assert.strictEqual(h.prompts[0][0].label, 'Reset Saved View State');
			h.state.save(sample);
			assert.strictEqual(storage.get(key, StorageScope.PROFILE), invalid);
			h.prompts[0][0].run();
			h.state.save(sample);
			assert.deepStrictEqual(setup(storage).state.value, sample);
		});
	}

	test('a failed write is reported and retry saves the latest deliberate state', () => {
		const h = setup();
		const write = sinon.stub(h.storage, 'store').throws(new Error('Storage unavailable'));
		h.state.save(sample);
		assert.strictEqual(h.errors.callCount, 1);
		assert.match(h.messages[0], /Could not save/);
		assert.deepStrictEqual(h.state.value, defaultProjectBoardViewState());
		write.restore();
		h.prompts[0][0].run();
		assert.deepStrictEqual(setup(h.storage).state.value, sample);
	});

	test('failed reset preserves bytes and reports recovery failure', () => {
		const h = setup();
		h.state.save(sample);
		sinon.stub(h.storage, 'remove').throws(new Error('Storage unavailable'));
		h.state.reset();
		assert.strictEqual(h.errors.callCount, 1);
		assert.deepStrictEqual(JSON.parse(h.storage.get(key, StorageScope.PROFILE)!), sample);
	});

	test('empty IDs, unsafe counts and non-object state are rejected', () => {
		for (const value of [null, [], { ...sample, expandedChats: [''] }, { ...sample, visibleCounts: [['cell', Number.MAX_SAFE_INTEGER + 1]] }]) {
			assert.throws(() => validateProjectBoardViewState(value), /view state is invalid/);
		}
	});
});
