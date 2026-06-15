/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';

/**
 * How long a feeding streak survives without a feed before it dies. Feeding any
 * fish within this window keeps the streak alive (and bumps the count). The
 * "24 hour" window is affectionately rendered to the user as a "24 day streak".
 */
export const STREAK_WINDOW_MS = 24 * 60 * 60 * 1000;

const STREAK_COUNT_KEY = 'sessions.aquarium.streak.count';
const STREAK_LAST_FED_KEY = 'sessions.aquarium.streak.lastFedAt';
const STREAK_REVIVABLE_KEY = 'sessions.aquarium.streak.revivable';

/** Result of recording a feed, describing how the streak changed. */
export interface IFeedResult {
	/** The streak count after this feed. */
	readonly count: number;
	/** True when this feed started a brand new streak (none was alive). */
	readonly started: boolean;
}

/**
 * Tracks how often the user feeds the aquarium fish as a persisted "streak".
 *
 * Every feed refreshes the streak's 24h timer and increments its count. If no
 * fish is fed for 24h the streak dies, but its count is parked as
 * {@link revivableCount} so the user can be offered a fun way to bring it back
 * (by starting a new chat session — see the aquarium service).
 */
export class FishFeedingStreak {

	constructor(
		private readonly storageService: IStorageService,
		private readonly now: () => number = Date.now,
	) { }

	private get lastFedAt(): number {
		return this.storageService.getNumber(STREAK_LAST_FED_KEY, StorageScope.APPLICATION, 0);
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
		const lastFedAt = this.lastFedAt;
		return this.rawCount > 0 && lastFedAt > 0 && (this.now() - lastFedAt) < STREAK_WINDOW_MS;
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
		const count = this.rawCount;
		if (count > 0 && !this.isAlive) {
			// Keep the largest streak ever lost as the revivable target.
			const revivable = Math.max(this.revivableCount, count);
			this.store(STREAK_REVIVABLE_KEY, revivable);
			this.store(STREAK_COUNT_KEY, 0);
			return count;
		}
		return 0;
	}

	/** Record that a fish was just fed, refreshing/extending the streak. */
	recordFeed(): IFeedResult {
		const alive = this.isAlive;
		const count = alive ? this.rawCount + 1 : 1;
		this.store(STREAK_COUNT_KEY, count);
		this.store(STREAK_LAST_FED_KEY, this.now());
		// Actively feeding supersedes any parked dead streak: the user is
		// building a live streak rather than reviving the old one.
		if (this.revivableCount > 0) {
			this.store(STREAK_REVIVABLE_KEY, 0);
		}
		return { count, started: !alive };
	}

	/**
	 * Revive a previously-died streak: restore its count and restart the 24h
	 * timer. Never lowers a streak that is already larger/alive. Returns the
	 * resulting count, or 0 if there was nothing to revive.
	 */
	revive(): number {
		const revivable = this.revivableCount;
		if (revivable <= 0) {
			return 0;
		}
		// Don't clobber a currently-alive (possibly larger) streak.
		const restored = Math.max(revivable, this.count);
		this.store(STREAK_COUNT_KEY, restored);
		this.store(STREAK_LAST_FED_KEY, this.now());
		this.store(STREAK_REVIVABLE_KEY, 0);
		return restored;
	}

	private store(key: string, value: number): void {
		this.storageService.store(key, value, StorageScope.APPLICATION, StorageTarget.USER);
	}
}
