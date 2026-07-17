/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';

/**
 * How long a feeding streak survives without a feed before it dies. Any feed
 * within this window refreshes the deadline, but the count only goes up once
 * per window (Snapchat-style) - feeding ten fish in one sitting still counts as
 * a single day. The "24 hour" window is affectionately rendered to the user as
 * a "24 day streak".
 */
export const STREAK_WINDOW_MS = 24 * 60 * 60 * 1000;

const STREAK_COUNT_KEY = 'sessions.aquarium.streak.count';
const STREAK_LAST_FED_KEY = 'sessions.aquarium.streak.lastFedAt';
const STREAK_LAST_INCREMENT_KEY = 'sessions.aquarium.streak.lastIncrementAt';
const STREAK_REVIVABLE_KEY = 'sessions.aquarium.streak.revivable';

/** Result of recording a feed, describing how the streak changed. */
export interface IFeedResult {
	/** The streak count after this feed. */
	readonly count: number;
	/** True when this feed started a brand new streak (none was alive or revivable). */
	readonly started: boolean;
	/** True when this feed revived a previously-died streak. */
	readonly revived: boolean;
}

/**
 * Tracks how often the user feeds the aquarium fish as a persisted "streak".
 *
 * Every feed refreshes the streak's 24h timer. If no fish is fed for 24h the
 * streak dies, but its count is parked as {@link revivableCount} so the user
 * can be offered a fun way to bring it back.
 */
export class FishFeedingStreak {

	constructor(
		private readonly storageService: IStorageService,
		private readonly now: () => number = Date.now,
	) {
		this.normalizePersistedState();
	}

	private get lastFedAt(): number {
		return this.storageService.getNumber(STREAK_LAST_FED_KEY, StorageScope.APPLICATION, 0);
	}

	private get lastIncrementAt(): number {
		return this.storageService.getNumber(STREAK_LAST_INCREMENT_KEY, StorageScope.APPLICATION, 0);
	}

	private get rawCount(): number {
		return this.storageService.getNumber(STREAK_COUNT_KEY, StorageScope.APPLICATION, 0);
	}

	/** The count of a previously-died streak that is available to revive (0 if none). */
	get revivableCount(): number {
		return this.storageService.getNumber(STREAK_REVIVABLE_KEY, StorageScope.APPLICATION, 0);
	}

	/** Whether the current streak is still alive (fed within the last 24h). */
	get isAlive(): boolean {
		return this.isAliveAt(this.now());
	}

	private isAliveAt(now: number): boolean {
		const lastFedAt = this.lastFedAt;
		return this.rawCount > 0 && lastFedAt > 0 && (now - lastFedAt) <= STREAK_WINDOW_MS;
	}

	/** The current live streak count, or 0 when no streak is alive. */
	get count(): number {
		return this.isAlive ? this.rawCount : 0;
	}

	/**
	 * Detect a streak that has aged out and park its count as revivable. Safe to
	 * call repeatedly. Returns the count that just died, or 0 if nothing died.
	 */
	collectExpired(): number {
		return this.collectExpiredAt(this.now());
	}

	private collectExpiredAt(now: number): number {
		const count = this.rawCount;
		if (count > 0 && !this.isAliveAt(now)) {
			// Keep the largest streak ever lost as the revivable target.
			const revivable = Math.max(this.revivableCount, count);
			this.store(STREAK_REVIVABLE_KEY, revivable);
			this.store(STREAK_COUNT_KEY, 0);
			return count;
		}
		return 0;
	}

	/**
	 * Record that a fish was just fed. Any feed keeps the streak alive, but the
	 * count only goes up once per {@link STREAK_WINDOW_MS}: feeding repeatedly
	 * within the same window leaves the count unchanged (Snapchat-style). If a
	 * previous streak has died, feeding revives it back to its parked count.
	 */
	recordFeed(): IFeedResult {
		const now = this.now();
		this.collectExpiredAt(now);
		const alive = this.isAliveAt(now);
		const revivable = this.revivableCount;
		let count: number;
		let revived = false;
		const lastIncrementAt = this.lastIncrementAt;
		if (alive && now - lastIncrementAt >= STREAK_WINDOW_MS) {
			// Alive and a full window has passed since the last bump: count up.
			// Advance the marker by exactly one window (rather than to `now`) so
			// the daily cadence stays anchored - feeding a little under 24h apart
			// still earns one bump per day instead of slowly drifting.
			count = this.rawCount + 1;
			this.store(STREAK_COUNT_KEY, count);
			this.store(STREAK_LAST_INCREMENT_KEY, lastIncrementAt + STREAK_WINDOW_MS);
		} else if (alive) {
			// Alive but still within the current window: keep the streak warm
			// without bumping the count.
			count = this.rawCount;
		} else if (revivable > 0) {
			// A died streak gets revived by feeding again, restoring its count.
			count = revivable;
			revived = true;
			this.store(STREAK_COUNT_KEY, count);
			this.store(STREAK_LAST_INCREMENT_KEY, now);
		} else {
			// First feed of a brand new streak.
			count = 1;
			this.store(STREAK_COUNT_KEY, count);
			this.store(STREAK_LAST_INCREMENT_KEY, now);
		}
		this.store(STREAK_LAST_FED_KEY, now);
		if (revivable > 0) {
			this.store(STREAK_REVIVABLE_KEY, 0);
		}
		return { count, started: !alive && !revived, revived };
	}

	private normalizePersistedState(): void {
		if (this.rawCount <= 0) {
			return;
		}
		let lastFedAt = this.lastFedAt;
		if (lastFedAt <= 0) {
			lastFedAt = this.now();
			this.store(STREAK_LAST_FED_KEY, lastFedAt);
		}
		if (this.lastIncrementAt <= 0) {
			this.store(STREAK_LAST_INCREMENT_KEY, lastFedAt);
		}
	}

	/**
	 * Force the streak into a specific state. Intended for development and
	 * demos only (see the "Simulate Fish Feeding Streak" command). When
	 * `alive` is true the streak is fed "now" so it counts as live; otherwise
	 * it is parked as a {@link revivableCount} died streak. A `count` of 0 (or
	 * less) clears all streak state.
	 */
	simulate(count: number, alive: boolean): void {
		if (count <= 0) {
			this.store(STREAK_COUNT_KEY, 0);
			this.store(STREAK_LAST_FED_KEY, 0);
			this.store(STREAK_LAST_INCREMENT_KEY, 0);
			this.store(STREAK_REVIVABLE_KEY, 0);
			return;
		}
		if (alive) {
			this.store(STREAK_COUNT_KEY, count);
			this.store(STREAK_LAST_FED_KEY, this.now());
			// Counted "today" already: feeding again won't bump for a window.
			this.store(STREAK_LAST_INCREMENT_KEY, this.now());
			this.store(STREAK_REVIVABLE_KEY, 0);
		} else {
			// Last fed outside the window so the streak has aged out, with its
			// count parked as revivable.
			this.store(STREAK_COUNT_KEY, 0);
			this.store(STREAK_LAST_FED_KEY, this.now() - STREAK_WINDOW_MS - 1000);
			this.store(STREAK_LAST_INCREMENT_KEY, this.now() - STREAK_WINDOW_MS - 1000);
			this.store(STREAK_REVIVABLE_KEY, count);
		}
	}

	private store(key: string, value: number): void {
		this.storageService.store(key, value, StorageScope.APPLICATION, StorageTarget.USER);
	}
}
