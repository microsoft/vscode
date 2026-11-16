/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { safeIntl } from '../../../../../base/common/date.js';
import { language } from '../../../../../base/common/platform.js';
import { localize } from '../../../../../nls.js';

const clockFormat = safeIntl.DateTimeFormat(language, { hour: 'numeric', minute: '2-digit' });
const weekdayFormat = safeIntl.DateTimeFormat(language, { weekday: 'short' });
const dateFormat = safeIntl.DateTimeFormat(language, { month: 'short', day: 'numeric' });
const dateWithYearFormat = safeIntl.DateTimeFormat(language, { month: 'short', day: 'numeric', year: 'numeric' });

function toTime(value: string | number | Date | undefined): number {
	return value instanceof Date ? value.getTime() : typeof value === 'string' ? Date.parse(value) : value ?? NaN;
}

/**
 * A scheduled send time, day first and without seconds: "Today 3:00 PM", "Tomorrow 9:00 AM",
 * "Mon 9:00 AM" within the week, then "Nov 24, 9:00 AM", with the year when it is not this year's.
 */
export function formatScheduledRequestTime(value: string | number | Date | undefined, now: number = Date.now(), includeAt = false): string {
	const time = toTime(value);
	if (!Number.isFinite(time)) {
		return localize('scheduledRequestTime.unavailable', "Time unavailable");
	}
	const clock = clockFormat.value.format(time);
	const days = localDay(time) - localDay(now);
	if (days === 0) {
		return includeAt
			? localize('scheduledRequestTime.todayAt', "Today at {0}", clock)
			: localize('scheduledRequestTime.today', "Today {0}", clock);
	}
	if (days === 1) {
		return includeAt
			? localize('scheduledRequestTime.tomorrowAt', "Tomorrow at {0}", clock)
			: localize('scheduledRequestTime.tomorrow', "Tomorrow {0}", clock);
	}
	if (days > 1 && days < 7) {
		return includeAt
			? localize('scheduledRequestTime.weekdayAt', "{0} at {1}", weekdayFormat.value.format(time), clock)
			: localize('scheduledRequestTime.weekday', "{0} {1}", weekdayFormat.value.format(time), clock);
	}
	const sameYear = new Date(time).getFullYear() === new Date(now).getFullYear();
	const date = (sameYear ? dateFormat : dateWithYearFormat).value.format(time);
	return includeAt
		? localize('scheduledRequestTime.dateAt', "{0} at {1}", date, clock)
		: localize('scheduledRequestTime.date', "{0}, {1}", date, clock);
}

/**
 * How long until a scheduled request sends, to the nearest minute, hour or day: "Sending in 5 minutes",
 * "Sending in 3 hours", "Sending in 2 days". With `short`, "In 3 hours".
 */
export function formatScheduledRequestTimeFromNow(value: string | number | Date | undefined, now: number = Date.now(), short?: boolean): string {
	const time = toTime(value);
	if (!Number.isFinite(time)) {
		return localize('scheduledRequestTime.unavailable', "Time unavailable");
	}
	// Due now, or waiting for the agent host to be available to send it.
	if (time <= now) {
		return short ? localize('scheduledRequestTime.now', "Now") : localize('scheduledRequestTime.sendingNow', "Sending now");
	}
	const duration = formatDuration(time - now);
	return short ? localize('scheduledRequestTime.in', "In {0}", duration) : localize('scheduledRequestTime.sendingIn', "Sending in {0}", duration);
}

/**
 * How long until {@link formatScheduledRequestTimeFromNow} says something else, so a label can stay current with one
 * timer; `undefined` once it says "Sending now".
 */
export function getScheduledRequestTimeFromNowChange(value: string | number | Date | undefined, now: number = Date.now()): number | undefined {
	const time = toTime(value);
	if (!Number.isFinite(time) || time <= now) {
		return undefined;
	}
	const remaining = time - now;
	// Rounded to the minute, the count drops once less than half a minute past a whole minute is left.
	return remaining <= 30_000 ? remaining : remaining - (Math.round(remaining / 60_000) - 0.5) * 60_000;
}

function formatDuration(milliseconds: number): string {
	const minutes = Math.round(milliseconds / 60_000);
	if (minutes < 1) {
		return localize('scheduledRequestTime.lessThanAMinute', "less than a minute");
	}
	if (minutes < 60) {
		return minutes === 1 ? localize('scheduledRequestTime.minute', "1 minute") : localize('scheduledRequestTime.minutes', "{0} minutes", minutes);
	}
	const hours = Math.round(minutes / 60);
	if (hours < 24) {
		return hours === 1 ? localize('scheduledRequestTime.hour', "1 hour") : localize('scheduledRequestTime.hours', "{0} hours", hours);
	}
	const days = Math.round(hours / 24);
	return days === 1 ? localize('scheduledRequestTime.day', "1 day") : localize('scheduledRequestTime.days', "{0} days", days);
}

/** Days since the epoch in the local time zone, so a difference counts calendar days. */
function localDay(time: number): number {
	const date = new Date(time);
	return Math.round(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
}
