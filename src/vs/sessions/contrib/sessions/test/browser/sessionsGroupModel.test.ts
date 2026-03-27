/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { SessionsGroupModel } from '../../browser/sessionsGroupModel.js';

const STORAGE_KEY = 'sessions.groups';

suite('SessionsGroupModel', () => {

	let store: DisposableStore;
	let storageService: InMemoryStorageService;

	setup(() => {
		store = new DisposableStore();
		storageService = store.add(new InMemoryStorageService());
	});

	teardown(() => {
		store.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	function createModel(): SessionsGroupModel {
		return store.add(new SessionsGroupModel(storageService));
	}

	test('starts empty', () => {
		const model = createModel();
		assert.deepStrictEqual(model.getSessionIds(), []);
	});

	test('addChat creates group with first chat as active', () => {
		const model = createModel();
		const fired: string[] = [];
		store.add(model.onDidChange(e => fired.push(e.sessionId)));

		model.addChat('s1', 'c1');

		assert.deepStrictEqual(model.getSessionIds(), ['s1']);
		assert.deepStrictEqual(model.getChatIds('s1'), ['c1']);
		assert.strictEqual(model.getActiveChatId('s1'), 'c1');
		assert.deepStrictEqual(fired, ['s1']);
	});

	test('addChat appends to existing group preserving active', () => {
		const model = createModel();
		model.addChat('s1', 'c1');

		const fired: string[] = [];
		store.add(model.onDidChange(e => fired.push(e.sessionId)));

		model.addChat('s1', 'c2');

		assert.deepStrictEqual(model.getChatIds('s1'), ['c1', 'c2']);
		assert.strictEqual(model.getActiveChatId('s1'), 'c1');
		assert.deepStrictEqual(fired, ['s1']);
	});

	test('addChat is a no-op for duplicate chat', () => {
		const model = createModel();
		model.addChat('s1', 'c1');

		const fired: string[] = [];
		store.add(model.onDidChange(e => fired.push(e.sessionId)));

		model.addChat('s1', 'c1');

		assert.deepStrictEqual(model.getChatIds('s1'), ['c1']);
		assert.deepStrictEqual(fired, []);
	});

	test('getChatIds returns empty for unknown session', () => {
		const model = createModel();
		assert.deepStrictEqual(model.getChatIds('unknown'), []);
	});

	test('getSessionIdForChat finds correct session', () => {
		const model = createModel();
		model.addChat('s1', 'c1');
		model.addChat('s2', 'c2');

		assert.strictEqual(model.getSessionIdForChat('c1'), 's1');
		assert.strictEqual(model.getSessionIdForChat('c2'), 's2');
	});

	test('getSessionIdForChat returns undefined for unknown chat', () => {
		const model = createModel();
		assert.strictEqual(model.getSessionIdForChat('x'), undefined);
	});

	test('getActiveChatId throws for unknown session', () => {
		const model = createModel();
		assert.throws(() => model.getActiveChatId('x'));
	});

	test('setActiveChatId changes active chat and fires event', () => {
		const model = createModel();
		model.addChat('s1', 'c1');
		model.addChat('s1', 'c2');

		const fired: string[] = [];
		store.add(model.onDidChange(e => fired.push(e.sessionId)));

		model.setActiveChatId('c2');

		assert.strictEqual(model.getActiveChatId('s1'), 'c2');
		assert.deepStrictEqual(fired, ['s1']);
	});

	test('setActiveChatId is a no-op for chat not in any group', () => {
		const model = createModel();
		model.addChat('s1', 'c1');

		const fired: string[] = [];
		store.add(model.onDidChange(e => fired.push(e.sessionId)));

		model.setActiveChatId('c999');

		assert.strictEqual(model.getActiveChatId('s1'), 'c1');
		assert.deepStrictEqual(fired, []);
	});

	test('setActiveChatId is a no-op when already active', () => {
		const model = createModel();
		model.addChat('s1', 'c1');

		const fired: string[] = [];
		store.add(model.onDidChange(e => fired.push(e.sessionId)));

		model.setActiveChatId('c1');

		assert.deepStrictEqual(fired, []);
	});

	test('removeChat removes chat from its group', () => {
		const model = createModel();
		model.addChat('s1', 'c1');
		model.addChat('s1', 'c2');

		const fired: string[] = [];
		store.add(model.onDidChange(e => fired.push(e.sessionId)));

		model.removeChat('c1');

		assert.deepStrictEqual(model.getChatIds('s1'), ['c2']);
		assert.strictEqual(model.getSessionIdForChat('c1'), undefined);
		assert.deepStrictEqual(fired, ['s1']);
	});

	test('removeChat deletes group when last chat is removed', () => {
		const model = createModel();
		model.addChat('s1', 'c1');

		const fired: string[] = [];
		store.add(model.onDidChange(e => fired.push(e.sessionId)));

		model.removeChat('c1');

		assert.deepStrictEqual(model.getSessionIds(), []);
		assert.deepStrictEqual(fired, ['s1']);
	});

	test('removeChat adjusts active index when active chat is removed', () => {
		const model = createModel();
		model.addChat('s1', 'c1');
		model.addChat('s1', 'c2');
		model.addChat('s1', 'c3');
		model.setActiveChatId('c3');

		model.removeChat('c3');

		assert.strictEqual(model.getActiveChatId('s1'), 'c2');
	});

	test('removeChat adjusts active index when earlier chat is removed', () => {
		const model = createModel();
		model.addChat('s1', 'c1');
		model.addChat('s1', 'c2');
		model.addChat('s1', 'c3');
		model.setActiveChatId('c3');

		model.removeChat('c1');

		assert.strictEqual(model.getActiveChatId('s1'), 'c3');
	});

	test('removeChat preserves active when later chat is removed', () => {
		const model = createModel();
		model.addChat('s1', 'c1');
		model.addChat('s1', 'c2');
		model.addChat('s1', 'c3');
		model.setActiveChatId('c1');

		model.removeChat('c3');

		assert.strictEqual(model.getActiveChatId('s1'), 'c1');
	});

	test('removeChat is a no-op for unknown chat', () => {
		const model = createModel();
		const fired: string[] = [];
		store.add(model.onDidChange(e => fired.push(e.sessionId)));

		model.removeChat('x');

		assert.deepStrictEqual(fired, []);
	});

	test('deleteSession removes group entirely', () => {
		const model = createModel();
		model.addChat('s1', 'c1');
		model.addChat('s1', 'c2');

		const fired: string[] = [];
		store.add(model.onDidChange(e => fired.push(e.sessionId)));

		model.deleteSession('s1');

		assert.deepStrictEqual(model.getSessionIds(), []);
		assert.deepStrictEqual(model.getChatIds('s1'), []);
		assert.strictEqual(model.getSessionIdForChat('c1'), undefined);
		assert.deepStrictEqual(fired, ['s1']);
	});

	test('deleteSession is a no-op for unknown session', () => {
		const model = createModel();
		const fired: string[] = [];
		store.add(model.onDidChange(e => fired.push(e.sessionId)));

		model.deleteSession('x');

		assert.deepStrictEqual(fired, []);
	});

	test('data persists across instances via storage', () => {
		const model1 = createModel();
		model1.addChat('s1', 'c1');
		model1.addChat('s1', 'c2');
		model1.addChat('s2', 'c3');
		model1.setActiveChatId('c2');
		model1.dispose();

		const model2 = createModel();
		assert.deepStrictEqual(model2.getSessionIds(), ['s1', 's2']);
		assert.deepStrictEqual(model2.getChatIds('s1'), ['c1', 'c2']);
		assert.deepStrictEqual(model2.getChatIds('s2'), ['c3']);
		assert.strictEqual(model2.getActiveChatId('s1'), 'c2');
		assert.strictEqual(model2.getActiveChatId('s2'), 'c3');
	});

	test('deletion persists across instances', () => {
		const model1 = createModel();
		model1.addChat('s1', 'c1');
		model1.deleteSession('s1');
		model1.dispose();

		const model2 = createModel();
		assert.deepStrictEqual(model2.getSessionIds(), []);
	});

	test('removeChat last-chat deletion persists', () => {
		const model1 = createModel();
		model1.addChat('s1', 'c1');
		model1.removeChat('c1');
		model1.dispose();

		const model2 = createModel();
		assert.deepStrictEqual(model2.getSessionIds(), []);
	});

	test('handles invalid JSON in storage gracefully', () => {
		storageService.store(STORAGE_KEY, '{bad json', StorageScope.PROFILE, StorageTarget.MACHINE);
		const model = createModel();
		assert.deepStrictEqual(model.getSessionIds(), []);
	});

	test('handles non-array JSON in storage gracefully', () => {
		storageService.store(STORAGE_KEY, '{"not":"array"}', StorageScope.PROFILE, StorageTarget.MACHINE);
		const model = createModel();
		assert.deepStrictEqual(model.getSessionIds(), []);
	});

	test('handles malformed entries in storage gracefully', () => {
		const data = [
			{ sessionId: 'good', chatIds: ['c1'], activeChatIndex: 0 },
			{ sessionId: 123, chatIds: ['c2'] },        // bad sessionId type
			{ chatIds: ['c3'] },                         // missing sessionId
			{ sessionId: 'mixed', chatIds: ['ok', 42] }, // mixed chatIds types
			{ sessionId: 'empty', chatIds: [] },         // empty chatIds skipped
			null,                                         // null entry
		];
		storageService.store(STORAGE_KEY, JSON.stringify(data), StorageScope.PROFILE, StorageTarget.MACHINE);

		const model = createModel();

		assert.deepStrictEqual(model.getSessionIds(), ['good', 'mixed']);
		assert.deepStrictEqual(model.getChatIds('good'), ['c1']);
		assert.deepStrictEqual(model.getChatIds('mixed'), ['ok']);
		assert.strictEqual(model.getActiveChatId('good'), 'c1');
		assert.strictEqual(model.getActiveChatId('mixed'), 'ok');
	});

	test('handles invalid activeChatIndex in storage gracefully', () => {
		const data = [
			{ sessionId: 's1', chatIds: ['c1', 'c2'], activeChatIndex: 1 },
			{ sessionId: 's2', chatIds: ['c3'], activeChatIndex: 5 },   // out of range
			{ sessionId: 's3', chatIds: ['c4'], activeChatIndex: -1 },  // negative
			{ sessionId: 's4', chatIds: ['c5'] },                        // missing
		];
		storageService.store(STORAGE_KEY, JSON.stringify(data), StorageScope.PROFILE, StorageTarget.MACHINE);

		const model = createModel();

		assert.strictEqual(model.getActiveChatId('s1'), 'c2');
		assert.strictEqual(model.getActiveChatId('s2'), 'c3');
		assert.strictEqual(model.getActiveChatId('s3'), 'c4');
		assert.strictEqual(model.getActiveChatId('s4'), 'c5');
	});

	test('removeChat updates storage', () => {
		const model = createModel();
		model.addChat('s1', 'c1');
		model.addChat('s1', 'c2');
		model.removeChat('c1');
		model.dispose();

		const model2 = createModel();
		assert.deepStrictEqual(model2.getChatIds('s1'), ['c2']);
	});
});
