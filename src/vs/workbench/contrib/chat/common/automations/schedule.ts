/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAutomationSchedule } from './automation.js';

/**
 * Computes the next instant at which a given automation schedule should fire.
 *
 * Daily and weekly schedules are interpreted in the host's local timezone:
 * `scheduleHour`/`scheduleMinute` describe a wall-clock time, not a UTC time,
 * so the same automation always fires at "the same time of day" regardless
 * of where the user is. DST transitions are handled by JavaScript's local
 * `Date` constructor, with a forward shift when the requested wall time
 * falls in the spring-forward gap.
 *
 * Returns `undefined` for the `manual` interval and for invalid inputs.
 *
 * The `now` parameter is injected so the scheduler and tests can reason
 * about time deterministically without stubbing globals.
 */
export function computeNextRunAt(schedule: IAutomationSchedule, now: Date): Date | undefined {
	const { interval, scheduleHour, scheduleMinute, scheduleDay } = schedule;

	if (!Number.isInteger(scheduleHour) || scheduleHour < 0 || scheduleHour > 23) {
		return undefined;
	}
	if (!Number.isInteger(scheduleMinute) || scheduleMinute < 0 || scheduleMinute > 59) {
		return undefined;
	}

	switch (interval) {
		case 'manual':
			return undefined;

		case 'hourly':
			return new Date(now.getTime() + 60 * 60 * 1000);

		case 'daily': {
			const today = buildLocalDate(now.getFullYear(), now.getMonth(), now.getDate(), scheduleHour, scheduleMinute);
			if (today.getTime() > now.getTime()) {
				return today;
			}
			const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
			return buildLocalDate(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), scheduleHour, scheduleMinute);
		}

		case 'weekly': {
			if (!Number.isInteger(scheduleDay) || scheduleDay < 0 || scheduleDay > 6) {
				return undefined;
			}
			const currentDay = now.getDay();
			let daysAhead = scheduleDay - currentDay;
			const sameDayButPassed = daysAhead === 0 && (now.getHours() > scheduleHour ||
				(now.getHours() === scheduleHour && now.getMinutes() >= scheduleMinute));
			if (daysAhead < 0 || sameDayButPassed) {
				daysAhead += 7;
			}
			const target = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
			return buildLocalDate(target.getFullYear(), target.getMonth(), target.getDate(), scheduleHour, scheduleMinute);
		}

		default:
			return undefined;
	}
}

/**
 * Builds a Date for a specific local wall-clock time. If the requested time
 * falls in a DST spring-forward gap (e.g. 2:30 AM on a day that jumps from
 * 2:00 to 3:00), shifts forward in 1-hour increments until a valid time is
 * found. Ambiguous fall-back times are resolved to the first occurrence,
 * matching JavaScript's default behavior.
 */
function buildLocalDate(year: number, monthIndex: number, day: number, hour: number, minute: number): Date {
	const candidate = new Date(year, monthIndex, day, hour, minute, 0, 0);
	if (candidate.getHours() === hour && candidate.getMinutes() === minute) {
		return candidate;
	}
	for (let shift = 1; shift <= 3; shift++) {
		const shifted = new Date(year, monthIndex, day, hour + shift, minute, 0, 0);
		if (shifted.getHours() === (hour + shift) % 24 && shifted.getMinutes() === minute) {
			return shifted;
		}
	}
	return candidate;
}
