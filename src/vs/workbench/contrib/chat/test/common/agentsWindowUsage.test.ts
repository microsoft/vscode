/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AGENTS_WINDOW_LAST_SESSION_CREATED_STORAGE_KEY } from '../../../../../platform/chat/common/agentsWindowInvitation.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { AgentsWindowUsage } from '../../common/agentsWindowUsage.js';
import { AGENTS_WINDOW_TOTAL_SESSIONS_STORAGE_KEY } from '../../common/constants.js';

suite('AgentsWindowUsage', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('defaults to zero without writing storage', () => {
		const storage = disposables.add(new InMemoryStorageService());
		const usage = new AgentsWindowUsage(storage);
		assert.deepStrictEqual({
			createdSessionCount: usage.createdSessionCount,
			isActiveUser: usage.isActiveUser(),
			application: storage.keys(StorageScope.APPLICATION, StorageTarget.MACHINE),
			shared: storage.keys(StorageScope.APPLICATION_SHARED, StorageTarget.MACHINE),
		}, { createdSessionCount: 0, isActiveUser: false, application: [], shared: [] });
	});

	test('reads the current existing session count across instances', () => {
		const storage = disposables.add(new InMemoryStorageService());
		const first = new AgentsWindowUsage(storage);
		storage.store(AGENTS_WINDOW_TOTAL_SESSIONS_STORAGE_KEY, 2, StorageScope.APPLICATION, StorageTarget.MACHINE);
		const second = new AgentsWindowUsage(storage);
		const before = [first.createdSessionCount, second.createdSessionCount];
		storage.store(AGENTS_WINDOW_TOTAL_SESSIONS_STORAGE_KEY, 3, StorageScope.APPLICATION, StorageTarget.MACHINE);
		assert.deepStrictEqual({ before, after: [first.createdSessionCount, second.createdSessionCount] }, {
			before: [2, 2],
			after: [3, 3],
		});
	});

	test('notifies only for the existing counter and stops after listener disposal', () => {
		const storage = disposables.add(new InMemoryStorageService());
		const usage = new AgentsWindowUsage(storage);
		const store = disposables.add(new DisposableStore());
		const counts: number[] = [];
		store.add(usage.onDidChangeCreatedSessionCount(store)(count => counts.push(count)));
		storage.store('unrelated', 1, StorageScope.APPLICATION, StorageTarget.MACHINE);
		storage.store(AGENTS_WINDOW_TOTAL_SESSIONS_STORAGE_KEY, 7, StorageScope.PROFILE, StorageTarget.MACHINE);
		storage.store(AGENTS_WINDOW_TOTAL_SESSIONS_STORAGE_KEY, 1, StorageScope.APPLICATION, StorageTarget.MACHINE);
		storage.store(AGENTS_WINDOW_TOTAL_SESSIONS_STORAGE_KEY, 2, StorageScope.APPLICATION, StorageTarget.MACHINE);
		store.dispose();
		storage.store(AGENTS_WINDOW_TOTAL_SESSIONS_STORAGE_KEY, 3, StorageScope.APPLICATION, StorageTarget.MACHINE);
		assert.deepStrictEqual(counts, [1, 2]);
	});

	test('records and publishes count and creation time together across instances', () => {
		const storage = disposables.add(new InMemoryStorageService());
		const first = new AgentsWindowUsage(storage);
		const second = new AgentsWindowUsage(storage);
		const now = 60 * 24 * 60 * 60 * 1000;
		storage.store(AGENTS_WINDOW_TOTAL_SESSIONS_STORAGE_KEY, 2, StorageScope.APPLICATION, StorageTarget.MACHINE);
		storage.store(AGENTS_WINDOW_LAST_SESSION_CREATED_STORAGE_KEY, 1, StorageScope.APPLICATION, StorageTarget.MACHINE);
		const changes: { count: number; active: boolean }[] = [];
		const store = disposables.add(new DisposableStore());
		store.add(second.onDidChange(store)(() => changes.push({ count: second.createdSessionCount, active: second.isActiveUser(now) })));
		const count = first.recordSessionCreated(now);
		assert.deepStrictEqual({
			count, changes,
			lastCreated: storage.getNumber(AGENTS_WINDOW_LAST_SESSION_CREATED_STORAGE_KEY, StorageScope.APPLICATION),
			storedCount: second.createdSessionCount,
			synced: storage.keys(StorageScope.APPLICATION, StorageTarget.USER),
		}, {
			count: 3, changes: [{ count: 3, active: true }, { count: 3, active: true }],
			lastCreated: now, storedCount: 3, synced: [],
		});
	});

	test('observes date-only updates, ignores other scopes, and disposes usage listeners', () => {
		const storage = disposables.add(new InMemoryStorageService());
		const usage = new AgentsWindowUsage(storage);
		const store = disposables.add(new DisposableStore());
		const active: boolean[] = [];
		const now = 60 * 24 * 60 * 60 * 1000;
		storage.store(AGENTS_WINDOW_TOTAL_SESSIONS_STORAGE_KEY, 3, StorageScope.APPLICATION, StorageTarget.MACHINE);
		store.add(usage.onDidChange(store)(() => active.push(usage.isActiveUser(now))));
		storage.store('unrelated', 1, StorageScope.APPLICATION, StorageTarget.MACHINE);
		storage.store(AGENTS_WINDOW_LAST_SESSION_CREATED_STORAGE_KEY, now, StorageScope.PROFILE, StorageTarget.MACHINE);
		storage.store(AGENTS_WINDOW_LAST_SESSION_CREATED_STORAGE_KEY, 1, StorageScope.APPLICATION, StorageTarget.MACHINE);
		storage.store(AGENTS_WINDOW_LAST_SESSION_CREATED_STORAGE_KEY, now, StorageScope.APPLICATION, StorageTarget.MACHINE);
		store.dispose();
		storage.store(AGENTS_WINDOW_TOTAL_SESSIONS_STORAGE_KEY, 2, StorageScope.APPLICATION, StorageTarget.MACHINE);
		assert.deepStrictEqual(active, [false, true]);
	});
});
