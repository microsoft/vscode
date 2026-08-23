/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestStorageService } from '../../../../../workbench/test/common/workbenchTestServices.js';
import { ISession, ISessionChangeset } from '../../common/session.js';
import { ISessionChangesStats, MAX_CACHED_SESSION_CHANGES_STATS, readSessionChangesStats, SessionChangesStatsCache } from '../../common/sessionChangesStatsCache.js';

const stats = (files: number): ISessionChangesStats => ({ files, insertions: files * 10, deletions: files });

suite('SessionChangesStatsCache', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createCache(storageService = disposables.add(new TestStorageService())): SessionChangesStatsCache {
		return disposables.add(new SessionChangesStatsCache(storageService));
	}

	test('remembers the stats last recorded for a session', () => {
		const cache = createCache();
		cache.set('a', stats(2));
		cache.set('a', stats(3));

		assert.deepStrictEqual({ a: cache.get('a', undefined), b: cache.get('b', undefined) }, {
			a: { files: 3, insertions: 30, deletions: 3 },
			b: undefined,
		});
	});

	test('drops the entry of a session that no longer has changes', () => {
		const cache = createCache();
		cache.set('a', stats(2));
		cache.set('a', { files: 0, insertions: 0, deletions: 0 });

		assert.strictEqual(cache.get('a', undefined), undefined);
	});

	test('evicts the oldest entry once the cache is full', () => {
		const cache = createCache();
		for (let i = 0; i < MAX_CACHED_SESSION_CHANGES_STATS; i++) {
			cache.set(`session-${i}`, stats(1));
		}
		// Re-recording the oldest session makes it the most recent one again, so
		// the next session evicts the one after it instead.
		cache.set('session-0', stats(2));
		cache.set('overflow', stats(1));

		assert.deepStrictEqual({
			evicted: cache.get('session-1', undefined),
			refreshed: cache.get('session-0', undefined),
			added: cache.get('overflow', undefined),
		}, {
			evicted: undefined,
			refreshed: { files: 2, insertions: 20, deletions: 2 },
			added: { files: 1, insertions: 10, deletions: 1 },
		});
	});

	test('restores the cache from global storage', () => {
		const storageService = disposables.add(new TestStorageService());
		createCache(storageService).set('a', stats(4));

		assert.deepStrictEqual(createCache(storageService).get('a', undefined), { files: 4, insertions: 40, deletions: 4 });
	});
});

suite('readSessionChangesStats', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function stubSession(overrides: Partial<ISession>): ISession {
		return upcastPartial<ISession>({
			sessionId: 'a',
			changesets: constObservable(undefined),
			changes: constObservable([]),
			...overrides,
		});
	}

	const change = { modifiedUri: URI.parse('test:///file.ts'), insertions: 3, deletions: 1 };

	test('reports stats only once the session reported its changes', () => {
		const notReported = stubSession({});
		const reportedNone = stubSession({ changesets: constObservable([]) });
		const summarized = stubSession({ changesSummary: constObservable({ files: 5, additions: 20, deletions: 7 }) });
		const changeset = upcastPartial<ISessionChangeset>({ isDefault: constObservable(true), changes: constObservable([change]) });
		const fromChangeset = stubSession({ changesets: constObservable([changeset]) });
		const fromSessionChanges = stubSession({ changes: constObservable([change]) });

		assert.deepStrictEqual({
			notReported: readSessionChangesStats(notReported, undefined),
			reportedNone: readSessionChangesStats(reportedNone, undefined),
			summarized: readSessionChangesStats(summarized, undefined),
			fromChangeset: readSessionChangesStats(fromChangeset, undefined),
			fromSessionChanges: readSessionChangesStats(fromSessionChanges, undefined),
		}, {
			notReported: undefined,
			reportedNone: { files: 0, insertions: 0, deletions: 0 },
			summarized: { files: 5, insertions: 20, deletions: 7 },
			fromChangeset: { files: 1, insertions: 3, deletions: 1 },
			fromSessionChanges: { files: 1, insertions: 3, deletions: 1 },
		});
	});
});
