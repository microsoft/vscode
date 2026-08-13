/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { AgentSessionPullRequestIconCache } from '../../common/agentSessionPullRequestIconCache.js';

suite('AgentSessionPullRequestIconCache', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function link(n: number): string {
		return `https://github.com/owner/repo/pull/${n}`;
	}

	const openIcon: ThemeIcon = { id: 'git-pull-request', color: { id: 'charts.green' } };
	const mergedIcon: ThemeIcon = { id: 'git-pull-request-done', color: { id: 'charts.purple' } };

	test('stores and reads icons keyed by PR link', () => {
		const cache = store.add(new AgentSessionPullRequestIconCache(store.add(new InMemoryStorageService())));

		cache.set(link(1), openIcon);

		assert.deepStrictEqual(cache.get(link(1)), openIcon);
		assert.strictEqual(cache.get(link(2)), undefined);
	});

	test('persists across instances via storage', () => {
		const storageService = store.add(new InMemoryStorageService());
		store.add(new AgentSessionPullRequestIconCache(storageService)).set(link(1), openIcon);

		const restored = store.add(new AgentSessionPullRequestIconCache(storageService));
		assert.deepStrictEqual(restored.get(link(1)), openIcon);
	});

	test('updates another cache instance through shared storage', async () => {
		const storageService = store.add(new InMemoryStorageService());
		const writer = store.add(new AgentSessionPullRequestIconCache(storageService));
		const reader = store.add(new AgentSessionPullRequestIconCache(storageService));
		const changed = Event.toPromise(reader.onDidChange);

		writer.set(link(1), mergedIcon);
		await changed;

		assert.deepStrictEqual(reader.get(link(1)), mergedIcon);
	});

	test('keeps only the 50 most recently updated entries', () => {
		const cache = store.add(new AgentSessionPullRequestIconCache(store.add(new InMemoryStorageService())));

		for (let i = 0; i < 60; i++) {
			cache.set(link(i), { id: `icon-${i}` });
		}

		// The 10 oldest (0..9) are evicted; the 50 most recent (10..59) remain.
		const present: boolean[] = [];
		for (let i = 0; i < 60; i++) {
			present.push(cache.get(link(i)) !== undefined);
		}
		assert.deepStrictEqual(present, [
			...new Array(10).fill(false),
			...new Array(50).fill(true),
		]);
	});

	test('changing an icon refreshes its recency so it survives eviction', () => {
		const cache = store.add(new AgentSessionPullRequestIconCache(store.add(new InMemoryStorageService())));

		for (let i = 0; i < 50; i++) {
			cache.set(link(i), { id: `icon-${i}` });
		}

		// Touch the oldest entry with a changed icon -> becomes most recent.
		cache.set(link(0), mergedIcon);

		// Adding one more evicts link(1) (now the oldest), not the refreshed link(0).
		cache.set(link(50), openIcon);

		assert.deepStrictEqual(cache.get(link(0)), mergedIcon);
		assert.strictEqual(cache.get(link(1)), undefined);
	});
});
