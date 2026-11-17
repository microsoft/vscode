/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import type { IAutomationSchedule } from '../../../../../workbench/contrib/chat/common/automations/automation.js';
import { automationScheduleToLocal } from '../../../../../workbench/contrib/chat/common/automations/schedule.js';

/** A schedule in plain words. */
export interface IAutomationScheduleDescription {
	/** Such as "Weekdays at 9:00 AM", or "Custom schedule" when no plain words fit. */
	readonly label: string;
	/** The cron expression behind a "Custom schedule". */
	readonly cronExpression?: string;
}

const pluralDays: readonly string[] = [
	localize('automationsSchedule.sundays', "Sundays"),
	localize('automationsSchedule.mondays', "Mondays"),
	localize('automationsSchedule.tuesdays', "Tuesdays"),
	localize('automationsSchedule.wednesdays', "Wednesdays"),
	localize('automationsSchedule.thursdays', "Thursdays"),
	localize('automationsSchedule.fridays', "Fridays"),
	localize('automationsSchedule.saturdays', "Saturdays"),
];

const dayNames: Readonly<Record<string, number>> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

/** Formats a wall-clock time the way the Automations page does, such as "9:00 AM". */
export function formatAutomationTime(hour: number, minute: number): string {
	const date = new Date(Date.UTC(2000, 0, 1, Math.max(0, Math.min(23, hour | 0)), Math.max(0, Math.min(59, minute | 0))));
	return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
}

export function describeAutomationSchedule(schedule: IAutomationSchedule): IAutomationScheduleDescription {
	const local = automationScheduleToLocal(schedule);
	const time = formatAutomationTime(local.scheduleHour, local.scheduleMinute);
	switch (local.interval) {
		case 'once':
			return { label: localize('automationsSchedule.once', "Once: {0}", schedule.runAt ? new Date(schedule.runAt).toLocaleString() : '') };
		case 'manual':
			return { label: localize('automationsSchedule.manual', "Manual") };
		case 'hourly':
			return { label: everyHours(1) };
		case 'daily':
			return { label: everyDayAt(time) };
		case 'weekdays':
			return { label: weekdaysAt(time) };
		case 'weekly':
			return { label: daysAt([((local.scheduleDay % 7) + 7) % 7], time) };
		case 'cron': {
			const label = schedule.cronExpression ? describeCronExpression(schedule.cronExpression) : undefined;
			return label ? { label } : customSchedule(schedule.cronExpression);
		}
		default:
			return customSchedule(schedule.cronExpression);
	}
}

/** Describes a five-field cron expression in plain words, or returns undefined when it has no simple description. */
export function describeCronExpression(expression: string): string | undefined {
	const fields = expression.trim().split(/\s+/);
	if (fields.length !== 5) {
		return undefined;
	}
	const [minuteField, hourField, dayOfMonthField, monthField, dayOfWeekField] = fields;
	if (monthField !== '*') {
		return undefined;
	}
	const anyDay = dayOfMonthField === '*' && dayOfWeekField === '*';

	// A step restarts at each hour or day, so only steps that divide it evenly run at a constant interval:
	// `*/45 * * * *` runs at :00 and :45, which is not "every 45 minutes".
	const minuteStep = parseStep(minuteField);
	if (minuteStep !== undefined) {
		return hourField === '*' && anyDay && 60 % minuteStep === 0 ? everyMinutes(minuteStep) : undefined;
	}
	const minute = parseNumber(minuteField, 0, 59);
	if (minute === undefined) {
		return undefined;
	}
	if (hourField === '*') {
		return anyDay ? everyHours(1) : undefined;
	}
	const hourStep = parseStep(hourField);
	if (hourStep !== undefined) {
		return anyDay && hourStep < 24 && 24 % hourStep === 0 ? everyHours(hourStep) : undefined;
	}
	const hour = parseNumber(hourField, 0, 23);
	if (hour === undefined) {
		return undefined;
	}
	const time = formatAutomationTime(hour, minute);
	if (anyDay) {
		return everyDayAt(time);
	}
	if (dayOfMonthField === '*') {
		const days = parseDaysOfWeek(dayOfWeekField);
		if (!days) {
			return undefined;
		}
		if (days.length === 7) {
			return everyDayAt(time);
		}
		if (days.length === 5 && days.every((day, index) => day === index + 1)) {
			return weekdaysAt(time);
		}
		return daysAt(days, time);
	}
	if (dayOfWeekField === '*') {
		const dayOfMonth = parseNumber(dayOfMonthField, 1, 31);
		return dayOfMonth === undefined ? undefined : localize('automationsSchedule.monthly', "Monthly on the {0} at {1}", ordinal(dayOfMonth), time);
	}
	return undefined;
}

function customSchedule(cronExpression: string | undefined): IAutomationScheduleDescription {
	return { label: localize('automationsSchedule.custom', "Custom schedule"), ...(cronExpression ? { cronExpression } : {}) };
}

function everyMinutes(count: number): string {
	return count === 1
		? localize('automationsSchedule.everyMinute', "Every minute")
		: localize('automationsSchedule.everyMinutes', "Every {0} minutes", count);
}

function everyHours(count: number): string {
	return count === 1
		? localize('automationsSchedule.everyHour', "Every hour")
		: localize('automationsSchedule.everyHours', "Every {0} hours", count);
}

function everyDayAt(time: string): string {
	return localize('automationsSchedule.everyDay', "Every day at {0}", time);
}

function weekdaysAt(time: string): string {
	return localize('automationsSchedule.weekdays', "Weekdays at {0}", time);
}

function daysAt(days: readonly number[], time: string): string {
	const names = days.map(day => pluralDays[day]);
	const list = names.length === 1
		? names[0]
		: localize('automationsSchedule.dayList', "{0} and {1}", names.slice(0, -1).join(localize('automationsSchedule.dayListSeparator', ", ")), names[names.length - 1]);
	return localize('automationsSchedule.daysAt', "{0} at {1}", list, time);
}

function ordinal(value: number): string {
	const lastTwo = value % 100;
	if (lastTwo < 11 || lastTwo > 13) {
		switch (value % 10) {
			case 1: return localize('automationsSchedule.ordinalFirst', "{0}st", value);
			case 2: return localize('automationsSchedule.ordinalSecond', "{0}nd", value);
			case 3: return localize('automationsSchedule.ordinalThird', "{0}rd", value);
		}
	}
	return localize('automationsSchedule.ordinalOther', "{0}th", value);
}

function parseNumber(field: string, min: number, max: number): number | undefined {
	if (!/^\d{1,2}$/.test(field)) {
		return undefined;
	}
	const value = Number(field);
	return value >= min && value <= max ? value : undefined;
}

function parseStep(field: string): number | undefined {
	const match = /^\*\/(?<step>\d{1,2})$/.exec(field);
	const step = match?.groups ? Number(match.groups.step) : undefined;
	return step !== undefined && step > 0 ? step : undefined;
}

/** Days of the week as sorted, distinct numbers from 0 (Sunday), or undefined for steps and other forms. */
function parseDaysOfWeek(field: string): number[] | undefined {
	const days = new Set<number>();
	for (const part of field.toLowerCase().split(',')) {
		const range = /^(?<from>\w+)(?:-(?<to>\w+))?$/.exec(part);
		const from = range?.groups ? parseDay(range.groups.from) : undefined;
		const to = range?.groups?.to !== undefined ? parseDay(range.groups.to) : from;
		if (from === undefined || to === undefined || to < from) {
			return undefined;
		}
		for (let day = from; day <= to; day++) {
			days.add(day % 7);
		}
	}
	return [...days].sort((a, b) => a - b);
}

function parseDay(value: string): number | undefined {
	if (/^\d$/.test(value)) {
		const day = Number(value);
		return day <= 7 ? day : undefined;
	}
	return dayNames[value];
}
