/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { AgentsWindowUsage } from '../../common/agentsWindowUsage.js';
import { AGENTS_WINDOW_HAS_RUN_REQUEST_STORAGE_KEY, AGENTS_WINDOW_TOTAL_SESSIONS_STORAGE_KEY } from '../../common/constants.js';

suite('AgentsWindowUsage', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('defaults to zero without writing storage', () => {
		const storage = disposables.add(new InMemoryStorageService());
		const usage = new AgentsWindowUsage(storage);
		assert.deepStrictEqual({
			createdSessionCount: usage.createdSessionCount,
			hasRunRequest: usage.hasRunRequest,
			application: storage.keys(StorageScope.APPLICATION, StorageTarget.MACHINE),
			shared: storage.keys(StorageScope.APPLICATION_SHARED, StorageTarget.MACHINE),
		}, { createdSessionCount: 0, hasRunRequest: false, application: [], shared: [] });
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

	test('backfills request usage from the existing session counter', () => {
		const storage = disposables.add(new InMemoryStorageService());
		const usage = new AgentsWindowUsage(storage);

		storage.store(AGENTS_WINDOW_TOTAL_SESSIONS_STORAGE_KEY, 1, StorageScope.APPLICATION, StorageTarget.MACHINE);

		assert.strictEqual(usage.hasRunRequest, true);
	});

	test('records request usage once and notifies listeners', () => {
		const storage = disposables.add(new InMemoryStorageService());
		const usage = new AgentsWindowUsage(storage);
		const store = disposables.add(new DisposableStore());
		const values: boolean[] = [];
		store.add(usage.onDidChangeHasRunRequest(store)(value => values.push(value)));

		usage.recordRequest();
		usage.recordRequest();

		assert.deepStrictEqual({
			hasRunRequest: usage.hasRunRequest,
			stored: storage.getBoolean(AGENTS_WINDOW_HAS_RUN_REQUEST_STORAGE_KEY, StorageScope.APPLICATION),
			values,
		}, {
			hasRunRequest: true,
			stored: true,
			values: [true],
		});
	});
});
