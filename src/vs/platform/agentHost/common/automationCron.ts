/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../nls.js';
import { safeIntl } from '../../../base/common/date.js';
import { language } from '../../../base/common/platform.js';

const MINUTE_MS = 60_000;
const DATE_SEARCH_STEP_MS = 12 * 60 * MINUTE_MS;
const MAX_SEARCH_MS = 10 * 366 * 24 * 60 * MINUTE_MS;

const MONTH_NAMES = new Map([
	['JAN', 1],
	['FEB', 2],
	['MAR', 3],
	['APR', 4],
	['MAY', 5],
	['JUN', 6],
	['JUL', 7],
	['AUG', 8],
	['SEP', 9],
	['OCT', 10],
	['NOV', 11],
	['DEC', 12],
]);

const WEEKDAY_NAMES = new Map([
	['SUN', 0],
	['MON', 1],
	['TUE', 2],
	['WED', 3],
	['THU', 4],
	['FRI', 5],
	['SAT', 6],
]);

interface ICronField {
	readonly values: ReadonlySet<number>;
	readonly unrestricted: boolean;
}

interface IAutomationCron {
	readonly minute: ICronField;
	readonly hour: ICronField;
	readonly dayOfMonth: ICronField;
	readonly month: ICronField;
	readonly dayOfWeek: ICronField;
}

interface ILocalDateParts {
	readonly minute: number;
	readonly hour: number;
	readonly dayOfMonth: number;
	readonly month: number;
	readonly dayOfWeek: number;
}

export function validateAutomationCron(expression: string, timeZone: string): void {
	parseAutomationCron(expression);
	createDateFormatter(timeZone);
}

/** Describes the same calendar and clock constraints used by the scheduler. */
export function describeAutomationCron(expression: string, locale = language): string {
	const cron = parseAutomationCron(expression);
	const minutes = [...cron.minute.values].sort((a, b) => a - b);
	const hours = [...cron.hour.values].sort((a, b) => a - b);
	const clock = safeIntl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
	const hourClock = safeIntl.DateTimeFormat(locale, { hour: 'numeric', timeZone: 'UTC' });
	const monthNames = safeIntl.DateTimeFormat(locale, { month: 'long', calendar: 'gregory', timeZone: 'UTC' });
	const weekdayNames = safeIntl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' });
	const formatClock = (hour: number, minute: number) => clock.value.format(new Date(Date.UTC(2024, 0, 1, hour, minute)));
	const formatHour = (hour: number) => hourClock.value.format(new Date(Date.UTC(2024, 0, 1, hour)));
	const hourDescription = hours.length === 1
		? localize('automationCron.description.singleHour', "the {0} hour", formatHour(hours[0]))
		: localize('automationCron.description.hours', "the hours {0}", describeCronValues(hours, formatHour));
	const minuteCadence = getCronCadence(minutes, 60);
	const hourCadence = getCronCadence(hours, 24);
	let time: string;
	if (minutes.length === 60) {
		time = hours.length === 24
			? localize('automationCron.description.everyMinute', "every minute")
			: localize('automationCron.description.minutesDuring', "every minute during {0}", hourDescription);
	} else if (minuteCadence !== undefined) {
		time = hours.length === 24
			? localize('automationCron.description.minuteCadence', "every {0} minutes", minuteCadence)
			: localize('automationCron.description.minuteCadenceDuring', "every {0} minutes during {1}", minuteCadence, hourDescription);
	} else if (hours.length === 24) {
		time = minutes.length === 1
			? localize('automationCron.description.minuteHourly', "at minute {0} of every hour", minutes[0])
			: localize('automationCron.description.minutesHourly', "at minutes {0} of every hour", describeCronValues(minutes));
	} else if (minutes.length === 1 && minutes[0] === 0 && hourCadence !== undefined) {
		time = localize('automationCron.description.hourCadence', "every {0} hours", hourCadence);
	} else if (minutes.length * hours.length <= 6) {
		time = localize('automationCron.description.times', "at {0}", describeCronList(hours.flatMap(hour => minutes.map(minute => formatClock(hour, minute)))));
	} else {
		time = minutes.length === 1
			? localize('automationCron.description.minuteDuring', "at minute {0} past {1}", minutes[0], hourDescription)
			: localize('automationCron.description.minutesDuringHours', "at minutes {0} past {1}", describeCronValues(minutes), hourDescription);
	}

	const days = [...cron.dayOfMonth.values].sort((a, b) => a - b);
	const weekdays = [...cron.dayOfWeek.values].sort((a, b) => a - b);
	const monthDays = days.length === 1
		? localize('automationCron.description.monthDay', "on day {0} of the month", days[0])
		: localize('automationCron.description.monthDays', "on days {0} of the month", describeCronValues(days));
	const weekDays = localize('automationCron.description.weekdays', "on {0}",
		describeCronValues(weekdays, day => weekdayNames.value.format(new Date(Date.UTC(2024, 0, 7 + day)))));
	let date: string;
	if (cron.dayOfMonth.unrestricted && cron.dayOfWeek.unrestricted) {
		date = localize('automationCron.description.everyDay', "every day");
	} else if (cron.dayOfMonth.unrestricted) {
		date = weekDays;
	} else if (cron.dayOfWeek.unrestricted) {
		date = monthDays;
	} else {
		date = localize('automationCron.description.additionalDays', "{0} and also {1}", monthDays, weekDays);
	}
	if (cron.month.values.size !== 12) {
		const months = [...cron.month.values].sort((a, b) => a - b);
		return localize('automationCron.description.inMonths', "In {0}, runs {1} {2}.",
			describeCronValues(months, month => monthNames.value.format(new Date(Date.UTC(2024, month - 1, 1)))), time, date);
	}
	return localize('automationCron.description', "Runs {0} {1}.", time, date);
}

function describeCronValues(values: readonly number[], format: (value: number) => string = String): string {
	if (values.length >= 3 && values.every((value, index) => index === 0 || value === values[index - 1] + 1)) {
		return localize('automationCron.description.range', "{0} through {1}", format(values[0]), format(values[values.length - 1]));
	}
	return describeCronList(values.map(format));
}

function describeCronList(items: readonly string[]): string {
	return items.length === 1 ? items[0] : localize('automationCron.description.list', "{0} and {1}",
		items.slice(0, -1).join(localize('automationCron.description.separator', ", ")), items[items.length - 1]);
}

function getCronCadence(values: readonly number[], span: number): number | undefined {
	if (values.length < 2) {
		return undefined;
	}
	const step = values[1] - values[0];
	return step > 1 && span % step === 0 && values.length === span / step && values.every((value, index) => value === index * step) ? step : undefined;
}

export function nextAutomationCronOccurrence(expression: string, timeZone: string, after: Date): Date {
	const cron = parseAutomationCron(expression);
	const formatter = createDateFormatter(timeZone);
	let candidate = Math.floor(after.getTime() / MINUTE_MS) * MINUTE_MS + MINUTE_MS;
	const searchEnd = candidate + MAX_SEARCH_MS;
	let minuteSearchEnd = candidate;
	while (candidate < searchEnd) {
		const parts = readLocalDateParts(formatter, candidate);
		const dateMatches = matchesDate(cron, parts);
		if (dateMatches && matchesTime(cron, parts)) {
			return new Date(candidate);
		}
		if (dateMatches || candidate < minuteSearchEnd) {
			candidate += MINUTE_MS;
			continue;
		}

		// Backfill the coarse interval when it enters an eligible local date so its earliest minutes are not skipped.
		const jumpedCandidate = Math.min(candidate + DATE_SEARCH_STEP_MS, searchEnd);
		const jumpedParts = readLocalDateParts(formatter, jumpedCandidate);
		if (matchesDate(cron, jumpedParts)) {
			minuteSearchEnd = jumpedCandidate;
			candidate += MINUTE_MS;
		} else {
			candidate = jumpedCandidate;
		}
	}
	throw new Error(`Automation schedule has no occurrence within ten years: ${expression}`);
}

function parseAutomationCron(expression: string): IAutomationCron {
	const fields = expression.trim().split(/\s+/);
	if (fields.length !== 5) {
		throw new Error(localize('automationCron.fields', "Automation schedule must contain exactly five fields: minute, hour, day of month, month, day of week."));
	}
	const cron: IAutomationCron = {
		minute: parseField(fields[0], localize('automationCron.minute', "Minute"), 0, 59),
		hour: parseField(fields[1], localize('automationCron.hour', "Hour"), 0, 23),
		dayOfMonth: parseField(fields[2], localize('automationCron.dayOfMonth', "Day of month"), 1, 31),
		month: parseField(fields[3], localize('automationCron.month', "Month"), 1, 12, MONTH_NAMES),
		dayOfWeek: parseField(fields[4], localize('automationCron.dayOfWeek', "Day of week"), 0, 7, WEEKDAY_NAMES, value => value === 7 ? 0 : value),
	};
	if (!hasPossibleCalendarDay(cron)) {
		throw new Error(localize('automationCron.calendar', "Automation schedule cannot match a real calendar date."));
	}
	return cron;
}

function hasPossibleCalendarDay(cron: IAutomationCron): boolean {
	if (cron.dayOfMonth.unrestricted || !cron.dayOfWeek.unrestricted) {
		return true;
	}
	const maximumDayByMonth = [0, 31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
	for (const month of cron.month.values) {
		const maximumDay = maximumDayByMonth[month];
		for (const day of cron.dayOfMonth.values) {
			if (day <= maximumDay) {
				return true;
			}
		}
	}
	return false;
}

function parseField(
	field: string,
	label: string,
	minimum: number,
	maximum: number,
	names: ReadonlyMap<string, number> = new Map(),
	normalize: (value: number) => number = value => value,
): ICronField {
	const values = new Set<number>();
	for (const segment of field.split(',')) {
		if (!segment) {
			throw new Error(localize('automationCron.emptySegment', "{0} contains an empty list item.", label));
		}
		const stepParts = segment.split('/');
		if (stepParts.length > 2) {
			throw new Error(localize('automationCron.invalidStep', "{0} contains an invalid step.", label));
		}
		const step = stepParts[1] === undefined ? 1 : parsePositiveInteger(stepParts[1], label);
		const base = stepParts[0];
		let start: number;
		let end: number;
		if (base === '*') {
			start = minimum;
			end = maximum;
		} else {
			const range = base.split('-');
			if (range.length === 1) {
				if (stepParts.length > 1) {
					throw new Error(localize('automationCron.stepBase', "{0} steps require '*' or a range such as {1}-{2}.", label, minimum, maximum));
				}
				start = parseValue(range[0], label, minimum, maximum, names);
				end = start;
			} else if (range.length === 2) {
				start = parseValue(range[0], label, minimum, maximum, names);
				end = parseValue(range[1], label, minimum, maximum, names);
				if (start > end) {
					throw new Error(localize('automationCron.ascending', "{0} ranges must be ascending.", label));
				}
			} else {
				throw new Error(localize('automationCron.invalidRange', "{0} contains an invalid range.", label));
			}
		}
		for (let value = start; value <= end; value += step) {
			values.add(normalize(value));
		}
	}
	return { values, unrestricted: field === '*' };
}

function parseValue(value: string, label: string, minimum: number, maximum: number, names: ReadonlyMap<string, number>): number {
	const named = names.get(value.toUpperCase());
	const parsed = named ?? (/^\d+$/.test(value) ? Number(value) : Number.NaN);
	if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
		throw new Error(localize('automationCron.range', "{0} value is outside {1}-{2}.", label, minimum, maximum));
	}
	return parsed;
}

function parsePositiveInteger(value: string, label: string): number {
	const parsed = /^\d+$/.test(value) ? Number(value) : Number.NaN;
	if (!Number.isInteger(parsed) || parsed <= 0) {
		throw new Error(localize('automationCron.positiveStep', "{0} step must be a positive integer.", label));
	}
	return parsed;
}

function createDateFormatter(timeZone: string): Intl.DateTimeFormat {
	try {
		return new Intl.DateTimeFormat('en-US', {
			timeZone,
			year: 'numeric',
			month: 'numeric',
			day: 'numeric',
			hour: 'numeric',
			minute: 'numeric',
			weekday: 'short',
			hourCycle: 'h23',
		});
	} catch (error) {
		throw new Error(localize('automationCron.timeZone', "Automation schedule uses an invalid time zone."), { cause: error });
	}
}

function readLocalDateParts(formatter: Intl.DateTimeFormat, timestamp: number): ILocalDateParts {
	const parts = new Map(formatter.formatToParts(timestamp).map(part => [part.type, part.value]));
	const weekday = WEEKDAY_NAMES.get((parts.get('weekday') ?? '').toUpperCase());
	if (weekday === undefined) {
		throw new Error('Automation schedule could not resolve the local weekday.');
	}
	return {
		minute: Number(parts.get('minute')),
		hour: Number(parts.get('hour')),
		dayOfMonth: Number(parts.get('day')),
		month: Number(parts.get('month')),
		dayOfWeek: weekday,
	};
}

function matchesDate(cron: IAutomationCron, parts: ILocalDateParts): boolean {
	if (!cron.month.values.has(parts.month)) {
		return false;
	}
	const dayOfMonthMatches = cron.dayOfMonth.values.has(parts.dayOfMonth);
	const dayOfWeekMatches = cron.dayOfWeek.values.has(parts.dayOfWeek);
	if (cron.dayOfMonth.unrestricted) {
		return cron.dayOfWeek.unrestricted || dayOfWeekMatches;
	}
	if (cron.dayOfWeek.unrestricted) {
		return dayOfMonthMatches;
	}
	return dayOfMonthMatches || dayOfWeekMatches;
}

function matchesTime(cron: IAutomationCron, parts: ILocalDateParts): boolean {
	return cron.minute.values.has(parts.minute) && cron.hour.values.has(parts.hour);
}
