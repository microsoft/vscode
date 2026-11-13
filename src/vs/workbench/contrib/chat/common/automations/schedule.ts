/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { getErrorMessage } from '../../../../../base/common/errors.js';
import { validateAutomationCron } from '../../../../../platform/agentHost/common/automationCron.js';
import { IAutomationSchedule } from './automation.js';

export function getAutomationScheduleDays(schedule: IAutomationSchedule): readonly number[] {
	return schedule.scheduleDays ?? [schedule.scheduleDay];
}

export function formatAutomationWeekdays(schedule: IAutomationSchedule): string {
	const days = getAutomationScheduleDays(schedule);
	if (!days.length || days.some(day => !Number.isInteger(day) || day < 0 || day > 6)) {
		throw new Error(localize('automation.invalidWeekdays', "Select at least one valid day of the week."));
	}
	return [...new Set(days)].sort((a, b) => a - b).join(',');
}

/** Parses numeric cron weekday lists, including the Sunday alias 7. */
export function parseAutomationWeekdays(value: string | undefined): readonly number[] | undefined {
	if (!value || !/^\d+(,\d+)*$/.test(value)) {
		return undefined;
	}
	const days = value.split(',').map(Number);
	return days.some(day => day > 7) ? undefined : [...new Set(days.map(day => day % 7))].sort((a, b) => a - b);
}

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
		...(schedule.interval === 'weekly' && schedule.scheduleDays !== undefined ? {
			scheduleDays: schedule.scheduleDays.map(day => ((day + Math.floor(shifted / 1440)) % 7 + 7) % 7).sort((a, b) => a - b),
		} : {}),
	};
}

export function getAutomationCronValidationError(expression: string, timeZone: string): string | undefined {
	if (!expression.trim()) {
		return undefined;
	}
	try {
		validateAutomationCron(expression, timeZone);
		return undefined;
	} catch (error) {
		return getErrorMessage(error);
	}
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

export const DAYS_OF_WEEK_PLURAL: readonly string[] = [
	localize('automation.day.sun.plural', "Sundays"),
	localize('automation.day.mon.plural', "Mondays"),
	localize('automation.day.tue.plural', "Tuesdays"),
	localize('automation.day.wed.plural', "Wednesdays"),
	localize('automation.day.thu.plural', "Thursdays"),
	localize('automation.day.fri.plural', "Fridays"),
	localize('automation.day.sat.plural', "Saturdays"),
];
