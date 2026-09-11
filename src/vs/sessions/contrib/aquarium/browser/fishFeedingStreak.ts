/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const HOURS_PER_HUNGER_STATE = 6;

const STREAK_COUNT_KEY = 'sessions.aquarium.streak.count';
const STREAK_LAST_FED_KEY = 'sessions.aquarium.streak.lastFedAt';
const STREAK_LAST_FED_DAY_KEY = 'sessions.aquarium.streak.lastFedDay';
const STREAK_REVIVABLE_KEY = 'sessions.aquarium.streak.revivable';

function getLocalCalendarDay(timestamp: number): number {
	const date = new Date(timestamp);
	return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / MILLISECONDS_PER_DAY;
}

export type FishHungerState = 'happy' | 'neutral' | 'sad' | 'verySad';

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
 * Feeding once on consecutive local calendar days grows the streak. Missing a
 * full day kills it at local midnight, while parking the count for revival.
 */
export class FishFeedingStreak {

	constructor(
		private readonly storageService: IStorageService,
		private readonly now: () => number = Date.now,
		private readonly getCalendarDay: (timestamp: number) => number = getLocalCalendarDay,
	) {
		this.normalizePersistedState();
	}

	private get lastFedAt(): number {
		return this.storageService.getNumber(STREAK_LAST_FED_KEY, StorageScope.APPLICATION, 0);
	}

	private get lastFedDay(): number | undefined {
		return this.storageService.getNumber(STREAK_LAST_FED_DAY_KEY, StorageScope.APPLICATION);
	}

	private get rawCount(): number {
		return this.storageService.getNumber(STREAK_COUNT_KEY, StorageScope.APPLICATION, 0);
	}

	/** The count of a previously-died streak that is available to revive (0 if none). */
	get revivableCount(): number {
		return this.storageService.getNumber(STREAK_REVIVABLE_KEY, StorageScope.APPLICATION, 0);
	}

	/** Whether the current streak was fed today or yesterday. */
	get isAlive(): boolean {
		return this.isAliveAt(this.now());
	}

	private isAliveAt(now: number): boolean {
		const lastFedDay = this.lastFedDay;
		return this.rawCount > 0
			&& lastFedDay !== undefined
			&& this.getCalendarDay(now) - lastFedDay <= 1;
	}

	/** The current live streak count, or 0 when no streak is alive. */
	get count(): number {
		return this.isAlive ? this.rawCount : 0;
	}

	/** The fish mood for the current streak and local time of day. */
	get hungerState(): FishHungerState {
		const count = this.rawCount;
		if (count <= 0) {
			return this.revivableCount > 0 ? 'verySad' : 'happy';
		}

		const now = this.now();
		const lastFedDay = this.lastFedDay;
		if (lastFedDay === undefined) {
			return 'happy';
		}

		const daysSinceFed = this.getCalendarDay(now) - lastFedDay;
		if (daysSinceFed <= 0) {
			return 'happy';
		}
		if (daysSinceFed > 1) {
			return 'verySad';
		}

		const hour = new Date(now).getHours();
		if (hour < HOURS_PER_HUNGER_STATE) {
			return 'happy';
		}
		if (hour < HOURS_PER_HUNGER_STATE * 2) {
			return 'neutral';
		}
		if (hour < HOURS_PER_HUNGER_STATE * 3) {
			return 'sad';
		}
		return 'verySad';
	}

	/** Delay until the next local time boundary that can change {@link hungerState}. */
	get millisecondsUntilHungerStateChange(): number | undefined {
		const lastFedDay = this.lastFedDay;
		if (this.rawCount <= 0 || lastFedDay === undefined) {
			return undefined;
		}

		const now = this.now();
		const daysSinceFed = this.getCalendarDay(now) - lastFedDay;
		if (daysSinceFed < 0 || daysSinceFed > 1) {
			return undefined;
		}

		const nextBoundary = new Date(now);
		const nextHour = daysSinceFed === 0
			? 24
			: (Math.floor(nextBoundary.getHours() / HOURS_PER_HUNGER_STATE) + 1) * HOURS_PER_HUNGER_STATE;
		nextBoundary.setHours(nextHour, 0, 0, 0);
		return Math.max(1, nextBoundary.getTime() - now);
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
	 * Record that a fish was just fed. The count increases once per local
	 * calendar day, and a previously-died streak is restored to its parked count.
	 */
	recordFeed(): IFeedResult {
		const now = this.now();
		const calendarDay = this.getCalendarDay(now);
		this.collectExpiredAt(now);
		const alive = this.isAliveAt(now);
		const lastFedDay = this.lastFedDay;
		const revivable = this.revivableCount;
		let count: number;
		let revived = false;
		if (alive && lastFedDay !== undefined && calendarDay > lastFedDay) {
			count = this.rawCount + 1;
			this.store(STREAK_COUNT_KEY, count);
		} else if (alive) {
			count = this.rawCount;
		} else if (revivable > 0) {
			count = revivable;
			revived = true;
			this.store(STREAK_COUNT_KEY, count);
		} else {
			count = 1;
			this.store(STREAK_COUNT_KEY, count);
		}
		this.store(STREAK_LAST_FED_KEY, now);
		this.store(STREAK_LAST_FED_DAY_KEY, calendarDay);
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
		if (this.lastFedDay === undefined) {
			this.store(STREAK_LAST_FED_DAY_KEY, this.getCalendarDay(lastFedAt));
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
			this.storageService.remove(STREAK_LAST_FED_DAY_KEY, StorageScope.APPLICATION);
			this.store(STREAK_REVIVABLE_KEY, 0);
			return;
		}
		if (alive) {
			const now = this.now();
			this.store(STREAK_COUNT_KEY, count);
			this.store(STREAK_LAST_FED_KEY, now);
			this.store(STREAK_LAST_FED_DAY_KEY, this.getCalendarDay(now));
			this.store(STREAK_REVIVABLE_KEY, 0);
		} else {
			this.store(STREAK_COUNT_KEY, 0);
			this.store(STREAK_LAST_FED_KEY, 0);
			this.storageService.remove(STREAK_LAST_FED_DAY_KEY, StorageScope.APPLICATION);
			this.store(STREAK_REVIVABLE_KEY, count);
		}
	}

	private store(key: string, value: number): void {
		this.storageService.store(key, value, StorageScope.APPLICATION, StorageTarget.USER);
	}
}
