/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { safeIntl } from '../../../../base/common/date.js';
import { language } from '../../../../base/common/platform.js';
import { localize } from '../../../../nls.js';

const clockFormat = safeIntl.DateTimeFormat(language, { hour: 'numeric', minute: '2-digit' });
const weekdayFormat = safeIntl.DateTimeFormat(language, { weekday: 'short' });
const dateFormat = safeIntl.DateTimeFormat(language, { month: 'short', day: 'numeric' });
const dateWithYearFormat = safeIntl.DateTimeFormat(language, { month: 'short', day: 'numeric', year: 'numeric' });

/**
 * A scheduled send time, day first and without seconds: "Today 3:00 PM", "Tomorrow 9:00 AM",
 * "Mon 9:00 AM" within the week, then "Nov 24, 9:00 AM", with the year when it is not this year's.
 */
export function formatScheduledChatTime(value: string | number | Date | undefined, now: number = Date.now()): string {
	const time = value instanceof Date ? value.getTime() : typeof value === 'string' ? Date.parse(value) : value ?? NaN;
	if (!Number.isFinite(time)) {
		return localize('scheduledChatTime.unavailable', "Time unavailable");
	}
	const clock = clockFormat.value.format(time);
	const days = localDay(time) - localDay(now);
	if (days === 0) {
		return localize('scheduledChatTime.today', "Today {0}", clock);
	}
	if (days === 1) {
		return localize('scheduledChatTime.tomorrow', "Tomorrow {0}", clock);
	}
	if (days > 1 && days < 7) {
		return localize('scheduledChatTime.weekday', "{0} {1}", weekdayFormat.value.format(time), clock);
	}
	const sameYear = new Date(time).getFullYear() === new Date(now).getFullYear();
	return localize('scheduledChatTime.date', "{0}, {1}", (sameYear ? dateFormat : dateWithYearFormat).value.format(time), clock);
}

/** Days since the epoch in the local time zone, so a difference counts calendar days. */
function localDay(time: number): number {
	const date = new Date(time);
	return Math.round(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
}
