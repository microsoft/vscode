/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { IAutomationSchedule } from './automation.js';

/** Projects a fixed UTC schedule into local wall-clock fields using a Date.getTimezoneOffset() value. */
export function automationScheduleToLocal(schedule: IAutomationSchedule, timezoneOffset = new Date().getTimezoneOffset()): IAutomationSchedule {
	if (schedule.timeZone !== 'UTC') {
		return schedule;
	}
	const { timeZone: _timeZone, ...local } = shiftSchedule(schedule, -timezoneOffset);
	return local;
}

/** Converts local wall-clock fields to fixed UTC, using the same offset as the editing session. */
export function automationScheduleToUTC(schedule: IAutomationSchedule, timezoneOffset = new Date().getTimezoneOffset()): IAutomationSchedule {
	return schedule.timeZone === 'UTC' ? schedule : { ...shiftSchedule(schedule, timezoneOffset), timeZone: 'UTC' };
}

function shiftSchedule(schedule: IAutomationSchedule, minutes: number): IAutomationSchedule {
	if (schedule.interval !== 'daily' && schedule.interval !== 'weekly') {
		return schedule;
	}
	const shifted = schedule.scheduleHour * 60 + schedule.scheduleMinute + minutes;
	const minuteOfDay = ((shifted % 1440) + 1440) % 1440;
	return {
		...schedule,
		scheduleHour: Math.floor(minuteOfDay / 60),
		scheduleMinute: minuteOfDay % 60,
		scheduleDay: schedule.interval === 'weekly'
			? ((schedule.scheduleDay + Math.floor(shifted / 1440)) % 7 + 7) % 7
			: schedule.scheduleDay,
	};
}

export const DAYS_OF_WEEK: readonly string[] = [
	localize('automation.day.sun', "Sunday"),
	localize('automation.day.mon', "Monday"),
	localize('automation.day.tue', "Tuesday"),
	localize('automation.day.wed', "Wednesday"),
	localize('automation.day.thu', "Thursday"),
	localize('automation.day.fri', "Friday"),
	localize('automation.day.sat', "Saturday"),
];
