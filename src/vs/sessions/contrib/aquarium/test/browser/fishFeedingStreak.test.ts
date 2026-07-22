/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { FishFeedingStreak } from '../../browser/fishFeedingStreak.js';

suite('FishFeedingStreak', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const STREAK_COUNT_KEY = 'sessions.aquarium.streak.count';
	const STREAK_LAST_FED_KEY = 'sessions.aquarium.streak.lastFedAt';
	const STREAK_LAST_FED_DAY_KEY = 'sessions.aquarium.streak.lastFedDay';

	function localTime(day: number, hour = 12, minute = 0): number {
		return new Date(2026, 6, day, hour, minute).getTime();
	}

	function createStreak() {
		const storage = store.add(new InMemoryStorageService());
		let clock = localTime(17);
		const now = () => clock;
		return {
			storage,
			streak: new FishFeedingStreak(storage, now),
			setTime: (day: number, hour = 12, minute = 0) => { clock = localTime(day, hour, minute); },
			reload: () => new FishFeedingStreak(storage, now),
		};
	}

	test('counts at most one feed per local calendar day', () => {
		const { streak, setTime } = createStreak();

		const firstFeed = streak.recordFeed();
		setTime(17, 23, 59);
		const sameDayFeed = streak.recordFeed();
		setTime(18, 0, 0);
		const nextDayFeed = streak.recordFeed();

		assert.deepStrictEqual({
			firstFeed,
			sameDayFeed,
			nextDayFeed,
			count: streak.count,
			isAlive: streak.isAlive,
		}, {
			firstFeed: { count: 1, started: true, revived: false },
			sameDayFeed: { count: 1, started: false, revived: false },
			nextDayFeed: { count: 2, started: false, revived: false },
			count: 2,
			isAlive: true,
		});
	});

	test('feeding many fish in one sitting only counts as one day', () => {
		const { streak } = createStreak();

		streak.recordFeed();
		for (let i = 0; i < 25; i++) {
			streak.recordFeed();
		}
		assert.strictEqual(streak.count, 1);
	});

	test('stays alive through the next day and dies at midnight after a missed day', () => {
		const { streak, setTime } = createStreak();

		setTime(17, 0, 1);
		streak.recordFeed();
		setTime(18, 23, 59);
		const beforeMidnight = {
			count: streak.count,
			isAlive: streak.isAlive,
		};
		setTime(19, 0, 0);
		const atMidnight = {
			count: streak.count,
			isAlive: streak.isAlive,
			expired: streak.collectExpired(),
			revivableCount: streak.revivableCount,
		};

		assert.deepStrictEqual({
			beforeMidnight,
			atMidnight,
		}, {
			beforeMidnight: {
				count: 1,
				isAlive: true,
			},
			atMidnight: {
				count: 0,
				isAlive: false,
				expired: 1,
				revivableCount: 1,
			},
		});
	});

	test('calendar-day state persists across reloads', () => {
		const { streak, setTime, reload } = createStreak();

		streak.recordFeed();
		setTime(18, 8);
		const restored = reload();
		const feed = restored.recordFeed();

		assert.deepStrictEqual({
			feed,
			count: restored.count,
			isAlive: restored.isAlive,
			revivableCount: restored.revivableCount,
		}, {
			feed: { count: 2, started: false, revived: false },
			count: 2,
			isAlive: true,
			revivableCount: 0,
		});
	});

	test('uses the timezone where each feed occurred', () => {
		const storage = store.add(new InMemoryStorageService());
		let timezoneOffset = -5 * 60;
		let clock = Date.UTC(2026, 0, 2, 4, 30);
		const getCalendarDay = (timestamp: number) => Math.floor((timestamp + timezoneOffset * 60 * 1000) / (24 * 60 * 60 * 1000));
		const streak = new FishFeedingStreak(storage, () => clock, getCalendarDay);

		const firstFeed = streak.recordFeed();
		timezoneOffset = 2 * 60;
		clock = Date.UTC(2026, 0, 2, 5, 0);
		const nextLocalDayFeed = streak.recordFeed();

		assert.deepStrictEqual({
			firstFeed,
			nextLocalDayFeed,
			count: streak.count,
		}, {
			firstFeed: { count: 1, started: true, revived: false },
			nextLocalDayFeed: { count: 2, started: false, revived: false },
			count: 2,
		});
	});

	test('migrates the local calendar day from the existing timestamp', () => {
		const storage = store.add(new InMemoryStorageService());
		const lastFedAt = localTime(17, 23, 30);
		storage.store(STREAK_COUNT_KEY, 7, StorageScope.APPLICATION, StorageTarget.USER);
		storage.store(STREAK_LAST_FED_KEY, lastFedAt, StorageScope.APPLICATION, StorageTarget.USER);

		new FishFeedingStreak(storage, () => localTime(18));

		assert.strictEqual(
			storage.getNumber(STREAK_LAST_FED_DAY_KEY, StorageScope.APPLICATION),
			Date.UTC(2026, 6, 17) / (24 * 60 * 60 * 1000)
		);
	});

	test('a revived streak continues counting on the next local day', () => {
		const { streak, setTime } = createStreak();

		streak.recordFeed();
		setTime(18);
		streak.recordFeed();
		setTime(20, 0, 0);
		const revivedFeed = streak.recordFeed();
		setTime(21, 0, 0);
		const nextDayFeed = streak.recordFeed();

		assert.deepStrictEqual({
			revivedFeed,
			nextDayFeed,
			count: streak.count,
			revivableCount: streak.revivableCount,
		}, {
			revivedFeed: { count: 2, started: false, revived: true },
			nextDayFeed: { count: 3, started: false, revived: false },
			count: 3,
			revivableCount: 0,
		});
	});

	test('simulate forces alive, died and cleared streak states', () => {
		const { streak } = createStreak();

		streak.simulate(30, true);
		const alive = {
			count: streak.count,
			isAlive: streak.isAlive,
			revivableCount: streak.revivableCount,
		};
		streak.simulate(12, false);
		const died = {
			count: streak.count,
			isAlive: streak.isAlive,
			revivableCount: streak.revivableCount,
			feed: streak.recordFeed(),
		};
		streak.simulate(0, true);
		const cleared = {
			count: streak.count,
			isAlive: streak.isAlive,
			revivableCount: streak.revivableCount,
		};

		assert.deepStrictEqual({
			alive,
			died,
			cleared,
		}, {
			alive: {
				count: 30,
				isAlive: true,
				revivableCount: 0,
			},
			died: {
				count: 0,
				isAlive: false,
				revivableCount: 12,
				feed: { count: 12, started: false, revived: true },
			},
			cleared: {
				count: 0,
				isAlive: false,
				revivableCount: 0,
			},
		});
	});

	test('keeps an existing persisted count when timestamp metadata is missing', () => {
		const storage = store.add(new InMemoryStorageService());
		let clock = localTime(17);
		const now = () => clock;
		storage.store(STREAK_COUNT_KEY, 7, StorageScope.APPLICATION, StorageTarget.USER);

		const streak = new FishFeedingStreak(storage, now);
		const sameDayFeed = streak.recordFeed();
		clock = localTime(18);
		const nextDayFeed = streak.recordFeed();
		assert.deepStrictEqual({
			count: streak.count,
			isAlive: streak.isAlive,
			sameDayFeed,
			nextDayFeed,
		}, {
			count: 8,
			isAlive: true,
			sameDayFeed: { count: 7, started: false, revived: false },
			nextDayFeed: { count: 8, started: false, revived: false },
		});

		clock = localTime(20, 0, 0);
		assert.strictEqual(streak.collectExpired(), 8);
	});
});
