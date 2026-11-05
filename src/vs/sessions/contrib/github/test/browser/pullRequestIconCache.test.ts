/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { PullRequestIconCache } from '../../browser/pullRequestIconCache.js';
import { computePullRequestIcon, GitHubPullRequestState } from '../../common/types.js';

suite('PullRequestIconCache', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function link(n: number): string {
		return `https://github.com/owner/repo/pull/${n}`;
	}

	const openIcon: ThemeIcon = { id: 'git-pull-request', color: { id: 'charts.green' } };
	const mergedIcon: ThemeIcon = { id: 'git-pull-request-done', color: { id: 'charts.purple' } };

	test('stores and reads icons keyed by PR link', () => {
		const cache = new PullRequestIconCache(store.add(new InMemoryStorageService()));

		cache.set(link(1), openIcon);

		assert.deepStrictEqual(cache.get(link(1)), openIcon);
		assert.strictEqual(cache.get(link(2)), undefined);
	});

	test('persists across instances via storage', () => {
		const storageService = store.add(new InMemoryStorageService());
		new PullRequestIconCache(storageService).set(link(1), openIcon);

		const restored = new PullRequestIconCache(storageService);
		assert.deepStrictEqual(restored.get(link(1)), openIcon);
	});

	test('keeps only the 1000 most recently updated entries', () => {
		const cache = new PullRequestIconCache(store.add(new InMemoryStorageService()));

		for (let i = 0; i < 1010; i++) {
			cache.set(link(i), { id: `icon-${i}` });
		}

		const present: boolean[] = [];
		for (let i = 0; i < 1010; i++) {
			present.push(cache.get(link(i)) !== undefined);
		}
		assert.deepStrictEqual(present, [
			...new Array(10).fill(false),
			...new Array(1000).fill(true),
		]);
	});

	test('changing an icon refreshes its recency so it survives eviction', () => {
		const cache = new PullRequestIconCache(store.add(new InMemoryStorageService()));

		for (let i = 0; i < 1000; i++) {
			cache.set(link(i), { id: `icon-${i}` });
		}

		// Touch the oldest entry with a changed icon -> becomes most recent.
		cache.set(link(0), mergedIcon);

		cache.set(link(1000), openIcon);

		assert.deepStrictEqual(cache.get(link(0)), mergedIcon);
		assert.strictEqual(cache.get(link(1)), undefined);
	});

	test('persists state, draft status, and the successful refresh time without PR content', () => {
		const storage = store.add(new InMemoryStorageService());
		const cache = new PullRequestIconCache(storage);
		const before = Date.now();
		cache.setState(link(1), { state: GitHubPullRequestState.Closed, isDraft: true });
		const restored = new PullRequestIconCache(storage);
		const snapshot = restored.getState(link(1));
		assert.deepStrictEqual({
			state: snapshot?.state,
			isDraft: snapshot?.isDraft,
			checked: snapshot !== undefined && snapshot.lastChecked >= before && snapshot.lastChecked <= Date.now(),
			icon: restored.get(link(1)),
			fields: snapshot && Object.keys(snapshot).sort(),
		}, {
			state: GitHubPullRequestState.Closed, isDraft: true, checked: true,
			icon: computePullRequestIcon(GitHubPullRequestState.Closed),
			fields: ['isDraft', 'lastChecked', 'state'],
		});
	});

	test('normalizes URL case and trailing slashes but isolates GitHub hosts', () => {
		const cache = new PullRequestIconCache(store.add(new InMemoryStorageService()));
		cache.setState('https://GitHub.com/Owner/Repo/pull/1/', { state: GitHubPullRequestState.Merged, isDraft: false });
		assert.deepStrictEqual({
			publicState: cache.getState(link(1))?.state,
			enterpriseState: cache.getState('https://ghe.example.com/owner/repo/pull/1'),
		}, { publicState: GitHubPullRequestState.Merged, enterpriseState: undefined });
	});

	test('returns the stored icon and state together after restart', () => {
		const storage = store.add(new InMemoryStorageService());
		new PullRequestIconCache(storage).setState(link(1), { state: GitHubPullRequestState.Open, isDraft: true });
		const cache = new PullRequestIconCache(storage);
		const entry = cache.getEntry('https://GitHub.com/Owner/Repo/pull/1/');
		assert.deepStrictEqual({
			icon: entry?.icon, pullRequest: entry?.pullRequest, missing: cache.getEntry(link(2)),
		}, {
			icon: computePullRequestIcon('draft'),
			pullRequest: cache.getState(link(1)), missing: undefined,
		});
	});

	test('preserves observed merges across restart and stale state or icon updates', () => {
		const storage = store.add(new InMemoryStorageService());
		new PullRequestIconCache(storage).setState(link(1), { state: GitHubPullRequestState.Merged, isDraft: false });
		const cache = new PullRequestIconCache(storage);
		cache.setState(link(1), { state: GitHubPullRequestState.Open, isDraft: true });
		cache.set(link(1), openIcon);
		assert.deepStrictEqual({
			state: cache.getState(link(1))?.state, icon: cache.get(link(1)),
		}, { state: GitHubPullRequestState.Merged, icon: computePullRequestIcon(GitHubPullRequestState.Merged) });
	});

	test('allows closed pull requests to reopen and drafts to become ready', () => {
		const cache = new PullRequestIconCache(store.add(new InMemoryStorageService()));
		cache.setState(link(1), { state: GitHubPullRequestState.Closed, isDraft: true });
		cache.setState(link(1), { state: GitHubPullRequestState.Open, isDraft: false });
		assert.deepStrictEqual({
			state: cache.getState(link(1))?.state, isDraft: cache.getState(link(1))?.isDraft, icon: cache.get(link(1)),
		}, { state: GitHubPullRequestState.Open, isDraft: false, icon: computePullRequestIcon(GitHubPullRequestState.Open) });
	});

	test('retains legacy icons and ignores invalid cached state', () => {
		const storage = store.add(new InMemoryStorageService());
		storage.store('sessions.github.pullRequestIconCache', JSON.stringify([
			{ link: link(1), icon: mergedIcon },
			{ link: link(2), icon: openIcon, pullRequest: { state: 'invalid', isDraft: false, lastChecked: 1 } },
			{ link: link(3), pullRequest: { state: 'merged', isDraft: false, lastChecked: -1 } },
		]), StorageScope.APPLICATION, StorageTarget.MACHINE);
		const cache = new PullRequestIconCache(storage);
		assert.deepStrictEqual({
			legacyMerged: cache.getState(link(1)),
			invalidState: cache.getState(link(2)),
			legacyIcon: cache.get(link(2)),
			invalidTimestamp: cache.getState(link(3)),
		}, {
			legacyMerged: { state: GitHubPullRequestState.Merged, isDraft: false, lastChecked: 0 },
			invalidState: undefined, legacyIcon: openIcon, invalidTimestamp: undefined,
		});
	});
});
