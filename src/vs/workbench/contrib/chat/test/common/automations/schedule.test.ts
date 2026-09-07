/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAutomationSchedule } from '../../../common/automations/automation.js';
import { computeNextRunAt } from '../../../common/automations/schedule.js';

/**
 * Builds a local-time `Date` from year/month/day/hour/minute. Used so test
 * fixtures read as wall-clock instants regardless of the host timezone.
 */
function localDate(year: number, month: number, day: number, hour = 0, minute = 0): Date {
	return new Date(year, month - 1, day, hour, minute, 0, 0);
}

suite('Automations - computeNextRunAt', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('manual schedules never produce a next-run', () => {
		const schedule: IAutomationSchedule = { interval: 'manual', scheduleHour: 9, scheduleMinute: 0, scheduleDay: 0 };
		assert.strictEqual(computeNextRunAt(schedule, localDate(2026, 6, 1, 12, 0)), undefined);
	});

	test('hourly schedules return now + 1h regardless of wall-clock fields', () => {
		const schedule: IAutomationSchedule = { interval: 'hourly', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 };
		const now = localDate(2026, 6, 1, 12, 30);
		const next = computeNextRunAt(schedule, now);
		assert.ok(next);
		assert.strictEqual(next.getTime() - now.getTime(), 60 * 60 * 1000);
	});

	test('daily: when target time is later today, returns today at that time', () => {
		const schedule: IAutomationSchedule = { interval: 'daily', scheduleHour: 9, scheduleMinute: 0, scheduleDay: 0 };
		const now = localDate(2026, 6, 1, 8, 0);
		assert.deepStrictEqual(computeNextRunAt(schedule, now), localDate(2026, 6, 1, 9, 0));
	});

	test('daily: when target time has passed, returns tomorrow at that time', () => {
		const schedule: IAutomationSchedule = { interval: 'daily', scheduleHour: 9, scheduleMinute: 0, scheduleDay: 0 };
		const now = localDate(2026, 6, 1, 10, 0);
		assert.deepStrictEqual(computeNextRunAt(schedule, now), localDate(2026, 6, 2, 9, 0));
	});

	test('daily: when target equals now, returns tomorrow (strict >)', () => {
		const schedule: IAutomationSchedule = { interval: 'daily', scheduleHour: 9, scheduleMinute: 0, scheduleDay: 0 };
		const now = localDate(2026, 6, 1, 9, 0);
		assert.deepStrictEqual(computeNextRunAt(schedule, now), localDate(2026, 6, 2, 9, 0));
	});

	test('daily: rolls into next month at month boundary', () => {
		const schedule: IAutomationSchedule = { interval: 'daily', scheduleHour: 9, scheduleMinute: 30, scheduleDay: 0 };
		const now = localDate(2026, 6, 30, 23, 0);
		assert.deepStrictEqual(computeNextRunAt(schedule, now), localDate(2026, 7, 1, 9, 30));
	});

	test('weekly: same weekday and time in the future returns today', () => {
		// 2026-06-01 is a Monday (getDay() === 1)
		const schedule: IAutomationSchedule = { interval: 'weekly', scheduleHour: 9, scheduleMinute: 0, scheduleDay: 1 };
		const now = localDate(2026, 6, 1, 7, 0);
		assert.deepStrictEqual(computeNextRunAt(schedule, now), localDate(2026, 6, 1, 9, 0));
	});

	test('weekly: same weekday but time already passed returns next week', () => {
		const schedule: IAutomationSchedule = { interval: 'weekly', scheduleHour: 9, scheduleMinute: 0, scheduleDay: 1 };
		const now = localDate(2026, 6, 1, 10, 0);
		assert.deepStrictEqual(computeNextRunAt(schedule, now), localDate(2026, 6, 8, 9, 0));
	});

	test('weekly: future weekday this week', () => {
		// Now = Mon (1). Target = Fri (5).
		const schedule: IAutomationSchedule = { interval: 'weekly', scheduleHour: 9, scheduleMinute: 0, scheduleDay: 5 };
		const now = localDate(2026, 6, 1, 7, 0);
		assert.deepStrictEqual(computeNextRunAt(schedule, now), localDate(2026, 6, 5, 9, 0));
	});

	test('weekly: past weekday this week wraps to next week', () => {
		// Now = Thu (4). Target = Mon (1).
		const schedule: IAutomationSchedule = { interval: 'weekly', scheduleHour: 9, scheduleMinute: 0, scheduleDay: 1 };
		const now = localDate(2026, 6, 4, 7, 0);
		assert.deepStrictEqual(computeNextRunAt(schedule, now), localDate(2026, 6, 8, 9, 0));
	});

	test('rejects invalid hour, minute, or day for daily/weekly', () => {
		const now = localDate(2026, 6, 1, 12, 0);
		assert.strictEqual(computeNextRunAt({ interval: 'daily', scheduleHour: 24, scheduleMinute: 0, scheduleDay: 0 }, now), undefined);
		assert.strictEqual(computeNextRunAt({ interval: 'daily', scheduleHour: -1, scheduleMinute: 0, scheduleDay: 0 }, now), undefined);
		assert.strictEqual(computeNextRunAt({ interval: 'daily', scheduleHour: 9, scheduleMinute: 60, scheduleDay: 0 }, now), undefined);
		assert.strictEqual(computeNextRunAt({ interval: 'weekly', scheduleHour: 9, scheduleMinute: 0, scheduleDay: 7 }, now), undefined);
		assert.strictEqual(computeNextRunAt({ interval: 'weekly', scheduleHour: 9, scheduleMinute: 0, scheduleDay: -1 }, now), undefined);
	});

	test('hourly ignores hour/minute fields (still produces a next-run with junk values)', () => {
		const now = localDate(2026, 6, 1, 12, 0);
		const schedule: IAutomationSchedule = { interval: 'hourly', scheduleHour: 99, scheduleMinute: 99, scheduleDay: 99 };
		const next = computeNextRunAt(schedule, now);
		assert.ok(next);
		assert.strictEqual(next.getTime() - now.getTime(), 60 * 60 * 1000);
	});

	test('daily: spring-forward day is not skipped', () => {
		// 2026-03-08 02:30 local is in the spring-forward gap in US timezones
		// (clock jumps 02:00 → 03:00). Even outside DST timezones the test
		// asserts the calendar-date semantics: starting 23:30 the day before,
		// `tomorrow` must be the *next calendar day*, not the day after that.
		const schedule: IAutomationSchedule = { interval: 'daily', scheduleHour: 2, scheduleMinute: 30, scheduleDay: 0 };
		const now = localDate(2026, 3, 7, 23, 30); // Saturday March 7, 23:30
		const next = computeNextRunAt(schedule, now);
		assert.ok(next);
		// Next run must be Sunday March 8, not Monday March 9. `localDate`
		// may shift 02:30 forward into the DST gap on actual DST hosts, but
		// the *date* must land on the 8th, never the 9th.
		assert.strictEqual(next.getDate(), 8, `expected next.getDate()===8, got ${next.toString()}`);
		assert.strictEqual(next.getMonth(), 2);
	});

	test('weekly: spring-forward across the boundary lands on the correct calendar day', () => {
		// Weekly on Sunday 02:30, now = Saturday March 7 23:30.
		const schedule: IAutomationSchedule = { interval: 'weekly', scheduleHour: 2, scheduleMinute: 30, scheduleDay: 0 };
		const now = localDate(2026, 3, 7, 23, 30);
		const next = computeNextRunAt(schedule, now);
		assert.ok(next);
		assert.strictEqual(next.getDate(), 8);
		assert.strictEqual(next.getDay(), 0); // Sunday
	});

	test('rejects unknown intervals', () => {
		const now = localDate(2026, 6, 1, 12, 0);
		const schedule = { interval: 'bogus', scheduleHour: 9, scheduleMinute: 0, scheduleDay: 0 } as unknown as IAutomationSchedule;
		assert.strictEqual(computeNextRunAt(schedule, now), undefined);
	});
});
