/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { FishFeedingStreak, STREAK_WINDOW_MS } from '../../browser/fishFeedingStreak.js';

suite('FishFeedingStreak', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const STREAK_COUNT_KEY = 'sessions.aquarium.streak.count';

	function createStreak() {
		const storage = store.add(new InMemoryStorageService());
		let clock = 1_000_000;
		const now = () => clock;
		return {
			storage,
			streak: new FishFeedingStreak(storage, now),
			advance: (ms: number) => { clock += ms; },
			reload: () => new FishFeedingStreak(storage, now),
		};
	}

	test('count only goes up once per window, lapsing kills, feeding revives', () => {
		const { streak, advance } = createStreak();

		// First feed starts a streak at 1.
		assert.deepStrictEqual(streak.recordFeed(), { count: 1, started: true, revived: false });

		// Feeding again within the same window keeps it alive but does NOT bump.
		advance(60 * 60 * 1000); // +1h
		assert.deepStrictEqual(streak.recordFeed(), { count: 1, started: false, revived: false });
		assert.strictEqual(streak.count, 1);

		// A feed once a full window has passed since the last bump counts up
		// (still alive because we fed 1h ago).
		advance(STREAK_WINDOW_MS - 60 * 60 * 1000); // now 24h since the first bump
		assert.deepStrictEqual(streak.recordFeed(), { count: 2, started: false, revived: false });
		assert.strictEqual(streak.count, 2);
		assert.strictEqual(streak.isAlive, true);

		// Let the streak lapse past the window: it dies but becomes revivable.
		advance(STREAK_WINDOW_MS + 1);
		assert.strictEqual(streak.isAlive, false);
		assert.strictEqual(streak.count, 0);
		assert.strictEqual(streak.collectExpired(), 2);
		assert.strictEqual(streak.revivableCount, 2);

		// Feeding a fish again revives the streak back to its parked count.
		assert.deepStrictEqual(streak.recordFeed(), { count: 2, started: false, revived: true });
		assert.strictEqual(streak.count, 2);
		assert.strictEqual(streak.revivableCount, 0);
		assert.strictEqual(streak.isAlive, true);
	});

	test('feeding many fish in one sitting only counts as one day', () => {
		const { streak, advance } = createStreak();

		streak.recordFeed();
		for (let i = 0; i < 25; i++) {
			advance(1000); // a second between rapid feeds
			streak.recordFeed();
		}
		assert.strictEqual(streak.count, 1);
	});

	test('feeding at the deadline keeps the streak alive', () => {
		const { streak, advance } = createStreak();

		assert.deepStrictEqual(streak.recordFeed(), { count: 1, started: true, revived: false });
		advance(STREAK_WINDOW_MS);
		assert.deepStrictEqual(streak.recordFeed(), { count: 2, started: false, revived: false });
		assert.strictEqual(streak.isAlive, true);
	});

	test('feeding refreshes the 24 hour clock and persists across reloads', () => {
		const { streak, advance, reload } = createStreak();

		assert.deepStrictEqual(streak.recordFeed(), { count: 1, started: true, revived: false });
		advance(STREAK_WINDOW_MS - 1);
		assert.deepStrictEqual(streak.recordFeed(), { count: 1, started: false, revived: false });

		advance(STREAK_WINDOW_MS - 1);
		const restored = reload();
		assert.deepStrictEqual({
			count: restored.count,
			isAlive: restored.isAlive,
			revivableCount: restored.revivableCount,
		}, {
			count: 1,
			isAlive: true,
			revivableCount: 0,
		});

		advance(2);
		assert.strictEqual(restored.isAlive, false);
	});

	test('a revived streak continues counting up from its restored value', () => {
		const { streak, advance } = createStreak();

		// Build a streak of 2 (feed, stay alive, bump a window later), then let
		// it lapse so it becomes revivable.
		streak.recordFeed();
		advance(60 * 60 * 1000); // +1h, still alive
		streak.recordFeed();
		advance(STREAK_WINDOW_MS - 60 * 60 * 1000); // a full window since the bump
		streak.recordFeed();
		assert.strictEqual(streak.count, 2);
		advance(STREAK_WINDOW_MS + 1);
		assert.strictEqual(streak.collectExpired(), 2);
		assert.strictEqual(streak.revivableCount, 2);

		// Feeding revives it to 2 and keeps it alive...
		assert.deepStrictEqual(streak.recordFeed(), { count: 2, started: false, revived: true });
		// ...and continuing to feed counts up to 3 a window later.
		advance(60 * 60 * 1000); // +1h, still alive
		streak.recordFeed();
		advance(STREAK_WINDOW_MS - 60 * 60 * 1000); // a full window since the revive
		assert.deepStrictEqual(streak.recordFeed(), { count: 3, started: false, revived: false });
		assert.strictEqual(streak.count, 3);
	});

	test('simulate forces alive, died and cleared streak states', () => {
		const { streak } = createStreak();

		// Alive: a live streak of the requested length, nothing revivable.
		streak.simulate(30, true);
		assert.strictEqual(streak.count, 30);
		assert.strictEqual(streak.isAlive, true);
		assert.strictEqual(streak.revivableCount, 0);

		// Died: no live streak, but parked as revivable.
		streak.simulate(12, false);
		assert.strictEqual(streak.count, 0);
		assert.strictEqual(streak.isAlive, false);
		assert.strictEqual(streak.revivableCount, 12);
		// Feeding a fish revives the simulated died streak.
		assert.deepStrictEqual(streak.recordFeed(), { count: 12, started: false, revived: true });

		// Clear: wipes all streak state.
		streak.simulate(0, true);
		assert.strictEqual(streak.count, 0);
		assert.strictEqual(streak.isAlive, false);
		assert.strictEqual(streak.revivableCount, 0);
	});

	test('feeding an expired persisted streak revives it even if no badge refresh collected it first', () => {
		const { streak, advance } = createStreak();

		streak.recordFeed();
		advance(60 * 60 * 1000);
		streak.recordFeed();
		advance(STREAK_WINDOW_MS - 60 * 60 * 1000);
		streak.recordFeed();
		assert.strictEqual(streak.count, 2);

		advance(STREAK_WINDOW_MS + 1);
		assert.deepStrictEqual(streak.recordFeed(), { count: 2, started: false, revived: true });
		assert.deepStrictEqual({
			count: streak.count,
			isAlive: streak.isAlive,
			revivableCount: streak.revivableCount,
		}, {
			count: 2,
			isAlive: true,
			revivableCount: 0,
		});
	});

	test('keeps an existing persisted count when timestamp metadata is missing', () => {
		const storage = store.add(new InMemoryStorageService());
		let clock = 1_000_000;
		const now = () => clock;
		storage.store(STREAK_COUNT_KEY, 7, StorageScope.APPLICATION, StorageTarget.USER);

		const streak = new FishFeedingStreak(storage, now);
		assert.deepStrictEqual({
			count: streak.count,
			isAlive: streak.isAlive,
			feed: streak.recordFeed(),
		}, {
			count: 7,
			isAlive: true,
			feed: { count: 7, started: false, revived: false },
		});

		clock += STREAK_WINDOW_MS + 1;
		assert.strictEqual(streak.collectExpired(), 7);
	});
});
