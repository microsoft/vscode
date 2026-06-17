/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { InMemoryStorageService, IStorageService, WillSaveStateReason } from '../../../../../platform/storage/common/storage.js';
import { GitHubPullRequestStateCache } from '../../browser/githubPullRequestStateCache.js';
import { GitHubPullRequestState } from '../../common/types.js';

suite('GitHubPullRequestStateCache', () => {

	const store = new DisposableStore();
	let storageService: InMemoryStorageService;

	setup(() => {
		storageService = store.add(new InMemoryStorageService());
	});

	teardown(() => store.clear());

	ensureNoDisposablesAreLeakedInTestSuite();

	function createCache(storage: IStorageService = storageService): GitHubPullRequestStateCache {
		return store.add(new GitHubPullRequestStateCache(storage));
	}

	test('getState reflects writes and returns a stable observable', () => {
		const cache = createCache();
		const observable = cache.getState('owner', 'repo', 1);

		assert.strictEqual(observable.get(), undefined);
		assert.strictEqual(cache.getState('owner', 'repo', 1), observable);

		cache.setState('owner', 'repo', 1, { iconState: GitHubPullRequestState.Open });

		assert.deepStrictEqual(observable.get(), { iconState: GitHubPullRequestState.Open });
	});

	test('persists state across reloads via global storage', async () => {
		const cache = createCache();
		cache.setState('owner', 'repo', 1, { iconState: GitHubPullRequestState.Merged });

		// Force the debounced save (as on shutdown) then reload from the same storage.
		await storageService.flush(WillSaveStateReason.SHUTDOWN);

		const reloaded = createCache();
		assert.deepStrictEqual(reloaded.getState('owner', 'repo', 1).get(), { iconState: GitHubPullRequestState.Merged });
	});

	test('caps stored entries at 100, evicting the oldest', () => {
		const cache = createCache();
		for (let i = 1; i <= 101; i++) {
			cache.setState('owner', 'repo', i, { iconState: GitHubPullRequestState.Open });
		}

		// The first (oldest) entry is evicted; the newest are retained.
		assert.strictEqual(cache.getState('owner', 'repo', 1).get(), undefined);
		assert.deepStrictEqual(cache.getState('owner', 'repo', 2).get(), { iconState: GitHubPullRequestState.Open });
		assert.deepStrictEqual(cache.getState('owner', 'repo', 101).get(), { iconState: GitHubPullRequestState.Open });
	});
});
