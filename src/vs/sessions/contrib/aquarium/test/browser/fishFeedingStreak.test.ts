/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { FishFeedingStreak, STREAK_WINDOW_MS } from '../../browser/fishFeedingStreak.js';

suite('FishFeedingStreak', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createStreak() {
		const storage = store.add(new InMemoryStorageService());
		let clock = 1_000_000;
		const streak = new FishFeedingStreak(storage, () => clock);
		return {
			streak,
			advance: (ms: number) => { clock += ms; },
		};
	}

	test('feeding builds, lapsing kills, reviving restores the streak', () => {
		const { streak, advance } = createStreak();

		// First feed starts a streak.
		assert.deepStrictEqual(streak.recordFeed(), { count: 1, started: true });

		// Feeding again within the window extends it.
		advance(STREAK_WINDOW_MS - 1);
		assert.deepStrictEqual(streak.recordFeed(), { count: 2, started: false });
		assert.strictEqual(streak.count, 2);
		assert.strictEqual(streak.isAlive, true);

		// Let the streak lapse past the 24h window: it dies but becomes revivable.
		advance(STREAK_WINDOW_MS + 1);
		assert.strictEqual(streak.isAlive, false);
		assert.strictEqual(streak.count, 0);
		assert.strictEqual(streak.collectExpired(), 2);
		assert.strictEqual(streak.revivableCount, 2);

		// Reviving restores the lost count and clears the revivable target.
		assert.strictEqual(streak.revive(), 2);
		assert.strictEqual(streak.count, 2);
		assert.strictEqual(streak.revivableCount, 0);
		assert.strictEqual(streak.isAlive, true);
	});

	test('feeding after a lapse supersedes the revivable streak (no clobber)', () => {
		const { streak, advance } = createStreak();

		// Build a streak of 3, then let it lapse so it becomes revivable.
		streak.recordFeed();
		advance(1000);
		streak.recordFeed();
		advance(1000);
		streak.recordFeed();
		advance(STREAK_WINDOW_MS + 1);
		assert.strictEqual(streak.collectExpired(), 3);
		assert.strictEqual(streak.revivableCount, 3);

		// Instead of reviving, keep feeding: a fresh streak starts and the
		// parked revivable value is dropped so it can't later clobber the new one.
		assert.deepStrictEqual(streak.recordFeed(), { count: 1, started: true });
		assert.strictEqual(streak.revivableCount, 0);
		advance(1000);
		streak.recordFeed();
		assert.strictEqual(streak.count, 2);

		// A late revive is now a no-op and must not lower the live streak.
		assert.strictEqual(streak.revive(), 0);
		assert.strictEqual(streak.count, 2);
	});
});
